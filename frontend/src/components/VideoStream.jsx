import { useEffect, useRef } from 'react'

export default function VideoStream({ stream, isLocal }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className="relative bg-black rounded-lg overflow-hidden shadow-lg aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="w-full h-full object-cover"
      />
      {isLocal && (
        <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-3 py-1 rounded text-sm font-semibold">
          You
        </div>
      )}
    </div>
  )
}
