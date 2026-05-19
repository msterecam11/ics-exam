/**
 * Fetches a PDF from the given API route and triggers a browser download.
 * Reads the filename from the Content-Disposition header when available.
 */
export async function downloadPdf(url: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as any).error ?? `HTTP ${res.status}`)
  }

  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)

  const cd    = res.headers.get("Content-Disposition") ?? ""
  const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)
  const name  = match ? decodeURIComponent(match[1]) : fallbackFilename

  const a = document.createElement("a")
  a.href     = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(objectUrl)
}
