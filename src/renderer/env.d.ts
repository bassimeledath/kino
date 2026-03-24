/// <reference types="vite/client" />

import type {
  CursorFrame,
  ExportDoneResult,
  ExportStartConfig,
  RecordingStatus,
  ZoomEvent,
} from '../shared/types'
import type { RecordingMetadata } from './hooks/useRecording'

interface ToolbarRecordingPayload {
  data: ArrayBuffer
  duration: number
  metadata: RecordingMetadata
  zoomEvents: ZoomEvent[]
}

interface KinoAPI {
  getSources: () => Promise<Array<{
    id: string
    name: string
    thumbnailDataURL: string
    display_id: string
  }>>
  checkPermission: (type: string) => Promise<string>
  startRecording: (config: unknown) => void
  stopRecording: () => void
  startExport: (config: ExportStartConfig) => Promise<ExportDoneResult>
  onRecordingStatus: (cb: (status: RecordingStatus) => void) => () => void
  onExportProgress: (cb: (progress: number) => void) => () => void
  onExportDone: (cb: (result: ExportDoneResult) => void) => () => void
  onCursorData: (cb: (frame: CursorFrame) => void) => () => void
  // Toolbar
  sendToolbarRecording: (payload: ToolbarRecordingPayload) => Promise<{ ok: boolean; error?: string }>
  getToolbarRecording: () => Promise<ToolbarRecordingPayload | null>
  closeToolbar: () => void
}

interface Window {
  kino: KinoAPI
}
