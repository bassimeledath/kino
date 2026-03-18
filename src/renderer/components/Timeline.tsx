import { useEffect, useRef, useState } from 'react'
import type { TimelineSegment } from '../../shared/types'

interface TimelineProps {
  hasRecorded: boolean
  recordDuration: number
  playheadMs: number
  selectedSegmentId: string | null
  segments: TimelineSegment[]
  onSetPlayheadMs: (value: number) => void
  onToggleSegmentSelected: (id: string) => void
  onSplit: () => void
  onDeleteSegment: () => void
  onUpdateSegment: (id: string, updates: Partial<TimelineSegment>) => void
}

function fmtMs(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function Timeline(props: TimelineProps) {
  const {
    hasRecorded,
    recordDuration,
    playheadMs,
    selectedSegmentId,
    segments,
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

  // Map absolute time → visual fraction (0..1) in collapsed layout
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

  // Map visual fraction (0..1) → absolute time
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

  return (
    <div
      data-testid="timeline"
      className="border-t border-zinc-800 bg-zinc-900 flex-shrink-0"
      style={{ height: '9.5rem' }}
    >
      <div className="px-4 py-2.5 h-full flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-zinc-400">Timeline</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-zinc-500">{fmtMs(playheadMs)}</span>
            <button
              onClick={onSplit}
              className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-zinc-700"
              title="Split at playhead (S key)"
            >
              Split
            </button>
            <button
              onClick={onDeleteSegment}
              disabled={!selectedSegmentId}
              className="text-xs px-2.5 py-1 rounded-md bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-zinc-700 disabled:opacity-40"
              title="Delete selected segment (Delete key)"
            >
              Delete
            </button>
            <span className="text-[10px] text-zinc-600">S=split · Del=remove</span>
          </div>
        </div>

        <div
          ref={trackRef}
          className="relative flex-1 bg-zinc-800/80 rounded-lg overflow-hidden border border-zinc-700/50 cursor-pointer"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const frac = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
            onSetPlayheadMs(Math.round(visualFracToAbs(frac)))
          }}
        >
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
                  className={`absolute inset-y-1 rounded-md transition-colors ${
                    isSelected
                      ? 'bg-red-500/50 border border-red-500/70'
                      : 'bg-red-500/20 border border-red-500/30 hover:bg-red-500/35'
                  }`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onToggleSegmentSelected(segment.id)
                  }}
                >
                  <span className="text-[10px] text-red-300/60 pl-1.5 truncate block leading-tight pt-1">
                    {fmtMs(segment.endTime - segment.startTime)}
                  </span>
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-red-400/50 rounded-l-md hover:bg-red-400/80"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setTrimDrag({ segmentId: segment.id, side: 'left' })
                    }}
                  />
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize bg-red-400/50 rounded-r-md hover:bg-red-400/80"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      setTrimDrag({ segmentId: segment.id, side: 'right' })
                    }}
                  />
                </div>
              )
            })
          })()}

          <div
            className="absolute top-0 bottom-0 w-px bg-white/80 pointer-events-none"
            style={{ left: `${absToVisualFrac(playheadMs) * 100}%` }}
          />
          <div
            className="absolute -top-px w-2 h-2 bg-white rounded-sm -translate-x-1/2 pointer-events-none"
            style={{ left: `${absToVisualFrac(playheadMs) * 100}%` }}
          />
        </div>

        <div className="flex justify-between mt-1 px-0.5">
          <span className="text-[10px] text-zinc-600 font-mono">0:00</span>
          <span className="text-[10px] text-zinc-600 font-mono">{fmtMs(Math.floor(visualDuration / 2))}</span>
          <span className="text-[10px] text-zinc-600 font-mono">{fmtMs(visualDuration)}</span>
        </div>
      </div>
    </div>
  )
}
