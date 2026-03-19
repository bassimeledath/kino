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

export type RecordingStatus = 'idle' | 'countdown' | 'recording' | 'paused' | 'processing'

export interface TimelineSegment {
  id: string
  startTime: number
  endTime: number
  deleted: boolean
  speed: number
  zoomEnabled: boolean
}
