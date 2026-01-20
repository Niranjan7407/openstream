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
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const screenStreamRef = useRef(null)
  const localStreamRef = useRef(null)

  const ICE_SERVERS = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
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

    // Get user media
    const getMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        })
        setLocalStream(stream)
        localStreamRef.current = stream
      } catch (error) {
        console.error('Error accessing media:', error)
        alert('Please allow camera and microphone access')
      }
    }

    getMedia()

    socketRef.current.emit('join-room', { roomCode })

    socketRef.current.on('user-joined', async ({ userId }) => {
      if (localStreamRef.current) {
        await createPeerConnection(userId, true)
      }
    })

    socketRef.current.on('existing-users', async ({ users }) => {
      for (const userId of users) {
        if (localStreamRef.current) {
          await createPeerConnection(userId, false)
        }
      }
    })

    socketRef.current.on('receive-offer', async ({ from, offer }) => {
      try {
        if (!peerConnectionsRef.current[from]) {
          await createPeerConnection(from, false)
        }
        await peerConnectionsRef.current[from].setRemoteDescription(
          new RTCSessionDescription(offer)
        )
        const answer = await peerConnectionsRef.current[from].createAnswer()
        await peerConnectionsRef.current[from].setLocalDescription(answer)
        socketRef.current.emit('send-answer', { to: from, answer: answer })
      } catch (error) {
        console.error('Error handling offer:', error)
      }
    })

    socketRef.current.on('receive-answer', async ({ from, answer }) => {
      try {
        await peerConnectionsRef.current[from].setRemoteDescription(
          new RTCSessionDescription(answer)
        )
      } catch (error) {
        console.error('Error handling answer:', error)
      }
    })

    socketRef.current.on('receive-ice-candidate', async ({ from, candidate }) => {
      try {
        if (peerConnectionsRef.current[from]) {
          await peerConnectionsRef.current[from].addIceCandidate(
            new RTCIceCandidate(candidate)
          )
        }
      } catch (error) {
        console.error('Error adding ICE candidate:', error)
      }
    })

    socketRef.current.on('user-left', ({ userId }) => {
      if (peerConnectionsRef.current[userId]) {
        peerConnectionsRef.current[userId].close()
        delete peerConnectionsRef.current[userId]
      }
      if (peersRef.current[userId]) {
        delete peersRef.current[userId]
      }
      setPeers(Object.values(peersRef.current))
    })

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        pc.close()
      })
      socketRef.current.disconnect()
    }
  }, [roomCode])

  const createPeerConnection = async (userId, initiator) => {
    try {
      const peerConnection = new RTCPeerConnection(ICE_SERVERS)

      // Add local stream tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          peerConnection.addTrack(track, localStreamRef.current)
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

      // Handle remote stream
      peerConnection.ontrack = (event) => {
        peersRef.current[userId] = { stream: event.streams[0] }
        setPeers(Object.values(peersRef.current))
      }

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'failed') {
          peerConnection.close()
          delete peerConnectionsRef.current[userId]
          setPeers(Object.values(peersRef.current).filter((p) => p.stream))
        }
      }

      peerConnectionsRef.current[userId] = peerConnection

      if (initiator) {
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)
        socketRef.current.emit('send-offer', { to: userId, offer: offer })
      }
    } catch (error) {
      console.error('Error creating peer connection:', error)
    }
  }

  const toggleCamera = async () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsCameraOn(!isCameraOn)
      }
    }
  }

  const toggleMic = async () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMicOn(!isMicOn)
      }
    }
  }

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false,
        })
        screenStreamRef.current = screenStream
        const screenTrack = screenStream.getVideoTracks()[0]

        // Replace video track in all peer connections
        for (const userId in peerConnectionsRef.current) {
          const peerConnection = peerConnectionsRef.current[userId]
          const sender = peerConnection.getSenders().find((s) => s.track?.kind === 'video')
          if (sender) {
            await sender.replaceTrack(screenTrack)
          }
        }

        screenTrack.onended = () => {
          stopScreenShare()
        }

        setIsScreenSharing(true)
      } else {
        stopScreenShare()
      }
    } catch (error) {
      console.error('Error sharing screen:', error)
    }
  }

  const stopScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop())
    }

    // Switch back to camera
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      for (const userId in peerConnectionsRef.current) {
        const peerConnection = peerConnectionsRef.current[userId]
        const sender = peerConnection.getSenders().find((s) => s.track?.kind === 'video')
        if (sender) {
          await sender.replaceTrack(videoTrack)
        }
      }
    }

    setIsScreenSharing(false)
  }

  const handleLeave = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
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
      <div className="flex-1 p-4">
        <VideoGrid
          localStream={localStream}
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
