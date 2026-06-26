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

  const texts = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map(item => item.str || '')
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    texts.push(text)
    process.stderr.write(`[extract-pdf] page ${i}: ${text.length} chars\n`)
  }

  // On Linux pipes, stdout.write is async — await the callback so
  // the process doesn't exit before the data is flushed to the parent.
  await new Promise((res, rej) => {
    process.stdout.write(JSON.stringify(texts), err => (err ? rej(err) : res(undefined)))
  })
}

main().catch(err => {
  process.stderr.write(`[extract-pdf] FAILED: ${err.message}\n${err.stack}\n`)
  process.exit(1)
})
