/**
 * Print-correctness probe.
 *
 * The log sheet is SVG drawn entirely in `currentColor`, so whether it is
 * readable on paper depends solely on the colour it inherits under print media.
 * Chrome drops background colours when printing but keeps text/stroke colour,
 * so a light inherited colour means an invisible sheet — measure that directly
 * rather than counting pixels of a background that never reaches paper.
 */
import { chromium } from 'playwright'

const TRIP = process.argv[2] ?? '28'
const LABEL = process.argv[3] ?? 'run'

/**
 * Tailwind 4 emits `oklch(...)`, which cannot be parsed as three sRGB channels
 * — doing so silently reports a near-white colour as dark. Round-trip the value
 * through a canvas so the browser performs the conversion.
 */
const toRgb = (page, css) =>
  page.evaluate((c) => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = 1
    const ctx = cv.getContext('2d')
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return { r, g, b, luminance: +(0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(1) }
  }, css)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } })
await page.addInitScript(() => localStorage.setItem('spotter-theme', 'dark'))
await page.goto(`http://localhost:5173/trips/${TRIP}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(3500)

const dayTabs = await page.locator('section button[aria-current]').count()

// Screen ink must stay light in dark mode — the print fix must not leak.
const screenInk = await page.evaluate(() => {
  const el = [...document.querySelectorAll('svg[role="img"]')].find(
    (s) => s.getBoundingClientRect().height > 0,
  )
  return el ? getComputedStyle(el).color : null
})
const screen = await toRgb(page, screenInk)

await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(500)

const out = await page.evaluate(() => {
  const visible = (el) => el.getBoundingClientRect().height > 0
  const sheets = [...document.querySelectorAll('svg[role="img"]')].filter(visible)
  const first = sheets[0]
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    printableSheets: sheets.length,
    bodyColor: getComputedStyle(document.body).color,
    sheetColor: first ? getComputedStyle(first).color : null,
  }
})

const ink = await toRgb(page, out.sheetColor)

console.log(JSON.stringify({
  label: LABEL,
  theme: out.theme,
  logDays: dayTabs,
  printableSheets: out.printableSheets,
  duplicatePages: out.printableSheets - dayTabs,
  screenInkRgb: `rgb(${screen.r},${screen.g},${screen.b})`,
  screenInkLuminance: screen.luminance,
  screenStillDarkMode: screen.luminance > 140,
  sheetInkColor: out.sheetColor,
  sheetInkRgb: `rgb(${ink.r},${ink.g},${ink.b})`,
  sheetInkLuminance: ink.luminance,
  readableOnPaper: ink.luminance < 110,
}, null, 2))

await browser.close()
