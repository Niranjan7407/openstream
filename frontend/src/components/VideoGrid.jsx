import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import VideoStream from './VideoStream'
import PictureInPicture from './PictureInPicture'

export default function VideoGrid({ localStream, screenStream, peers, isScreenSharing }) {
  const [activeTab, setActiveTab] = useState('camera')
  const [maximizedVideo, setMaximizedVideo] = useState(null) // { type: 'local' | 'peer', userId?: string, isScreen: boolean }
  const [showPiP, setShowPiP] = useState(true)
  const fullscreenRef = useRef(null)

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
    peers: peers.length,
    maximizedVideo
  })

  const handleMaximize = (type, userId = null, isScreen = false) => {
    if (maximizedVideo && maximizedVideo.type === type && maximizedVideo.userId === userId) {
      // Un-maximize if clicking the same video
      setMaximizedVideo(null)
    } else {
      setMaximizedVideo({ type, userId, isScreen })
      // Auto-switch tab if maximizing from different tab
      if (isScreen && activeTab !== 'screen') {
        setActiveTab('screen')
      } else if (!isScreen && activeTab !== 'camera') {
        setActiveTab('camera')
      }
    }
  }

  const togglePiP = () => {
    setShowPiP(!showPiP)
  }

  // Request or exit fullscreen when maximize state changes
  useEffect(() => {
    const element = fullscreenRef.current
    if (maximizedVideo && element) {
      if (!document.fullscreenElement) {
        element.requestFullscreen().catch((err) => console.error('Fullscreen error', err))
      }
    } else if (!maximizedVideo && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    }
  }, [maximizedVideo])

  // Sync state if user exits fullscreen with Esc/F11
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && maximizedVideo) {
        setMaximizedVideo(null)
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [maximizedVideo])

  // Keyboard shortcut: press "f" to exit/enter fullscreen on maximized view
  useEffect(() => {
    if (!maximizedVideo) return undefined
    const handleKeyDown = (e) => {
      if (e.key.toLowerCase() === 'f') {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {})
        } else if (fullscreenRef.current) {
          fullscreenRef.current.requestFullscreen().catch((err) => console.error('Fullscreen error', err))
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [maximizedVideo])

  // Determine if we should show PiP
  const shouldShowPiP = maximizedVideo && 
                        localStream && 
                        !maximizedVideo.isScreen && 
                        !(maximizedVideo.type === 'local' && !maximizedVideo.isScreen)

  return (
    <>
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
          
          {/* PiP visibility toggle - only show when something is maximized */}
          {shouldShowPiP && (
            <button
              onClick={togglePiP}
              className={`ml-auto px-4 py-2 rounded-lg font-semibold transition flex items-center gap-2 ${
                showPiP
                  ? 'bg-gray-700 text-white hover:bg-gray-600'
                  : 'bg-gray-600 text-gray-400 hover:bg-gray-700'
              }`}
              title={showPiP ? 'Hide your video preview' : 'Show your video preview'}
            >
              {showPiP ? <EyeOff size={18} /> : <Eye size={18} />}
              <span className="hidden sm:inline">Your Preview</span>
            </button>
          )}
        </div>

        {/* Video Grid or Maximized View */}
        <div className="flex-1 p-4 flex items-center justify-center overflow-hidden">
          {maximizedVideo ? (
            // Maximized View
            <div ref={fullscreenRef} className="w-full h-full bg-black flex items-center justify-center">
              {maximizedVideo.type === 'local' && maximizedVideo.isScreen && screenStream && (
                <VideoStream 
                  stream={screenStream} 
                  isLocal={true} 
                  isScreen={true} 
                  label="Your Screen" 
                  onMaximize={() => handleMaximize('local', null, true)}
                  isMaximized={true}
                />
              )}
              {maximizedVideo.type === 'local' && !maximizedVideo.isScreen && localStream && (
                <VideoStream 
                  stream={localStream} 
                  isLocal={true} 
                  label="You (Camera On)" 
                  onMaximize={() => handleMaximize('local', null, false)}
                  isMaximized={true}
                />
              )}
              {maximizedVideo.type === 'peer' && maximizedVideo.isScreen && (
                <VideoStream 
                  stream={screenStreams.find(p => p.userId === maximizedVideo.userId)?.stream} 
                  isLocal={false} 
                  isScreen={true} 
                  label="Participant Screen" 
                  onMaximize={() => handleMaximize('peer', maximizedVideo.userId, true)}
                  isMaximized={true}
                />
              )}
              {maximizedVideo.type === 'peer' && !maximizedVideo.isScreen && (
                <VideoStream 
                  stream={cameraStreams.find(p => p.userId === maximizedVideo.userId)?.stream} 
                  isLocal={false} 
                  label="Participant" 
                  onMaximize={() => handleMaximize('peer', maximizedVideo.userId, false)}
                  isMaximized={true}
                />
              )}
            </div>
          ) : (
            // Grid View
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
                    <VideoStream 
                      stream={localStream} 
                      isLocal={true} 
                      label="You (Camera On)" 
                      onMaximize={() => handleMaximize('local', null, false)}
                      isMaximized={false}
                    />
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
                      <VideoStream 
                        key={`camera-${peer.userId}`} 
                        stream={peer.stream} 
                        isLocal={false} 
                        label="Participant" 
                        onMaximize={() => handleMaximize('peer', peer.userId, false)}
                        isMaximized={false}
                      />
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
                      onMaximize={() => handleMaximize('local', null, true)}
                      isMaximized={false}
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
                        label="Participant Screen" 
                        onMaximize={() => handleMaximize('peer', peer.userId, true)}
                        isMaximized={false}
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
          )}
        </div>
      </div>

      {/* Picture-in-Picture for local video when something else is maximized */}
      {shouldShowPiP && (
        <PictureInPicture
          stream={localStream}
          isVisible={showPiP}
          onToggleVisibility={togglePiP}
          isScreenSharing={maximizedVideo?.isScreen}
        />
      )}
    </>
  )
}
