import { contextBridge, ipcRenderer } from 'electron'
import { Channels } from '../shared/channels'
import type {
  CursorFrame,
  ExportDoneResult,
  ExportStartConfig,
  RecordingStatus,
} from '../shared/types'

contextBridge.exposeInMainWorld('kino', {
  // Request/response
  getSources: () => ipcRenderer.invoke(Channels.SOURCES_LIST),
  checkPermission: (type: string) => ipcRenderer.invoke(Channels.PERMISSIONS_CHECK, type),

  // Recording controls
  startRecording: (config: unknown) => ipcRenderer.send(Channels.RECORDING_START, config),
  stopRecording: () => ipcRenderer.send(Channels.RECORDING_STOP),
  // Export
  startExport: (config: ExportStartConfig) => ipcRenderer.invoke(Channels.EXPORT_START, config) as Promise<ExportDoneResult>,

  // Events from main
  onRecordingStatus: (cb: (status: RecordingStatus) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, data: RecordingStatus) => cb(data)
    ipcRenderer.on(Channels.RECORDING_STATUS, handler)
    return () => ipcRenderer.removeListener(Channels.RECORDING_STATUS, handler)
  },

  onExportProgress: (cb: (progress: number) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, p: number) => cb(p)
    ipcRenderer.on(Channels.EXPORT_PROGRESS, handler)
    return () => ipcRenderer.removeListener(Channels.EXPORT_PROGRESS, handler)
  },

  onExportDone: (cb: (result: ExportDoneResult) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, r: ExportDoneResult) => cb(r)
    ipcRenderer.on(Channels.EXPORT_DONE, handler)
    return () => ipcRenderer.removeListener(Channels.EXPORT_DONE, handler)
  },

  onCursorData: (cb: (frame: CursorFrame) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, frame: CursorFrame) => cb(frame)
    ipcRenderer.on(Channels.CURSOR_DATA, handler)
    return () => ipcRenderer.removeListener(Channels.CURSOR_DATA, handler)
  },

  // Toolbar-specific
  toolbarStartRecording: () => ipcRenderer.send(Channels.TOOLBAR_START_RECORDING),
  toolbarStopRecording: () => ipcRenderer.send(Channels.TOOLBAR_STOP_RECORDING),
  onToolbarTimer: (cb: (elapsedMs: number) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, ms: number) => cb(ms)
    ipcRenderer.on(Channels.TOOLBAR_RECORDING_TIMER, handler)
    return () => ipcRenderer.removeListener(Channels.TOOLBAR_RECORDING_TIMER, handler)
  },
})
