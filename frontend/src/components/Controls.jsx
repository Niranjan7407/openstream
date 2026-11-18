import { useState } from 'react'
import {
  Copy,
  Link,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  Phone,
  MessageSquare,
  Settings,
  Maximize2,
  Minimize2,
  Check,
  Sparkles,
} from 'lucide-react'

export default function Controls({
  roomCode,
  isCameraOn,
  isMicOn,
  isScreenSharing,
  onToggleCamera,
  onToggleMic,
  onToggleScreenShare,
  onLeave,
  onToggleChat,
  isChatOpen,
  unreadCount = 0,
  onOpenSettings,
  selectedQuality = '1080p60',
}) {
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}?room=${roomCode}`
    navigator.clipboard.writeText(inviteUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const toggleAppFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        setIsFullscreen(false)
      } else {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
      }
    } catch (err) {
      console.error('Fullscreen toggle error:', err)
    }
  }

  return (
    <div className="bg-gray-950 border-t border-gray-800 px-4 py-3 select-none">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
        {/* Left: Room Code & Quick Share Links */}
        <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 px-3 py-1.5 rounded-xl shadow">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Room Code</span>
            <span className="text-white font-mono text-sm font-bold">{roomCode}</span>
          </div>

          <div className="h-6 w-px bg-gray-800 mx-1" />

          {/* Copy Code */}
          <button
            onClick={copyRoomCode}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition relative group"
            title="Copy room code"
          >
            {copiedCode ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black text-white text-[11px] px-2 py-0.5 rounded whitespace-nowrap z-30 shadow">
              {copiedCode ? 'Copied code!' : 'Copy code'}
            </span>
          </button>

          {/* Copy Invite Link */}
          <button
            onClick={copyInviteLink}
            className="p-1.5 text-purple-400 hover:text-purple-300 hover:bg-gray-800 rounded-lg transition relative group flex items-center gap-1"
            title="Copy direct invite link"
          >
            {copiedLink ? <Check size={16} className="text-green-400" /> : <Link size={16} />}
            <span className="text-xs font-semibold hidden sm:inline">
              {copiedLink ? 'Link Copied!' : 'Invite Link'}
            </span>
            <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black text-white text-[11px] px-2 py-0.5 rounded whitespace-nowrap z-30 shadow">
              {copiedLink ? 'Copied link!' : 'Copy invite URL'}
            </span>
          </button>
        </div>

        {/* Center: Main Media Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Microphone */}
          <button
            onClick={onToggleMic}
            className={`p-3 rounded-2xl transition shadow-lg relative group ${
              isMicOn
                ? 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={isMicOn ? 'Mute microphone (M)' : 'Unmute microphone (M)'}
          >
            {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap z-30 shadow">
              {isMicOn ? 'Mute (M)' : 'Unmute (M)'}
            </span>
          </button>

          {/* Camera */}
          <button
            onClick={onToggleCamera}
            className={`p-3 rounded-2xl transition shadow-lg relative group ${
              isCameraOn
                ? 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={isCameraOn ? 'Turn off camera (V)' : 'Turn on camera (V)'}
          >
            {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap z-30 shadow">
              {isCameraOn ? 'Stop Video (V)' : 'Start Video (V)'}
            </span>
          </button>

          {/* Screen Share (1080p 60fps) */}
          <button
            onClick={onToggleScreenShare}
            className={`px-4 py-3 rounded-2xl transition shadow-lg flex items-center gap-2 relative group ${
              isScreenSharing
                ? 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-400'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
            title={isScreenSharing ? 'Stop screen sharing (S)' : 'Share screen in 1080p 60fps (S)'}
          >
            <Monitor size={20} />
            <span className="font-semibold text-sm hidden md:inline">
              {isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
            </span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono font-bold uppercase hidden lg:inline">
              {selectedQuality}
            </span>
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap z-30 shadow">
              {isScreenSharing ? 'Stop Sharing (S)' : 'Share Screen (S)'}
            </span>
          </button>

          {/* Fullscreen Room */}
          <button
            onClick={toggleAppFullscreen}
            className="p-3 rounded-2xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition shadow-lg relative group"
            title="Toggle fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap z-30 shadow">
              Fullscreen (F)
            </span>
          </button>
        </div>

        {/* Right: Chat, Settings & Leave Call */}
        <div className="flex items-center gap-2">
          {/* Chat Toggle */}
          <button
            onClick={onToggleChat}
            className={`p-3 rounded-2xl transition shadow-lg relative ${
              isChatOpen
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700'
            }`}
            title="In-call chat (C)"
          >
            <MessageSquare size={20} />
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center animate-pulse shadow">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-3 rounded-2xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition shadow-lg"
            title="Settings & Stream Quality"
          >
            <Settings size={20} />
          </button>

          {/* Leave Call */}
          <button
            onClick={onLeave}
            className="px-4 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold transition shadow-lg flex items-center gap-2"
            title="Leave call"
          >
            <Phone size={20} className="transform rotate-[135deg]" />
            <span className="hidden sm:inline text-sm">Leave</span>
          </button>
        </div>
      </div>
    </div>
  )
}
