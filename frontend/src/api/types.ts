/** Mirrors the DRF payload from `POST /api/trips/`. */

import type { DutyStatus } from '@/domain/duty'
import type { StopKind } from '@/domain/stops'

export type { StopKind }

export interface Place {
  name: string
  lat: number
  lng: number
  city_state: string
}

export interface Stop {
  sequence: number
  kind: StopKind
  status: DutyStatus
  label: string
  location: string
  lat: number | null
  lng: number | null
  arrive_at: string
  depart_at: string
  duration_hr: number
  mile_marker: number
}

export interface Step {
  sequence: number
  instruction: string
  distance_mi: number
  duration_hr: number
  mile_marker: number
}

export interface RouteLeg {
  sequence: number
  kind: string
  origin_lat: number
  origin_lng: number
  dest_lat: number
  dest_lng: number
  distance_mi: number
  duration_hr: number
}

export interface DutySegmentDto {
  status: DutyStatus
  start_minute: number
  end_minute: number
  note: string
}

export interface RemarkDto {
  minute: number
  location: string
  note: string
}

export interface RecapDto {
  on_duty_today: number
  total_last_7_days: number
  available_tomorrow: number
  total_last_8_days: number
}

export interface LogDay {
  day_index: number
  date: string
  totals: Record<DutyStatus, number>
  total_hours: number
  miles_driving_today: number
  segments: DutySegmentDto[]
  remarks: RemarkDto[]
  recap: RecapDto
  is_partial: boolean
}

export interface Violation {
  kind: string
  at: string
  detail: string
  limit: number
  actual: number
}

export interface TripSummary {
  total_miles: number
  drive_hours: number
  on_duty_hours: number
  elapsed_hours: number
  arrival_datetime: string
  cycle_used_start: number
  cycle_used_end: number
  log_sheet_count: number
}

export interface Trip {
  id: number
  created_at: string
  current_location: string
  pickup_location: string
  dropoff_location: string
  current_cycle_used: number
  start_datetime: string
  timezone: string
  allow_sleeper_split: boolean
  driver_name: string
  co_driver_name: string
  carrier_name: string
  main_office_address: string
  home_terminal_address: string
  truck_number: string
  trailer_number: string
  shipper_commodity: string
  shipping_doc_no: string
  origin_lat: number | null
  origin_lng: number | null
  pickup_lat: number | null
  pickup_lng: number | null
  dropoff_lat: number | null
  dropoff_lng: number | null
  route_geometry: [number, number][]
  routing_provider: string
  summary: TripSummary
  is_compliant: boolean
  violations: Violation[]
  legs: RouteLeg[]
  stops: Stop[]
  steps: Step[]
  log_days: LogDay[]
}

export interface TripListRow {
  id: number
  current_location: string
  pickup_location: string
  dropoff_location: string
  current_cycle_used: number
  total_miles: number
  drive_hours: number
  elapsed_hours: number
  arrival_datetime: string
  is_compliant: boolean
  log_sheet_count: number
  created_at: string
}

export interface TripInput {
  current_location: string
  pickup_location: string
  dropoff_location: string
  current_cycle_used: number
  start_datetime?: string
  timezone?: string
  allow_sleeper_split?: boolean
  driver_name?: string
  carrier_name?: string
  main_office_address?: string
  home_terminal_address?: string
  truck_number?: string
  trailer_number?: string
  shipper_commodity?: string
  shipping_doc_no?: string
}
