/// <reference types="vite/client" />

import type { CursorFrame } from '../shared/types'

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
  pauseRecording: () => void
  startExport: (config: unknown) => void
  onRecordingStatus: (cb: (status: string) => void) => () => void
  onExportProgress: (cb: (progress: number) => void) => () => void
  onExportDone: (cb: (result: { path: string | null; error?: string }) => void) => () => void
  onCursorData: (cb: (frame: CursorFrame) => void) => () => void
}

interface Window {
  kino: KinoAPI
}
