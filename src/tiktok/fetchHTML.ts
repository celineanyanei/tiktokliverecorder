import puppeteer from 'puppeteer'
import { TIKTOK_UA } from "./constants"

/**
 * Fetches the HTML content from the specified URL.
 * Handles shortened URLs (vt.tiktok.com, vm.tiktok.com) by following redirects.
 * @param {string} url - The URL to fetch the HTML from
 * @returns {Promise<string>} - A promise that resolves to the HTML content as a string
 */
export default async function fetchHTML(
  url: string
): Promise<string> {
  console.info(
    `\n🌐 Fetching page HTML from: ${url}`
  )

  let newBrowser: any = null
  try {
    newBrowser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    const page = await newBrowser.newPage()
    await page.setUserAgent(TIKTOK_UA)

    // Navigate — Puppeteer automatically follows redirects (vt.tiktok.com → www.tiktok.com)
    // Use domcontentloaded instead of networkidle2 which hangs forever on TikTok
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

    // Log the final URL after redirects (useful for debugging shortened URLs)
    const finalUrl = page.url()
    if (finalUrl !== url) {
      console.info(`\n🔄 Redirected to: ${finalUrl}`)
    }

    // Wait a moment for page scripts to populate dynamic content (roomId, etc.)
    await new Promise(resolve => setTimeout(resolve, 3000))

    const html: string = await page.content()
    await newBrowser.close()
    newBrowser = null

    console.info(`\n✅ Done! HTML fetched successfully.`)
    console.info(`\n✅ ${html.length} bytes fetched from ${finalUrl}`)

    return html
  } catch (error) {
    if (newBrowser) {
      try { await newBrowser.close() } catch (_) {}
    }
    throw new Error(`❌ Failed to fetch HTML from ${url}: ${error}`)
  }
}

