export interface RecordingConfig {
  sourceId: string
  sourceType: 'screen' | 'window' | 'region'
  audioSources: {
    systemAudio: boolean
    microphone: boolean
  }
  countdown: number // seconds, 0 = no countdown
}

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
  autoZoomLevel: number // 1.0 - 4.0
  cursorSmoothing: boolean
  cursorSize: number // multiplier, 1.0 = default
  clickHighlight: boolean
  background: string // CSS color
  padding: number // pixels
  cornerRadius: number // pixels
  shadowEnabled: boolean
  shadowBlur: number
}

export interface ExportConfig {
  format: 'mp4'
  codec: 'h264' | 'h265'
  resolution: '720p' | '1080p' | '4k'
  fps: 30 | 60
  quality: 'fast' | 'balanced' | 'high'
  outputPath: string
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
