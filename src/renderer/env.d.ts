/// <reference types="vite/client" />

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
}

interface Window {
  kino: KinoAPI
}
