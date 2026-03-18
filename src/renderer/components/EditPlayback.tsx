import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { TimelineSegment } from '../../shared/types'

interface EditPlaybackProps {
  playbackUrl: string
  segments: TimelineSegment[]
  playheadMs: number
  onPlayheadChange: (ms: number) => void
  isPlaying: boolean
  onPlayingChange: (playing: boolean) => void
}

export function EditPlayback({
  playbackUrl,
  segments,
  playheadMs,
  onPlayheadChange,
  isPlaying,
  onPlayingChange,
}: EditPlaybackProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const lastReportedRef = useRef(0)

  const activeSegments = useMemo(
    () => segments.filter((s) => !s.deleted).sort((a, b) => a.startTime - b.startTime),
    [segments],
  )

  const activeSegmentsRef = useRef(activeSegments)
  activeSegmentsRef.current = activeSegments

  // Seek video when playheadMs changes externally (e.g. timeline click)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (Math.abs(playheadMs - lastReportedRef.current) > 200) {
      video.currentTime = playheadMs / 1000
    }
  }, [playheadMs])

  // Play / pause
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      const segs = activeSegmentsRef.current
      if (segs.length === 0) {
        onPlayingChange(false)
        return
      }
      const currentMs = video.currentTime * 1000
      const inSeg = segs.find((s) => currentMs >= s.startTime && currentMs < s.endTime)
      if (!inSeg) {
        const next = segs.find((s) => s.startTime >= currentMs) || segs[0]
        if (next) {
          video.currentTime = next.startTime / 1000
          lastReportedRef.current = next.startTime
          onPlayheadChange(next.startTime)
        }
      }
      video.play()
    } else {
      video.pause()
    }
  }, [isPlaying, onPlayheadChange, onPlayingChange])

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const currentMs = Math.round(video.currentTime * 1000)
    lastReportedRef.current = currentMs
    onPlayheadChange(currentMs)

    if (!video.paused) {
      const segs = activeSegmentsRef.current
      const inSeg = segs.find((s) => currentMs >= s.startTime && currentMs < s.endTime)

      if (!inSeg) {
        const next = segs.find((s) => s.startTime > currentMs)
        if (next) {
          video.currentTime = next.startTime / 1000
          lastReportedRef.current = next.startTime
          onPlayheadChange(next.startTime)
        } else {
          video.pause()
          onPlayingChange(false)
          if (segs.length > 0) {
            video.currentTime = segs[0].startTime / 1000
            lastReportedRef.current = segs[0].startTime
            onPlayheadChange(segs[0].startTime)
          }
        }
      }
    }
  }, [onPlayheadChange, onPlayingChange])

  const handleEnded = useCallback(() => {
    onPlayingChange(false)
    const segs = activeSegmentsRef.current
    if (segs.length > 0 && videoRef.current) {
      videoRef.current.currentTime = segs[0].startTime / 1000
      lastReportedRef.current = segs[0].startTime
      onPlayheadChange(segs[0].startTime)
    }
  }, [onPlayheadChange, onPlayingChange])

  return (
    <video
      ref={videoRef}
      src={playbackUrl}
      className="w-full rounded-2xl border border-zinc-800 shadow-2xl bg-black"
      playsInline
      onTimeUpdate={handleTimeUpdate}
      onEnded={handleEnded}
    />
  )
}
