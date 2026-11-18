import { useState } from 'react'
import HomePage from './pages/HomePage'
import RoomPage from './pages/RoomPage'

function App() {
  const [currentPage, setCurrentPage] = useState('home')
  const [roomCode, setRoomCode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('room')
    return code && code.length === 6 ? code.toUpperCase() : null
  })
  const [userName, setUserName] = useState('You')

  const handleCreateRoom = (code, name) => {
    setRoomCode(code)
    setUserName(name || 'You')
    setCurrentPage('room')
    const newUrl = `${window.location.pathname}?room=${code}`
    window.history.pushState({ room: code }, '', newUrl)
  }

  const handleJoinRoom = (code, name) => {
    setRoomCode(code)
    setUserName(name || 'You')
    setCurrentPage('room')
    const newUrl = `${window.location.pathname}?room=${code}`
    window.history.pushState({ room: code }, '', newUrl)
  }

  const handleLeaveRoom = () => {
    setCurrentPage('home')
    setRoomCode(null)
    window.history.pushState({}, '', window.location.pathname)
  }

  return (
    <>
      {currentPage === 'home' ? (
        <HomePage
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          defaultRoomCode={roomCode || ''}
        />
      ) : (
        <RoomPage
          roomCode={roomCode}
          userName={userName}
          onLeaveRoom={handleLeaveRoom}
        />
      )}
    </>
  )
}

export default App
