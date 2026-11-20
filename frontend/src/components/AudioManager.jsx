import { useEffect, useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'

function PeerAudioPlayer({ stream, volume, onAutoplayBlocked }) {
  const audioRef = useRef(null)

  useEffect(() => {
    const el = audioRef.current
    if (!el || !stream) return

    const updateAudio = () => {
      if (stream.getAudioTracks().length > 0) {
        if (el.srcObject !== stream) {
          el.srcObject = stream
        }
        el.volume = Math.min(Math.max(volume, 0), 1)
        const playPromise = el.play()
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            console.warn('Autoplay prevented on audio element:', err)
            if (onAutoplayBlocked) onAutoplayBlocked()
          })
        }
      }
    }

    updateAudio()
    stream.addEventListener('addtrack', updateAudio)
    stream.addEventListener('removetrack', updateAudio)
    return () => {
      stream.removeEventListener('addtrack', updateAudio)
      stream.removeEventListener('removetrack', updateAudio)
    }
  }, [stream, volume, onAutoplayBlocked])

  return <audio ref={audioRef} autoPlay playsInline />
}

/**
 * Global audio manager with DOM-mounted audio elements.
 * Ensures microphone audio and screen audio play without pause or dropouts.
 */
export default function AudioManager({ peers, peerVolumes = {}, screenVolumes = {} }) {
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const containerRef = useRef(null)

  const handleUnlockAudio = () => {
    if (containerRef.current) {
      const audioElements = containerRef.current.querySelectorAll('audio')
      audioElements.forEach((el) => {
        el.play().catch(console.warn)
      })
    }
    setAutoplayBlocked(false)
  }

  return (
    <>
      {/* Real DOM-mounted audio players */}
      <div ref={containerRef} className="hidden" aria-hidden="true">
        {peers.map((peer) => (
          <div key={peer.userId}>
            {/* Remote Mic Audio */}
            {peer.stream && (
              <PeerAudioPlayer
                stream={peer.stream}
                volume={peerVolumes[peer.userId] ?? 1.0}
                onAutoplayBlocked={() => setAutoplayBlocked(true)}
              />
            )}
            {/* Remote Screen Share Audio */}
            {peer.screenStream && (
              <PeerAudioPlayer
                stream={peer.screenStream}
                volume={screenVolumes[peer.userId] ?? 1.0}
                onAutoplayBlocked={() => setAutoplayBlocked(true)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Autoplay Unlock Banner */}
      {autoplayBlocked && (
        <div
          className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 bg-amber-500 hover:bg-amber-600 text-gray-900 font-bold px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3 cursor-pointer transition animate-bounce"
          onClick={handleUnlockAudio}
        >
          <Volume2 size={20} />
          <span>Click anywhere to enable incoming voice and game audio!</span>
        </div>
      )}
    </>
  )
}
