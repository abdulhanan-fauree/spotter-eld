import { chromium } from 'playwright'

const browser = await chromium.launch()
const errors = []

async function shot(path, file, { theme = 'light', full = true, wait = 2500 } = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  page.on('console', (m) => m.type() === 'error' && errors.push(`${file}: ${m.text()}`))
  page.on('pageerror', (e) => errors.push(`${file}: PAGEERROR ${e.message}`))
  await page.addInitScript((t) => localStorage.setItem('spotter-theme', t), theme)
  await page.goto(`http://localhost:5173${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `/tmp/${file}.png`, fullPage: full })
  await page.close()
  console.log('shot', file)
}

// Create a trip through the UI once, then reuse its id.
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
page.on('pageerror', (e) => errors.push('flow: ' + e.message))
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: /Cycle nearly spent/ }).click()
await page.getByRole('button', { name: /Plan trip/ }).click()
await page.waitForURL(/\/trips\/\d+/, { timeout: 120000 })
const id = page.url().match(/\/trips\/(\d+)/)[1]
await page.close()

await shot('/', 'ui-planner-light', { theme: 'light', full: false })
await shot('/', 'ui-planner-dark', { theme: 'dark', full: false })
await shot(`/trips/${id}`, 'ui-results-light', { theme: 'light', wait: 4000 })
await shot(`/trips/${id}`, 'ui-results-dark', { theme: 'dark', wait: 4000 })
await shot('/trips', 'ui-history', { theme: 'light', full: false })

console.log('console errors:', errors.length ? errors.slice(0, 6) : 'none')
await browser.close()
