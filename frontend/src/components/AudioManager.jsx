import { useEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'

/**
 * Global audio manager to guarantee participant and screen share audio
 * plays continuously without interruptions when changing UI layouts or tabs.
 */
export default function AudioManager({ peers, peerVolumes = {}, screenVolumes = {} }) {
  const audioElementsRef = useRef({})
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)

  // Attach streams to dedicated audio elements
  useEffect(() => {
    peers.forEach((peer) => {
      // 1. Participant Microphone Audio
      if (peer.stream) {
        const audioTracks = peer.stream.getAudioTracks()
        const micKey = `mic-${peer.userId}`
        if (audioTracks.length > 0) {
          let el = audioElementsRef.current[micKey]
          if (!el) {
            el = new Audio()
            el.autoplay = true
            el.playsInline = true
            audioElementsRef.current[micKey] = el
          }

          if (el.srcObject !== peer.stream) {
            el.srcObject = peer.stream
            const userVol = peerVolumes[peer.userId] !== undefined ? peerVolumes[peer.userId] : 1.0
            el.volume = Math.min(Math.max(userVol, 0), 1)

            el.play().catch((err) => {
              console.warn(`Autoplay blocked for ${micKey}:`, err)
              setAutoplayBlocked(true)
            })
          }
        }
      }

      // 2. Participant Screen Share Audio (System/Tab audio)
      if (peer.screenStream) {
        const screenAudioTracks = peer.screenStream.getAudioTracks()
        const screenKey = `screen-${peer.userId}`
        if (screenAudioTracks.length > 0) {
          let screenEl = audioElementsRef.current[screenKey]
          if (!screenEl) {
            screenEl = new Audio()
            screenEl.autoplay = true
            screenEl.playsInline = true
            audioElementsRef.current[screenKey] = screenEl
          }

          if (screenEl.srcObject !== peer.screenStream) {
            screenEl.srcObject = peer.screenStream
            const scrVol = screenVolumes[peer.userId] !== undefined ? screenVolumes[peer.userId] : 1.0
            screenEl.volume = Math.min(Math.max(scrVol, 0), 1)

            screenEl.play().catch((err) => {
              console.warn(`Autoplay blocked for ${screenKey}:`, err)
              setAutoplayBlocked(true)
            })
          }
        }
      }
    })

    // Clean up audio elements for disconnected peers
    const activeUserIds = new Set(peers.map((p) => p.userId))
    const currentAudioElements = audioElementsRef.current
    Object.keys(currentAudioElements).forEach((key) => {
      const parts = key.split('-')
      const uid = parts.slice(1).join('-')
      if (!activeUserIds.has(uid)) {
        const el = currentAudioElements[key]
        if (el) {
          el.pause()
          el.srcObject = null
          delete currentAudioElements[key]
        }
      }
    })
  }, [peers, peerVolumes, screenVolumes])

  // React to volume changes
  useEffect(() => {
    Object.keys(audioElementsRef.current).forEach((key) => {
      const el = audioElementsRef.current[key]
      if (!el) return
      if (key.startsWith('mic-')) {
        const uid = key.replace('mic-', '')
        const vol = peerVolumes[uid] !== undefined ? peerVolumes[uid] : 1.0
        el.volume = Math.min(Math.max(vol, 0), 1)
      } else if (key.startsWith('screen-')) {
        const uid = key.replace('screen-', '')
        const vol = screenVolumes[uid] !== undefined ? screenVolumes[uid] : 1.0
        el.volume = Math.min(Math.max(vol, 0), 1)
      }
    })
  }, [peerVolumes, screenVolumes])

  const handleUnlockAudio = () => {
    Object.values(audioElementsRef.current).forEach((el) => {
      if (el) {
        el.play().catch(console.warn)
      }
    })
    setAutoplayBlocked(false)
  }

  if (!autoplayBlocked) return null

  return (
    <div
      className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold px-4 py-2 rounded-lg shadow-xl flex items-center gap-3 cursor-pointer transition animate-bounce"
      onClick={handleUnlockAudio}
    >
      <Volume2 size={20} />
      <span>Audio is muted by browser. Click here to enable audio!</span>
    </div>
  )
}
