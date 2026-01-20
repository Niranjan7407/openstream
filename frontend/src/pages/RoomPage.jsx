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

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
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
        return peerConnectionsRef.current[userId]
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
          console.log(`Added ${track.kind} track to ${userId}`)
        })
      }

      // Add screen stream tracks if sharing (both video and audio)
      if (screenStreamRef.current) {
        console.log(`Adding screen stream tracks to ${userId}`)
        screenStreamRef.current.getTracks().forEach((track) => {
          peerConnection.addTrack(track, screenStreamRef.current)
          console.log(`Added screen ${track.kind} track to ${userId}`)
        })
      }

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log(`Sending ICE candidate to ${userId}`)
          socketRef.current.emit('send-ice-candidate', {
            to: userId,
            candidate: event.candidate,
          })
        }
      }

      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log(`ICE connection state with ${userId}: ${peerConnection.iceConnectionState}`)
      }

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state with ${userId}: ${peerConnection.connectionState}`)
        if (peerConnection.connectionState === 'failed') {
          console.log(`Connection failed with ${userId}, attempting to restart ICE`)
          peerConnection.restartIce()
        } else if (peerConnection.connectionState === 'disconnected') {
          console.log(`Disconnected from ${userId}`)
        } else if (peerConnection.connectionState === 'connected') {
          console.log(`Successfully connected to ${userId}`)
        } else if (peerConnection.connectionState === 'closed') {
          console.log(`Connection closed with ${userId}`)
          delete peerConnectionsRef.current[userId]
          delete peersRef.current[userId]
          updatePeersUI()
        }
      }

      // Handle remote stream - IMPROVED TRACK DETECTION
      peerConnection.ontrack = (event) => {
        console.log(`Received ${event.track.kind} track from ${userId}`)
        console.log('Track details:', {
          id: event.track.id,
          label: event.track.label,
          kind: event.track.kind,
          streamId: event.streams[0]?.id
        })
        
        if (!peersRef.current[userId]) {
          peersRef.current[userId] = { userId, stream: null, screenStream: null }
        }

        const remoteStream = event.streams[0]
        
        // Better detection of screen share tracks
        // Screen share tracks typically have labels like "screen:0:0" or contain "screen" in the label
        const isScreenTrack = event.track.label.toLowerCase().includes('screen') || 
                             event.track.label.includes('screen:') ||
                             event.track.label.includes('monitor') ||
                             event.transceiver?.mid?.includes('screen')
        
        console.log(`Track identified as: ${isScreenTrack ? 'SCREEN' : 'CAMERA'} for ${userId}`)
        
        if (isScreenTrack) {
          // This is a screen share stream
          if (!peersRef.current[userId].screenStream) {
            console.log(`Creating new screen stream for ${userId}`)
            peersRef.current[userId].screenStream = new MediaStream()
          }
          
          // Remove old tracks of the same kind
          const existingTracks = peersRef.current[userId].screenStream.getTracks()
          existingTracks.forEach(track => {
            if (track.kind === event.track.kind) {
              peersRef.current[userId].screenStream.removeTrack(track)
            }
          })
          
          peersRef.current[userId].screenStream.addTrack(event.track)
          console.log(`Added screen ${event.track.kind} track for ${userId}`)
        } else {
          // This is a camera/microphone stream
          if (!peersRef.current[userId].stream) {
            console.log(`Creating new camera stream for ${userId}`)
            peersRef.current[userId].stream = new MediaStream()
          }
          
          // Remove old tracks of the same kind
          const existingTracks = peersRef.current[userId].stream.getTracks()
          existingTracks.forEach(track => {
            if (track.kind === event.track.kind) {
              peersRef.current[userId].stream.removeTrack(track)
            }
          })
          
          peersRef.current[userId].stream.addTrack(event.track)
          console.log(`Added camera ${event.track.kind} track for ${userId}`)
        }

        console.log(`Peer ${userId} streams:`, {
          hasCamera: !!peersRef.current[userId].stream && peersRef.current[userId].stream.getTracks().length > 0,
          cameraTrackCount: peersRef.current[userId].stream?.getTracks().length || 0,
          hasScreen: !!peersRef.current[userId].screenStream && peersRef.current[userId].screenStream.getTracks().length > 0,
          screenTrackCount: peersRef.current[userId].screenStream?.getTracks().length || 0
        })

        updatePeersUI()
      }

      peerConnectionsRef.current[userId] = peerConnection

      if (initiator) {
        console.log(`Creating and sending offer to ${userId}`)
        try {
          const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          })
          await peerConnection.setLocalDescription(offer)
          socketRef.current.emit('send-offer', { to: userId, offer: offer })
          console.log(`Offer sent to ${userId}`)
        } catch (offerError) {
          console.error('Error creating offer:', offerError)
        }
      }

      return peerConnection
    } catch (error) {
      console.error('Error creating peer connection:', error)
      return null
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
      await createPeerConnection(userId, true)
    })

    // When you join, get existing users
    socketRef.current.on('existing-users', async ({ users }) => {
      console.log(`Existing users in room: ${users.length}`, users)
      for (const userId of users) {
        await createPeerConnection(userId, false)
      }
    })

    socketRef.current.on('receive-offer', async ({ from, offer }) => {
      console.log(`Received offer from ${from}`)
      try {
        let pc = peerConnectionsRef.current[from]
        
        if (!pc) {
          console.log(`No peer connection with ${from}, creating one...`)
          pc = await createPeerConnection(from, false)
        }
        
        if (pc) {
          // Check signaling state before setting remote description
          if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
            console.log(`Setting remote description for ${from}, signaling state: ${pc.signalingState}`)
            await pc.setRemoteDescription(new RTCSessionDescription(offer))
            
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            
            socketRef.current.emit('send-answer', { to: from, answer: answer })
            console.log(`Sent answer to ${from}`)
          } else {
            console.warn(`Cannot set remote description for ${from}, signaling state: ${pc.signalingState}`)
          }
        }
      } catch (error) {
        console.error('Error handling offer:', error)
      }
    })

    socketRef.current.on('receive-answer', async ({ from, answer }) => {
      console.log(`Received answer from ${from}`)
      try {
        const pc = peerConnectionsRef.current[from]
        if (pc) {
          if (pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(answer))
            console.log(`Remote description set for ${from}`)
          } else {
            console.warn(`Cannot set answer for ${from}, signaling state: ${pc.signalingState}`)
          }
        }
      } catch (error) {
        console.error('Error handling answer:', error)
      }
    })

    socketRef.current.on('receive-ice-candidate', async ({ from, candidate }) => {
      console.log(`Received ICE candidate from ${from}`)
      try {
        const pc = peerConnectionsRef.current[from]
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
          console.log(`Added ICE candidate from ${from}`)
        } else {
          console.warn(`Cannot add ICE candidate from ${from}, connection not ready`)
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
            audio: isMicOn,
          })
          localStreamRef.current = stream
          setLocalStream(stream)

          // Add tracks to all existing peer connections
          for (const userId in peerConnectionsRef.current) {
            const peerConnection = peerConnectionsRef.current[userId]
            stream.getTracks().forEach((track) => {
              try {
                peerConnection.addTrack(track, stream)
                console.log(`Added ${track.kind} track to ${userId}`)
              } catch (e) {
                console.error(`Error adding track to ${userId}:`, e)
              }
            })
            
            // Renegotiate
            if (peerConnection.signalingState === 'stable') {
              const offer = await peerConnection.createOffer()
              await peerConnection.setLocalDescription(offer)
              socketRef.current.emit('send-offer', { to: userId, offer })
            }
          }
        } else {
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
            video: isCameraOn,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          })
          localStreamRef.current = stream
          setLocalStream(stream)

          // Add tracks to all existing peer connections
          for (const userId in peerConnectionsRef.current) {
            const peerConnection = peerConnectionsRef.current[userId]
            stream.getTracks().forEach((track) => {
              try {
                peerConnection.addTrack(track, stream)
                console.log(`Added ${track.kind} track to ${userId}`)
              } catch (e) {
                console.error(`Error adding track to ${userId}:`, e)
              }
            })
            
            // Renegotiate
            if (peerConnection.signalingState === 'stable') {
              const offer = await peerConnection.createOffer()
              await peerConnection.setLocalDescription(offer)
              socketRef.current.emit('send-offer', { to: userId, offer })
            }
          }
        } else {
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
        // Request screen share with audio
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { 
            cursor: 'always',
            displaySurface: 'monitor',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
        
        screenStreamRef.current = displayStream
        setScreenStream(displayStream)
        
        console.log('Screen stream tracks:', displayStream.getTracks().map(t => ({
          kind: t.kind,
          label: t.label,
          enabled: t.enabled
        })))
        
        // Add screen tracks to all existing peer connections
        for (const userId in peerConnectionsRef.current) {
          const peerConnection = peerConnectionsRef.current[userId]
          displayStream.getTracks().forEach((track) => {
            try {
              peerConnection.addTrack(track, displayStream)
              console.log(`Added screen ${track.kind} track to ${userId}`)
            } catch (e) {
              console.error(`Error adding screen track to ${userId}:`, e)
            }
          })
          
          // Renegotiate to add the new tracks
          if (peerConnection.signalingState === 'stable') {
            const offer = await peerConnection.createOffer()
            await peerConnection.setLocalDescription(offer)
            socketRef.current.emit('send-offer', { to: userId, offer })
          }
        }

        // Handle when user stops screen share from the system
        displayStream.getVideoTracks()[0].onended = () => {
          stopScreenShare()
        }

        setIsScreenSharing(true)
        console.log('Screen sharing started with audio:', displayStream.getAudioTracks().length > 0)
      } else {
        stopScreenShare()
      }
    } catch (error) {
      console.error('Error sharing screen:', error)
      if (error.name !== 'NotAllowedError') {
        alert('Error accessing screen share. Make sure to enable "Share system audio" when sharing.')
      }
    }
  }

  const stopScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        console.log(`Stopping screen ${track.kind} track`)
        track.stop()
      })
    }

    // Remove screen tracks from all peer connections
    for (const userId in peerConnectionsRef.current) {
      const peerConnection = peerConnectionsRef.current[userId]
      const senders = peerConnection.getSenders()
      
      for (const sender of senders) {
        if (sender.track && screenStreamRef.current?.getTracks().includes(sender.track)) {
          try {
            peerConnection.removeTrack(sender)
            console.log(`Removed screen ${sender.track.kind} track from ${userId}`)
          } catch (error) {
            console.error('Error removing screen track:', error)
          }
        }
      }
      
      // Renegotiate after removing tracks
      if (peerConnection.signalingState === 'stable') {
        try {
          const offer = await peerConnection.createOffer()
          await peerConnection.setLocalDescription(offer)
          socketRef.current.emit('send-offer', { to: userId, offer })
        } catch (error) {
          console.error('Error renegotiating after screen share stop:', error)
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