/**
 * Returns a Puppeteer browser instance that works both locally and on Vercel.
 * - Production (Vercel): uses @sparticuz/chromium (serverless-compatible)
 * - Development: uses system Chrome via puppeteer-core
 */
export async function getBrowser() {
  const puppeteer = await import("puppeteer-core")

  if (process.env.NODE_ENV === "production") {
    const chromium = await import("@sparticuz/chromium")
    return puppeteer.default.launch({
      args            : chromium.default.args,
      defaultViewport : chromium.default.defaultViewport,
      executablePath  : await chromium.default.executablePath(),
      headless        : true,
    })
  }

  // Development — find local Chrome
  const executablePath =
    process.platform === "win32"
      ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
      : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "/usr/bin/google-chrome"

  return puppeteer.default.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  })
}
