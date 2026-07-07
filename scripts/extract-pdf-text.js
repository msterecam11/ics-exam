'use strict'
// Subprocess: reads PDF bytes from stdin, writes JSON per-page text array to stdout.
// Runs outside the Next.js/Turbopack bundle so pdfjs works natively.

const pdfjsLib = require('pdfjs-dist/build/pdf.js')
// pdfjs v2 in Node.js auto-detects no Worker API and uses inline processing.
// Do NOT set workerSrc = '' — it can suppress page loading in some builds.

// pdfjs writes font warnings directly to process.stdout which corrupts the JSON output.
// Set verbosity to ERRORS only (0) to suppress them.
if (typeof pdfjsLib.verbosity !== 'undefined') {
  pdfjsLib.verbosity = 0 // 0 = ERRORS only
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.on('data', c => chunks.push(c))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)))
    process.stdin.on('error', reject)
  })
}

async function main() {
  const buf = await readStdin()
  process.stderr.write(`[extract-pdf] received ${buf.length} bytes\n`)

  if (!buf.length) {
    process.stdout.write('[]')
    return
  }

  // Use new Uint8Array(buf) — creates a clean copy; avoids Buffer byteOffset issues
  const data = new Uint8Array(buf)
  process.stderr.write(`[extract-pdf] uint8array ${data.length} bytes\n`)

  const loadingTask = pdfjsLib.getDocument({ data, disableFontFace: true })
  const pdf = await loadingTask.promise
  process.stderr.write(`[extract-pdf] numPages: ${pdf.numPages}\n`)

  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1 })
    const pageHeight = viewport.height

    const items = content.items
      .map(item => ({
        str: item.str || '',
        // Font-size proxy: pdf.js text items carry a height (or derive it
        // from the transform's vertical scale for older builds).
        height: item.height || Math.hypot(item.transform[2], item.transform[3]) || 0,
        y: item.transform[5], // PDF y-origin is bottom-left; larger y = nearer the top
      }))
      .filter(it => it.str.trim().length > 0)

    const text = items.map(it => it.str).join(' ').replace(/\s{2,}/g, ' ').trim()

    // Heading heuristic: the largest-font text runs in the top ~30% of the
    // page are almost always the slide's own title — detect and surface it
    // separately so we can prefer it verbatim instead of asking the AI to
    // guess a title from the flattened body text.
    let heading = ''
    if (items.length > 0) {
      const maxHeight = Math.max(...items.map(it => it.height))
      if (maxHeight > 0) {
        const topThreshold = pageHeight * 0.7
        const candidates = items.filter(it => it.height >= maxHeight * 0.85 && it.y >= topThreshold)
        const headingText = candidates.map(it => it.str).join(' ').replace(/\s{2,}/g, ' ').trim()
        // Sanity check: a real heading is short and shorter than the full page
        // text (so we don't mistake a single-heading-only page for "no body").
        if (headingText && headingText.split(/\s+/).length <= 12 && headingText.length < text.length) {
          heading = headingText
        }
      }
    }

    pages.push({ text, heading })
    process.stderr.write(`[extract-pdf] page ${i}: ${text.length} chars, heading: "${heading}"\n`)
  }

  // On Linux pipes, stdout.write is async — await the callback so
  // the process doesn't exit before the data is flushed to the parent.
  await new Promise((res, rej) => {
    process.stdout.write(JSON.stringify(pages), err => (err ? rej(err) : res(undefined)))
  })
}

main().catch(err => {
  process.stderr.write(`[extract-pdf] FAILED: ${err.message}\n${err.stack}\n`)
  process.exit(1)
})
