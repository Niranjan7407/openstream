const express = require('express')
const cors = require('cors')
const http = require('http')
const socketIO = require('socket.io')

const app = express()
const server = http.createServer(app)

// Permissive CORS across any origin for cross-origin hosting (Vercel, Render, local network, etc.)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
}))
app.options('*', cors())

const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true,
})

app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ICE / TURN Servers endpoint for clients to discover relays dynamically
app.get('/api/ice-servers', (req, res) => {
  const customTurnUrl = process.env.TURN_URL
  const customTurnUsername = process.env.TURN_USERNAME
  const customTurnCredential = process.env.TURN_CREDENTIAL

  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:openrelay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turns:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ]

  if (customTurnUrl) {
    iceServers.push({
      urls: customTurnUrl,
      username: customTurnUsername,
      credential: customTurnCredential,
    })
  }

  res.json({ iceServers })
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
  socket.on('screen-share-status', ({ roomCode, isSharing, streamId, hasAudio, quality, audioTrackId }) => {
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
        audioTrackId,
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
      audioTrackId,
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
