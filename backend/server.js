const express = require('express')
const cors = require('cors')
const http = require('http')
const socketIO = require('socket.io')

const app = express()
const server = http.createServer(app)

// Allow multiple origins for production and development
const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL || "https://openstream-psi.vercel.app/"
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

    // Get existing users in room BEFORE adding new user
    const existingUsers = Array.from(rooms.get(roomCode))
    
    // Add new user to room
    rooms.get(roomCode).add(socket.id)

    console.log(`User ${socket.id} joined room ${roomCode}`)
    console.log(`Room ${roomCode} now has ${rooms.get(roomCode).size} users`)

    // Notify existing users about the new user joining
    // They should initiate the connection
    existingUsers.forEach((existingUserId) => {
      io.to(existingUserId).emit('user-joined', { userId: socket.id })
    })

    // Send list of existing users to the new user
    // The new user should initiate connections to them
    socket.emit('existing-users', { users: existingUsers })
  })

  socket.on('send-offer', ({ to, offer }) => {
    console.log(`Offer from ${socket.id} to ${to}`)
    io.to(to).emit('receive-offer', { from: socket.id, offer })
  })

  socket.on('send-answer', ({ to, answer }) => {
    console.log(`Answer from ${socket.id} to ${to}`)
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
    console.log(`User ${socket.id} left room ${roomCode}`)
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
