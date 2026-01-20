import { useState } from 'react'
import HomePage from './pages/HomePage'
import RoomPage from './pages/RoomPage'

function App() {
  const [currentPage, setCurrentPage] = useState('home')
  const [roomCode, setRoomCode] = useState(null)

  const handleCreateRoom = (code) => {
    setRoomCode(code)
    setCurrentPage('room')
  }

  const handleJoinRoom = (code) => {
    setRoomCode(code)
    setCurrentPage('room')
  }

  const handleLeaveRoom = () => {
    setCurrentPage('home')
    setRoomCode(null)
  }

  return (
    <>
      {currentPage === 'home' ? (
        <HomePage onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />
      ) : (
        <RoomPage roomCode={roomCode} onLeaveRoom={handleLeaveRoom} />
      )}
    </>
  )
}

export default App
