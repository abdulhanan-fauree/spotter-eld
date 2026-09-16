import { L } from '../grid'
import { Field } from './primitives'

export interface LogSheetHeader {
  date: string
  from?: string
  to?: string
  totalMilesDriving?: number
  totalMileage?: number
  carrierName?: string
  mainOfficeAddress?: string
  homeTerminalAddress?: string
  truckNumber?: string
  trailerNumber?: string
  driverName?: string
  coDriverName?: string
  shippingDocNo?: string
  shipperCommodity?: string
}

const miles = (n?: number) => (n != null ? Math.round(n).toLocaleString() : '')

/** Everything above the grid, per the blank form supplied with the brief. */
export function SheetHeader({ header }: { header: LogSheetHeader }) {
  return (
    <g>
      <text x={L.width / 2} y={26} textAnchor="middle" fontSize={17} className="log-title">
        Driver&apos;s Daily Log
      </text>
      <text x={L.width / 2} y={40} textAnchor="middle" fontSize={8.5} className="log-caption">
        (24 hours) — one calendar day
      </text>
      <text x={L.width - 20} y={20} textAnchor="end" fontSize={7.5} className="log-caption">
        Original — File at home terminal.
      </text>
      <text x={L.width - 20} y={31} textAnchor="end" fontSize={7.5} className="log-caption">
        Duplicate — Driver retains in his/her possession for 8 days.
      </text>

      <Field x={20} y={62} w={150} label="(month) (day) (year)" value={header.date} />
      <Field x={190} y={62} w={230} label="From" value={header.from} />
      <Field x={440} y={62} w={230} label="To" value={header.to} />

      <Field x={20} y={110} w={150} label="Total Miles Driving Today" value={miles(header.totalMilesDriving)} />
      <Field x={190} y={110} w={150} label="Total Mileage Today" value={miles(header.totalMileage)} />
      <Field x={360} y={110} w={310} label="Name of Carrier or Carriers" value={header.carrierName} />
      <Field x={690} y={110} w={290} label="Main Office Address" value={header.mainOfficeAddress} />

      <Field
        x={20}
        y={158}
        w={320}
        label="Truck/Tractor and Trailer Numbers or License Plate(s)/State (show each unit)"
        value={[header.truckNumber, header.trailerNumber].filter(Boolean).join(' / ')}
      />
      <Field x={360} y={158} w={310} label="Home Terminal Address" value={header.homeTerminalAddress} />
      <Field x={690} y={158} w={290} label="Driver's Signature in Full" value={header.driverName} />
    </g>
  )
}
