/**
 * Returns a Puppeteer browser instance.
 * Uses full `puppeteer` which bundles its own Chromium — works on any Linux
 * server (Railway, Render, VPS, etc.) without extra configuration.
 */
export async function getBrowser() {
  const puppeteer = await import("puppeteer")

  return puppeteer.default.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  })
}
