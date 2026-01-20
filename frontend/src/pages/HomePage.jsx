import { useState } from 'react'
import { generateRoomCode } from '../utils/roomUtils'

export default function HomePage({ onCreateRoom, onJoinRoom }) {
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')

  const handleCreate = () => {
    const code = generateRoomCode()
    onCreateRoom(code)
  }

  const handleJoin = () => {
    if (!joinCode.trim()) {
      setError('Please enter a room code')
      return
    }
    if (joinCode.length !== 6) {
      setError('Room code must be 6 characters')
      return
    }
    setError('')
    onJoinRoom(joinCode.toUpperCase())
  }

  return (
    <div className="min-h-screen bg-gradient-to-tr from-purple-500 via-pink-500 to-red-500 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-2xl p-12 max-w-md w-full mx-4">
        <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-purple-600 to-red-600 bg-clip-text text-transparent">
          OpenStream
        </h1>
        <p className="text-center text-gray-600 mb-8">Connect with anyone, anywhere</p>

        <div className="space-y-4">
          <button
            onClick={handleCreate}
            className="w-full bg-gradient-to-r from-purple-600 to-red-600 hover:from-purple-700 hover:to-red-700 text-white font-bold py-3 px-4 rounded-lg transition duration-200 transform hover:scale-105"
          >
            Create Room
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          <input
            type="text"
            placeholder="Enter room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength="6"
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-purple-600 uppercase text-center font-bold text-lg tracking-widest"
          />

          <button
            onClick={handleJoin}
            className="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 px-4 rounded-lg transition duration-200 transform hover:scale-105"
          >
            Join Room
          </button>
        </div>

        {error && <p className="text-red-600 text-center mt-4 font-semibold">{error}</p>}
      </div>
    </div>
  )
}
