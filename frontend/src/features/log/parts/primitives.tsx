/** Shared SVG atoms for the log sheet. */

/** A ruled box with a value above the line and its printed caption below. */
export function Field({
  x,
  y,
  w,
  label,
  value,
  size = 11,
}: {
  x: number
  y: number
  w: number
  label: string
  value?: string
  size?: number
}) {
  return (
    <g>
      <text x={x + w / 2} y={y - 4} textAnchor="middle" fontSize={size + 2} className="log-value">
        {value || ''}
      </text>
      <line x1={x} y1={y} x2={x + w} y2={y} className="log-rule" />
      <text x={x + w / 2} y={y + 10} textAnchor="middle" fontSize={7.5} className="log-caption">
        {label}
      </text>
    </g>
  )
}

/** The hour scale. The form carries one above the grid and one above Remarks. */
export function HourScale({
  y,
  labels,
  hourX,
}: {
  y: number
  labels: { hour: number; label: string }[]
  hourX: (h: number) => number
}) {
  return (
    <>
      {labels.map(({ hour, label }) => (
        <text
          key={hour}
          x={hourX(hour)}
          y={y}
          textAnchor={hour === 0 ? 'start' : 'middle'}
          fontSize={7}
          className="log-caption"
        >
          {label}
        </text>
      ))}
    </>
  )
}
