/// <reference types="vite/client" />

import type { CursorFrame, ExportDoneResult, ExportStartConfig } from '../shared/types'

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
  onRecordingStatus: (cb: (status: string) => void) => () => void
  onExportProgress: (cb: (progress: number) => void) => () => void
  onExportDone: (cb: (result: ExportDoneResult) => void) => () => void
  onCursorData: (cb: (frame: CursorFrame) => void) => () => void
}

interface Window {
  kino: KinoAPI
}
