import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import Groq from "groq-sdk"
import { extractPdfPageTexts } from "@/lib/pdf-extract"

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY_LMS ?? process.env.GROQ_API_KEY ?? "placeholder",
})

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// ── Filename cleaner (no AI needed) ──────────────────────────────
function cleanFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")           // remove extension
    .replace(/[-_]/g, " ")             // dashes/underscores → spaces
    .replace(/\s{2,}/g, " ")           // collapse double spaces
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()) // Title Case
}

// A page/slide whose text is this short or shorter (e.g. "Thank You",
// "Questions?") gets labeled verbatim — never sent to the AI — so nothing
// can be invented for content that isn't actually there.
const TRIVIAL_WORD_LIMIT = 8

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function titleCaseVerbatim(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/\b\w/g, c => c.toUpperCase())
}


// ── Groq: generate titles for all pages of one PDF (single call) ──
async function titlesForPdfPages(
  pageTexts: string[],
  filename: string,
): Promise<string[]> {
  // Pages with no extractable text → fall back to cleaned filename + page number
  const hasText = pageTexts.some(t => t.length > 20)
  if (!hasText) {
    const base = cleanFilename(filename)
    return pageTexts.map((_, i) => `${base} — Page ${i + 1}`)
  }

  const numbered = pageTexts
    .map((t, i) => `Page ${i + 1}: ${t.slice(0, 300)}`)
    .join("\n---\n")

  const prompt = `You are an e-learning content specialist. Below are text extracts from each page of a training PDF titled "${filename}".
For EVERY page, write a concise title (4–7 words).

RULES:
- If a page is a COVER/TITLE page (course name, logo, presenter info, little else), an AGENDA/OUTLINE, a LEARNING OBJECTIVES list, a SECTION DIVIDER (a big heading introducing the next part), a REFERENCES/SOURCES page, or a CONTACT/CLOSING/THANK-YOU page — output a short literal label naming what the page IS (its role), e.g. "Cover Page", "Learning Objectives", "Course Agenda", "Section 2 Divider", "References", "Thank You". Do NOT paraphrase or invent a subject-matter topic for these — name the page's role, don't summarize its bullet points into a fake topic.
- Only write a descriptive subject-matter title for pages with real instructional content (explanations, procedures, data, diagrams, examples).
- Never invent facts, topics, or content that is not actually present on the page.

${numbered}

Respond with ONLY a JSON array of strings, one per page, in the same order:
["Title for page 1", "Title for page 2", ...]
No explanation, no markdown — only the JSON array.`

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1500,
    })
    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]"
    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) throw new Error("No JSON array in response")
    const parsed: string[] = JSON.parse(match[0])
    // Ensure we have one title per page
    return pageTexts.map((_, i) => parsed[i] || `${cleanFilename(filename)} — Page ${i + 1}`)
  } catch {
    const base = cleanFilename(filename)
    return pageTexts.map((_, i) => `${base} — Page ${i + 1}`)
  }
}

// ── Groq: single title for a quiz/exam item ───────────────────────
async function titleForQuiz(
  questions: { text: string }[],
  defaultTitle: string,
): Promise<string> {
  if (!questions.length) return defaultTitle
  const sample = questions
    .slice(0, 5)
    .map((q, i) => `Q${i + 1}: ${q.text.slice(0, 120)}`)
    .join("\n")

  const prompt = `These are questions from a training quiz:
${sample}

Write a concise 4-7 word title for this quiz that describes its main topic. Include the number of questions.
Example: "10-Question Ramp Safety Knowledge Check"
Respond with only the title.`

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 30,
    })
    return completion.choices[0]?.message?.content?.trim() || defaultTitle
  } catch {
    return defaultTitle
  }
}

// ── Groq: title from HTML text content ────────────────────────────
async function titleForText(html: string, defaultTitle: string): Promise<string> {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 400)
  if (!text) return defaultTitle

  // Very short slides ("Thank You", "Questions?") — label verbatim, no AI call,
  // so nothing gets invented for content that isn't actually there.
  if (wordCount(text) < TRIVIAL_WORD_LIMIT) return titleCaseVerbatim(text)

  const prompt = `This is the text content of a training slide:
"${text}"

Write a concise 4-7 word title for this content.

If this slide is a COVER/TITLE slide, AGENDA, LEARNING OBJECTIVES list, SECTION DIVIDER, REFERENCES, or a CLOSING/THANK-YOU slide, respond with a short literal label for what it IS (e.g. "Learning Objectives", "Course Agenda", "Section Divider", "References", "Thank You") instead of inventing a subject-matter topic.

Respond with only the title.`

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 30,
    })
    return completion.choices[0]?.message?.content?.trim() || defaultTitle
  } catch {
    return defaultTitle
  }
}

// ── Groq vision: title from image URL ─────────────────────────────
async function titleForImage(imageUrl: string, defaultTitle: string): Promise<string> {
  try {
    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl } },
            {
              type: "text",
              text: "This is an image from an aviation training course. Write a concise 4-7 word descriptive title for this image. Respond with only the title.",
            },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 30,
    })
    return completion.choices[0]?.message?.content?.trim() || defaultTitle
  } catch {
    return defaultTitle
  }
}

// ── Main handler ──────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { module_id } = body
  if (!module_id) return NextResponse.json({ error: "module_id required" }, { status: 400 })

  // Fetch the package + items
  const { data: pkg } = await db
    .from("lms_packages")
    .select("id, title, lms_package_items(id, type, title, config, order_index)")
    .eq("module_id", module_id)
    .single()

  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 })

  const items = ((pkg.lms_package_items ?? []) as any[])
    .sort((a: any, b: any) => a.order_index - b.order_index)

  if (!items.length) return NextResponse.json({ suggestions: [] })

  // ── Group slide_pdf items by file_url (one extraction per file) ──
  const pdfGroups = new Map<string, { items: any[]; filename: string }>()
  for (const item of items) {
    if (item.type === "slide_pdf" && item.config?.file_url) {
      const url = item.config.file_url as string
      if (!pdfGroups.has(url)) {
        pdfGroups.set(url, { items: [], filename: item.config.file_name ?? "Training PDF" })
      }
      pdfGroups.get(url)!.items.push(item)
    }
  }

  // ── Extract text + generate titles for each unique PDF ───────────
  const pdfTitleMap = new Map<string, string>() // item.id → suggested title

  for (const [url, group] of pdfGroups) {
    const pageNumbers = group.items.map((it: any) => it.config.page_number as number)

    const allTexts = await extractPdfPageTexts(url)
    // allTexts is 0-indexed; page_number is 1-indexed
    const relevantTexts = pageNumbers.map(p => allTexts[p - 1] ?? "")

    const hasAnyText = relevantTexts.some(t => t.length > 20)

    if (!hasAnyText) {
      // Image-based PDF or inaccessible URL — use actual page_number from config
      // (not array index, which would give wrong numbers for non-sequential pages)
      const base = cleanFilename(group.filename)
      console.log(`[analyze-titles] Image-based PDF or no text — using filename fallback for: ${group.filename}`)
      group.items.forEach((it: any) => {
        pdfTitleMap.set(it.id, `${base} — Slide ${it.config.page_number}`)
      })
      continue
    }

    // Split pages into "trivial" (very little text — e.g. "Thank You") which
    // are labeled verbatim with no AI call, and "rich" pages which go to the
    // AI for a real distilled/structural title. This guarantees a 2-word
    // closing slide can never come back with invented content.
    const richIdx: number[] = []
    const richTexts: string[] = []
    relevantTexts.forEach((t, idx) => {
      const wc = wordCount(t)
      const item = group.items[idx]
      if (wc === 0) {
        pdfTitleMap.set(item.id, `${cleanFilename(group.filename)} — Slide ${item.config.page_number}`)
      } else if (wc < TRIVIAL_WORD_LIMIT) {
        pdfTitleMap.set(item.id, titleCaseVerbatim(t))
      } else {
        richIdx.push(idx)
        richTexts.push(t)
      }
    })

    if (richTexts.length > 0) {
      const titles = await titlesForPdfPages(richTexts, group.filename)
      richIdx.forEach((origIdx, i) => {
        pdfTitleMap.set(group.items[origIdx].id, titles[i])
      })
    }
  }

  // ── Build suggestions for every item ─────────────────────────────
  const suggestions: { id: string; current_title: string; suggested_title: string; type: string }[] = []

  // Process non-PDF items concurrently (cap at 5 parallel)
  const nonPdfItems = items.filter((it: any) => it.type !== "slide_pdf")

  // Batch concurrency: process 5 at a time
  for (let i = 0; i < nonPdfItems.length; i += 5) {
    const batch = nonPdfItems.slice(i, i + 5)
    const batchResults = await Promise.all(
      batch.map(async (item: any) => {
        let suggested = item.title as string

        switch (item.type as string) {
          case "quiz":
            suggested = await titleForQuiz(
              item.config?.questions ?? [],
              `${(item.config?.questions ?? []).length}-Question Quiz`,
            )
            break
          case "exam":
            suggested = await titleForQuiz(
              item.config?.questions ?? [],
              `${(item.config?.questions ?? []).length}-Question Knowledge Test`,
            )
            break
          case "text":
            suggested = await titleForText(item.config?.html ?? "", item.title)
            break
          case "image":
            if (item.config?.file_url) {
              suggested = await titleForImage(item.config.file_url, cleanFilename(item.config?.file_name ?? item.title))
            } else {
              suggested = cleanFilename(item.config?.file_name ?? item.title)
            }
            break
          case "slide_pptx":
          case "video":
          case "audio":
            suggested = cleanFilename(item.config?.file_name ?? item.title)
            break
          case "youtube":
            suggested = item.title // keep as-is — admin should rename manually
            break
          case "web_content":
            suggested = item.config?.title || item.title
            break
          case "divider":
            suggested = item.title // section dividers — admin renames manually
            break
        }

        return { id: item.id, current_title: item.title, suggested_title: suggested, type: item.type }
      })
    )
    suggestions.push(...batchResults)
  }

  // Add PDF suggestions (already computed)
  for (const item of items.filter((it: any) => it.type === "slide_pdf")) {
    const suggested = pdfTitleMap.get(item.id) ?? cleanFilename(item.config?.file_name ?? item.title)
    suggestions.push({ id: item.id, current_title: item.title, suggested_title: suggested, type: item.type })
  }

  // Re-sort suggestions by original item order
  const orderMap = new Map(items.map((it: any, idx: number) => [it.id, idx]))
  suggestions.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))

  return NextResponse.json({ suggestions })
}
