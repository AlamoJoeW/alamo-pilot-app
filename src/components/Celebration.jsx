import { useEffect, useRef, useState } from 'react'

// Easter egg: plays after a pilot submits an EOD covering MORE than 4 sites
// (collected + partial + mob, each site counted once). Plays once automatically,
// then offers up to 2 replays, after which only "Close" is left.
const MAX_REPLAYS = 2

export default function Celebration({ siteCount, onClose }) {
  const videoRef = useRef(null)
  const [ended, setEnded] = useState(false)
  const [replaysLeft, setReplaysLeft] = useState(MAX_REPLAYS)
  const [muted, setMuted] = useState(false)

  // Try with sound first; browsers (iOS Safari especially) may refuse, so fall
  // back to muted playback and show a "tap for sound" button.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    const p = v.play()
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        v.muted = true
        setMuted(true)
        v.play().catch(() => setEnded(true))
      })
    }
  }, [])

  function replay() {
    const v = videoRef.current
    if (!v || replaysLeft <= 0) return
    setReplaysLeft(n => n - 1)
    setEnded(false)
    v.currentTime = 0
    v.play().catch(() => {
      v.muted = true
      setMuted(true)
      v.play().catch(() => setEnded(true))
    })
  }

  function unmute() {
    const v = videoRef.current
    if (!v) return
    v.muted = false
    setMuted(false)
  }

  return (
    <div className="celebrate-overlay" role="dialog" aria-label="Great work">
      <video
        ref={videoRef}
        className="celebrate-video"
        src="/celebrate.mp4"
        playsInline
        preload="auto"
        onEnded={() => setEnded(true)}
      />
      <button className="celebrate-close" onClick={onClose} aria-label="Close">✕</button>
      {muted && !ended && (
        <button className="celebrate-sound" onClick={unmute}>🔊 Tap for sound</button>
      )}
      {ended && (
        <div className="celebrate-end">
          <div className="celebrate-title">{siteCount} sites today — great work! 🎉</div>
          <div className="celebrate-btns">
            {replaysLeft > 0 && (
              <button className="celebrate-btn celebrate-btn-secondary" onClick={replay}>
                ▶ Watch again ({replaysLeft} left)
              </button>
            )}
            <button className="celebrate-btn" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
