import { useState, useRef, useEffect } from 'react'
import { Grid, Tv, Maximize2, Minimize2 } from 'lucide-react'
import VideoStream from './VideoStream'

export default function VideoGrid({
  localStream,
  screenStream,
  peers,
  currentUserName,
  peerVolumes = {},
  screenVolumes = {},
  onPeerVolumeChange,
  onScreenVolumeChange,
  selectedQuality,
}) {
  // Pinned item: { type: 'local-screen' | 'local-camera' | 'peer-screen' | 'peer-camera', userId?: string } | null
  const [pinnedItem, setPinnedItem] = useState(null)
  const [layoutMode, setLayoutMode] = useState('stage') // 'stage' or 'grid'
  const stageContainerRef = useRef(null)
  const [isStageFullscreen, setIsStageFullscreen] = useState(false)

  // Identify all active streams
  const cameraStreams = peers.filter((p) => p && p.stream)
  const screenStreams = peers.filter((p) => p && p.screenStream)

  // Track fullscreen on stageContainer
  useEffect(() => {
    const handleFsChange = () => {
      setIsStageFullscreen(document.fullscreenElement === stageContainerRef.current)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  const toggleStageFullscreen = async () => {
    const el = stageContainerRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        if (el.requestFullscreen) {
          await el.requestFullscreen()
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen()
        }
      }
    } catch (err) {
      console.error('Fullscreen error on stage:', err)
    }
  }

  // Determine stage stream
  let stageItem = null
  if (pinnedItem) {
    if (pinnedItem.type === 'local-screen' && screenStream) {
      stageItem = {
        type: 'local-screen',
        stream: screenStream,
        isLocal: true,
        isScreen: true,
        label: 'Your Screen Share',
      }
    } else if (pinnedItem.type === 'local-camera' && localStream) {
      stageItem = {
        type: 'local-camera',
        stream: localStream,
        isLocal: true,
        isScreen: false,
        label: `${currentUserName || 'You'} (Camera)`,
      }
    } else if (pinnedItem.type === 'peer-screen') {
      const peer = screenStreams.find((p) => p.userId === pinnedItem.userId)
      if (peer) {
        stageItem = {
          type: 'peer-screen',
          userId: peer.userId,
          stream: peer.screenStream,
          isLocal: false,
          isScreen: true,
          label: `${peer.userName || 'Participant'}'s Screen`,
          volume: screenVolumes[peer.userId] ?? 1.0,
        }
      }
    } else if (pinnedItem.type === 'peer-camera') {
      const peer = cameraStreams.find((p) => p.userId === pinnedItem.userId)
      if (peer) {
        stageItem = {
          type: 'peer-camera',
          userId: peer.userId,
          stream: peer.stream,
          isLocal: false,
          isScreen: false,
          label: peer.userName || 'Participant',
          volume: peerVolumes[peer.userId] ?? 1.0,
        }
      }
    }
  }

  // Fallback stage item if in stage mode and no item pinned:
  // Prioritize remote screen, then local screen, then first peer camera, then local camera
  if (!stageItem && layoutMode === 'stage') {
    if (screenStreams.length > 0) {
      const peer = screenStreams[0]
      stageItem = {
        type: 'peer-screen',
        userId: peer.userId,
        stream: peer.screenStream,
        isLocal: false,
        isScreen: true,
        label: `${peer.userName || 'Participant'}'s Screen`,
        volume: screenVolumes[peer.userId] ?? 1.0,
      }
    } else if (screenStream) {
      stageItem = {
        type: 'local-screen',
        stream: screenStream,
        isLocal: true,
        isScreen: true,
        label: 'Your Screen Share',
      }
    } else if (cameraStreams.length > 0) {
      const peer = cameraStreams[0]
      stageItem = {
        type: 'peer-camera',
        userId: peer.userId,
        stream: peer.stream,
        isLocal: false,
        isScreen: false,
        label: peer.userName || 'Participant',
        volume: peerVolumes[peer.userId] ?? 1.0,
      }
    } else if (localStream) {
      stageItem = {
        type: 'local-camera',
        stream: localStream,
        isLocal: true,
        isScreen: false,
        label: `${currentUserName || 'You'} (Camera)`,
      }
    }
  }

  // Collect all items for filmstrip / grid
  const allItems = []

  // Remote screen shares
  screenStreams.forEach((peer) => {
    allItems.push({
      id: `peer-screen-${peer.userId}`,
      type: 'peer-screen',
      userId: peer.userId,
      stream: peer.screenStream,
      isLocal: false,
      isScreen: true,
      label: `${peer.userName || 'Participant'}'s Screen`,
      volume: screenVolumes[peer.userId] ?? 1.0,
    })
  })

  // Local screen share
  if (screenStream) {
    allItems.push({
      id: 'local-screen',
      type: 'local-screen',
      stream: screenStream,
      isLocal: true,
      isScreen: true,
      label: 'Your Screen',
    })
  }

  // Remote cameras
  cameraStreams.forEach((peer) => {
    allItems.push({
      id: `peer-camera-${peer.userId}`,
      type: 'peer-camera',
      userId: peer.userId,
      stream: peer.stream,
      isLocal: false,
      isScreen: false,
      label: peer.userName || 'Participant',
      volume: peerVolumes[peer.userId] ?? 1.0,
    })
  })

  // Local camera
  if (localStream) {
    allItems.push({
      id: 'local-camera',
      type: 'local-camera',
      stream: localStream,
      isLocal: true,
      isScreen: false,
      label: `${currentUserName || 'You'}`,
    })
  }

  const isStageActive = layoutMode === 'stage' && stageItem

  return (
    <div ref={stageContainerRef} className="h-full w-full flex flex-col bg-gray-900 overflow-hidden select-none">
      {/* Top Bar Navigation & Mode Toggle */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-950/80 border-b border-gray-800">
        <div className="flex items-center gap-2">
          {/* Layout Mode Toggles */}
          <button
            onClick={() => setLayoutMode('stage')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              layoutMode === 'stage' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Tv size={15} />
            <span>Stage View</span>
          </button>
          <button
            onClick={() => setLayoutMode('grid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              layoutMode === 'grid' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Grid size={15} />
            <span>Grid View</span>
          </button>
        </div>

        {/* Info & Fullscreen Stage Button */}
        <div className="flex items-center gap-2">
          {screenStreams.length > 0 && (
            <span className="text-xs text-blue-400 bg-blue-950/60 border border-blue-900/60 px-2.5 py-1 rounded-full flex items-center gap-1">
              <Tv size={13} />
              <span>{screenStreams.length} Screen Share active</span>
            </span>
          )}

          <button
            onClick={toggleStageFullscreen}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition"
            title={isStageFullscreen ? 'Exit stage fullscreen' : 'Stage Fullscreen'}
          >
            {isStageFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* Main Container: Stage View vs Grid View */}
      <div className="flex-1 p-3 flex flex-col md:flex-row gap-3 overflow-hidden">
        {isStageActive ? (
          // STAGE MODE: Large featured stream + scrollable filmstrip
          <>
            {/* Featured Stage Stream */}
            <div className="flex-1 h-full min-h-0 bg-gray-950 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl relative">
              <VideoStream
                stream={stageItem.stream}
                isLocal={stageItem.isLocal}
                isScreen={stageItem.isScreen}
                label={stageItem.label}
                isPinned={true}
                onPin={() => setPinnedItem(null)}
                volume={stageItem.volume}
                onVolumeChange={
                  stageItem.isScreen && !stageItem.isLocal && onScreenVolumeChange
                    ? (val) => onScreenVolumeChange(stageItem.userId, val)
                    : !stageItem.isScreen && !stageItem.isLocal && onPeerVolumeChange
                    ? (val) => onPeerVolumeChange(stageItem.userId, val)
                    : null
                }
                qualityBadge={stageItem.isScreen ? (selectedQuality === '1080p60' ? '1080p 60fps' : selectedQuality) : null}
              />
            </div>

            {/* Filmstrip sidebar of other participants */}
            {allItems.length > 1 && (
              <div className="w-full md:w-64 lg:w-72 flex md:flex-col gap-2.5 overflow-x-auto md:overflow-y-auto max-h-48 md:max-h-full pb-1 md:pb-0 shrink-0">
                {allItems
                  .filter((item) => {
                    if (stageItem.type === item.type) {
                      if (item.userId) return item.userId !== stageItem.userId
                      return false
                    }
                    return true
                  })
                  .map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setPinnedItem({ type: item.type, userId: item.userId })}
                      className="w-48 md:w-full aspect-video shrink-0 cursor-pointer rounded-xl overflow-hidden border border-gray-800 hover:border-purple-500 transition shadow-lg relative group"
                    >
                      <VideoStream
                        stream={item.stream}
                        isLocal={item.isLocal}
                        isScreen={item.isScreen}
                        label={item.label}
                        isPinned={false}
                        onPin={() => setPinnedItem({ type: item.type, userId: item.userId })}
                        volume={item.volume}
                      />
                      <div className="absolute inset-0 bg-purple-600/10 opacity-0 group-hover:opacity-100 transition pointer-events-none flex items-center justify-center">
                        <span className="bg-black/80 text-white text-xs px-2.5 py-1 rounded-lg font-semibold shadow">
                          Click to Focus
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        ) : (
          // GRID MODE: Balanced grid of all video streams
          <div
            className="w-full h-full grid gap-3 overflow-y-auto"
            style={{
              gridTemplateColumns:
                allItems.length === 1
                  ? '1fr'
                  : allItems.length <= 4
                  ? 'repeat(auto-fit, minmax(360px, 1fr))'
                  : 'repeat(auto-fit, minmax(280px, 1fr))',
              alignContent: 'center',
            }}
          >
            {allItems.length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center text-gray-500 py-16">
                <Tv size={48} className="mb-3 text-purple-500/40" />
                <p className="text-lg font-semibold text-gray-400">Ready to Stream</p>
                <p className="text-sm text-gray-600 mt-1">Enable your camera or click "Share Screen" below to start!</p>
              </div>
            ) : (
              allItems.map((item) => (
                <div key={item.id} className="w-full aspect-video rounded-xl overflow-hidden shadow-xl">
                  <VideoStream
                    stream={item.stream}
                    isLocal={item.isLocal}
                    isScreen={item.isScreen}
                    label={item.label}
                    isPinned={false}
                    onPin={() => {
                      setPinnedItem({ type: item.type, userId: item.userId })
                      setLayoutMode('stage')
                    }}
                    volume={item.volume}
                    onVolumeChange={
                      item.isScreen && !item.isLocal && onScreenVolumeChange
                        ? (val) => onScreenVolumeChange(item.userId, val)
                        : !item.isScreen && !item.isLocal && onPeerVolumeChange
                        ? (val) => onPeerVolumeChange(item.userId, val)
                        : null
                    }
                  />
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
