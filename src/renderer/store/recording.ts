import { create } from 'zustand'
import type { RecordingStatus, ProjectSettings } from '../../shared/types'

interface RecordingStore {
  status: RecordingStatus
  duration: number
  selectedSourceId: string | null
  settings: ProjectSettings
  setStatus: (status: RecordingStatus) => void
  setSource: (id: string) => void
  updateSettings: (partial: Partial<ProjectSettings>) => void
}

const defaultSettings: ProjectSettings = {
  fps: 60,
  resolution: 'native',
  autoZoom: true,
  autoZoomLevel: 2.0,
  cursorSmoothing: true,
  cursorSize: 1.5,
  clickHighlight: true,
  background: '#0a0a0a',
  padding: 48,
  cornerRadius: 12,
  shadowEnabled: true,
  shadowBlur: 40,
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  status: 'idle',
  duration: 0,
  selectedSourceId: null,
  settings: defaultSettings,
  setStatus: (status) => set({ status }),
  setSource: (id) => set({ selectedSourceId: id }),
  updateSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),
}))

// Listen for status updates from main process
if (typeof window !== 'undefined' && window.kino) {
  window.kino.onRecordingStatus((status: string) => {
    useRecordingStore.getState().setStatus(status as RecordingStatus)
  })
}
