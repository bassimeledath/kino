import { useCallback, useEffect, useState } from 'react'

type ToolbarPhase = 'idle' | 'recording'

function fmtTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function FloatingToolbar() {
  const [phase, setPhase] = useState<ToolbarPhase>('idle')
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (typeof window.kino?.onRecordingStatus !== 'function') return
    const off = window.kino.onRecordingStatus((status) => {
      if (status === 'recording') setPhase('recording')
      else if (status === 'idle') setPhase('idle')
    })
    return off
  }, [])

  useEffect(() => {
    if (typeof window.kino?.onToolbarTimer !== 'function') return
    const off = window.kino.onToolbarTimer((ms) => {
      setElapsed(ms)
    })
    return off
  }, [])

  const handleRecord = useCallback(() => {
    window.kino.toolbarStartRecording()
  }, [])

  const handleStop = useCallback(() => {
    window.kino.toolbarStopRecording()
  }, [])

  return (
    <div
      className="flex h-full items-center px-3 gap-2"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {phase === 'idle' ? (
        <>
          <button
            data-testid="toolbar-record-btn"
            onClick={handleRecord}
            className="flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-1.5 text-[12px] font-semibold text-white transition-all duration-150 hover:bg-red-600 active:scale-[0.97]"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div className="w-2 h-2 rounded-full bg-white" />
            Record
          </button>
          <button
            data-testid="toolbar-settings-btn"
            className="rounded-full bg-zinc-700/60 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-600 hover:text-zinc-200"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1.5 text-[12px] font-mono text-red-400 font-medium min-w-[52px]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {fmtTimer(elapsed)}
          </span>
          <button
            data-testid="toolbar-stop-btn"
            onClick={handleStop}
            className="flex items-center gap-1.5 rounded-full bg-zinc-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-all duration-150 hover:bg-zinc-500 active:scale-[0.97]"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div className="w-2 h-2 rounded-sm bg-white" />
            Stop
          </button>
        </>
      )}
    </div>
  )
}
