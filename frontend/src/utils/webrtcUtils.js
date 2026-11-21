// WebRTC streaming quality presets, high-speed ICE relays, and audio capture helpers

export const STREAM_QUALITIES = {
  '1080p60': {
    label: '1080p 60 FPS (Nitro Quality / Gaming)',
    width: 1920,
    height: 1080,
    frameRate: 60,
    maxBitrate: 8000000, // 8 Mbps
    minBitrate: 3000000, // 3 Mbps floor prevents quality drop
    description: 'Crisp 1080p with smooth 60fps motion for games and video',
  },
  '1080p30': {
    label: '1080p 30 FPS (Crisp / Standard)',
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 4500000, // 4.5 Mbps
    minBitrate: 2000000,
    description: 'Full HD text clarity with balanced bandwidth',
  },
  '1440p60': {
    label: '1440p 2K 60 FPS (Ultra HD)',
    width: 2560,
    height: 1440,
    frameRate: 60,
    maxBitrate: 12000000, // 12 Mbps
    minBitrate: 5000000,
    description: 'Ultra high resolution for 1440p monitors',
  },
  '720p60': {
    label: '720p 60 FPS (Fast / Lower Bandwidth)',
    width: 1280,
    height: 720,
    frameRate: 60,
    maxBitrate: 3000000, // 3 Mbps
    minBitrate: 1500000,
    description: 'Smooth 60fps for slower network connections',
  },
}

// Fast and reliable STUN servers (Google & Cloudflare) for universal cross-platform WebRTC
export const FAST_ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  bundlePolicy: 'max-bundle',
}

function initVideoTrackHints(stream) {
  if (!stream) return
  const videoTrack = stream.getVideoTracks()[0]
  if (videoTrack && 'contentHint' in videoTrack) {
    videoTrack.contentHint = 'motion'
  }
}

/**
 * Request display media (screen share) with tiered cross-browser compatibility
 * Handles Chrome, Firefox, Edge, Safari on Windows, Linux, and macOS
 */
export async function getHighQualityDisplayMedia(qualityKey = '1080p60') {
  const quality = STREAM_QUALITIES[qualityKey] || STREAM_QUALITIES['1080p60']

  const videoConstraints = {
    cursor: 'always',
    width: { ideal: quality.width, max: quality.width },
    height: { ideal: quality.height, max: quality.height },
    frameRate: { ideal: quality.frameRate, max: quality.frameRate },
  }

  // Tier 1: Optimal Chromium setup with system audio capture
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: videoConstraints,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        suppressLocalAudioPlayback: false,
      },
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    })
    initVideoTrackHints(stream)
    return stream
  } catch (err1) {
    if (err1.name === 'NotAllowedError') throw err1

    // Tier 2: Basic audio capture fallback
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: true,
      })
      initVideoTrackHints(stream)
      return stream
    } catch (err2) {
      if (err2.name === 'NotAllowedError') throw err2

      // Tier 3: Video-only fallback (essential for Firefox where display audio capture throws)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
      })
      initVideoTrackHints(stream)
      return stream
    }
  }
}

/**
 * Web Audio API Stream Mixer (Option B):
 * Merges high-definition screen/game audio and microphone audio into a single clean WebRTC track
 * with independent gain controls and zero feedback loopback.
 */
export class StreamAudioMixer {
  constructor() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    this.ctx = new AudioCtx()
    this.destination = this.ctx.createMediaStreamDestination()

    // Microphone branch (with independent gain)
    this.micSource = null
    this.micGain = this.ctx.createGain()
    this.micGain.gain.value = 1.0

    // Screen / Game Audio branch (with independent gain)
    this.screenSource = null
    this.screenGain = this.ctx.createGain()
    this.screenGain.gain.value = 1.0

    // Connect both gains to destination
    this.micGain.connect(this.destination)
    this.screenGain.connect(this.destination)
  }

  setMicTrack(track) {
    if (this.micSource) {
      try {
        this.micSource.disconnect()
      } catch (e) {
        console.warn('Error disconnecting micSource:', e)
      }
      this.micSource = null
    }
    if (track) {
      try {
        const stream = new MediaStream([track])
        this.micSource = this.ctx.createMediaStreamSource(stream)
        this.micSource.connect(this.micGain)
      } catch (e) {
        console.warn('Error connecting micSource in mixer:', e)
      }
    }
  }

  setScreenTrack(track) {
    if (this.screenSource) {
      try {
        this.screenSource.disconnect()
      } catch (e) {
        console.warn('Error disconnecting screenSource:', e)
      }
      this.screenSource = null
    }
    if (track) {
      try {
        const stream = new MediaStream([track])
        this.screenSource = this.ctx.createMediaStreamSource(stream)
        this.screenSource.connect(this.screenGain)
      } catch (e) {
        console.warn('Error connecting screenSource in mixer:', e)
      }
    }
  }

  setMicGain(val) {
    if (this.micGain) {
      this.micGain.gain.setTargetAtTime(Math.max(0, val), this.ctx.currentTime, 0.05)
    }
  }

  setScreenGain(val) {
    if (this.screenGain) {
      this.screenGain.gain.setTargetAtTime(Math.max(0, val), this.ctx.currentTime, 0.05)
    }
  }

  getMixedTrack() {
    return this.destination.stream.getAudioTracks()[0] || null
  }

  getMixedStream() {
    return this.destination.stream
  }

  close() {
    if (this.micSource) {
      try {
        this.micSource.disconnect()
      } catch (err) {
        console.debug('Error disconnecting micSource:', err)
      }
    }
    if (this.screenSource) {
      try {
        this.screenSource.disconnect()
      } catch (err) {
        console.debug('Error disconnecting screenSource:', err)
      }
    }
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close().catch(console.warn)
    }
  }
}

/**
 * Capture an audio source (e.g., Stereo Mix on Windows, PulseAudio Monitor on Linux, or Virtual Cable)
 */
export async function captureAudioDeviceStream(deviceId = null) {
  const constraints = {
    audio: deviceId
      ? {
          deviceId: { exact: deviceId },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
        }
      : {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
          sampleRate: 48000,
        },
  }
  return await navigator.mediaDevices.getUserMedia(constraints)
}

/**
 * Configure RTCRtpSender to maintain resolution and high bitrates without dropping
 */
export async function applySenderQuality(sender, qualityKey = '1080p60') {
  if (!sender || !sender.getParameters) return
  const quality = STREAM_QUALITIES[qualityKey] || STREAM_QUALITIES['1080p60']

  try {
    const params = sender.getParameters()
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}]
    }

    params.encodings[0].maxBitrate = quality.maxBitrate
    params.encodings[0].maxFramerate = quality.frameRate
    params.encodings[0].scaleResolutionDownBy = 1.0

    if ('degradationPreference' in params) {
      params.degradationPreference = 'maintain-resolution'
    }

    await sender.setParameters(params)
    console.log(`Locked sender quality: ${quality.label} (${quality.maxBitrate / 1000000} Mbps)`)
  } catch (err) {
    console.warn('Could not set sender parameters:', err)
  }
}

/**
 * Idempotently enhance SDP for high-fidelity stereo Opus audio and enforce high bandwidth limits
 * Works seamlessly across Chrome, Firefox, Edge without syntax errors or duplicate lines
 */
export function lockSdpHighBitrate(sdp, maxKbps = 8000) {
  if (!sdp) return sdp

  const lines = sdp.split(/\r\n|\r|\n/)
  const result = []
  let inVideoSection = false
  let videoBwInserted = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    if (line.startsWith('m=video')) {
      inVideoSection = true
      videoBwInserted = false
      result.push(line)
      continue
    } else if (line.startsWith('m=')) {
      inVideoSection = false
    }

    // Strip existing bandwidth lines under video to avoid duplicate attribute errors
    if (inVideoSection && (line.startsWith('b=AS:') || line.startsWith('b=TIAS:'))) {
      continue
    }

    // Insert bandwidth limits before video attributes
    if (inVideoSection && !videoBwInserted && (line.startsWith('a=') || line === '')) {
      result.push(`b=AS:${maxKbps}`)
      result.push(`b=TIAS:${maxKbps * 1000}`)
      videoBwInserted = true
    }

    // Opus audio enhancement (stereo and high fidelity audio)
    if (line.includes('a=fmtp:') && line.includes('useinbandfec=1')) {
      if (!line.includes('stereo=1')) {
        line += ';stereo=1;sprop-stereo=1'
      }
      if (!line.includes('maxaveragebitrate=')) {
        line += ';maxaveragebitrate=128000'
      }
    }

    result.push(line)
  }

  return result.join('\r\n')
}

// Backwards-compatible alias
export const enhanceSdpForScreenAudio = lockSdpHighBitrate
