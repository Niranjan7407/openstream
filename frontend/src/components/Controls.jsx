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
  Volume2,
  VolumeX,
} from 'lucide-react'

export default function Controls({
  roomCode,
  isCameraOn,
  isMicOn,
  isScreenSharing,
  hasScreenAudio = false,
  isScreenAudioMuted = false,
  onToggleCamera,
  onToggleMic,
  onToggleScreenShare,
  onToggleScreenAudioMute,
  onLeave,
  onToggleChat,
  isChatOpen,
  unreadCount = 0,
  onOpenSettings,
  selectedQuality = '1080p60',
  isNoiseSuppressed = true,
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
    <div className="bg-gray-950/95 border-t border-gray-800/80 px-2 sm:px-4 py-2 sm:py-3 select-none backdrop-blur-lg">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 flex-wrap">
        {/* Left: Room Code & Quick Share Links (Compact on Mobile) */}
        <div className="flex items-center gap-1.5 sm:gap-2 bg-gray-900 border border-gray-800 px-2.5 sm:px-3 py-1 rounded-xl shadow">
          <div className="flex flex-col">
            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider hidden xs:inline">Room</span>
            <span className="text-white font-mono text-xs sm:text-sm font-bold tracking-wider">{roomCode}</span>
          </div>

          <div className="h-5 w-px bg-gray-800 mx-0.5 sm:mx-1" />

          {/* Copy Code */}
          <button
            onClick={copyRoomCode}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
            title="Copy room code"
          >
            {copiedCode ? <Check size={15} className="text-green-400" /> : <Copy size={15} />}
          </button>

          {/* Copy Invite Link */}
          <button
            onClick={copyInviteLink}
            className="p-1.5 text-purple-400 hover:text-purple-300 hover:bg-gray-800 rounded-lg transition flex items-center gap-1"
            title="Copy invite URL link"
          >
            {copiedLink ? <Check size={15} className="text-green-400" /> : <Link size={15} />}
            <span className="text-xs font-semibold hidden md:inline">
              {copiedLink ? 'Copied!' : 'Invite'}
            </span>
          </button>
        </div>

        {/* Center: Main Media Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Microphone */}
          <button
            onClick={onToggleMic}
            className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl transition shadow-lg relative group ${
              isMicOn
                ? 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={isMicOn ? 'Mute microphone (M)' : 'Unmute microphone (M)'}
          >
            {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
          </button>

          {/* Camera */}
          <button
            onClick={onToggleCamera}
            className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl transition shadow-lg relative group ${
              isCameraOn
                ? 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={isCameraOn ? 'Turn off camera (V)' : 'Turn on camera (V)'}
          >
            {isCameraOn ? <Video size={18} /> : <VideoOff size={18} />}
          </button>

          {/* Screen Share (1080p 60fps) */}
          <button
            onClick={onToggleScreenShare}
            className={`px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl transition shadow-lg flex items-center gap-1.5 sm:gap-2 relative group ${
              isScreenSharing
                ? 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-400'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
            title={isScreenSharing ? 'Stop screen sharing (S)' : 'Share screen in 1080p 60fps (S)'}
          >
            <Monitor size={18} />
            <span className="font-semibold text-xs sm:text-sm hidden sm:inline">
              {isScreenSharing ? 'Stop' : 'Share'}
            </span>
            <span className="text-[9px] bg-white/20 px-1 py-0.5 rounded font-mono font-bold uppercase hidden lg:inline">
              {selectedQuality}
            </span>
          </button>

          {/* Quick Screen Audio Mute / Unmute Toggle (When Screen Sharing) */}
          {isScreenSharing && (
            <button
              onClick={onToggleScreenAudioMute}
              disabled={!hasScreenAudio}
              className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl transition shadow-lg relative group ${
                !hasScreenAudio
                  ? 'bg-gray-800 text-gray-500 border border-gray-700 cursor-not-allowed opacity-60'
                  : isScreenAudioMuted
                  ? 'bg-amber-600 hover:bg-amber-700 text-white border border-amber-500'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 ring-2 ring-emerald-400/40'
              }`}
              title={
                !hasScreenAudio
                  ? 'Screen video only (No game/system sound was shared)'
                  : isScreenAudioMuted
                  ? 'Unmute game/screen sound'
                  : 'Mute game/screen sound (Streaming in high fidelity stereo)'
              }
            >
              {!hasScreenAudio ? (
                <VolumeX size={18} />
              ) : isScreenAudioMuted ? (
                <VolumeX size={18} />
              ) : (
                <Volume2 size={18} />
              )}
            </button>
          )}

          {/* Fullscreen Room */}
          <button
            onClick={toggleAppFullscreen}
            className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition shadow-lg"
            title="Toggle fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>

        {/* Right: Chat, Settings & Leave Call */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Chat Toggle */}
          <button
            onClick={onToggleChat}
            className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl transition shadow-lg relative ${
              isChatOpen
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700'
            }`}
            title="In-call chat (C)"
          >
            <MessageSquare size={18} />
            {unreadCount > 0 && !isChatOpen && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center animate-pulse shadow">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 transition shadow-lg relative group"
            title="Settings & Noise Cancellation"
          >
            <Settings size={18} />
            {isNoiseSuppressed && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-gray-950" title="Noise Suppression Active" />
            )}
          </button>

          {/* Leave Call */}
          <button
            onClick={onLeave}
            className="px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-red-600 hover:bg-red-700 text-white font-semibold transition shadow-lg flex items-center gap-1.5"
            title="Leave call"
          >
            <Phone size={18} className="transform rotate-[135deg]" />
            <span className="hidden sm:inline text-xs sm:text-sm">Leave</span>
          </button>
        </div>
      </div>
    </div>
  )
}
