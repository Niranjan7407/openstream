// WebRTC streaming quality presets and helpers for 1080p 60fps Discord Nitro alternative

export const STREAM_QUALITIES = {
  '1080p60': {
    label: '1080p 60 FPS (Nitro Quality / Gaming)',
    width: 1920,
    height: 1080,
    frameRate: 60,
    maxBitrate: 8000000, // 8 Mbps
    description: 'Crisp 1080p with smooth 60fps motion for games and video',
  },
  '1080p30': {
    label: '1080p 30 FPS (Crisp / Standard)',
    width: 1920,
    height: 1080,
    frameRate: 30,
    maxBitrate: 4000000, // 4 Mbps
    description: 'Full HD text clarity with balanced bandwidth',
  },
  '1440p60': {
    label: '1440p 2K 60 FPS (Ultra HD)',
    width: 2560,
    height: 1440,
    frameRate: 60,
    maxBitrate: 12000000, // 12 Mbps
    description: 'Ultra high resolution for 1440p monitors',
  },
  '720p60': {
    label: '720p 60 FPS (Fast / Lower Bandwidth)',
    width: 1280,
    height: 720,
    frameRate: 60,
    maxBitrate: 2500000, // 2.5 Mbps
    description: 'Smooth 60fps for slower network connections',
  },
}

/**
 * Request display media (screen share) with high quality video and system audio
 */
export async function getHighQualityDisplayMedia(qualityKey = '1080p60') {
  const quality = STREAM_QUALITIES[qualityKey] || STREAM_QUALITIES['1080p60']

  // Request screen capture with system/tab audio
  const constraints = {
    video: {
      cursor: 'always',
      displaySurface: 'monitor',
      width: { ideal: quality.width, max: quality.width },
      height: { ideal: quality.height, max: quality.height },
      frameRate: { ideal: quality.frameRate, max: quality.frameRate },
    },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      suppressLocalAudioPlayback: false,
      channelCount: 2, // Stereo system audio
      sampleRate: 48000,
    },
    systemAudio: 'include',
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  }

  const stream = await navigator.mediaDevices.getDisplayMedia(constraints)

  // Set content hint on video track for motion fluidity (60fps)
  const videoTrack = stream.getVideoTracks()[0]
  if (videoTrack && 'contentHint' in videoTrack) {
    videoTrack.contentHint = 'motion'
  }

  return stream
}

/**
 * Configure RTCRtpSender to send high bitrate and 60fps for crystal clear 1080p
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
    params.encodings[0].priority = 'high'
    params.encodings[0].networkPriority = 'high'

    await sender.setParameters(params)
    console.log(`Applied sender quality: ${quality.label} (${quality.maxBitrate / 1000000} Mbps)`)
  } catch (err) {
    console.warn('Could not set sender parameters:', err)
  }
}

/**
 * Enhance SDP to support high-fidelity stereo Opus audio for screen sharing
 */
export function enhanceSdpForScreenAudio(sdp) {
  if (!sdp) return sdp
  // Find opus payload type and add stereo=1;sprop-stereo=1;maxaveragebitrate=128000
  return sdp.replace(/(a=fmtp:\d+ .*?useinbandfec=1)/g, '$1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000')
}
