import { useState, useRef, useEffect } from 'react'
import { Grid, Tv, Maximize2, Minimize2, Users } from 'lucide-react'
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
  // Pinned item: { type: 'local-screen' | 'local-user' | 'peer-screen' | 'peer-user', userId?: string } | null
  const [pinnedItem, setPinnedItem] = useState(null)
  const [layoutMode, setLayoutMode] = useState('stage') // 'stage' or 'grid'
  const stageContainerRef = useRef(null)
  const [isStageFullscreen, setIsStageFullscreen] = useState(false)

  // Remote screen shares
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

  // --- Collect all participants & screen shares ---
  const allItems = []

  // 1. Remote Screen Shares
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

  // 2. Local Screen Share
  if (screenStream) {
    allItems.push({
      id: 'local-screen',
      type: 'local-screen',
      stream: screenStream,
      isLocal: true,
      isScreen: true,
      label: 'Your Screen Share',
    })
  }

  // 3. Local User (ALWAYS included, even if camera is off!)
  allItems.push({
    id: 'local-user',
    type: 'local-user',
    stream: localStream,
    isLocal: true,
    isScreen: false,
    label: `${currentUserName || 'You'} (You)`,
  })

  // 4. Remote Peers (ALWAYS included, even if camera is off!)
  peers.forEach((peer) => {
    allItems.push({
      id: `peer-user-${peer.userId}`,
      type: 'peer-user',
      userId: peer.userId,
      stream: peer.stream,
      isLocal: false,
      isScreen: false,
      label: peer.userName || `User-${peer.userId.slice(0, 4)}`,
      volume: peerVolumes[peer.userId] ?? 1.0,
    })
  })

  // Determine stage item
  let stageItem = null
  if (pinnedItem) {
    if (pinnedItem.type === 'local-screen' && screenStream) {
      stageItem = allItems.find((i) => i.id === 'local-screen')
    } else if (pinnedItem.type === 'local-user') {
      stageItem = allItems.find((i) => i.id === 'local-user')
    } else if (pinnedItem.type === 'peer-screen') {
      stageItem = allItems.find((i) => i.type === 'peer-screen' && i.userId === pinnedItem.userId)
    } else if (pinnedItem.type === 'peer-user') {
      stageItem = allItems.find((i) => i.type === 'peer-user' && i.userId === pinnedItem.userId)
    }
  }

  // Fallback stage item when in Stage Mode:
  // Priority: 1st remote screen -> local screen -> 1st remote user -> local user
  if (!stageItem && layoutMode === 'stage') {
    const remoteScreen = allItems.find((i) => i.type === 'peer-screen')
    const localScr = allItems.find((i) => i.type === 'local-screen')
    const remoteUser = allItems.find((i) => i.type === 'peer-user')
    const localUsr = allItems.find((i) => i.id === 'local-user')
    stageItem = remoteScreen || localScr || remoteUser || localUsr || allItems[0]
  }

  const isStageActive = layoutMode === 'stage' && stageItem

  // Filmstrip items: all items except the one currently on the main stage
  const filmstripItems = stageItem ? allItems.filter((item) => item.id !== stageItem.id) : allItems

  return (
    <div ref={stageContainerRef} className="h-full w-full flex flex-col bg-gray-950 overflow-hidden select-none">
      {/* Top Bar Navigation & Mode Toggle */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-gray-900/90 border-b border-gray-800 backdrop-blur-md">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Layout Mode Toggles */}
          <button
            onClick={() => setLayoutMode('stage')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              layoutMode === 'stage' ? 'bg-purple-600 text-white shadow' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Tv size={14} />
            <span className="hidden xs:inline">Stage View</span>
          </button>
          <button
            onClick={() => setLayoutMode('grid')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              layoutMode === 'grid' ? 'bg-purple-600 text-white shadow' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Grid size={14} />
            <span className="hidden xs:inline">Grid View</span>
          </button>

          {/* Participant count badge */}
          <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-800/80 px-2 py-1 rounded-lg border border-gray-700/50 ml-1">
            <Users size={13} className="text-purple-400" />
            <span>{peers.length + 1}</span>
          </div>
        </div>

        {/* Info & Fullscreen Stage Button */}
        <div className="flex items-center gap-2">
          {screenStreams.length > 0 && (
            <span className="text-[11px] sm:text-xs text-blue-400 bg-blue-950/70 border border-blue-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Tv size={12} />
              <span className="hidden sm:inline">{screenStreams.length} Screen Live</span>
              <span className="sm:hidden">Live</span>
            </span>
          )}

          <button
            onClick={toggleStageFullscreen}
            className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition border border-gray-700/60"
            title={isStageFullscreen ? 'Exit stage fullscreen' : 'Stage Fullscreen'}
          >
            {isStageFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* Main Container: Stage View vs Grid View */}
      <div className="flex-1 p-2 sm:p-3 flex flex-col md:flex-row gap-2 sm:gap-3 overflow-hidden">
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
                isPinned={!!pinnedItem}
                onPin={() => setPinnedItem(pinnedItem ? null : { type: stageItem.type, userId: stageItem.userId })}
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

            {/* Filmstrip: Compact horizontal strip on mobile, sidebar on desktop */}
            {filmstripItems.length > 0 && (
              <div className="w-full md:w-60 lg:w-72 flex md:flex-col gap-2 overflow-x-auto md:overflow-y-auto max-h-28 sm:max-h-36 md:max-h-full pb-1 md:pb-0 shrink-0">
                {filmstripItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => setPinnedItem({ type: item.type, userId: item.userId })}
                    className="w-36 sm:w-44 md:w-full aspect-video shrink-0 cursor-pointer rounded-xl overflow-hidden border border-gray-800 hover:border-purple-500 transition shadow-lg relative group"
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
                      <span className="bg-black/80 text-white text-[11px] px-2 py-0.5 rounded font-semibold shadow">
                        Focus
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          // GRID MODE: Balanced grid of all video streams and participants
          <div
            className="w-full h-full grid gap-2.5 sm:gap-3 overflow-y-auto p-1"
            style={{
              gridTemplateColumns:
                allItems.length === 1
                  ? '1fr'
                  : allItems.length <= 2
                  ? 'repeat(auto-fit, minmax(280px, 1fr))'
                  : 'repeat(auto-fit, minmax(240px, 1fr))',
              alignContent: 'center',
            }}
          >
            {allItems.map((item) => (
              <div key={item.id} className="w-full aspect-video rounded-xl overflow-hidden shadow-xl border border-gray-800">
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
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
