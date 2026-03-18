import { useRecordingStore } from './store/recording'

function App() {
  const status = useRecordingStore((s) => s.status)

  return (
    <div className="flex h-screen flex-col">
      {/* Title bar drag region */}
      <div className="h-12 flex-shrink-0 [-webkit-app-region:drag]" />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Preview area */}
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="mb-4 text-4xl font-bold">Kino</h1>
            <p className="mb-8 text-zinc-400">Screen recording with auto-zoom</p>

            {/* Recording controls */}
            <div className="flex items-center justify-center gap-4">
              {status === 'idle' ? (
                <button
                  data-testid="record-btn"
                  className="rounded-full bg-red-500 px-8 py-3 font-medium text-white transition hover:bg-red-600"
                  onClick={() => window.kino.startRecording({})}
                >
                  Record
                </button>
              ) : status === 'recording' ? (
                <button
                  data-testid="stop-btn"
                  className="rounded-full bg-zinc-700 px-8 py-3 font-medium text-white transition hover:bg-zinc-600"
                  onClick={() => window.kino.stopRecording()}
                >
                  Stop
                </button>
              ) : null}

              <button
                data-testid="settings"
                className="rounded-full bg-zinc-800 px-6 py-3 text-zinc-300 transition hover:bg-zinc-700"
                onClick={() => {}}
              >
                Settings
              </button>
            </div>

            {/* Zoom toggle */}
            <div className="mt-6 flex items-center justify-center gap-2">
              <label className="text-sm text-zinc-400">Auto-Zoom</label>
              <input
                type="checkbox"
                data-testid="zoom-toggle"
                defaultChecked
                className="h-4 w-4"
              />
            </div>
          </div>
        </div>

        {/* Settings panel placeholder */}
        <div
          data-testid="settings-panel"
          className="hidden w-72 border-l border-zinc-800 bg-zinc-900 p-4"
        >
          <h2 className="mb-4 text-lg font-semibold">Settings</h2>
        </div>
      </div>

      {/* Timeline placeholder */}
      <div
        data-testid="timeline"
        className="hidden h-32 border-t border-zinc-800 bg-zinc-900"
      >
        <div className="p-4 text-sm text-zinc-500">Timeline</div>
      </div>

      {/* Export button */}
      <div className="flex justify-end border-t border-zinc-800 p-3">
        <button
          data-testid="export-btn"
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Export
        </button>
      </div>
    </div>
  )
}

export default App
