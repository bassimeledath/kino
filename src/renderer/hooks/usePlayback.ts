import { useCallback, useEffect, useRef, useState } from 'react'

export function usePlayback() {
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null)
  const playbackUrlRef = useRef<string | null>(null)

  const clearPlayback = useCallback(() => {
    if (playbackUrlRef.current) {
      URL.revokeObjectURL(playbackUrlRef.current)
      playbackUrlRef.current = null
    }
    setPlaybackUrl(null)
  }, [])

  const setPlaybackFromChunks = useCallback(
    (chunks: Blob[]) => {
      if (chunks.length === 0) {
        clearPlayback()
        return null
      }

      const blob = new Blob(chunks, { type: 'video/webm' })
      const sizeKb = Math.round(blob.size / 1024)
      console.log(`[playback] blob created, ${sizeKb} KB, ${chunks.length} chunks`)

      const url = URL.createObjectURL(blob)
      if (playbackUrlRef.current) {
        URL.revokeObjectURL(playbackUrlRef.current)
      }
      playbackUrlRef.current = url
      setPlaybackUrl(url)
      return url
    },
    [clearPlayback],
  )

  useEffect(() => {
    return () => {
      if (playbackUrlRef.current) {
        URL.revokeObjectURL(playbackUrlRef.current)
      }
    }
  }, [])

  return {
    playbackUrl,
    clearPlayback,
    setPlaybackFromChunks,
  }
}
