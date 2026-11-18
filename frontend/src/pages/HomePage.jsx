import { useState } from 'react'
import { generateRoomCode } from '../utils/roomUtils'
import { Sparkles, Tv, Mic, Users, ArrowRight } from 'lucide-react'

export default function HomePage({ onCreateRoom, onJoinRoom, defaultRoomCode = '' }) {
  const [userName, setUserName] = useState(() => {
    return localStorage.getItem('openstream_username') || `User-${Math.floor(1000 + Math.random() * 9000)}`
  })
  const [joinCode, setJoinCode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const roomParam = params.get('room')
    if (roomParam && roomParam.length === 6) {
      return roomParam.toUpperCase()
    }
    return defaultRoomCode
  })
  const [error, setError] = useState('')

  const saveUserName = (name) => {
    const trimmed = name.trim()
    setUserName(trimmed)
    if (trimmed) {
      localStorage.setItem('openstream_username', trimmed)
    }
  }

  const handleCreate = () => {
    if (!userName.trim()) {
      setError('Please enter your name first')
      return
    }
    setError('')
    const code = generateRoomCode()
    onCreateRoom(code, userName.trim())
  }

  const handleJoin = () => {
    if (!userName.trim()) {
      setError('Please enter your name first')
      return
    }
    if (!joinCode.trim()) {
      setError('Please enter a room code')
      return
    }
    if (joinCode.length !== 6) {
      setError('Room code must be 6 characters')
      return
    }
    setError('')
    onJoinRoom(joinCode.toUpperCase(), userName.trim())
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-purple-950 to-gray-950 flex flex-col items-center justify-center p-4 text-white">
      {/* Brand & Badge */}
      <div className="text-center mb-8 max-w-lg">
        <div className="inline-flex items-center gap-2 bg-purple-900/40 border border-purple-500/30 px-3 py-1.5 rounded-full text-xs font-semibold text-purple-300 mb-4 shadow">
          <Sparkles size={14} className="text-purple-400" />
          <span>Discord & Google Meet Alternative • 1080p 60FPS Free</span>
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-300 bg-clip-text text-transparent mb-3">
          OpenStream
        </h1>
        <p className="text-gray-400 text-sm sm:text-base">
          High fidelity 1080p 60fps screen sharing with system audio, ultra-low latency voice chat, and no subscriptions.
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-gray-900/90 border border-gray-800 rounded-3xl shadow-2xl p-6 sm:p-8 max-w-md w-full backdrop-blur-xl">
        <div className="space-y-5">
          {/* Display Name Input */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Your Display Name
            </label>
            <input
              type="text"
              placeholder="e.g. Alex"
              value={userName}
              onChange={(e) => saveUserName(e.target.value)}
              maxLength="24"
              className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition font-medium"
            />
          </div>

          {/* Create Room Button */}
          <button
            onClick={handleCreate}
            className="w-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-purple-900/40 transition duration-200 flex items-center justify-center gap-2 transform active:scale-[0.98]"
          >
            <Tv size={18} />
            <span>Create New Room</span>
          </button>

          {/* Divider */}
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-800"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="px-3 bg-gray-900 text-gray-500 font-semibold tracking-wider">or join existing</span>
            </div>
          </div>

          {/* Join Code Input */}
          <div className="space-y-2">
            <input
              type="text"
              placeholder="ROOM CODE"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength="6"
              className="w-full bg-gray-950 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 uppercase text-center font-mono font-bold text-lg tracking-widest transition"
            />

            <button
              onClick={handleJoin}
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold py-3 px-4 rounded-xl border border-gray-700 transition flex items-center justify-center gap-2"
            >
              <span>Join Room</span>
              <ArrowRight size={16} />
            </button>
          </div>

          {error && (
            <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs font-medium p-3 rounded-xl text-center">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl text-xs text-gray-400 text-center px-4">
        <div className="bg-gray-900/50 border border-gray-800/80 rounded-2xl p-3.5">
          <div className="font-bold text-gray-200 mb-1 flex items-center justify-center gap-1.5">
            <Tv size={14} className="text-purple-400" />
            <span>1080p 60FPS</span>
          </div>
          <span>Fluid gaming and presentation streaming without paywalls.</span>
        </div>
        <div className="bg-gray-900/50 border border-gray-800/80 rounded-2xl p-3.5">
          <div className="font-bold text-gray-200 mb-1 flex items-center justify-center gap-1.5">
            <Mic size={14} className="text-indigo-400" />
            <span>System Audio</span>
          </div>
          <span>Stream game sound and tab audio in crystal clear stereo.</span>
        </div>
        <div className="bg-gray-900/50 border border-gray-800/80 rounded-2xl p-3.5">
          <div className="font-bold text-gray-200 mb-1 flex items-center justify-center gap-1.5">
            <Users size={14} className="text-pink-400" />
            <span>Stage & Chat</span>
          </div>
          <span>Focus streams, fullscreen video, and in-call text chat.</span>
        </div>
      </div>
    </div>
  )
}
