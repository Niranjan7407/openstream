import { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import VideoGrid from '../components/VideoGrid'
import Controls from '../components/Controls'
import { API_URL } from '../config'

export default function RoomPage({ roomCode, onLeaveRoom }) {
  const socketRef = useRef(null)
  const peersRef = useRef({})
  const peerConnectionsRef = useRef({})
  const [peers, setPeers] = useState([])
  const [localStream, setLocalStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isMicOn, setIsMicOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const dummyStreamRef = useRef(null)

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  }

  // Create a dummy stream with silent audio for when user has no devices enabled
  const getDummyStream = async () => {
    try {
      if (dummyStreamRef.current) {
        return dummyStreamRef.current
      }

      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const destination = audioContext.createMediaStreamDestination()
      dummyStreamRef.current = destination.stream
      return dummyStreamRef.current
    } catch (error) {
      console.error('Error creating dummy stream:', error)
      return null
    }
  }

  // Update UI when peers change
  const updatePeersUI = () => {
    const peerArray = Object.values(peersRef.current).filter(p => p && (p.stream || p.screenStream))
    console.log('Updating UI with peers:', peerArray.length, peerArray)
    setPeers([...peerArray])
  }

  const createPeerConnection = async (userId, initiator) => {
    try {
      console.log(`Creating peer connection with ${userId}, initiator: ${initiator}`)
      
      // Don't create duplicate connections
      if (peerConnectionsRef.current[userId]) {
        console.log(`Connection with ${userId} already exists`)
        return
      }

      const peerConnection = new RTCPeerConnection(ICE_SERVERS)

      // Initialize peer object
      if (!peersRef.current[userId]) {
        peersRef.current[userId] = { userId, stream: null, screenStream: null }
      }

      // Add local stream tracks if available
      if (localStreamRef.current) {
        console.log(`Adding local stream tracks to ${userId}`)
        localStreamRef.current.getTracks().forEach((track) => {
          peerConnection.addTrack(track, localStreamRef.current)
        })
      }

      // Add screen stream tracks if sharing
      if (screenStreamRef.current) {
        console.log(`Adding screen stream tracks to ${userId}`)
        screenStreamRef.current.getTracks().forEach((track) => {
          peerConnection.addTrack(track, screenStreamRef.current)
        })
      }

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('send-ice-candidate', {
            to: userId,
            candidate: event.candidate,
          })
        }
      }

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state with ${userId}: ${peerConnection.connectionState}`)
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          console.log(`Closing connection with ${userId}`)
          peerConnection.close()
          delete peerConnectionsRef.current[userId]
          delete peersRef.current[userId]
          updatePeersUI()
        } else if (peerConnection.connectionState === 'connected') {
          console.log(`Connected to ${userId}`)
        }
      }

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        console.log(`Received ${event.track.kind} track from ${userId}, track label: ${event.track.label}`)
        
        if (!peersRef.current[userId]) {
          peersRef.current[userId] = { userId, stream: null, screenStream: null }
        }

        const remoteStream = event.streams[0]
        
        // Check if this is a screen track
        const isScreenTrack = event.track.label.toLowerCase().includes('screen')
        
        if (isScreenTrack) {
          peersRef.current[userId].screenStream = remoteStream
          console.log(`Set screen stream for ${userId}`)
        } else {
          // This is camera/audio stream
          peersRef.current[userId].stream = remoteStream
          console.log(`Set camera stream for ${userId}`)
        }

        console.log(`Peer ${userId} now has:`, {
          hasCamera: !!peersRef.current[userId].stream,
          hasScreen: !!peersRef.current[userId].screenStream,
          streamId: remoteStream.id
        })

        updatePeersUI()
      }

      peerConnectionsRef.current[userId] = peerConnection

      if (initiator) {
        console.log(`Creating and sending offer to ${userId}`)
        try {
          const offer = await peerConnection.createOffer()
          await peerConnection.setLocalDescription(offer)
          socketRef.current.emit('send-offer', { to: userId, offer: offer })
          console.log(`Offer sent to ${userId}`)
        } catch (offerError) {
          console.error('Error creating offer:', offerError)
        }
      }
    } catch (error) {
      console.error('Error creating peer connection:', error)
    }
  }

  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(API_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      withCredentials: true,
    })

    socketRef.current.on('connect', () => {
      console.log('Socket connected:', socketRef.current.id)
      setConnectionStatus('connected')
    })

    socketRef.current.on('disconnect', () => {
      console.log('Socket disconnected')
      setConnectionStatus('disconnected')
    })

    socketRef.current.emit('join-room', { roomCode })
    console.log('Emitted join-room with code:', roomCode)

    // When a new user joins the room
    socketRef.current.on('user-joined', async ({ userId }) => {
      console.log(`New user joined: ${userId}`)
      // Always create connection, even if no local stream
      await createPeerConnection(userId, true)
    })

    // When you join, get existing users
    socketRef.current.on('existing-users', async ({ users }) => {
      console.log(`Existing users in room: ${users.length}`, users)
      for (const userId of users) {
        // Always create connection, even if no local stream
        await createPeerConnection(userId, false)
      }
    })

    socketRef.current.on('receive-offer', async ({ from, offer }) => {
      console.log(`Received offer from ${from}`)
      try {
        if (!peerConnectionsRef.current[from]) {
          console.log(`No peer connection with ${from}, creating one...`)
          await createPeerConnection(from, false)
        }
        const pc = peerConnectionsRef.current[from]
        if (pc && (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer')) {
          console.log(`Setting remote description for ${from}, signaling state: ${pc.signalingState}`)
          await pc.setRemoteDescription(new RTCSessionDescription(offer))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          socketRef.current.emit('send-answer', { to: from, answer: answer })
          console.log(`Sent answer to ${from}`)
        }
      } catch (error) {
        console.error('Error handling offer:', error)
      }
    })

    socketRef.current.on('receive-answer', async ({ from, answer }) => {
      console.log(`Received answer from ${from}`)
      try {
        const pc = peerConnectionsRef.current[from]
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer))
          console.log(`Remote description set for ${from}`)
        } else {
          console.log(`Cannot set answer for ${from}, signaling state: ${pc?.signalingState}`)
        }
      } catch (error) {
        console.error('Error handling answer:', error)
      }
    })

    socketRef.current.on('receive-ice-candidate', async ({ from, candidate }) => {
      try {
        const pc = peerConnectionsRef.current[from]
        if (pc) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error)
      }
    })

    socketRef.current.on('user-left', ({ userId }) => {
      console.log(`User left: ${userId}`)
      if (peerConnectionsRef.current[userId]) {
        peerConnectionsRef.current[userId].close()
        delete peerConnectionsRef.current[userId]
      }
      if (peersRef.current[userId]) {
        delete peersRef.current[userId]
      }
      updatePeersUI()
    })

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      if (dummyStreamRef.current) {
        dummyStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        pc.close()
      })
      socketRef.current.disconnect()
    }
  }, [roomCode])

  const toggleCamera = async () => {
    try {
      if (!isCameraOn) {
        // Request permission to enable camera
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: isMicOn, // Include audio only if mic is already on
          })
          localStreamRef.current = stream
          setLocalStream(stream)

          // Add video track to all existing peer connections
          const videoTrack = stream.getVideoTracks()[0]
          if (videoTrack) {
            for (const userId in peerConnectionsRef.current) {
              const peerConnection = peerConnectionsRef.current[userId]
              try {
                await peerConnection.addTrack(videoTrack, stream)
              } catch (e) {
                console.error(`Error adding track to ${userId}:`, e)
              }
            }
          }
        } else {
          // If stream exists but video is off, enable it
          const videoTrack = localStreamRef.current.getVideoTracks()[0]
          if (videoTrack) {
            videoTrack.enabled = true
          }
        }
        setIsCameraOn(true)
      } else {
        // Disable camera
        if (localStreamRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0]
          if (videoTrack) {
            videoTrack.enabled = false
          }
        }
        setIsCameraOn(false)
      }
    } catch (error) {
      console.error('Error toggling camera:', error)
      alert('Could not access camera. Please check permissions.')
    }
  }

  const toggleMic = async () => {
    try {
      if (!isMicOn) {
        // Request permission to enable mic
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: isCameraOn, // Include video only if camera is already on
            audio: true,
          })
          localStreamRef.current = stream
          setLocalStream(stream)

          // Add audio track to all existing peer connections
          const audioTrack = stream.getAudioTracks()[0]
          if (audioTrack) {
            for (const userId in peerConnectionsRef.current) {
              const peerConnection = peerConnectionsRef.current[userId]
              try {
                await peerConnection.addTrack(audioTrack, stream)
              } catch (e) {
                console.error(`Error adding track to ${userId}:`, e)
              }
            }
          }
        } else {
          // If stream exists but audio is off, enable it
          const audioTrack = localStreamRef.current.getAudioTracks()[0]
          if (audioTrack) {
            audioTrack.enabled = true
          }
        }
        setIsMicOn(true)
      } else {
        // Disable mic
        if (localStreamRef.current) {
          const audioTrack = localStreamRef.current.getAudioTracks()[0]
          if (audioTrack) {
            audioTrack.enabled = false
          }
        }
        setIsMicOn(false)
      }
    } catch (error) {
      console.error('Error toggling microphone:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false,
        })
        
        screenStreamRef.current = displayStream
        setScreenStream(displayStream)
        
        const screenTrack = displayStream.getVideoTracks()[0]
        
        // Add screen track to all existing peer connections
        for (const userId in peerConnectionsRef.current) {
          const peerConnection = peerConnectionsRef.current[userId]
          try {
            await peerConnection.addTrack(screenTrack, displayStream)
          } catch (e) {
            console.error(`Error adding screen track to ${userId}:`, e)
          }
        }

        // Handle when user stops screen share from the system
        screenTrack.onended = () => {
          stopScreenShare()
        }

        setIsScreenSharing(true)
        console.log('Screen sharing started')
      } else {
        stopScreenShare()
      }
    } catch (error) {
      console.error('Error sharing screen:', error)
      if (error.name !== 'NotAllowedError') {
        alert('Error accessing screen share')
      }
    }
  }

  const stopScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop())
    }

    // Remove screen track from all peer connections
    for (const userId in peerConnectionsRef.current) {
      const peerConnection = peerConnectionsRef.current[userId]
      const screenSenders = peerConnection.getSenders().filter((sender) => {
        return sender.track && sender.track.kind === 'video' && 
               sender.track.label.toLowerCase().includes('screen')
      })
      
      for (const sender of screenSenders) {
        try {
          await peerConnection.removeTrack(sender)
        } catch (error) {
          console.error('Error removing screen track:', error)
        }
      }
    }

    screenStreamRef.current = null
    setScreenStream(null)
    setIsScreenSharing(false)
    console.log('Screen sharing stopped')
  }

  const handleLeave = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop())
    }
    Object.values(peerConnectionsRef.current).forEach((pc) => {
      pc.close()
    })
    socketRef.current.emit('leave-room', { roomCode })
    socketRef.current.disconnect()
    onLeaveRoom()
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Connection Status Indicator */}
      <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-sm font-semibold bg-opacity-70 z-10" style={{
        backgroundColor: connectionStatus === 'connected' ? '#10b981' : connectionStatus === 'connecting' ? '#f59e0b' : '#ef4444',
        color: 'white'
      }}>
        {connectionStatus === 'connected' ? '✓ Connected' : connectionStatus === 'connecting' ? '⚙ Connecting...' : '✕ Disconnected'}
      </div>

      <div className="flex-1 p-4">
        <VideoGrid
          localStream={localStream}
          screenStream={screenStream}
          peers={peers}
          isScreenSharing={isScreenSharing}
        />
      </div>

      <Controls
        roomCode={roomCode}
        isCameraOn={isCameraOn}
        isMicOn={isMicOn}
        isScreenSharing={isScreenSharing}
        onToggleCamera={toggleCamera}
        onToggleMic={toggleMic}
        onToggleScreenShare={toggleScreenShare}
        onLeave={handleLeave}
      />
    </div>
  )
}
