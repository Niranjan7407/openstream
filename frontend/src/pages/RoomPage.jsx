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
  captureAudioDeviceStream,
  applySenderQuality,
  lockSdpHighBitrate,
  FAST_ICE_SERVERS,
  getIceServersConfiguration,
} from '../utils/webrtcUtils'

export default function RoomPage({ roomCode, userName = 'You', onLeaveRoom }) {
  const socketRef = useRef(null)
  const peerConnectionsRef = useRef({}) // userId -> RTCPeerConnection
  const peersRef = useRef({}) // userId -> { userId, userName, stream, screenStream }
  const peerScreenSharesRef = useRef({}) // userId -> { isSharing, streamId, hasAudio, quality, audioTrackId }
  const pendingCandidatesRef = useRef({}) // userId -> RTCIceCandidateInit[]

  // Perfect Negotiation tracking
  const makingOfferRef = useRef({}) // userId -> boolean
  const ignoreOfferRef = useRef({}) // userId -> boolean

  const [peers, setPeers] = useState([])
  const [localStream, setLocalStream] = useState(null)
  const [screenStream, setScreenStream] = useState(null)
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isMicOn, setIsMicOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isScreenAudioMuted, setIsScreenAudioMuted] = useState(false)
  const [micGain, setMicGain] = useState(1.0)
  const [screenAudioGain, setScreenAudioGain] = useState(1.0)
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [currentSocketId, setCurrentSocketId] = useState('')

  // Screen share toast / info
  const [screenAudioNotice, setScreenAudioNotice] = useState(null)
  const isInsecureContext = typeof window !== 'undefined' && window.isSecureContext === false

  // Quality, Desktop Audio & Voice Settings with LocalStorage persistence
  const [selectedQuality, setSelectedQuality] = useState('1080p60')
  const [screenAudioDevice, setScreenAudioDevice] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const [audioProcessing, setAudioProcessing] = useState(() => {
    try {
      const saved = localStorage.getItem('openstream_audio_processing')
      if (saved) return JSON.parse(saved)
    } catch (e) {
      console.warn('Failed to parse saved audio processing settings:', e)
    }
    return {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    }
  })

  const [selectedAudioInput, setSelectedAudioInput] = useState(() => {
    return localStorage.getItem('openstream_audio_device') || ''
  })
  const [selectedVideoInput, setSelectedVideoInput] = useState(() => {
    return localStorage.getItem('openstream_video_device') || ''
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
  const screenAudioDeviceRef = useRef(screenAudioDevice)
  const audioProcessingRef = useRef(audioProcessing)
  const selectedAudioInputRef = useRef(selectedAudioInput)
  const selectedVideoInputRef = useRef(selectedVideoInput)
  const iceServersRef = useRef(FAST_ICE_SERVERS)

  useEffect(() => {
    // Dynamically query ICE / TURN relays from backend if reachable
    fetch(`${API_URL}/api/ice-servers`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          iceServersRef.current = getIceServersConfiguration(data.iceServers)
          console.log(`Discovered ${data.iceServers.length} ICE / TURN relay servers from backend`)
        }
      })
      .catch((e) => {
        console.debug('Using built-in STUN & TURN servers:', e)
      })
  }, [])

  useEffect(() => {
    selectedQualityRef.current = selectedQuality
  }, [selectedQuality])

  useEffect(() => {
    screenAudioDeviceRef.current = screenAudioDevice
  }, [screenAudioDevice])

  useEffect(() => {
    audioProcessingRef.current = audioProcessing
    try {
      localStorage.setItem('openstream_audio_processing', JSON.stringify(audioProcessing))
    } catch (e) {
      console.warn('Failed to save audio processing settings:', e)
    }
  }, [audioProcessing])

  useEffect(() => {
    selectedAudioInputRef.current = selectedAudioInput
    if (selectedAudioInput) {
      localStorage.setItem('openstream_audio_device', selectedAudioInput)
    }
  }, [selectedAudioInput])

  useEffect(() => {
    selectedVideoInputRef.current = selectedVideoInput
    if (selectedVideoInput) {
      localStorage.setItem('openstream_video_device', selectedVideoInput)
    }
  }, [selectedVideoInput])

  // Update React peers state from ref with clone so React always re-renders
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
    pendingCandidatesRef.current[userId] = []
    if (queue.length > 0) {
      console.log(`Draining ${queue.length} pending ICE candidates for ${userId}`)
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (e) {
          console.warn(`Error adding queued candidate for ${userId}:`, e)
        }
      }
    }
  }

  // Renegotiate a specific peer safely with Perfect Negotiation
  const renegotiatePeer = useCallback(async (userId) => {
    const pc = peerConnectionsRef.current[userId]
    if (!pc) return

    try {
      makingOfferRef.current[userId] = true
      const offer = await pc.createOffer()
      if (pc.signalingState !== 'stable') return

      offer.sdp = lockSdpHighBitrate(offer.sdp, 8000)
      await pc.setLocalDescription(offer)
      if (socketRef.current) {
        socketRef.current.emit('send-offer', { to: userId, offer: pc.localDescription })
      }
    } catch (err) {
      console.error(`Error in renegotiatePeer for ${userId}:`, err)
    } finally {
      makingOfferRef.current[userId] = false
    }
  }, [])

  // Renegotiate all connected peers
  const renegotiateAllPeers = useCallback(async () => {
    for (const userId in peerConnectionsRef.current) {
      await renegotiatePeer(userId)
    }
  }, [renegotiatePeer])

  // Create WebRTC peer connection
  const createPeerConnection = useCallback(
    async (userId, initiator, peerUserName) => {
      try {
        if (peerConnectionsRef.current[userId]) {
          return peerConnectionsRef.current[userId]
        }

        console.log(`Creating RTCPeerConnection with ${userId} (initiator: ${initiator})`)
        const pc = new RTCPeerConnection(iceServersRef.current)
        peerConnectionsRef.current[userId] = pc
        makingOfferRef.current[userId] = false
        ignoreOfferRef.current[userId] = false

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

        // Send ICE candidates to remote peer
        pc.onicecandidate = (event) => {
          if (event.candidate && socketRef.current) {
            socketRef.current.emit('send-ice-candidate', {
              to: userId,
              candidate: event.candidate,
            })
          }
        }

        // Connection state monitoring
        pc.onconnectionstatechange = () => {
          console.log(`Connection state with ${userId}: ${pc.connectionState}`)
          if (pc.connectionState === 'failed') {
            console.log(`Restarting ICE on connection failure with ${userId}...`)
            try {
              pc.restartIce()
              renegotiatePeer(userId)
            } catch (err) {
              console.error(`Error restarting ICE on connection state failure for ${userId}:`, err)
            }
          } else if (pc.connectionState === 'closed') {
            delete peerConnectionsRef.current[userId]
            delete peersRef.current[userId]
            delete pendingCandidatesRef.current[userId]
            delete makingOfferRef.current[userId]
            delete ignoreOfferRef.current[userId]
            updatePeersUI()
          }
        }

        // ICE Connection state monitoring (recovers from NAT/Firewall drops across different networks)
        pc.oniceconnectionstatechange = () => {
          console.log(`ICE connection state with ${userId}: ${pc.iceConnectionState}`)
          if (pc.iceConnectionState === 'failed') {
            console.warn(`ICE failed with ${userId}, attempting restartIce()...`)
            try {
              pc.restartIce()
              renegotiatePeer(userId)
            } catch (err) {
              console.error(`Error restarting ICE for ${userId}:`, err)
            }
          }
        }

        // Handle receiving tracks
        pc.ontrack = (event) => {
          console.log(`ontrack from ${userId}: kind=${event.track.kind}, label="${event.track.label}"`)
          const remoteStream = event.streams[0]
          const shareInfo = peerScreenSharesRef.current[userId]

          // Detect screen share track accurately
          let isScreen = false
          if (shareInfo && shareInfo.isSharing) {
            if (remoteStream && shareInfo.streamId && remoteStream.id === shareInfo.streamId) {
              isScreen = true
            } else if (shareInfo.audioTrackId && shareInfo.audioTrackId === event.track.id) {
              isScreen = true
            } else if (
              event.track.kind === 'video' &&
              (!peersRef.current[userId]?.stream?.getVideoTracks().length || peersRef.current[userId]?.screenStream)
            ) {
              isScreen = true
            } else if (
              event.track.kind === 'audio' &&
              shareInfo.hasAudio &&
              (!peersRef.current[userId]?.stream || remoteStream?.id !== peersRef.current[userId]?.stream?.id)
            ) {
              isScreen = true
            }
          }

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
            // Track belongs to Screen Share: Create new MediaStream reference so React state detects update
            const currentTracks = peersRef.current[userId].screenStream
              ? peersRef.current[userId].screenStream.getTracks().filter((t) => t.kind !== event.track.kind)
              : []
            peersRef.current[userId].screenStream = new MediaStream([...currentTracks, event.track])
            console.log(`Attached ${event.track.kind} track to screenStream for ${userId}`)
          } else {
            // Track belongs to Camera / Microphone: Create new MediaStream reference so React state detects update
            const currentTracks = peersRef.current[userId].stream
              ? peersRef.current[userId].stream.getTracks().filter((t) => t.kind !== event.track.kind)
              : []
            peersRef.current[userId].stream = new MediaStream([...currentTracks, event.track])
            console.log(`Attached ${event.track.kind} track to camera/mic stream for ${userId}`)
          }

          updatePeersUI()
        }

        // Initiator creates initial offer
        if (initiator) {
          try {
            makingOfferRef.current[userId] = true
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true,
            })
            offer.sdp = lockSdpHighBitrate(offer.sdp, 8000)
            await pc.setLocalDescription(offer)
            socketRef.current.emit('send-offer', { to: userId, offer: pc.localDescription })
            console.log(`Sent initial offer to ${userId}`)
          } catch (offerErr) {
            console.error(`Error creating initial offer for ${userId}:`, offerErr)
          } finally {
            makingOfferRef.current[userId] = false
          }
        }

        return pc
      } catch (err) {
        console.error(`Error creating peer connection for ${userId}:`, err)
        return null
      }
    },
    [updatePeersUI, renegotiatePeer]
  )

  // Socket & WebRTC setup
  useEffect(() => {
    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
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
    socket.on('peer-screen-share-status', ({ userId, isSharing, streamId, hasAudio, quality, audioTrackId }) => {
      console.log(`Screen share update from ${userId}: isSharing=${isSharing}, hasAudio=${hasAudio}`)
      peerScreenSharesRef.current[userId] = { isSharing, streamId, hasAudio, quality, audioTrackId }

      if (!isSharing && peersRef.current[userId]?.screenStream) {
        peersRef.current[userId].screenStream = null
        updatePeersUI()
      }
    })

    // Receive Offer with Perfect Negotiation (Glare / Collision Handled)
    socket.on('receive-offer', async ({ from, offer }) => {
      console.log(`Received offer from ${from}`)
      try {
        let pc = peerConnectionsRef.current[from]
        if (!pc) {
          pc = await createPeerConnection(from, false)
        }
        if (!pc) return

        // Tie-breaker: Deterministic comparison of socket IDs
        const polite = socket.id.localeCompare(from) > 0
        const isMakingOffer = makingOfferRef.current[from]
        const offerCollision = offer.type === 'offer' && (isMakingOffer || pc.signalingState !== 'stable')

        ignoreOfferRef.current[from] = !polite && offerCollision
        if (ignoreOfferRef.current[from]) {
          console.log(`Ignoring offer collision from ${from} (impolite)`)
          return
        }

        if (offerCollision) {
          console.log(`Rolling back local offer for ${from} (polite)`)
          await pc.setLocalDescription({ type: 'rollback' })
        }

        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        await drainPendingCandidates(from, pc)

        const answer = await pc.createAnswer()
        answer.sdp = lockSdpHighBitrate(answer.sdp, 8000)
        await pc.setLocalDescription(answer)
        socket.emit('send-answer', { to: from, answer: pc.localDescription })
        console.log(`Sent answer to ${from}`)
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
        if (!ignoreOfferRef.current[from]) {
          console.warn(`Error adding ICE candidate from ${from}:`, err)
        }
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
      delete makingOfferRef.current[userId]
      delete ignoreOfferRef.current[userId]
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

  // Helper: Build microphone constraints with noise cancellation
  const getMicConstraints = useCallback(
    (processing, deviceId) => ({
      audio: {
        echoCancellation: processing.echoCancellation ?? true,
        noiseSuppression: processing.noiseSuppression ?? true,
        autoGainControl: processing.autoGainControl ?? true,
        sampleRate: 48000,
        channelCount: 1, // Standard mono voice capture ensures optimal hardware & browser noise cancellation
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    }),
    []
  )

  // Live update of noise suppression and audio constraints
  const handleAudioProcessingChange = useCallback(
    async (field, val) => {
      const updated = { ...audioProcessingRef.current, [field]: val }
      setAudioProcessing(updated)

      // If mic is live, dynamically apply new constraints to live track
      if (localStreamRef.current && isMicOn) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0]
        if (audioTrack) {
          try {
            await audioTrack.applyConstraints({
              echoCancellation: updated.echoCancellation ?? true,
              noiseSuppression: updated.noiseSuppression ?? true,
              autoGainControl: updated.autoGainControl ?? true,
            })
            console.log(`Applied updated audio processing constraint: ${field}=${val}`)
          } catch (e) {
            console.warn('Could not apply audio constraints dynamically, recreating track:', e)
            try {
              const newStream = await navigator.mediaDevices.getUserMedia(
                getMicConstraints(updated, selectedAudioInputRef.current)
              )
              const newTrack = newStream.getAudioTracks()[0]
              if (newTrack) {
                audioTrack.stop()
                localStreamRef.current.removeTrack(audioTrack)
                localStreamRef.current.addTrack(newTrack)

                // Replace track on all peer senders without renegotiation
                for (const uid in peerConnectionsRef.current) {
                  const pc = peerConnectionsRef.current[uid]
                  const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio')
                  if (sender) {
                    await sender.replaceTrack(newTrack)
                  }
                }
                setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
              }
            } catch (recreateErr) {
              console.error('Error recreating audio track:', recreateErr)
            }
          }
        }
      }
    },
    [isMicOn, getMicConstraints]
  )

  // Switch microphone input device
  const handleAudioInputChange = useCallback(
    async (deviceId) => {
      setSelectedAudioInput(deviceId)

      if (localStreamRef.current && isMicOn) {
        const audioTrack = localStreamRef.current.getAudioTracks()[0]
        try {
          const newStream = await navigator.mediaDevices.getUserMedia(
            getMicConstraints(audioProcessingRef.current, deviceId)
          )
          const newTrack = newStream.getAudioTracks()[0]
          if (newTrack) {
            if (audioTrack) {
              audioTrack.stop()
              localStreamRef.current.removeTrack(audioTrack)
            }
            localStreamRef.current.addTrack(newTrack)

            for (const uid in peerConnectionsRef.current) {
              const pc = peerConnectionsRef.current[uid]
              const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio')
              if (sender) {
                await sender.replaceTrack(newTrack)
              }
            }
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
          }
        } catch (err) {
          console.error('Error switching audio input device:', err)
        }
      }
    },
    [isMicOn, getMicConstraints]
  )

  // Switch camera video device
  const handleVideoInputChange = useCallback(
    async (deviceId) => {
      setSelectedVideoInput(deviceId)

      if (localStreamRef.current && isCameraOn) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0]
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 60 },
              ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            },
          })
          const newTrack = newStream.getVideoTracks()[0]
          if (newTrack) {
            if (videoTrack) {
              videoTrack.stop()
              localStreamRef.current.removeTrack(videoTrack)
            }
            localStreamRef.current.addTrack(newTrack)

            for (const uid in peerConnectionsRef.current) {
              const pc = peerConnectionsRef.current[uid]
              const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video')
              if (sender) {
                await sender.replaceTrack(newTrack)
              }
            }
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
          }
        } catch (err) {
          console.error('Error switching video camera device:', err)
        }
      }
    },
    [isCameraOn]
  )

  // Toggle Camera
  const toggleCamera = useCallback(async () => {
    try {
      if (!isCameraOn) {
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30, max: 60 },
              ...(selectedVideoInputRef.current ? { deviceId: { exact: selectedVideoInputRef.current } } : {}),
            },
            audio: isMicOn ? getMicConstraints(audioProcessingRef.current, selectedAudioInputRef.current).audio : false,
          })
          localStreamRef.current = stream
          setLocalStream(new MediaStream(stream.getTracks()))

          for (const userId in peerConnectionsRef.current) {
            const pc = peerConnectionsRef.current[userId]
            stream.getTracks().forEach((t) => pc.addTrack(t, stream))
          }
          await renegotiateAllPeers()
        } else {
          let videoTrack = localStreamRef.current.getVideoTracks()[0]
          if (!videoTrack) {
            const videoStream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30, max: 60 },
                ...(selectedVideoInputRef.current ? { deviceId: { exact: selectedVideoInputRef.current } } : {}),
              },
            })
            videoTrack = videoStream.getVideoTracks()[0]
            localStreamRef.current.addTrack(videoTrack)
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))

            for (const userId in peerConnectionsRef.current) {
              const pc = peerConnectionsRef.current[userId]
              pc.addTrack(videoTrack, localStreamRef.current)
            }
            await renegotiateAllPeers()
          } else {
            videoTrack.enabled = true
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
          }
        }
        setIsCameraOn(true)
      } else {
        if (localStreamRef.current) {
          const videoTrack = localStreamRef.current.getVideoTracks()[0]
          if (videoTrack) {
            videoTrack.enabled = false
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
          }
        }
        setIsCameraOn(false)
      }
    } catch (err) {
      console.error('Error toggling camera:', err)
      alert('Could not access camera. Please check device permissions.')
    }
  }, [isCameraOn, isMicOn, getMicConstraints, renegotiateAllPeers])

  // Toggle Microphone
  const toggleMic = useCallback(async () => {
    try {
      if (!isMicOn) {
        if (!localStreamRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: isCameraOn
              ? {
                  width: { ideal: 1920 },
                  height: { ideal: 1080 },
                  ...(selectedVideoInputRef.current ? { deviceId: { exact: selectedVideoInputRef.current } } : {}),
                }
              : false,
            audio: getMicConstraints(audioProcessingRef.current, selectedAudioInputRef.current).audio,
          })
          localStreamRef.current = stream
          setLocalStream(new MediaStream(stream.getTracks()))

          for (const userId in peerConnectionsRef.current) {
            const pc = peerConnectionsRef.current[userId]
            stream.getTracks().forEach((t) => pc.addTrack(t, stream))
          }
          await renegotiateAllPeers()
        } else {
          let audioTrack = localStreamRef.current.getAudioTracks()[0]
          if (!audioTrack) {
            const audioStream = await navigator.mediaDevices.getUserMedia(
              getMicConstraints(audioProcessingRef.current, selectedAudioInputRef.current)
            )
            audioTrack = audioStream.getAudioTracks()[0]
            localStreamRef.current.addTrack(audioTrack)
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))

            for (const userId in peerConnectionsRef.current) {
              const pc = peerConnectionsRef.current[userId]
              pc.addTrack(audioTrack, localStreamRef.current)
            }
            await renegotiateAllPeers()
          } else {
            audioTrack.enabled = true
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
          }
        }
        setIsMicOn(true)
      } else {
        if (localStreamRef.current) {
          const audioTrack = localStreamRef.current.getAudioTracks()[0]
          if (audioTrack) {
            audioTrack.enabled = false
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
          }
        }
        setIsMicOn(false)
      }
    } catch (err) {
      console.error('Error toggling microphone:', err)
      alert('Could not access microphone. Please check device permissions.')
    }
  }, [isMicOn, isCameraOn, getMicConstraints, renegotiateAllPeers])

  // Stop Screen Share
  const stopScreenShare = useCallback(async () => {
    const stream = screenStreamRef.current
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
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
        if (sender.track && stream?.getTracks().includes(sender.track)) {
          try {
            pc.removeTrack(sender)
          } catch (e) {
            console.error('Error removing screen track:', e)
          }
        }
      }
    }

    screenStreamRef.current = null
    setScreenStream(null)
    setIsScreenSharing(false)
    await renegotiateAllPeers()
  }, [roomCode, renegotiateAllPeers])

  // Toggle Screen Audio Mute
  const toggleScreenAudioMute = useCallback(() => {
    setIsScreenAudioMuted((prev) => {
      const next = !prev
      if (screenStreamRef.current) {
        const aTrack = screenStreamRef.current.getAudioTracks()[0]
        if (aTrack) {
          aTrack.enabled = !next
        }
      }
      return next
    })
  }, [])

  // Toggle Screen Share in 1080p 60fps with Desktop / Entire Screen Audio
  const toggleScreenShare = useCallback(async () => {
    try {
      if (!isScreenSharing) {
        const displayStream = await getHighQualityDisplayMedia(selectedQuality)

        // Check if browser captured an audio track
        let hasAudio = displayStream.getAudioTracks().length > 0
        let audioTrack = displayStream.getAudioTracks()[0]

        // Secondary loopback desktop audio device fallback (for Windows / Linux loopback)
        if (!hasAudio && screenAudioDeviceRef.current) {
          try {
            const secondaryStream = await captureAudioDeviceStream(screenAudioDeviceRef.current)
            const secAudioTrack = secondaryStream.getAudioTracks()[0]
            if (secAudioTrack) {
              displayStream.addTrack(secAudioTrack)
              hasAudio = true
              audioTrack = secAudioTrack
              console.log('Attached desktop/game audio device to screen share')
            }
          } catch (audioErr) {
            console.warn('Could not attach desktop audio device:', audioErr)
          }
        }

        if (hasAudio && audioTrack) {
          audioTrack.enabled = !isScreenAudioMuted
        }

        screenStreamRef.current = displayStream
        setScreenStream(displayStream)

        console.log(`Started screen share. Quality: ${selectedQuality}. Audio: ${hasAudio}`)

        if (hasAudio) {
          setScreenAudioNotice({
            type: 'success',
            text: 'Screen sharing with 1080p 60fps & game/system audio active! (Zero echo)',
          })
        } else {
          setScreenAudioNotice({
            type: 'info',
            text: 'Screen sharing video only. (To include game sound, tick "Also share system audio" in share dialog).',
          })
        }
        setTimeout(() => setScreenAudioNotice(null), 7000)

        // Broadcast screen share status
        if (socketRef.current) {
          socketRef.current.emit('screen-share-status', {
            roomCode,
            isSharing: true,
            streamId: displayStream.id,
            hasAudio,
            quality: selectedQuality,
            audioTrackId: audioTrack?.id,
          })
        }

        // Add tracks to peers
        for (const userId in peerConnectionsRef.current) {
          const pc = peerConnectionsRef.current[userId]
          displayStream.getTracks().forEach((track) => {
            const sender = pc.addTrack(track, displayStream)
            if (track.kind === 'video') {
              applySenderQuality(sender, selectedQuality)
            }
          })
        }

        await renegotiateAllPeers()

        // Handle native browser "Stop sharing" button
        displayStream.getVideoTracks()[0].onended = () => {
          stopScreenShare()
        }

        setIsScreenSharing(true)
      } else {
        await stopScreenShare()
      }
    } catch (err) {
      console.error('Error sharing screen:', err)
      if (err.name !== 'NotAllowedError') {
        alert('Could not start screen sharing. Please check permissions.')
      }
    }
  }, [isScreenSharing, selectedQuality, roomCode, stopScreenShare, renegotiateAllPeers, isScreenAudioMuted])

  // Send In-Call Chat Message
  const handleSendMessage = (text) => {
    if (!socketRef.current || !text) return
    socketRef.current.emit('send-chat-message', { roomCode, message: text })
  }

  // Handle Leave Room
  const handleLeave = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop())
    }
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close())
    if (socketRef.current) {
      socketRef.current.emit('leave-room', { roomCode })
      socketRef.current.disconnect()
    }
    onLeaveRoom()
  }

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return

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
      {/* Insecure Context Warning */}
      {isInsecureContext && (
        <div className="bg-amber-950/90 border-b border-amber-600/50 px-4 py-2 text-xs text-amber-200 flex items-center justify-between z-50">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider bg-amber-600/30 px-1.5 py-0.5 rounded text-[10px]">
              Insecure HTTP
            </span>
            <span>
              Browsers disable Camera, Mic, and Screen Sharing over non-localhost HTTP. Access via <strong>HTTPS or localhost</strong>.
            </span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="underline hover:text-white text-[11px] ml-2 shrink-0 font-medium"
          >
            Connection Settings
          </button>
        </div>
      )}

      {/* Top Notification / Audio Banner */}
      {screenAudioNotice && (
        <div
          className={`absolute top-3 left-1/2 transform -translate-x-1/2 z-40 max-w-md mx-4 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold shadow-2xl transition-all border ${
            screenAudioNotice.type === 'success'
              ? 'bg-emerald-950/95 text-emerald-300 border-emerald-700'
              : 'bg-blue-950/95 text-blue-300 border-blue-700'
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
        className={`absolute top-2.5 right-2.5 z-30 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold shadow flex items-center gap-1.5 backdrop-blur-md ${
          connectionStatus === 'connected'
            ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-600/40'
            : connectionStatus === 'connecting'
            ? 'bg-amber-900/80 text-amber-300 border border-amber-600/40 animate-pulse'
            : 'bg-red-900/80 text-red-300 border border-red-600/40'
        }`}
      >
        <span
          className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
            connectionStatus === 'connected'
              ? 'bg-emerald-400'
              : connectionStatus === 'connecting'
              ? 'bg-amber-400'
              : 'bg-red-400'
          }`}
        />
        <span>
          {connectionStatus === 'connected'
            ? 'Connected'
            : connectionStatus === 'connecting'
            ? 'Connecting...'
            : 'Disconnected'}
        </span>
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
        hasScreenAudio={Boolean(screenStream && screenStream.getAudioTracks().length > 0)}
        isScreenAudioMuted={isScreenAudioMuted}
        onToggleCamera={toggleCamera}
        onToggleMic={toggleMic}
        onToggleScreenShare={toggleScreenShare}
        onToggleScreenAudioMute={toggleScreenAudioMute}
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
        isNoiseSuppressed={audioProcessing.noiseSuppression}
      />

      {/* Settings & Quality Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        selectedQuality={selectedQuality}
        onQualityChange={setSelectedQuality}
        audioProcessing={audioProcessing}
        onAudioProcessingChange={handleAudioProcessingChange}
        selectedAudioInput={selectedAudioInput}
        onAudioInputChange={handleAudioInputChange}
        selectedVideoInput={selectedVideoInput}
        onVideoInputChange={handleVideoInputChange}
        screenAudioDevice={screenAudioDevice}
        onScreenAudioDeviceChange={setScreenAudioDevice}
        micGain={micGain}
        onMicGainChange={setMicGain}
        screenAudioGain={screenAudioGain}
        onScreenAudioGainChange={setScreenAudioGain}
        isScreenAudioMuted={isScreenAudioMuted}
        onToggleScreenAudioMute={toggleScreenAudioMute}
        isScreenSharing={isScreenSharing}
        hasScreenAudio={Boolean(screenStream && screenStream.getAudioTracks().length > 0)}
        screenStream={screenStream}
      />
    </div>
  )
}
