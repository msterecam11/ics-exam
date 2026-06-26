'use strict'
// Standalone script — called as a subprocess from analyze-titles route.
// Reads PDF bytes from stdin, writes JSON array of per-page texts to stdout.
// Runs outside the Next.js/Turbopack bundle so pdfjs v2 fake-worker works.

const pdfjsLib = require('pdfjs-dist/build/pdf.js')
pdfjsLib.GlobalWorkerOptions.workerSrc = '' // fake-worker mode (works in pdfjs v2)

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
  if (!buf.length) {
    process.stdout.write('[]')
    return
  }

  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  const pdf = await pdfjsLib.getDocument({ data, disableFontFace: true }).promise

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
  }

  process.stdout.write(JSON.stringify(texts))
}

main().catch(err => {
  process.stderr.write(err.message + '\n')
  process.exit(1)
})
