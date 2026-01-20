const express = require('express')
const cors = require('cors')
const http = require('http')
const socketIO = require('socket.io')

const app = express()
const server = http.createServer(app)

// Allow multiple origins for production and development
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL || 'https://your-app.vercel.app'
]

const io = socketIO(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
}))

app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const rooms = new Map()
const users = new Map()

io.on('connection', (socket) => {
  console.log('User connected:', socket.id)

  socket.on('join-room', ({ roomCode }) => {
    socket.join(roomCode)
    users.set(socket.id, { roomCode, socketId: socket.id })

    if (!rooms.has(roomCode)) {
      rooms.set(roomCode, new Set())
    }
    rooms.get(roomCode).add(socket.id)

    socket.to(roomCode).emit('user-joined', { userId: socket.id })

    const existingUsers = Array.from(rooms.get(roomCode)).filter((id) => id !== socket.id)
    socket.emit('existing-users', { users: existingUsers })
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

  socket.on('leave-room', ({ roomCode }) => {
    socket.leave(roomCode)
    if (rooms.has(roomCode)) {
      rooms.get(roomCode).delete(socket.id)
      io.to(roomCode).emit('user-left', { userId: socket.id })

      if (rooms.get(roomCode).size === 0) {
        rooms.delete(roomCode)
      }
    }
    users.delete(socket.id)
  })

  socket.on('disconnect', () => {
    const user = users.get(socket.id)
    if (user) {
      const { roomCode } = user
      if (rooms.has(roomCode)) {
        rooms.get(roomCode).delete(socket.id)
        io.to(roomCode).emit('user-left', { userId: socket.id })

        if (rooms.get(roomCode).size === 0) {
          rooms.delete(roomCode)
        }
      }
    }
    users.delete(socket.id)
    console.log('User disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
