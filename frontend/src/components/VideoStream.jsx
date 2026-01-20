import { useEffect, useRef } from 'react'

export default function VideoStream({ stream, isLocal, isScreen, label }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      console.log('Setting stream on video element:', stream.id, 'Tracks:', stream.getTracks().length)
    }
  }, [stream])

  return (
    <div className="relative bg-black rounded-lg overflow-hidden shadow-lg aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-contain bg-black"
      />
      <div className="absolute bottom-2 left-2 bg-black bg-opacity-70 text-white px-3 py-1 rounded text-sm font-semibold">
        {label || (isScreen ? 'Screen' : 'Video')}
      </div>
    </div>
  )
}
