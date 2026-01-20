import { useEffect, useRef, useState } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'

export default function PictureInPicture({ stream, isVisible, onToggleVisibility, isScreenSharing }) {
  const videoRef = useRef(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    // Check if device is mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  // Don't show PiP when screen sharing is maximized
  if (!isVisible || !stream || isScreenSharing) {
    return null
  }

  const position = isMobile ? 'top-4 right-4' : 'bottom-4 right-4'

  return (
    <div 
      className={`fixed ${position} z-50 bg-black rounded-lg overflow-hidden shadow-2xl border-2 border-gray-700`}
      style={{ width: isMobile ? '120px' : '240px' }}
    >
      {/* Toggle visibility button */}
      <button
        onClick={onToggleVisibility}
        className="absolute top-2 right-2 bg-black bg-opacity-70 hover:bg-opacity-90 text-white p-1.5 rounded transition z-10"
        title="Hide video preview"
      >
        <X size={16} />
      </button>

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
        style={{ aspectRatio: '16/9' }}
      />
      
      <div className="absolute bottom-1 left-1 bg-black bg-opacity-70 text-white px-2 py-0.5 rounded text-xs font-semibold">
        You
      </div>
    </div>
  )
}
