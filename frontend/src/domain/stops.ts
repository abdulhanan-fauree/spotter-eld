/** Stop vocabulary. Mirrors `apps.hos.types.StopKind` on the server. */

export type StopKind =
  | 'pre_trip'
  | 'pickup'
  | 'dropoff'
  | 'fuel'
  | 'break_30'
  | 'rest_10'
  | 'restart_34'

export const STOP_TITLE: Record<StopKind, string> = {
  pre_trip: 'Pre-trip inspection',
  pickup: 'Pickup',
  dropoff: 'Dropoff',
  fuel: 'Fuel stop',
  break_30: '30-minute break',
  rest_10: '10-hour rest',
  restart_34: '34-hour restart',
}
