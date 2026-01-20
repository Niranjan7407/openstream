import { Copy, Mic, MicOff, Video, VideoOff, Monitor, Phone } from 'lucide-react'
import { useState } from 'react'

export default function Controls({
  roomCode,
  isCameraOn,
  isMicOn,
  isScreenSharing,
  onToggleCamera,
  onToggleMic,
  onToggleScreenShare,
  onLeave,
}) {
  const [copied, setCopied] = useState(false)

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-4 py-4">
      <div className="max-w-2xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 bg-gray-900 px-4 py-2 rounded-lg">
          <span className="text-white font-mono text-lg font-bold">{roomCode}</span>
          <button
            onClick={copyRoomCode}
            className="text-gray-400 hover:text-white transition"
            title="Copy room code"
          >
            <Copy size={20} />
          </button>
          {copied && <span className="text-green-400 text-sm ml-2">Copied!</span>}
        </div>

        <div className="flex gap-4">
          <button
            onClick={onToggleMic}
            className={`p-3 rounded-full transition ${
              isMicOn
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={isMicOn ? 'Mute microphone' : 'Unmute microphone'}
          >
            {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
          </button>

          <button
            onClick={onToggleCamera}
            className={`p-3 rounded-full transition ${
              isCameraOn
                ? 'bg-gray-700 hover:bg-gray-600 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
            title={isCameraOn ? 'Turn off camera' : 'Turn on camera'}
          >
            {isCameraOn ? <Video size={24} /> : <VideoOff size={24} />}
          </button>

          <button
            onClick={onToggleScreenShare}
            className={`p-3 rounded-full transition ${
              isScreenSharing
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
            }`}
            title={isScreenSharing ? 'Stop sharing screen' : 'Share screen'}
          >
            <Monitor size={24} />
          </button>

          <button
            onClick={onLeave}
            className="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white transition"
            title="Leave call"
          >
            <Phone size={24} className="transform rotate-[135deg]" />
          </button>
        </div>
      </div>
    </div>
  )
}
