import { contextBridge, ipcRenderer } from 'electron'
import { Channels } from '../shared/channels'

contextBridge.exposeInMainWorld('kino', {
  // Request/response
  getSources: () => ipcRenderer.invoke(Channels.SOURCES_LIST),
  checkPermission: (type: string) => ipcRenderer.invoke(Channels.PERMISSIONS_CHECK, type),

  // Recording controls
  startRecording: (config: unknown) => ipcRenderer.send(Channels.RECORDING_START, config),
  stopRecording: () => ipcRenderer.send(Channels.RECORDING_STOP),
  pauseRecording: () => ipcRenderer.send(Channels.RECORDING_PAUSE),

  // Export
  startExport: (config: unknown) => ipcRenderer.send(Channels.EXPORT_START, config),

  // Events from main
  onRecordingStatus: (cb: (status: string) => void) => {
    ipcRenderer.on(Channels.RECORDING_STATUS, (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners(Channels.RECORDING_STATUS)
  },
  onExportProgress: (cb: (progress: number) => void) => {
    ipcRenderer.on(Channels.EXPORT_PROGRESS, (_e, p) => cb(p))
    return () => ipcRenderer.removeAllListeners(Channels.EXPORT_PROGRESS)
  },
})
