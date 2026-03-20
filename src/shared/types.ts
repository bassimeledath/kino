export interface CursorFrame {
  t: number      // ms since recording start
  x: number      // screen X coordinate
  y: number      // screen Y coordinate
  click: boolean // left button down
}

export interface ProjectSettings {
  fps: 30 | 60
  resolution: 'native' | '1080p' | '720p' | '4k'
  autoZoom: boolean
  autoZoomLevel: number // 1.0 - 4.0 (click zoom target)
  dwellZoomLevel: number // gentle zoom for long dwell (e.g. 1.3)
  dwellDelay: number // ms idle before dwell zoom triggers (e.g. 4000)
  cursorSmoothing: boolean
  cursorSize: number // multiplier, 1.0 = default
  clickHighlight: boolean
  background: string // CSS color
  padding: number // pixels
  cornerRadius: number // pixels
  shadowEnabled: boolean
  shadowBlur: number
  screenSpringStiffness: number
  screenSpringDamping: number
  screenSpringMass: number
  mouseSpringStiffness: number
  mouseSpringDamping: number
  mouseSpringMass: number
  zoomSpringStiffness: number
  zoomSpringDamping: number
  zoomSpringMass: number
  snapToEdgesRatio: number
}

export interface ExportStartConfig {
  data?: ArrayBuffer
  resolution?: 'native' | '1080p' | '720p' | '4k'
  fps?: 30 | 60
}

export interface ExportDoneResult {
  path: string | null
  error?: string
}

export const RECORDING_STATUSES = ['idle', 'countdown', 'recording', 'paused', 'processing'] as const
export type RecordingStatus = (typeof RECORDING_STATUSES)[number]

export function isRecordingStatus(value: string): value is RecordingStatus {
  return (RECORDING_STATUSES as readonly string[]).includes(value)
}

export interface TimelineSegment {
  id: string
  startTime: number
  endTime: number
  deleted: boolean
  speed: number
  zoomEnabled: boolean
}

export interface ZoomEvent {
  startMs: number
  endMs: number
  type: 'click' | 'dwell'
}
