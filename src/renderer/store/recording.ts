import { create } from 'zustand'
import { isRecordingStatus } from '../../shared/types'
import type { ProjectSettings, RecordingStatus } from '../../shared/types'

interface RecordingStore {
  status: RecordingStatus
  settings: ProjectSettings
  setStatus: (status: RecordingStatus) => void
  updateSettings: (partial: Partial<ProjectSettings>) => void
}

const defaultSettings: ProjectSettings = {
  fps: 60,
  resolution: 'native',
  autoZoom: true,
  autoZoomLevel: 1.902,
  dwellZoomLevel: 1.3,
  dwellDelay: 4000,
  cursorSmoothing: true,
  cursorSize: 1.5,
  clickHighlight: true,
  background: '#0a0a0a',
  padding: 48,
  cornerRadius: 12,
  shadowEnabled: true,
  shadowBlur: 40,
  screenSpringStiffness: 200,
  screenSpringDamping: 40,
  screenSpringMass: 2.25,
  mouseSpringStiffness: 470,
  mouseSpringDamping: 70,
  mouseSpringMass: 3,
  zoomSpringStiffness: 700,
  zoomSpringDamping: 30,
  zoomSpringMass: 1,
  zoomOutSpringStiffness: 300,
  zoomOutSpringDamping: 25,
  zoomOutSpringMass: 1.5,
  snapToEdgesRatio: 0.25,
}

export const useRecordingStore = create<RecordingStore>((set) => ({
  status: 'idle',
  settings: defaultSettings,
  setStatus: (status) => set({ status }),
  updateSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),
}))

// Listen for status updates from main process
if (typeof window !== 'undefined' && window.kino) {
  try {
    window.kino.onRecordingStatus((status) => {
      if (!isRecordingStatus(status)) {
        console.warn('[recording-store] ignored invalid recording status', status)
        return
      }
      useRecordingStore.getState().setStatus(status)
    })
  } catch {
    // IPC listener setup failed gracefully
  }
}
