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

// Fast Google, Cloudflare, Nextcloud STUN and Metered Free TURN Relays
export const FAST_ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.sipgate.net:3478' },
    { urls: 'stun:stun.nextcloud.com:443' },
    {
      urls: 'stun:openrelay.metered.ca:80',
    },
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
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
}

/**
 * Request display media (screen share) with system audio capability
 */
export async function getHighQualityDisplayMedia(qualityKey = '1080p60') {
  const quality = STREAM_QUALITIES[qualityKey] || STREAM_QUALITIES['1080p60']

  // Constraints optimized to prompt for system audio across Chrome, Edge, and other browsers
  const constraints = {
    video: {
      cursor: 'always',
      width: { ideal: quality.width, max: quality.width },
      height: { ideal: quality.height, max: quality.height },
      frameRate: { ideal: quality.frameRate, max: quality.frameRate },
    },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: false,
    },
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  }

  let stream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia(constraints)
  } catch (err) {
    // Fallback with basic audio: true if complex audio constraints were rejected
    if (err.name !== 'NotAllowedError') {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: constraints.video,
        audio: true,
      })
    } else {
      throw err
    }
  }

  // Set content hint on video track for motion fluidity (60fps)
  const videoTrack = stream.getVideoTracks()[0]
  if (videoTrack && 'contentHint' in videoTrack) {
    videoTrack.contentHint = 'motion'
  }

  return stream
}

/**
 * Capture an audio source (e.g., PulseAudio Monitor on Linux, Stereo Mix on Windows, or Virtual Cable)
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
    // Instruct WebRTC to preserve resolution: do NOT downscale 1080p on jitter!
    if ('degradationPreference' in sender) {
      sender.degradationPreference = 'maintain-resolution'
    }

    const params = sender.getParameters()
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}]
    }

    params.encodings[0].maxBitrate = quality.maxBitrate
    params.encodings[0].minBitrate = quality.minBitrate
    params.encodings[0].maxFramerate = quality.frameRate
    params.encodings[0].scaleResolutionDownBy = 1.0 // Strictly disable downscaling
    params.encodings[0].priority = 'high'
    params.encodings[0].networkPriority = 'high'

    await sender.setParameters(params)
    console.log(`Locked sender quality: ${quality.label} (${quality.maxBitrate / 1000000} Mbps)`)
  } catch (err) {
    console.warn('Could not set sender parameters:', err)
  }
}

/**
 * Enhance SDP for high-fidelity stereo Opus audio and enforce high bandwidth limits
 */
export function lockSdpHighBitrate(sdp, maxKbps = 8000) {
  if (!sdp) return sdp

  let modifiedSdp = sdp

  // Enable Opus stereo at 128 kbps
  modifiedSdp = modifiedSdp.replace(
    /(a=fmtp:\d+ .*?useinbandfec=1)/g,
    '$1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000'
  )

  // Insert transport maximum bitrate (b=AS:8000) for video m-line
  modifiedSdp = modifiedSdp.replace(/(m=video [^\r\n]+[\r\n]+)/g, `$1b=AS:${maxKbps}\r\n`)

  // Lock Google WebRTC engine minimum bitrate to avoid automatic drop
  modifiedSdp = modifiedSdp.replace(
    /(a=fmtp:\d+ .*?level-asymmetry-allowed=1)/g,
    '$1;x-google-min-bitrate=3000;x-google-start-bitrate=6000;x-google-max-bitrate=10000'
  )

  return modifiedSdp
}

// Backwards-compatible alias
export const enhanceSdpForScreenAudio = lockSdpHighBitrate
