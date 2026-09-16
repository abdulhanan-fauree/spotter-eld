/**
 * The log sheet renderer, checked against the FMCSA golden sheet (guide pp.18-19).
 *
 * John Doe, Richmond VA -> Newark NJ, 04/09/2021, 350 miles, Pro No. 101601.
 *
 * As a side effect this writes /tmp/golden-sheet.svg on every run, so the output
 * can be opened and compared with the PDF by eye. Unit tests pin the arithmetic;
 * only looking at it catches a grid that is numerically right and visually wrong.
 */

import { writeFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ELDLogSheet } from './ELDLogSheet'
import { GRID_BOTTOM, L, type Segment, totalsFor } from './grid'

const JOHN_DOE: Segment[] = [
  { status: 'OFF', start_minute: 0, end_minute: 360 },
  { status: 'ON', start_minute: 360, end_minute: 450, note: 'Load, dispatch, pre-trip' },
  { status: 'D', start_minute: 450, end_minute: 540 },
  { status: 'ON', start_minute: 540, end_minute: 570, note: 'Fuel' },
  { status: 'D', start_minute: 570, end_minute: 720 },
  { status: 'OFF', start_minute: 720, end_minute: 780, note: 'Lunch' },
  { status: 'D', start_minute: 780, end_minute: 900 },
  { status: 'ON', start_minute: 900, end_minute: 930, note: 'Delivery' },
  { status: 'D', start_minute: 930, end_minute: 960 },
  { status: 'SB', start_minute: 960, end_minute: 1065 },
  { status: 'D', start_minute: 1065, end_minute: 1140 },
  { status: 'ON', start_minute: 1140, end_minute: 1260, note: 'Post-trip, paperwork' },
  { status: 'OFF', start_minute: 1260, end_minute: 1440 },
]

const REMARKS = [
  { minute: 360, location: 'Richmond, VA' },
  { minute: 540, location: 'Fredericksburg, VA' },
  { minute: 720, location: 'Baltimore, MD' },
  { minute: 900, location: 'Philadelphia, PA' },
  { minute: 960, location: 'Cherry Hill, NJ' },
  { minute: 1140, location: 'Newark, NJ' },
]

const HEADER = {
  date: '04 / 09 / 2021',
  from: 'Richmond, VA',
  to: 'Newark, NJ',
  totalMilesDriving: 350,
  totalMileage: 350,
  carrierName: "John Doe's Transportation",
  mainOfficeAddress: 'Washington, D.C.',
  homeTerminalAddress: 'Washington, D.C.',
  truckNumber: '123',
  trailerNumber: '20544',
  driverName: 'John E. Doe',
  shippingDocNo: '101601',
  shipperCommodity: 'General freight',
}

const RECAP = {
  on_duty_today: 12.25,
  total_last_7_days: 12.25,
  available_tomorrow: 57.75,
  total_last_8_days: 12.25,
}

function render() {
  return renderToStaticMarkup(
    <ELDLogSheet header={HEADER} segments={JOHN_DOE} remarks={REMARKS} recap={RECAP} />,
  )
}

describe('ELDLogSheet — FMCSA golden sheet', () => {
  const markup = render()

  it('writes a standalone SVG for visual comparison with the PDF', () => {
    const svg = markup.replace(
      '<svg ',
      '<svg style="background:#fff;color:#0f172a;font-family:ui-sans-serif,system-ui,sans-serif" ',
    )
    writeFileSync('/tmp/golden-sheet.svg', svg)
    expect(svg.length).toBeGreaterThan(3000)
  })

  it('renders a single root svg sized to its content', () => {
    expect(markup.startsWith('<svg')).toBe(true)
    const box = markup.match(/viewBox="0 0 (\d+) (\d+)"/)
    expect(box).not.toBeNull()
    expect(Number(box![1])).toBe(L.width)
    // Height is derived from the bands rather than fixed, so the sheet cannot
    // develop a dead zone between the Remarks and the Recap.
    const height = Number(box![2])
    expect(height).toBeGreaterThan(GRID_BOTTOM + 200)
    expect(height).toBeLessThan(660)
  })

  it('prints the Total Hours column from guide p.19', () => {
    // Off 10.00 · SB 1.75 · Driving 7.75 · On Duty 4.50
    for (const v of ['10.00', '1.75', '7.75', '4.50']) {
      expect(markup).toContain(`>${v}<`)
    }
  })

  it('prints the grand total of 24 hours', () => {
    expect(markup).toContain('= 24.00')
    const t = totalsFor(JOHN_DOE)
    expect(t.OFF + t.SB + t.D + t.ON).toBeCloseTo(24, 6)
  })

  it('draws the duty line as one continuous path', () => {
    const paths = markup.match(/class="duty-line"/g)
    expect(paths).toHaveLength(1)
  })

  it('labels all four duty rows in form order', () => {
    for (const label of ['1. Off Duty', '2. Sleeper Berth', '3. Driving', '4. On Duty']) {
      expect(markup).toContain(label)
    }
  })

  it('labels midnight and noon on both hour rows', () => {
    // The form carries an hour scale above the grid and again above Remarks.
    expect(markup.match(/>Midnight</g)?.length).toBe(2)
    expect(markup.match(/>Noon</g)?.length).toBe(2)
  })

  it('writes all six remarks', () => {
    for (const r of REMARKS) expect(markup).toContain(r.location)
  })

  it('slants the remarks labels', () => {
    expect(markup).toContain('rotate(-58')
  })

  it('renders the header fields from the supplied blank form', () => {
    for (const v of [
      'Total Miles Driving Today',
      'Total Mileage Today',
      'Name of Carrier or Carriers',
      'Main Office Address',
      'Home Terminal Address',
      'DVL or Manifest No.',
    ]) {
      expect(markup).toContain(v)
    }
  })

  it('renders the recap band with boxes A, B and C', () => {
    expect(markup).toContain('70 Hour / 8 Day Drivers')
    expect(markup).toContain('last 7 days including today') // A
    expect(markup).toContain('tomorrow, 70 hr. minus A') // B
    expect(markup).toContain('last 8 days including today') // C
  })

  it('carries the driver certification wording', () => {
    expect(markup).toContain('I certify that these entries are true and correct')
  })

  it('does not animate by default, so print and tests are deterministic', () => {
    expect(markup).not.toContain('stroke-dashoffset')
  })

  it('animates when asked', () => {
    const animated = renderToStaticMarkup(
      <ELDLogSheet header={HEADER} segments={JOHN_DOE} animate />,
    )
    expect(animated).toContain('pathLength="1"')
  })

  it('renders without remarks or recap', () => {
    const bare = renderToStaticMarkup(<ELDLogSheet header={HEADER} segments={JOHN_DOE} />)
    expect(bare).toContain('duty-line')
    expect(bare).not.toContain('70 Hour / 8 Day Drivers')
  })

  it('renders an empty day without throwing', () => {
    const empty = renderToStaticMarkup(<ELDLogSheet header={HEADER} segments={[]} />)
    expect(empty).toContain('= 0.00')
  })
})
