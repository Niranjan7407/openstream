import { useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import VideoGrid from '../components/VideoGrid'
import Controls from '../components/Controls'
import AudioManager from '../components/AudioManager'
import ChatPanel from '../components/ChatPanel'
import SettingsModal from '../components/SettingsModal'
import { API_URL } from '../config'
import {
  getHighQualityDisplayMedia,
  applySenderQuality,
  enhanceSdpForScreenAudio,
} from '../utils/webrtcUtils'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

export default function RoomPage({ roomCode, userName = 'You', onLeaveRoom }) {
  const socketRef = useRef(null)
  const peerConnectionsRef = useRef({}) // userId -> RTCPeerConnection
  const peersRef = useRef({}) // userId -> { userId, userName, stream, screenStream }
  const peerScreenSharesRef = useRef({}) // userId -> { isSharing, streamId, hasAudio, quality }
  const pendingCandidatesRef = useRef({}) // userId -> RTCIceCandidateInit[]

  const [peers, setPeers] = useState([])
  const [localStream, setLocalStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isMicOn, setIsMicOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [currentSocketId, setCurrentSocketId] = useState('')

  // Screen share toast / info
  const [screenAudioNotice, setScreenAudioNotice] = useState(null)

  // Quality and Audio Settings
  const [selectedQuality, setSelectedQuality] = useState('1080p60')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [audioProcessing, setAudioProcessing] = useState({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  })

  // Volumes
  const [peerVolumes, setPeerVolumes] = useState({}) // userId -> float (0 to 1)
  const [screenVolumes, setScreenVolumes] = useState({}) // userId -> float (0 to 1)

  // Chat
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  const localStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const selectedQualityRef = useRef(selectedQuality)

  useEffect(() => {
    selectedQualityRef.current = selectedQuality
  }, [selectedQuality])


  // Update React peers state from ref
  const updatePeersUI = useCallback(() => {
    const list = Object.values(peersRef.current).map((p) => ({
      userId: p.userId,
      userName: p.userName || `User-${p.userId.slice(0, 4)}`,
      stream: p.stream,
      screenStream: p.screenStream,
    }))
    setPeers([...list])
  }, [])

  // Drain pending ICE candidates once remote description is set
  const drainPendingCandidates = async (userId, pc) => {
    const queue = pendingCandidatesRef.current[userId] || []
    if (queue.length > 0) {
      console.log(`Draining ${queue.length} pending ICE candidates for ${userId}`)
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (e) {
          console.warn(`Error adding queued candidate for ${userId}:`, e)
        }
      }
      pendingCandidatesRef.current[userId] = []
    }
  }

  // Create WebRTC peer connection
  const createPeerConnection = useCallback(
    async (userId, initiator, peerUserName) => {
      try {
        if (peerConnectionsRef.current[userId]) {
          return peerConnectionsRef.current[userId]
        }

        console.log(`Creating RTCPeerConnection with ${userId} (initiator: ${initiator})`)
        const pc = new RTCPeerConnection(ICE_SERVERS)
        peerConnectionsRef.current[userId] = pc

        if (!peersRef.current[userId]) {
          peersRef.current[userId] = {
            userId,
            userName: peerUserName || `User-${userId.slice(0, 4)}`,
            stream: null,
            screenStream: null,
          }
        } else if (peerUserName) {
          peersRef.current[userId].userName = peerUserName
        }

        // Add local camera/mic stream tracks if available
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current)
          })
        }

        // Add screen share tracks if active
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((track) => {
            const sender = pc.addTrack(track, screenStreamRef.current)
            if (track.kind === 'video') {
              applySenderQuality(sender, selectedQualityRef.current)
            }
          })
        }

        // ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate && socketRef.current) {
            socketRef.current.emit('send-ice-candidate', {
              to: userId,
              candidate: event.candidate,
            })
          }
        }

        // ICE restart on failure
        pc.onconnectionstatechange = () => {
          console.log(`Connection state with ${userId}: ${pc.connectionState}`)
          if (pc.connectionState === 'failed') {
            console.log(`Restarting ICE with ${userId}...`)
            pc.restartIce()
          } else if (pc.connectionState === 'closed') {
            delete peerConnectionsRef.current[userId]
            delete peersRef.current[userId]
            delete pendingCandidatesRef.current[userId]
            updatePeersUI()
          }
        }

        // Handle receiving tracks
        pc.ontrack = (event) => {
          console.log(`ontrack from ${userId}: kind=${event.track.kind}, label="${event.track.label}"`)
          const remoteStream = event.streams[0]
          const shareInfo = peerScreenSharesRef.current[userId]

          // Distinguish screen track vs camera/mic track
          let isScreen = false
          if (shareInfo && shareInfo.isSharing) {
            if (remoteStream && shareInfo.streamId && remoteStream.id === shareInfo.streamId) {
              isScreen = true
            } else if (event.track.getSettings && event.track.getSettings().displaySurface !== undefined) {
              isScreen = true
            } else if (event.track.kind === 'video' && (!peersRef.current[userId].stream || peersRef.current[userId].screenStream)) {
              isScreen = true
            } else if (event.track.kind === 'audio' && shareInfo.hasAudio && peersRef.current[userId].screenStream) {
              isScreen = true
            }
          }

          // Fallback heuristic
          if (!isScreen && event.track.label) {
            const lbl = event.track.label.toLowerCase()
            if (lbl.includes('screen') || lbl.includes('display') || lbl.includes('window') || lbl.includes('monitor')) {
              isScreen = true
            }
          }

          if (!peersRef.current[userId]) {
            peersRef.current[userId] = {
              userId,
              userName: peerUserName || `User-${userId.slice(0, 4)}`,
              stream: null,
              screenStream: null,
            }
          }

          if (isScreen) {
            // Track belongs to Screen Share
            if (!peersRef.current[userId].screenStream) {
              peersRef.current[userId].screenStream = new MediaStream()
            }
            const scrStream = peersRef.current[userId].screenStream
            scrStream.getTracks().forEach((t) => {
              if (t.kind === event.track.kind) scrStream.removeTrack(t)
            })
            scrStream.addTrack(event.track)
            console.log(`Attached ${event.track.kind} track to screenStream for ${userId}`)
          } else {
            // Track belongs to Camera / Microphone
            if (!peersRef.current[userId].stream) {
              peersRef.current[userId].stream = new MediaStream()
            }
            const camStream = peersRef.current[userId].stream
            camStream.getTracks().forEach((t) => {
              if (t.kind === event.track.kind) camStream.removeTrack(t)
            })
            camStream.addTrack(event.track)
            console.log(`Attached ${event.track.kind} track to camera/mic stream for ${userId}`)
          }

          updatePeersUI()
        }

        // Initiator creates offer
        if (initiator) {
          try {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            })
            offer.sdp = enhanceSdpForScreenAudio(offer.sdp)
            await pc.setLocalDescription(offer)
            socketRef.current.emit('send-offer', { to: userId, offer })
            console.log(`Sent offer to ${userId}`)
          } catch (offerErr) {
            console.error(`Error creating offer for ${userId}:`, offerErr)
          }
        }

        return pc
      } catch (err) {
        console.error(`Error creating peer connection for ${userId}:`, err)
        return null
      }
    },
    [updatePeersUI]
  )

  // Socket & WebRTC setup
  useEffect(() => {
    const socket = io(API_URL, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      withCredentials: true,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id)
      setConnectionStatus('connected')
      setCurrentSocketId(socket.id)
      socket.emit('join-room', { roomCode, userName })
    })

    socket.on('disconnect', () => {
      console.log('Socket disconnected')
      setConnectionStatus('disconnected')
    })

    // Existing users in the room
    socket.on('existing-users', async ({ users, activeScreenShares }) => {
      console.log('Existing users received:', users)
      if (activeScreenShares && activeScreenShares.length > 0) {
        activeScreenShares.forEach((share) => {
          peerScreenSharesRef.current[share.userId] = share
        })
      }

      for (const user of users) {
        await createPeerConnection(user.userId, false, user.userName)
      }
      updatePeersUI()
    })

    // New user joined
    socket.on('user-joined', async ({ userId, userName: newUserName }) => {
      console.log(`New user joined: ${userId} (${newUserName})`)
      await createPeerConnection(userId, true, newUserName)
      updatePeersUI()
    })

    // Peer screen share status update
    socket.on('peer-screen-share-status', ({ userId, isSharing, streamId, hasAudio, quality }) => {
      console.log(`Screen share update from ${userId}: isSharing=${isSharing}, hasAudio=${hasAudio}`)
      peerScreenSharesRef.current[userId] = { isSharing, streamId, hasAudio, quality }

      if (!isSharing && peersRef.current[userId]?.screenStream) {
        peersRef.current[userId].screenStream = null
        updatePeersUI()
      }
    })

    // Receive Offer
    socket.on('receive-offer', async ({ from, offer }) => {
      console.log(`Received offer from ${from}`)
      try {
        let pc = peerConnectionsRef.current[from]
        if (!pc) {
          pc = await createPeerConnection(from, false)
        }

        if (pc) {
          if (pc.signalingState === 'stable' || pc.signalingState === 'have-remote-offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(offer))
            await drainPendingCandidates(from, pc)

            const answer = await pc.createAnswer()
            answer.sdp = enhanceSdpForScreenAudio(answer.sdp)
            await pc.setLocalDescription(answer)
            socket.emit('send-answer', { to: from, answer })
            console.log(`Sent answer to ${from}`)
          }
        }
      } catch (err) {
        console.error(`Error handling offer from ${from}:`, err)
      }
    })

    // Receive Answer
    socket.on('receive-answer', async ({ from, answer }) => {
      console.log(`Received answer from ${from}`)
      try {
        const pc = peerConnectionsRef.current[from]
        if (pc && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer))
          await drainPendingCandidates(from, pc)
          console.log(`Set remote description from answer for ${from}`)
        }
      } catch (err) {
        console.error(`Error handling answer from ${from}:`, err)
      }
    })

    // Receive ICE Candidate with Queueing
    socket.on('receive-ice-candidate', async ({ from, candidate }) => {
      try {
        const pc = peerConnectionsRef.current[from]
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } else {
          if (!pendingCandidatesRef.current[from]) {
            pendingCandidatesRef.current[from] = []
          }
          pendingCandidatesRef.current[from].push(candidate)
        }
      } catch (err) {
        console.error(`Error adding ICE candidate from ${from}:`, err)
      }
    })

    // In-Call Chat Message
    socket.on('chat-message', (chatMsg) => {
      setMessages((prev) => [...prev, chatMsg])
      setUnreadCount((prev) => prev + 1)
    })

    // User left
    socket.on('user-left', ({ userId }) => {
      console.log(`User left: ${userId}`)
      if (peerConnectionsRef.current[userId]) {
        peerConnectionsRef.current[userId].close()
        delete peerConnectionsRef.current[userId]
      }
      delete peersRef.current[userId]
      delete peerScreenSharesRef.current[userId]
      delete pendingCandidatesRef.current[userId]
      updatePeersUI()
    })

    const pcsToClean = peerConnectionsRef.current

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop())
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop())
      }
      Object.values(pcsToClean).forEach((pc) => pc.close())
      socket.disconnect()
    }
  }, [roomCode, userName, createPeerConnection, updatePeersUI])

  // Toggle Camera
  const toggleCamera = useCallback(async () => {
    try {
      if (!isCameraOn) {
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: isMicOn
              ? {
                  echoCancellation: audioProcessing.echoCancellation,
                  noiseSuppression: audioProcessing.noiseSuppression,
                  autoGainControl: audioProcessing.autoGainControl,
                }
              : false,
          })
          localStreamRef.current = stream
          setLocalStream(stream)

          for (const userId in peerConnectionsRef.current) {
            const pc = peerConnectionsRef.current[userId]
            stream.getTracks().forEach((t) => pc.addTrack(t, stream))
            if (pc.signalingState === 'stable') {
              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              socketRef.current.emit('send-offer', { to: userId, offer })
            }
          }
        } else {
          let videoTrack = localStreamRef.current.getVideoTracks()[0]
          if (!videoTrack) {
            const videoStream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
            })
            videoTrack = videoStream.getVideoTracks()[0]
            localStreamRef.current.addTrack(videoTrack)
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))

            for (const userId in peerConnectionsRef.current) {
              const pc = peerConnectionsRef.current[userId]
              pc.addTrack(videoTrack, localStreamRef.current)
              if (pc.signalingState === 'stable') {
                const offer = await pc.createOffer()
                await pc.setLocalDescription(offer)
                socketRef.current.emit('send-offer', { to: userId, offer })
              }
            }
          } else {
            videoTrack.enabled = true
          }
        }
        setIsCameraOn(true)
      } else {
        if (localStreamRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0]
          if (videoTrack) videoTrack.enabled = false
        }
        setIsCameraOn(false)
      }
    } catch (err) {
      console.error('Error toggling camera:', err)
      alert('Could not access camera. Please check device permissions.')
    }
  }, [isCameraOn, isMicOn, audioProcessing])

  // Toggle Microphone
  const toggleMic = useCallback(async () => {
    try {
      if (!isMicOn) {
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: isCameraOn,
            audio: {
              echoCancellation: audioProcessing.echoCancellation,
              noiseSuppression: audioProcessing.noiseSuppression,
              autoGainControl: audioProcessing.autoGainControl,
              sampleRate: 48000,
            },
          })
          localStreamRef.current = stream
          setLocalStream(stream)

          for (const userId in peerConnectionsRef.current) {
            const pc = peerConnectionsRef.current[userId]
            stream.getTracks().forEach((t) => pc.addTrack(t, stream))
            if (pc.signalingState === 'stable') {
              const offer = await pc.createOffer()
              await pc.setLocalDescription(offer)
              socketRef.current.emit('send-offer', { to: userId, offer })
            }
          }
        } else {
          let audioTrack = localStreamRef.current.getAudioTracks()[0]
          if (!audioTrack) {
            const audioStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: audioProcessing.echoCancellation,
                noiseSuppression: audioProcessing.noiseSuppression,
                autoGainControl: audioProcessing.autoGainControl,
                sampleRate: 48000,
              },
            })
            audioTrack = audioStream.getAudioTracks()[0]
            localStreamRef.current.addTrack(audioTrack)
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))

            for (const userId in peerConnectionsRef.current) {
              const pc = peerConnectionsRef.current[userId]
              pc.addTrack(audioTrack, localStreamRef.current)
              if (pc.signalingState === 'stable') {
                const offer = await pc.createOffer()
                await pc.setLocalDescription(offer)
                socketRef.current.emit('send-offer', { to: userId, offer })
              }
            }
          } else {
            audioTrack.enabled = true
          }
        }
        setIsMicOn(true)
      } else {
        if (localStreamRef.current) {
          const audioTrack = localStreamRef.current.getAudioTracks()[0]
          if (audioTrack) audioTrack.enabled = false
        }
        setIsMicOn(false)
      }
    } catch (err) {
      console.error('Error toggling microphone:', err)
      alert('Could not access microphone. Please check device permissions.')
    }
  }, [isMicOn, isCameraOn, audioProcessing])

  // Stop Screen Share
  const stopScreenShare = useCallback(async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
    }

    if (socketRef.current) {
      socketRef.current.emit('screen-share-status', {
        roomCode,
        isSharing: false,
      })
    }

    for (const userId in peerConnectionsRef.current) {
      const pc = peerConnectionsRef.current[userId]
      const senders = pc.getSenders()
      for (const sender of senders) {
        if (sender.track && screenStreamRef.current?.getTracks().includes(sender.track)) {
          try {
            pc.removeTrack(sender)
          } catch (e) {
            console.error('Error removing screen track:', e)
          }
        }
      }

      if (pc.signalingState === 'stable') {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          socketRef.current.emit('send-offer', { to: userId, offer })
        } catch (e) {
          console.warn('Error renegotiating after stopping screen share:', e)
        }
      }
    }

    screenStreamRef.current = null
    setScreenStream(null)
    setIsScreenSharing(false)
  }, [roomCode])

  // Toggle Screen Share in 1080p 60fps with System Audio
  const toggleScreenShare = useCallback(async () => {
    try {
      if (!isScreenSharing) {
        const displayStream = await getHighQualityDisplayMedia(selectedQuality)
        screenStreamRef.current = displayStream
        setScreenStream(displayStream)

        const hasAudio = displayStream.getAudioTracks().length > 0
        console.log(`Started screen share. Quality: ${selectedQuality}. Audio captured: ${hasAudio}`)

        if (hasAudio) {
          setScreenAudioNotice({
            type: 'success',
            text: 'Screen sharing with 1080p 60fps and system/tab audio enabled!',
          })
        } else {
          setScreenAudioNotice({
            type: 'info',
            text: 'Screen sharing without audio. Check "Share system audio" in the share prompt if you want friends to hear your game or music!',
          })
        }
        setTimeout(() => setScreenAudioNotice(null), 6000)

        socketRef.current.emit('screen-share-status', {
          roomCode,
          isSharing: true,
          streamId: displayStream.id,
          hasAudio,
          quality: selectedQuality,
        })

        for (const userId in peerConnectionsRef.current) {
          const pc = peerConnectionsRef.current[userId]
          displayStream.getTracks().forEach((track) => {
            const sender = pc.addTrack(track, displayStream)
            if (track.kind === 'video') {
              applySenderQuality(sender, selectedQuality)
            }
          })

          if (pc.signalingState === 'stable') {
            const offer = await pc.createOffer()
            offer.sdp = enhanceSdpForScreenAudio(offer.sdp)
            await pc.setLocalDescription(offer)
            socketRef.current.emit('send-offer', { to: userId, offer })
          }
        }

        displayStream.getVideoTracks()[0].onended = () => {
          stopScreenShare()
        }

        setIsScreenSharing(true)
      } else {
        stopScreenShare()
      }
    } catch (err) {
      console.error('Error sharing screen:', err)
      if (err.name !== 'NotAllowedError') {
        alert('Could not start screen sharing. Please check permissions.')
      }
    }
  }, [isScreenSharing, selectedQuality, roomCode, stopScreenShare])

  // Send In-Call Chat Message
  const handleSendMessage = (text) => {
    if (!socketRef.current || !text) return
    socketRef.current.emit('send-chat-message', { roomCode, message: text })
  }

  // Handle Leave
  const handleLeave = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
    }
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close())
    socketRef.current.emit('leave-room', { roomCode })
    socketRef.current.disconnect()
    onLeaveRoom()
  }

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return

      const key = e.key.toLowerCase()
      if (key === 'm') {
        e.preventDefault()
        toggleMic()
      } else if (key === 'v') {
        e.preventDefault()
        toggleCamera()
      } else if (key === 's') {
        e.preventDefault()
        toggleScreenShare()
      } else if (key === 'c') {
        e.preventDefault()
        setIsChatOpen((prev) => {
          if (!prev) setUnreadCount(0)
          return !prev
        })
      } else if (key === 'f') {
        e.preventDefault()
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(console.warn)
        } else {
          document.documentElement.requestFullscreen().catch(console.warn)
        }
      } else if (e.key === 'Escape') {
        if (isSettingsOpen) setIsSettingsOpen(false)
        if (isChatOpen) setIsChatOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleMic, toggleCamera, toggleScreenShare, isSettingsOpen, isChatOpen])

  return (
    <div className="h-screen w-screen bg-gray-950 flex flex-col overflow-hidden text-gray-100 font-sans">
      {/* Top Notification / Audio Banner */}
      {screenAudioNotice && (
        <div
          className={`absolute top-4 left-1/2 transform -translate-x-1/2 z-40 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-2xl transition-all border ${
            screenAudioNotice.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700'
              : 'bg-blue-950/90 text-blue-300 border-blue-700'
          }`}
        >
          {screenAudioNotice.text}
        </div>
      )}

      {/* Global continuous audio player for all peers & screens */}
      <AudioManager
        peers={peers}
        peerVolumes={peerVolumes}
        screenVolumes={screenVolumes}
      />

      {/* Connection Status Pill (Top Right) */}
      <div
        className={`absolute top-3 right-3 z-30 px-2.5 py-1 rounded-full text-xs font-bold shadow flex items-center gap-1.5 backdrop-blur-md ${
          connectionStatus === 'connected'
            ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-600/40'
            : connectionStatus === 'connecting'
            ? 'bg-amber-900/80 text-amber-300 border border-amber-600/40 animate-pulse'
            : 'bg-red-900/80 text-red-300 border border-red-600/40'
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            connectionStatus === 'connected'
              ? 'bg-emerald-400'
              : connectionStatus === 'connecting'
              ? 'bg-amber-400'
              : 'bg-red-400'
          }`}
        />
        <span>{connectionStatus === 'connected' ? 'Connected' : connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}</span>
      </div>

      {/* Main Workspace (Stage/Grid + Chat Drawer) */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 h-full overflow-hidden">
          <VideoGrid
            localStream={localStream}
            screenStream={screenStream}
            peers={peers}
            currentUserName={userName}
            peerVolumes={peerVolumes}
            screenVolumes={screenVolumes}
            onPeerVolumeChange={(uid, vol) => setPeerVolumes((prev) => ({ ...prev, [uid]: vol }))}
            onScreenVolumeChange={(uid, vol) => setScreenVolumes((prev) => ({ ...prev, [uid]: vol }))}
            selectedQuality={selectedQuality}
          />
        </div>

        {/* Slide-out In-Call Chat Drawer */}
        <ChatPanel
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={messages}
          onSendMessage={handleSendMessage}
          currentUserId={currentSocketId}
        />
      </div>

      {/* Controls Bar */}
      <Controls
        roomCode={roomCode}
        isCameraOn={isCameraOn}
        isMicOn={isMicOn}
        isScreenSharing={isScreenSharing}
        onToggleCamera={toggleCamera}
        onToggleMic={toggleMic}
        onToggleScreenShare={toggleScreenShare}
        onLeave={handleLeave}
        onToggleChat={() => {
          setIsChatOpen((prev) => {
            if (!prev) setUnreadCount(0)
            return !prev
          })
        }}
        isChatOpen={isChatOpen}
        unreadCount={unreadCount}
        onOpenSettings={() => setIsSettingsOpen(true)}
        selectedQuality={selectedQuality}
      />

      {/* Settings & Quality Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        selectedQuality={selectedQuality}
        onQualityChange={setSelectedQuality}
        audioProcessing={audioProcessing}
        onAudioProcessingChange={(field, val) =>
          setAudioProcessing((prev) => ({ ...prev, [field]: val }))
        }
      />
    </div>
  )
}
