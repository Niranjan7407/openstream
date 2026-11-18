import { useEffect, useRef, useState, forwardRef } from 'react'
import { Maximize2, Minimize2, Pin, PinOff, Tv, Volume2, VolumeX } from 'lucide-react'

const VideoStream = forwardRef(function VideoStream(
  {
    stream,
    isLocal,
    isScreen,
    label,
    isPinned,
    onPin,
    isSpeaking,
    volume = 1.0,
    onVolumeChange,
    qualityBadge,
  },
  ref
) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [userActive, setUserActive] = useState(false)
  const hideTimerRef = useRef(null)
  const [supportsPiP] = useState(() => typeof document !== 'undefined' && !!document.pictureInPictureEnabled)

  // Track video track presence and enabled state
  const [hasLiveVideo, setHasLiveVideo] = useState(false)

  useEffect(() => {
    const checkVideoTrack = () => {
      if (!stream) {
        setHasLiveVideo(false)
        return
      }
      const videoTracks = stream.getVideoTracks()
      const hasEnabled = videoTracks.length > 0 && videoTracks.some((t) => t.enabled && t.readyState === 'live')
      setHasLiveVideo(hasEnabled)
    }

    checkVideoTrack()

    // Listen to track mute/unmute/ended events to keep UI in sync
    if (stream) {
      const vTrack = stream.getVideoTracks()[0]
      if (vTrack) {
        vTrack.onmute = checkVideoTrack
        vTrack.onunmute = checkVideoTrack
        vTrack.onended = checkVideoTrack
      }
    }
  }, [stream])

  // Attach stream and reliably start playback
  useEffect(() => {
    const videoEl = videoRef.current
    if (videoEl && stream) {
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream
      }

      if (!isLocal) {
        videoEl.volume = Math.min(Math.max(volume, 0), 1)
      }

      const tryPlay = () => {
        if (videoEl && videoEl.paused) {
          videoEl.play().catch((err) => {
            console.warn('Playback deferred on video element:', err)
          })
        }
      }

      tryPlay()
      videoEl.onloadedmetadata = tryPlay
      videoEl.oncanplay = tryPlay
    }
  }, [stream, isLocal, volume, hasLiveVideo])

  // Inactivity timer for auto-hiding overlays (especially in fullscreen)
  const handleUserActivity = () => {
    setUserActive(true)
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
    }
    hideTimerRef.current = setTimeout(() => {
      setUserActive(false)
    }, 2500)
  };

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  // Track fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      const el = containerRef.current
      if (document.fullscreenElement === el) {
        setIsFullscreen(true)
      } else if (!document.fullscreenElement) {
        setIsFullscreen(false)
      }
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // Synchronous fullscreen trigger on direct user gesture
  const handleToggleFullscreen = async (e) => {
    e?.stopPropagation()
    const target = containerRef.current
    if (!target) return

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        setIsFullscreen(false)
      } else {
        if (target.requestFullscreen) {
          await target.requestFullscreen()
        } else if (target.webkitRequestFullscreen) {
          await target.webkitRequestFullscreen()
        }
        setIsFullscreen(true)
      }
    } catch (err) {
      console.error('Error toggling fullscreen:', err)
    }
  }

  // Picture-in-Picture trigger
  const handleTogglePiP = async (e) => {
    e?.stopPropagation()
    if (!videoRef.current) return

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture()
      } else {
        await videoRef.current.requestPictureInPicture()
      }
    } catch (err) {
      console.error('Error with Picture-in-Picture:', err)
    }
  }

  const setCombinedRef = (node) => {
    containerRef.current = node
    if (typeof ref === 'function') {
      ref(node)
    } else if (ref) {
      ref.current = node
    }
  }

  const hasAudio = stream && stream.getAudioTracks().length > 0
  const showVideoElement = hasLiveVideo || isScreen

  // In fullscreen or when inactive, hide distracting overlays
  const showOverlays = userActive || !isFullscreen

  return (
    <div
      ref={setCombinedRef}
      onMouseMove={handleUserActivity}
      onTouchStart={handleUserActivity}
      onMouseEnter={() => {
        handleUserActivity()
      }}
      onMouseLeave={() => {
        if (isFullscreen) setUserActive(false)
      }}
      onDoubleClick={handleToggleFullscreen}
      className={`relative w-full h-full bg-gray-950 rounded-xl overflow-hidden shadow-2xl flex items-center justify-center transition-all duration-300 select-none ${
        isSpeaking ? 'ring-4 ring-green-500 ring-offset-2 ring-offset-gray-900' : 'border border-gray-800'
      } ${isFullscreen ? 'cursor-none' : ''} ${userActive ? '!cursor-default' : ''}`}
    >
      {/* Permanent Video Element: Kept in DOM to prevent tearing down decoder on toggle */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full ${isScreen ? 'object-contain' : 'object-cover'} bg-black ${
          showVideoElement ? 'block' : 'hidden'
        }`}
      />

      {/* Avatar Fallback: Shown when camera is off */}
      {!showVideoElement && (
        <div className="flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
          <div
            className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center text-xl sm:text-2xl md:text-3xl font-bold text-white shadow-xl transition-transform ${
              isSpeaking
                ? 'scale-105 bg-gradient-to-tr from-green-500 to-emerald-600 ring-4 ring-green-400/50'
                : 'bg-gradient-to-tr from-purple-600 via-indigo-600 to-indigo-800'
            }`}
          >
            {(label || 'User').slice(0, 2).toUpperCase()}
          </div>
          <span className="mt-3 text-gray-300 font-semibold text-sm sm:text-base tracking-wide">
            {label || 'Participant'}
          </span>
          <span className="text-xs text-gray-500 mt-0.5">Camera off</span>
        </div>
      )}

      {/* Top Overlay Badges - Auto-fades out in fullscreen or inactivity */}
      <div
        className={`absolute top-3 left-3 flex items-center gap-2 z-20 pointer-events-none transition-opacity duration-300 ${
          showOverlays ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Stream / User Label */}
        <div className="bg-black/80 backdrop-blur-md text-white text-xs sm:text-sm font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow border border-white/10">
          {isScreen && <Tv size={14} className="text-blue-400" />}
          <span>{label || (isScreen ? 'Screen' : 'User')}</span>
        </div>

        {/* 1080p / 60fps quality badge */}
        {isScreen && (
          <div className="bg-purple-900/80 backdrop-blur-md text-purple-200 text-xs font-semibold px-2 py-0.5 rounded-lg shadow border border-purple-500/30">
            {qualityBadge || '1080p 60fps'}
          </div>
        )}

        {/* Audio Active Badge */}
        {hasAudio && (
          <div className="bg-emerald-900/80 backdrop-blur-md text-emerald-200 text-xs font-semibold px-2 py-0.5 rounded-lg shadow flex items-center gap-1 border border-emerald-500/30">
            <Volume2 size={13} />
            <span>{isScreen ? 'System Audio' : 'Audio'}</span>
          </div>
        )}
      </div>

      {/* Top Right Action Buttons - Auto-fades out when watching */}
      <div
        className={`absolute top-3 right-3 flex items-center gap-1.5 z-20 transition-opacity duration-300 ${
          showOverlays ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Remote Volume Slider */}
        {!isLocal && onVolumeChange && (
          <div className="flex items-center gap-1.5 bg-black/80 backdrop-blur-md px-2 py-1 rounded-lg border border-gray-700/80 shadow">
            {volume === 0 ? <VolumeX size={15} className="text-red-400" /> : <Volume2 size={15} className="text-gray-300" />}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-14 sm:w-16 h-1.5 accent-purple-500 cursor-pointer"
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
          </div>
        )}

        {/* Pin to Stage Button */}
        {onPin && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPin()
            }}
            className={`p-2 rounded-lg text-white backdrop-blur-md transition shadow ${
              isPinned ? 'bg-purple-600 hover:bg-purple-700' : 'bg-black/75 hover:bg-black/90 border border-white/10'
            }`}
            title={isPinned ? 'Unpin stream' : 'Pin to stage'}
          >
            {isPinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
        )}

        {/* Picture-in-Picture Button */}
        {supportsPiP && showVideoElement && (
          <button
            onClick={handleTogglePiP}
            className="p-2 rounded-lg bg-black/75 hover:bg-black/90 text-white backdrop-blur-md transition shadow border border-white/10"
            title="Pop out in Picture-in-Picture"
          >
            <Tv size={15} />
          </button>
        )}

        {/* Fullscreen Button */}
        <button
          onClick={handleToggleFullscreen}
          className="p-2 rounded-lg bg-black/75 hover:bg-black/90 text-white backdrop-blur-md transition shadow border border-white/10"
          title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen (F)'}
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      {/* Double click hint: only shown initially on windowed view, hidden in fullscreen */}
      {!isFullscreen && (
        <div
          className={`absolute bottom-2.5 right-2.5 text-[11px] text-gray-400 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded pointer-events-none transition-opacity duration-300 ${
            userActive ? 'opacity-100' : 'opacity-0'
          }`}
        >
          Double-click to full screen
        </div>
      )}
    </div>
  )
})

export default VideoStream
