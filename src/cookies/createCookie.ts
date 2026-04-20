import { launch } from 'puppeteer'
import TiktokCookie from '../tiktok/types/TikTokCookieInterface'

async function createCookie(): Promise<TiktokCookie[]> {
  console.info(`\n🍪 Creating cookie for API authentication...`)
  let browser: any = null
  try {
    console.info(`\n🚀 Launching puppeteer to retrieve session cookie...`)

    browser = await launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })
    const page = await browser.newPage()

    // Only wait for domcontentloaded — networkidle2 hangs forever on TikTok
    await page.goto('https://www.tiktok.com/live', {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    })

    // Wait a few seconds for cookies to be set by TikTok's scripts
    console.info(`\n⏳ Waiting for cookies to populate...`)
    await new Promise(resolve => setTimeout(resolve, 3000))

    const client = await page.target().createCDPSession()
    const cookies = (await client.send('Network.getAllCookies')).cookies

    await browser.close()
    browser = null

    if (!cookies || cookies.length === 0) {
      throw new Error('No cookies received from TikTok')
    }

    console.info(`\n✅ Cookie successfully created (${cookies.length} cookies) for API usage.`)

    return cookies
  } catch (error) {
    if (browser) {
      try { await browser.close() } catch (_) {}
    }
    throw new Error(`❌ Failed to create cookie. Error: ${error}`)
  }
}

export default createCookie
