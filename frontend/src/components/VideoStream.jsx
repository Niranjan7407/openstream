import { useEffect, useRef, useState, forwardRef } from 'react'
import { Maximize, Minimize } from 'lucide-react'

const VideoStream = forwardRef(function VideoStream({ stream, isLocal, isScreen, label, onMaximize, isMaximized }, ref) {
  const videoRef = useRef(null)
  const containerRef = useRef(null)
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      
      // Log stream details
      const tracks = stream.getTracks()
      console.log('Setting stream on video element:', {
        streamId: stream.id,
        isLocal,
        isScreen,
        label,
        tracks: tracks.map(t => ({
          kind: t.kind,
          label: t.label,
          enabled: t.enabled,
          muted: t.muted
        }))
      })
      
      // For screen shares, ensure audio plays
      if (isScreen && !isLocal) {
        videoRef.current.volume = 1.0
      }
    }
  }, [stream, isLocal, isScreen, label])

  const handleMaximize = () => {
    if (onMaximize) {
      onMaximize()
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

  return (
    <div 
      className={`relative bg-black rounded-lg overflow-hidden shadow-lg ${isMaximized ? 'w-full h-full' : 'aspect-video'}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      ref={setCombinedRef}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal && !isScreen} // Only mute local camera, not local screen (so you can hear your screen audio)
        className="w-full h-full object-contain bg-black"
      />
      
      {/* Maximize/Minimize Button - Shows on hover */}
      {onMaximize && isHovering && (
        <button
          onClick={handleMaximize}
          className="absolute top-4 right-4 bg-black bg-opacity-70 hover:bg-opacity-90 text-white p-2 rounded-lg transition z-10"
          title={isMaximized ? 'Exit fullscreen' : 'Maximize'}
        >
          {isMaximized ? <Minimize size={24} /> : <Maximize size={24} />}
        </button>
      )}
      
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm font-semibold">
        {label || (isScreen ? 'Screen' : 'Video')}
      </div>
      
      {/* Audio indicator */}
      {stream && stream.getAudioTracks().length > 0 && (
        <div className="absolute top-2 right-2 bg-green-600 bg-opacity-70 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 1C12 1 10 3 10 6V12C10 15 12 17 12 17M12 17C12 17 14 15 14 12V6C14 3 12 1 12 1M12 17V21M8 21H16M19 10V12C19 15.866 15.866 19 12 19C8.13401 19 5 15.866 5 12V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Audio
        </div>
      )}
    </div>
  )
})

export default VideoStream
