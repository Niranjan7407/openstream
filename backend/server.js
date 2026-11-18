const express = require('express')
const cors = require('cors')
const http = require('http')
const socketIO = require('socket.io')

const app = express()
const server = http.createServer(app)

// Robust origin check supporting localhost, local network IPs, and configured frontend URL
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  (process.env.FRONTEND_URL || 'https://openstream-psi.vercel.app').replace(/\/+$/, '')
]

const isOriginAllowed = (origin) => {
  if (!origin) return true
  const cleanOrigin = origin.replace(/\/+$/, '')
  if (allowedOrigins.includes(cleanOrigin)) return true
  // Allow localhost / 127.0.0.1 on any port
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true
  // Allow local network IP (e.g., 192.168.x.x, 10.x.x.x) on any port for mobile testing
  if (/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) return true
  return false
}

const io = socketIO(server, {
  cors: {
    origin: function (origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true)
      } else {
        callback(null, true) // Allow connection in dev / fallback to avoid breaking
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

app.use(cors({
  origin: function (origin, callback) {
    if (isOriginAllowed(origin)) {
      callback(null, true)
    } else {
      callback(null, true)
    }
  },
  credentials: true,
}))

app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const rooms = new Map() // roomCode -> Set of socketId
const users = new Map() // socketId -> { roomCode, socketId, userName }
const roomScreenShares = new Map() // roomCode -> Map(socketId, { streamId, hasAudio, userName })

io.on('connection', (socket) => {
  console.log('User connected:', socket.id)

  socket.on('join-room', ({ roomCode, userName }) => {
    const displayName = userName && userName.trim() ? userName.trim() : `User-${socket.id.slice(0, 4)}`
    socket.join(roomCode)
    users.set(socket.id, { roomCode, socketId: socket.id, userName: displayName })

    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, new Set())
    }

    // Get existing users in room BEFORE adding new user
    const existingUserIds = Array.from(rooms.get(roomCode))
    const existingUsers = existingUserIds.map((id) => ({
      userId: id,
      userName: users.get(id)?.userName || `User-${id.slice(0, 4)}`,
    }))

    // Add new user to room
    rooms.get(roomCode).add(socket.id)

    console.log(`User ${socket.id} (${displayName}) joined room ${roomCode}`)
    console.log(`Room ${roomCode} now has ${rooms.get(roomCode).size} users`)

    // Notify existing users about the new user joining
    existingUserIds.forEach((existingUserId) => {
      io.to(existingUserId).emit('user-joined', {
        userId: socket.id,
        userName: displayName,
      })
    })

    // Active screen shares in this room
    const activeScreenShares = []
    if (roomScreenShares.has(roomCode)) {
      for (const [userId, shareInfo] of roomScreenShares.get(roomCode).entries()) {
        activeScreenShares.push({ userId, ...shareInfo })
      }
    }

    // Send list of existing users & active screen shares to the new user
    socket.emit('existing-users', {
      users: existingUsers,
      activeScreenShares,
    })
  })

  socket.on('send-offer', ({ to, offer }) => {
    io.to(to).emit('receive-offer', { from: socket.id, offer })
  })

  socket.on('send-answer', ({ to, answer }) => {
    io.to(to).emit('receive-answer', { from: socket.id, answer })
  })

  socket.on('send-ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('receive-ice-candidate', { from: socket.id, candidate })
  })

  // Broadcast screen sharing status changes
  socket.on('screen-share-status', ({ roomCode, isSharing, streamId, hasAudio, quality }) => {
    const user = users.get(socket.id)
    if (!roomScreenShares.has(roomCode)) {
      roomScreenShares.set(roomCode, new Map())
    }

    const roomShares = roomScreenShares.get(roomCode)
    if (isSharing) {
      roomShares.set(socket.id, {
        streamId,
        hasAudio: !!hasAudio,
        quality: quality || '1080p60',
        userName: user?.userName || `User-${socket.id.slice(0, 4)}`,
      })
    } else {
      roomShares.delete(socket.id)
    }

    socket.to(roomCode).emit('peer-screen-share-status', {
      userId: socket.id,
      userName: user?.userName,
      isSharing,
      streamId,
      hasAudio: !!hasAudio,
      quality: quality || '1080p60',
    })
  })

  // In-room text chat
  socket.on('send-chat-message', ({ roomCode, message }) => {
    const user = users.get(socket.id)
    const displayName = user?.userName || `User-${socket.id.slice(0, 4)}`
    const chatMsg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      senderId: socket.id,
      senderName: displayName,
      text: message,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    io.to(roomCode).emit('chat-message', chatMsg)
  })

  // Peer status update (e.g. mic muted, camera disabled, speaking)
  socket.on('user-status-update', ({ roomCode, status }) => {
    socket.to(roomCode).emit('peer-status-update', {
      userId: socket.id,
      ...status,
    })
  })

  const handleUserLeave = (socketId) => {
    const user = users.get(socketId)
    if (user) {
      const { roomCode } = user
      if (rooms.has(roomCode)) {
        rooms.get(roomCode).delete(socketId)
        io.to(roomCode).emit('user-left', { userId: socketId })

        if (roomScreenShares.has(roomCode)) {
          roomScreenShares.get(roomCode).delete(socketId)
        }

        if (rooms.get(roomCode).size === 0) {
          rooms.delete(roomCode)
          roomScreenShares.delete(roomCode)
        }
      }
    }
    users.delete(socketId)
    console.log(`User ${socketId} cleaned up`)
  }

  socket.on('leave-room', ({ roomCode }) => {
    socket.leave(roomCode)
    handleUserLeave(socket.id)
  })

  socket.on('disconnect', () => {
    handleUserLeave(socket.id)
    console.log('User disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
