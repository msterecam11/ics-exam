import JSZip from "jszip"
import { db } from "@/lib/db"
import { parseCSV, type CSVParsedQuestion } from "@/lib/csv-parser"

const BUCKET = "lms-library"
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg"])
// Only the 40MB *compressed* upload size was ever capped — a small,
// highly-compressible zip could still expand to gigabytes in server memory
// during JSZip.loadAsync/entry.async(), an OOM/DoS risk on the same process
// serving the exam API. Checked twice: declared sizes from the zip's own
// central directory (before decompressing anything), then actual bytes read
// as a second guard in case a declared size can't be trusted.
const MAX_UNCOMPRESSED_BYTES = 150 * 1024 * 1024
const MAX_ENTRIES = 500

function extOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? ""
}

function baseName(path: string): string {
  return path.split("/").pop() ?? path
}

interface ZipImportResult {
  questions: CSVParsedQuestion[]
  errors: { row: number; message: string }[]
}

// Unpacks a .zip containing one CSV plus any number of images, uploads the
// images, and rewrites each question's `image_url` from a bare filename to
// the real uploaded URL. A cell that's already a full URL (http...) passes
// through untouched — the zip is optional per-row, not required.
export async function importQuestionsFromZip(zipBuffer: ArrayBuffer): Promise<ZipImportResult> {
  const zip = await JSZip.loadAsync(zipBuffer)

  const allEntries = Object.values(zip.files).filter((f) => !f.dir)
  if (allEntries.length > MAX_ENTRIES) {
    return { questions: [], errors: [{ row: 0, message: `Too many files in the zip (max ${MAX_ENTRIES})` }] }
  }
  const declaredUncompressed = allEntries.reduce(
    (sum, f) => sum + ((f as any)._data?.uncompressedSize ?? 0), 0
  )
  if (declaredUncompressed > MAX_UNCOMPRESSED_BYTES) {
    return {
      questions: [],
      errors: [{ row: 0, message: `Zip contents too large when decompressed (max ${MAX_UNCOMPRESSED_BYTES / (1024 * 1024)}MB uncompressed)` }],
    }
  }

  const csvEntries = Object.values(zip.files).filter(
    (f) => !f.dir && extOf(f.name) === "csv"
  )
  if (csvEntries.length === 0) {
    return { questions: [], errors: [{ row: 0, message: "No .csv file found inside the zip" }] }
  }
  if (csvEntries.length > 1) {
    return { questions: [], errors: [{ row: 0, message: `Found ${csvEntries.length} .csv files in the zip — include exactly one` }] }
  }

  const imageEntries = Object.values(zip.files).filter(
    (f) => !f.dir && IMAGE_EXTENSIONS.has(extOf(f.name))
  )

  // Filenames must be unique within the zip — matching is by basename only
  // (subfolders are allowed), so two images with the same name anywhere in
  // the archive would be ambiguous. Fail closed rather than silently pick one.
  const seen = new Map<string, string>() // lowercased basename -> original path
  const duplicates = new Set<string>()
  for (const entry of imageEntries) {
    const key = baseName(entry.name).toLowerCase()
    if (seen.has(key) && seen.get(key) !== entry.name) duplicates.add(key)
    seen.set(key, entry.name)
  }
  if (duplicates.size > 0) {
    return {
      questions: [],
      errors: [{ row: 0, message: `Duplicate image filename(s) in the zip (must be unique): ${[...duplicates].join(", ")}` }],
    }
  }

  // Upload every image up front, keyed by lowercased basename.
  const urlByFilename = new Map<string, string>()
  let totalReadBytes = 0
  for (const entry of imageEntries) {
    const key = baseName(entry.name).toLowerCase()
    const bytes = await entry.async("arraybuffer")
    totalReadBytes += bytes.byteLength
    // Second guard, in case a declared central-directory size wasn't
    // trustworthy — bail before uploading anything further.
    if (totalReadBytes > MAX_UNCOMPRESSED_BYTES) {
      return {
        questions: [],
        errors: [{ row: 0, message: `Zip contents too large when decompressed (max ${MAX_UNCOMPRESSED_BYTES / (1024 * 1024)}MB uncompressed)` }],
      }
    }
    const ext = extOf(entry.name) || "png"
    const storagePath = `exams/questions/${crypto.randomUUID()}.${ext}`
    const contentType = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`

    const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, bytes, { contentType, upsert: false })
    if (uploadError) continue // question falls back to no image for this row; surfaced via the unmatched-filename warning below

    const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath)
    urlByFilename.set(key, urlData.publicUrl)
  }

  const csvText = await csvEntries[0].async("text")
  const { questions, errors } = parseCSV(csvText)

  const resolved: CSVParsedQuestion[] = []
  for (const q of questions) {
    if (!q.image_url || /^https?:\/\//i.test(q.image_url)) {
      resolved.push(q)
      continue
    }
    const url = urlByFilename.get(baseName(q.image_url).toLowerCase())
    if (url) {
      resolved.push({ ...q, image_url: url })
    } else {
      errors.push({ row: q._row ?? 0, message: `image_url "${q.image_url}" doesn't match any file in the zip — question imported without a figure` })
      resolved.push({ ...q, image_url: undefined })
    }
  }

  return { questions: resolved, errors }
}
