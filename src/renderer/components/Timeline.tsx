import { useEffect, useRef, useState } from 'react'
import type { TimelineSegment, ZoomEvent } from '../../shared/types'
import { fmtMs } from '../utils/format'

interface TimelineProps {
  hasRecorded: boolean
  recordDuration: number
  playheadMs: number
  selectedSegmentId: string | null
  segments: TimelineSegment[]
  zoomEvents: ZoomEvent[]
  onSetPlayheadMs: (value: number) => void
  onToggleSegmentSelected: (id: string) => void
  onSplit: () => void
  onDeleteSegment: () => void
  onUpdateSegment: (id: string, updates: Partial<TimelineSegment>) => void
}

export function Timeline(props: TimelineProps) {
  const {
    hasRecorded,
    recordDuration,
    playheadMs,
    selectedSegmentId,
    segments,
    zoomEvents,
    onSetPlayheadMs,
    onToggleSegmentSelected,
    onSplit,
    onDeleteSegment,
    onUpdateSegment,
  } = props

  const [trimDrag, setTrimDrag] = useState<{
    segmentId: string
    side: 'left' | 'right'
  } | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  const totalDur = Math.max(recordDuration, 1)

  // Collapsed visual layout: position non-deleted segments contiguously
  const visibleSegments = segments
    .filter((s) => !s.deleted)
    .sort((a, b) => a.startTime - b.startTime)

  const visualDuration = Math.max(
    visibleSegments.reduce((sum, s) => sum + (s.endTime - s.startTime), 0),
    1,
  )

  // Map absolute time -> visual fraction (0..1) in collapsed layout
  function absToVisualFrac(absMs: number): number {
    let visualMs = 0
    for (const seg of visibleSegments) {
      if (absMs <= seg.startTime) break
      if (absMs >= seg.endTime) {
        visualMs += seg.endTime - seg.startTime
      } else {
        visualMs += absMs - seg.startTime
        break
      }
    }
    return visualMs / visualDuration
  }

  // Map visual fraction (0..1) -> absolute time
  function visualFracToAbs(frac: number): number {
    let targetMs = frac * visualDuration
    for (const seg of visibleSegments) {
      const segDur = seg.endTime - seg.startTime
      if (targetMs <= segDur) {
        return seg.startTime + targetMs
      }
      targetMs -= segDur
    }
    const last = visibleSegments[visibleSegments.length - 1]
    return last ? last.endTime : 0
  }

  useEffect(() => {
    if (!trimDrag || !trackRef.current) return
    const track = trackRef.current

    const handleMouseMove = (e: MouseEvent) => {
      const rect = track.getBoundingClientRect()
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const timeMs = Math.round(visualFracToAbs(frac))

      const seg = segments.find((s) => s.id === trimDrag.segmentId)
      if (!seg) return

      if (trimDrag.side === 'left') {
        const newStart = Math.max(0, Math.min(timeMs, seg.endTime - 100))
        onUpdateSegment(trimDrag.segmentId, { startTime: newStart })
      } else {
        const newEnd = Math.min(totalDur, Math.max(timeMs, seg.startTime + 100))
        onUpdateSegment(trimDrag.segmentId, { endTime: newEnd })
      }
    }

    const handleMouseUp = () => setTrimDrag(null)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [trimDrag, segments, recordDuration, onUpdateSegment])

  if (!hasRecorded) return null

  const playheadFrac = absToVisualFrac(playheadMs) * 100

  return (
    <div
      data-testid="timeline"
      className="border-t border-zinc-800/60 bg-zinc-900/95 flex-shrink-0"
      style={{ height: '10.5rem' }}
    >
      <div className="px-4 py-2.5 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold text-zinc-400 tracking-wide uppercase">Timeline</span>
            <span className="text-[11px] font-mono text-zinc-500 tabular-nums">{fmtMs(playheadMs)} / {fmtMs(visualDuration)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onSplit}
              className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-all border border-zinc-700/50"
              title="Split at playhead (S key)"
            >
              <span className="flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <line x1="5" y1="0" x2="5" y2="10" />
                  <line x1="2" y1="3" x2="5" y2="0" />
                  <line x1="8" y1="3" x2="5" y2="0" />
                </svg>
                Split
              </span>
            </button>
            <button
              onClick={onDeleteSegment}
              disabled={!selectedSegmentId}
              className="text-[11px] px-2.5 py-1 rounded-md bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-all border border-zinc-700/50 disabled:opacity-30 disabled:pointer-events-none"
              title="Delete selected segment (Delete key)"
            >
              Delete
            </button>
            <span className="text-[10px] text-zinc-700 ml-1">S / Del</span>
          </div>
        </div>

        {/* Zoom events lane */}
        {zoomEvents.length > 0 && (
          <div className="relative h-3 mb-1 rounded-sm overflow-hidden bg-zinc-800/40">
            {zoomEvents.map((evt, i) => {
              const leftFrac = absToVisualFrac(evt.startMs) * 100
              const rightFrac = absToVisualFrac(evt.endMs) * 100
              const width = Math.max(rightFrac - leftFrac, 0.3)
              const isClick = evt.type === 'click'
              return (
                <div
                  key={i}
                  className={`absolute inset-y-0 rounded-sm ${
                    isClick
                      ? 'bg-cyan-500/40 border-b-2 border-cyan-400/60'
                      : 'bg-violet-500/35 border-b-2 border-violet-400/50'
                  }`}
                  style={{ left: `${leftFrac}%`, width: `${width}%` }}
                  title={`${evt.type} zoom: ${fmtMs(evt.startMs)} - ${fmtMs(evt.endMs)}`}
                />
              )
            })}
            {/* Zoom lane labels */}
            <div className="absolute inset-0 flex items-center px-1.5 pointer-events-none">
              <span className="text-[8px] text-zinc-600 font-medium tracking-wider uppercase">Zoom</span>
            </div>
          </div>
        )}

        {/* Main track */}
        <div
          ref={trackRef}
          className="relative flex-1 bg-zinc-800/60 rounded-lg overflow-hidden border border-zinc-700/40 cursor-pointer"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
            onSetPlayheadMs(Math.round(visualFracToAbs(frac)))
          }}
        >
          {/* Segments */}
          {(() => {
            let visualOffset = 0
            return visibleSegments.map((segment) => {
              const segDur = segment.endTime - segment.startTime
              const left = (visualOffset / visualDuration) * 100
              const width = Math.max((segDur / visualDuration) * 100, 0.5)
              visualOffset += segDur
              const isSelected = segment.id === selectedSegmentId

              return (
                <div
                  key={segment.id}
                  className={`absolute inset-y-1 rounded transition-all duration-100 ${
                    isSelected
                      ? 'bg-red-500/40 ring-1 ring-red-400/70 ring-inset'
                      : 'bg-zinc-600/30 hover:bg-zinc-500/35'
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleSegmentSelected(segment.id)
                  }}
                >
                  <span className="text-[9px] text-zinc-400/70 pl-1.5 truncate block leading-tight pt-1 font-mono">
                    {fmtMs(segment.endTime - segment.startTime)}
                  </span>
                  {/* Trim handles */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize rounded-l transition-colors hover:bg-white/20"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setTrimDrag({ segmentId: segment.id, side: 'left' })
                    }}
                  />
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize rounded-r transition-colors hover:bg-white/20"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setTrimDrag({ segmentId: segment.id, side: 'right' })
                    }}
                  />
                </div>
              )
            })
          })()}

          {/* Zoom event overlays on main track (thin bottom strip) */}
          {zoomEvents.length > 0 && zoomEvents.map((evt, i) => {
            const leftFrac = absToVisualFrac(evt.startMs) * 100
            const rightFrac = absToVisualFrac(evt.endMs) * 100
            const width = Math.max(rightFrac - leftFrac, 0.3)
            const isClick = evt.type === 'click'
            return (
              <div
                key={`zoom-${i}`}
                className={`absolute bottom-0 h-[3px] pointer-events-none ${
                  isClick ? 'bg-cyan-400/50' : 'bg-violet-400/40'
                }`}
                style={{ left: `${leftFrac}%`, width: `${width}%` }}
              />
            )
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px pointer-events-none"
            style={{
              left: `${playheadFrac}%`,
              background: 'linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(255,255,255,0.4))',
            }}
          />
          <div
            className="absolute -top-px w-2.5 h-2.5 bg-white rounded-full -translate-x-1/2 pointer-events-none shadow-sm shadow-black/30"
            style={{ left: `${playheadFrac}%` }}
          />
        </div>

        {/* Time ruler */}
        <div className="flex justify-between mt-1 px-0.5">
          <span className="text-[9px] text-zinc-600 font-mono tabular-nums">0:00</span>
          <span className="text-[9px] text-zinc-600 font-mono tabular-nums">{fmtMs(Math.floor(visualDuration / 4))}</span>
          <span className="text-[9px] text-zinc-600 font-mono tabular-nums">{fmtMs(Math.floor(visualDuration / 2))}</span>
          <span className="text-[9px] text-zinc-600 font-mono tabular-nums">{fmtMs(Math.floor((visualDuration * 3) / 4))}</span>
          <span className="text-[9px] text-zinc-600 font-mono tabular-nums">{fmtMs(visualDuration)}</span>
        </div>
      </div>
    </div>
  )
}
