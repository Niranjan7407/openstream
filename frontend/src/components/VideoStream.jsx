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
  const [showControls, setShowControls] = useState(false)
  const [supportsPiP] = useState(() => typeof document !== 'undefined' && !!document.pictureInPictureEnabled)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      // Ensure volume is set for remote screen stream
      if (!isLocal) {
        videoRef.current.volume = Math.min(Math.max(volume, 0), 1)
      }
    }
  }, [stream, isLocal, volume])

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
  const hasVideo = stream && stream.getVideoTracks().length > 0 && stream.getVideoTracks().some((t) => t.enabled)

  return (
    <div
      ref={setCombinedRef}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onDoubleClick={handleToggleFullscreen}
      className={`relative w-full h-full bg-gray-950 rounded-xl overflow-hidden shadow-2xl flex items-center justify-center transition-all duration-200 select-none ${
        isSpeaking ? 'ring-4 ring-green-500 ring-offset-2 ring-offset-gray-900' : 'border border-gray-800'
      }`}
    >
      {/* Video Element */}
      {hasVideo || isScreen ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          // Local stream MUST ALWAYS be muted to avoid hearing your own voice/echo!
          muted={isLocal}
          className={`w-full h-full ${isScreen ? 'object-contain' : 'object-cover'} bg-black`}
        />
      ) : (
        // Avatar fallback for participant with camera off
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <div
            className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-2xl sm:text-3xl font-bold text-white shadow-lg transition-transform ${
              isSpeaking ? 'scale-105 bg-gradient-to-tr from-green-500 to-emerald-600' : 'bg-gradient-to-tr from-purple-600 to-indigo-700'
            }`}
          >
            {(label || 'User').slice(0, 2).toUpperCase()}
          </div>
          <span className="mt-3 text-gray-300 font-medium text-sm sm:text-base">{label || 'Participant'}</span>
        </div>
      )}

      {/* Top Overlay Badges */}
      <div className="absolute top-3 left-3 flex items-center gap-2 z-20 pointer-events-none">
        {/* Stream / User Label */}
        <div className="bg-black/75 backdrop-blur-md text-white text-xs sm:text-sm font-semibold px-3 py-1 rounded-lg flex items-center gap-1.5 shadow">
          {isScreen && <Tv size={14} className="text-blue-400" />}
          <span>{label || (isScreen ? 'Screen' : 'User')}</span>
        </div>

        {/* 1080p / 60fps quality badge */}
        {isScreen && (
          <div className="bg-purple-900/80 backdrop-blur-md text-purple-200 text-xs font-semibold px-2.5 py-1 rounded-lg shadow border border-purple-500/30">
            {qualityBadge || '1080p 60fps'}
          </div>
        )}

        {/* Audio Active Badge */}
        {hasAudio && (
          <div className="bg-emerald-900/80 backdrop-blur-md text-emerald-200 text-xs font-semibold px-2.5 py-1 rounded-lg shadow flex items-center gap-1 border border-emerald-500/30">
            <Volume2 size={13} />
            <span>{isScreen ? 'System Audio' : 'Audio'}</span>
          </div>
        )}
      </div>

      {/* Action Buttons Overlay (top right) */}
      <div
        className={`absolute top-3 right-3 flex items-center gap-1.5 z-20 transition-opacity duration-200 ${
          showControls || isFullscreen ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Remote Volume Slider (Mic or Screen) */}
        {!isLocal && onVolumeChange && (
          <div className="flex items-center gap-1.5 bg-black/80 backdrop-blur-md px-2.5 py-1.5 rounded-lg border border-gray-700">
            {volume === 0 ? <VolumeX size={16} className="text-red-400" /> : <Volume2 size={16} className="text-gray-300" />}
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-16 h-1.5 accent-purple-500 cursor-pointer"
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
          </div>
        )}

        {/* Pin / Spotlight button */}
        {onPin && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onPin()
            }}
            className={`p-2 rounded-lg text-white backdrop-blur-md transition shadow ${
              isPinned ? 'bg-purple-600 hover:bg-purple-700' : 'bg-black/75 hover:bg-black/90'
            }`}
            title={isPinned ? 'Unpin stream' : 'Pin to stage'}
          >
            {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
        )}

        {/* Picture-in-Picture Button */}
        {supportsPiP && (hasVideo || isScreen) && (
          <button
            onClick={handleTogglePiP}
            className="p-2 rounded-lg bg-black/75 hover:bg-black/90 text-white backdrop-blur-md transition shadow"
            title="Pop out in Picture-in-Picture"
          >
            <Tv size={16} />
          </button>
        )}

        {/* Fullscreen Button */}
        <button
          onClick={handleToggleFullscreen}
          className="p-2 rounded-lg bg-black/75 hover:bg-black/90 text-white backdrop-blur-md transition shadow"
          title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen (F)'}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Double click hint on hover */}
      <div
        className={`absolute bottom-3 right-3 text-xs text-gray-400 bg-black/60 px-2 py-0.5 rounded pointer-events-none transition-opacity duration-200 ${
          showControls && !isFullscreen ? 'opacity-100' : 'opacity-0'
        }`}
      >
        Double-click for full screen
      </div>
    </div>
  )
})

export default VideoStream
