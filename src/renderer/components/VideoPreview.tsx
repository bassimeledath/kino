import type { RefObject } from 'react'
import type { ProjectSettings, RecordingStatus, TimelineSegment } from '../../shared/types'
import { fmtMs } from '../utils/format'
import { CanvasPlayback } from './CanvasPlayback'

interface VideoPreviewProps {
  status: RecordingStatus
  hasRecorded: boolean
  countdownValue: number | null
  recordDuration: number
  settings: ProjectSettings
  playbackUrl: string | null
  captureVideoRef: RefObject<HTMLVideoElement>
  canvasRef: RefObject<HTMLCanvasElement>
  segments: TimelineSegment[]
  playheadMs: number
  onPlayheadChange: (ms: number) => void
  isPlaying: boolean
  onPlayingChange: (playing: boolean) => void
}

export function VideoPreview(props: VideoPreviewProps) {
  const {
    status,
    hasRecorded,
    countdownValue,
    recordDuration,
    settings,
    playbackUrl,
    captureVideoRef,
    canvasRef,
    segments,
    playheadMs,
    onPlayheadChange,
    isPlaying,
    onPlayingChange,
  } = props

  return (
    <>
      <video ref={captureVideoRef} className="hidden" muted playsInline />

      {countdownValue !== null && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
          <div
            key={countdownValue}
            className="text-[8rem] font-black text-white leading-none"
            style={{ animation: 'countdownPop 0.8s ease-out forwards' }}
          >
            {countdownValue}
          </div>
          <style>{`
            @keyframes countdownPop {
              0%   { transform: scale(1.6); opacity: 0; }
              30%  { transform: scale(1.0); opacity: 1; }
              80%  { transform: scale(1.0); opacity: 1; }
              100% { transform: scale(0.7); opacity: 0; }
            }
          `}</style>
        </div>
      )}

      {status === 'idle' && !hasRecorded && countdownValue === null && (
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
              <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="6" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Kino</h1>
          </div>
          <p className="text-zinc-500 text-xs">Professional screen recording with auto-zoom</p>
        </div>
      )}

      {status === 'recording' ? (
        <div className="relative mb-6 w-full max-w-2xl">
          <canvas
            ref={canvasRef}
            width={800}
            height={450}
            className="w-full rounded-2xl border border-zinc-800 shadow-2xl"
          />
          <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1.5 text-xs font-mono backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            {fmtMs(recordDuration)}
          </div>
        </div>
      ) : hasRecorded ? (
        <div className="mb-8 w-full max-w-2xl">
          {playbackUrl ? (
            <CanvasPlayback
              playbackUrl={playbackUrl}
              segments={segments}
              playheadMs={playheadMs}
              onPlayheadChange={onPlayheadChange}
              isPlaying={isPlaying}
              onPlayingChange={onPlayingChange}
              settings={settings}
            />
          ) : (
            <div
              className="w-full aspect-video rounded-2xl border border-zinc-800 flex items-center justify-center shadow-2xl shadow-black/60"
              style={{ background: '#111' }}
            >
              <span className="text-xs text-zinc-500">{fmtMs(recordDuration)} recorded — preparing playback...</span>
            </div>
          )}
        </div>
      ) : (
        <div
          className="mb-8 w-96 h-52 rounded-2xl border border-zinc-800 flex items-center justify-center shadow-2xl shadow-black/60 relative overflow-hidden"
          style={{ background: settings.background, borderRadius: settings.cornerRadius }}
        >
          <div className="flex flex-col items-center gap-3 text-zinc-600">
            <svg width="44" height="44" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <span className="text-xs font-medium">No preview</span>
          </div>
        </div>
      )}
    </>
  )
}
