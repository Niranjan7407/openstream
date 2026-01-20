import { useEffect, useRef } from 'react'
import VideoStream from './VideoStream'

export default function VideoGrid({ localStream, peers, isScreenSharing }) {
  const totalParticipants = (localStream ? 1 : 0) + peers.length

  return (
    <div className="h-full flex items-center justify-center">
      <div
        className={`grid gap-4 w-full h-full`}
        style={{
          gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))`,
          maxWidth: '1600px',
          margin: '0 auto',
        }}
      >
        {localStream && <VideoStream stream={localStream} isLocal={true} />}
        {peers.map((peerObj, index) => (
          <VideoStream key={index} stream={peerObj.stream} isLocal={false} />
        ))}
      </div>
    </div>
  )
}
