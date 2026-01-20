import { useState } from 'react'
import VideoStream from './VideoStream'

export default function VideoGrid({ localStream, screenStream, peers, isScreenSharing }) {
  const [activeTab, setActiveTab] = useState('camera')

  const cameraStreams = peers
    .filter(peer => peer && peer.stream)
    .map((peer) => ({ stream: peer.stream, userId: peer.userId }))
  
  const screenStreams = peers
    .filter(peer => peer && peer.screenStream)
    .map((peer) => ({ stream: peer.screenStream, userId: peer.userId }))

  const totalParticipants = (localStream ? 1 : 0) + cameraStreams.length
  const totalScreenShares = (screenStream ? 1 : 0) + screenStreams.length

  console.log('VideoGrid render:', {
    hasLocalStream: !!localStream,
    hasLocalScreenStream: !!screenStream,
    cameraStreams: cameraStreams.length,
    screenStreams: screenStreams.length,
    totalParticipants,
    totalScreenShares,
    peers: peers.length
  })

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="flex gap-2 p-4 bg-gray-800 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('camera')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            activeTab === 'camera'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Camera ({totalParticipants})
        </button>
        {totalScreenShares > 0 && (
          <button
            onClick={() => setActiveTab('screen')}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              activeTab === 'screen'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Screen Share ({totalScreenShares})
          </button>
        )}
      </div>

      {/* Video Grid */}
      <div className="flex-1 p-4 flex items-center justify-center overflow-auto">
        <div
          className={`grid gap-4 w-full h-full`}
          style={{
            gridTemplateColumns: `repeat(auto-fit, minmax(300px, 1fr))`,
            maxWidth: '1600px',
            margin: '0 auto',
          }}
        >
          {activeTab === 'camera' ? (
            <>
              {localStream ? (
                <VideoStream stream={localStream} isLocal={true} label="You (Camera On)" />
              ) : (
                <div className="relative bg-gray-800 rounded-lg overflow-hidden shadow-lg aspect-video flex items-center justify-center border-2 border-dashed border-gray-600">
                  <div className="text-center">
                    <p className="text-gray-400 mb-2">Your Camera</p>
                    <p className="text-gray-500 text-sm">Click camera button to enable</p>
                  </div>
                </div>
              )}
              
              {cameraStreams.length > 0 ? (
                cameraStreams.map((peer) => (
                  <VideoStream key={`camera-${peer.userId}`} stream={peer.stream} isLocal={false} label={`Participant`} />
                ))
              ) : totalParticipants > 0 ? (
                <div className="col-span-full flex items-center justify-center text-gray-400">
                  <p>Waiting for other participants to enable camera...</p>
                </div>
              ) : (
                <div className="col-span-full flex items-center justify-center text-gray-400">
                  <p>You are alone in this room. Share the room code to invite others.</p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Show local screen share first if available */}
              {screenStream && (
                <VideoStream 
                  stream={screenStream} 
                  isLocal={true} 
                  isScreen={true} 
                  label="Your Screen" 
                />
              )}
              
              {/* Show other participants' screen shares */}
              {screenStreams.length > 0 && (
                screenStreams.map((peer) => (
                  <VideoStream 
                    key={`screen-${peer.userId}`} 
                    stream={peer.stream} 
                    isLocal={false} 
                    isScreen={true} 
                    label={`Participant Screen`} 
                  />
                ))
              )}
              
              {!screenStream && screenStreams.length === 0 && (
                <div className="col-span-full flex items-center justify-center text-gray-400">
                  <p>No screen shares available</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
