import { useState, useEffect, useRef } from 'react'
import {
  X,
  Settings,
  Mic,
  Monitor,
  Sparkles,
  HelpCircle,
  Volume2,
  VolumeX,
  ShieldCheck,
  Activity,
  CheckCircle2,
  Sliders,
  AlertCircle,
  Info,
} from 'lucide-react'
import { STREAM_QUALITIES } from '../utils/webrtcUtils'

export default function SettingsModal({
  isOpen,
  onClose,
  selectedQuality,
  onQualityChange,
  audioProcessing,
  onAudioProcessingChange,
  selectedAudioInput,
  onAudioInputChange,
  selectedVideoInput,
  onVideoInputChange,
  screenAudioDevice,
  onScreenAudioDeviceChange,
  micGain = 1.0,
  onMicGainChange,
  screenAudioGain = 1.0,
  onScreenAudioGainChange,
  isScreenAudioMuted = false,
  onToggleScreenAudioMute,
  isScreenSharing = false,
  hasScreenAudio = false,
  screenStream = null,
}) {
  const [devices, setDevices] = useState({ audioInputs: [], videoInputs: [] })
  const [activeTab, setActiveTab] = useState('audio') // Default to audio/voice for quick access
  const [isTestingMic, setIsTestingMic] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [screenAudioLevel, setScreenAudioLevel] = useState(0)

  const testStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const animFrameRef = useRef(null)

  const screenMeterCtxRef = useRef(null)
  const screenAnimFrameRef = useRef(null)

  // Enumerate audio and video input devices
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    const fetchDevices = async () => {
      try {
        const devList = await navigator.mediaDevices.enumerateDevices()
        if (isMounted) {
          setDevices({
            audioInputs: devList.filter((d) => d.kind === 'audioinput'),
            videoInputs: devList.filter((d) => d.kind === 'videoinput'),
          })
        }
      } catch (err) {
        console.warn('Could not enumerate devices:', err)
      }
    }

    fetchDevices()
    navigator.mediaDevices?.addEventListener('devicechange', fetchDevices)

    return () => {
      isMounted = false
      navigator.mediaDevices?.removeEventListener('devicechange', fetchDevices)
    }
  }, [isOpen])

  // Stop mic test and release audio resources
  const cleanupTestAudio = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop())
      testStreamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(console.warn)
      audioContextRef.current = null
    }
  }

  const stopMicTest = () => {
    cleanupTestAudio()
    setIsTestingMic(false)
    setMicLevel(0)
  }

  // Start mic test
  const startMicTest = async () => {
    cleanupTestAudio()
    try {
      const constraints = {
        audio: {
          deviceId: selectedAudioInput ? { exact: selectedAudioInput } : undefined,
          echoCancellation: audioProcessing?.echoCancellation ?? true,
          noiseSuppression: audioProcessing?.noiseSuppression ?? true,
          autoGainControl: audioProcessing?.autoGainControl ?? true,
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      testStreamRef.current = stream

      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx()
      audioContextRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.6
      source.connect(analyser)

      const pcmData = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteFrequencyData(pcmData)
        let sum = 0
        for (let i = 0; i < pcmData.length; i++) {
          sum += pcmData[i]
        }
        const avg = sum / pcmData.length
        const normalized = Math.min(Math.round((avg / 128) * 100), 100)
        setMicLevel(normalized)
        animFrameRef.current = requestAnimationFrame(tick)
      }

      setIsTestingMic(true)
      tick()
    } catch (err) {
      console.warn('Microphone test failed:', err)
      setIsTestingMic(false)
    }
  }

  // Screen audio level meter when screen sharing has audio
  useEffect(() => {
    if (!isOpen || !screenStream || !hasScreenAudio) return

    const audioTrack = screenStream.getAudioTracks()[0]
    if (!audioTrack) return

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx()
      screenMeterCtxRef.current = ctx

      const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]))
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.6
      source.connect(analyser)

      const pcmData = new Uint8Array(analyser.frequencyBinCount)

      const tickScreen = () => {
        analyser.getByteFrequencyData(pcmData)
        let sum = 0
        for (let i = 0; i < pcmData.length; i++) {
          sum += pcmData[i]
        }
        const avg = sum / pcmData.length
        const normalized = Math.min(Math.round((avg / 128) * 100), 100)
        setScreenAudioLevel(normalized)
        screenAnimFrameRef.current = requestAnimationFrame(tickScreen)
      }

      tickScreen()
    } catch (err) {
      console.warn('Screen audio meter failed:', err)
    }

    return () => {
      if (screenAnimFrameRef.current) {
        cancelAnimationFrame(screenAnimFrameRef.current)
        screenAnimFrameRef.current = null
      }
      if (screenMeterCtxRef.current && screenMeterCtxRef.current.state !== 'closed') {
        screenMeterCtxRef.current.close().catch(console.warn)
        screenMeterCtxRef.current = null
      }
      setScreenAudioLevel(0)
    }
  }, [isOpen, screenStream, hasScreenAudio])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupTestAudio()
      if (screenAnimFrameRef.current) {
        cancelAnimationFrame(screenAnimFrameRef.current)
      }
      if (screenMeterCtxRef.current && screenMeterCtxRef.current.state !== 'closed') {
        screenMeterCtxRef.current.close().catch(console.warn)
      }
    }
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800 flex items-center justify-between bg-gray-950">
          <div className="flex items-center gap-2.5 text-white font-bold text-base sm:text-lg">
            <Settings size={20} className="text-purple-400" />
            <span>Audio Studio & Stream Quality</span>
          </div>
          <button
            onClick={() => {
              stopMicTest()
              onClose()
            }}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 bg-gray-950/60 px-4 sm:px-5 gap-3 sm:gap-4 overflow-x-auto">
          <button
            onClick={() => setActiveTab('audio')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'audio'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Mic size={16} />
            <span>Voice & Game Mixer (Zero Echo)</span>
          </button>
          <button
            onClick={() => setActiveTab('stream')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'stream'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Monitor size={16} />
            <span>Screen & Quality</span>
          </button>
          <button
            onClick={() => setActiveTab('shortcuts')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'shortcuts'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <HelpCircle size={16} />
            <span>Shortcuts</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-gray-200 text-sm">
          {activeTab === 'audio' && (
            <div className="space-y-5">
              {/* Zero Echo Architecture Card */}
              <div className="bg-gradient-to-r from-purple-950/50 via-indigo-950/40 to-blue-950/40 border border-purple-500/30 rounded-2xl p-4 shadow-lg space-y-2">
                <div className="flex items-center gap-2 text-white font-bold text-xs sm:text-sm">
                  <ShieldCheck size={18} className="text-emerald-400" />
                  <span>Zero-Echo Dual Stream Architecture</span>
                  <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider border border-emerald-500/30">
                    No Stereo Mix Needed
                  </span>
                </div>
                <p className="text-gray-300 text-xs leading-relaxed">
                  OpenStream captures <strong>game & system audio directly from your screen share</strong> in pure 48kHz stereo, while capturing your <strong>microphone separately with Echo Cancellation & AI Noise Suppression</strong>.
                  Your friends will never hear their own voice looped back, and you can talk freely while playing!
                </p>
                <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-gray-300 font-medium">
                  <span className="bg-black/40 px-2 py-1 rounded-lg border border-white/5 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-green-400" />
                    <span>Real Mic + Game Sound Together</span>
                  </span>
                  <span className="bg-black/40 px-2 py-1 rounded-lg border border-white/5 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-green-400" />
                    <span>Zero Loopback Echo</span>
                  </span>
                  <span className="bg-black/40 px-2 py-1 rounded-lg border border-white/5 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-green-400" />
                    <span>Independent Voice & Game Faders</span>
                  </span>
                </div>
              </div>

              {/* Device Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {devices.audioInputs.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                      Your Microphone Device
                    </label>
                    <select
                      value={selectedAudioInput || ''}
                      onChange={(e) => onAudioInputChange && onAudioInputChange(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-purple-500"
                    >
                      <option value="">Default Microphone / Headset</option>
                      {devices.audioInputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
                    <span className="text-[10px] text-amber-400 mt-1 block flex items-center gap-1">
                      <AlertCircle size={11} />
                      <span>Choose your real microphone. Do not select Stereo Mix.</span>
                    </span>
                  </div>
                )}

                {devices.videoInputs.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                      Camera Device
                    </label>
                    <select
                      value={selectedVideoInput || ''}
                      onChange={(e) => onVideoInputChange && onVideoInputChange(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-purple-500"
                    >
                      <option value="">Default Camera</option>
                      {devices.videoInputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${d.deviceId.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Streamer Audio Studio Faders (Microphone Gain & Screen Sound Gain) */}
              <div className="bg-gray-950/80 border border-gray-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs sm:text-sm">
                    <Sliders size={16} className="text-purple-400" />
                    <span>Broadcaster Audio Mixer & Faders</span>
                  </div>
                </div>

                {/* Microphone Level Fader */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <Mic size={14} className="text-purple-400" />
                      <span>Microphone Volume</span>
                    </span>
                    <span className="text-purple-400 font-mono font-bold">
                      {Math.round((micGain ?? 1.0) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={micGain ?? 1.0}
                    onChange={(e) => onMicGainChange && onMicGainChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gray-800 rounded-lg accent-purple-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>Mute (0%)</span>
                    <span>Normal (100%)</span>
                    <span>Boost (200%)</span>
                  </div>
                </div>

                {/* Screen / Game Audio Fader & Mute */}
                <div className="space-y-1.5 pt-2 border-t border-gray-800/80">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <Volume2 size={14} className="text-blue-400" />
                      <span>Screen / Game Audio Volume</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={onToggleScreenAudioMute}
                        disabled={!isScreenSharing || !hasScreenAudio}
                        className={`text-[10px] px-2 py-0.5 rounded font-semibold transition flex items-center gap-1 ${
                          !isScreenSharing || !hasScreenAudio
                            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                            : isScreenAudioMuted
                            ? 'bg-amber-600 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {isScreenAudioMuted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                        <span>{isScreenAudioMuted ? 'Muted' : 'Live'}</span>
                      </button>
                      <span className="text-blue-400 font-mono font-bold">
                        {isScreenAudioMuted ? '0%' : `${Math.round((screenAudioGain ?? 1.0) * 100)}%`}
                      </span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    disabled={isScreenAudioMuted}
                    value={screenAudioGain ?? 1.0}
                    onChange={(e) => onScreenAudioGainChange && onScreenAudioGainChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gray-800 rounded-lg accent-blue-500 cursor-pointer disabled:opacity-40"
                  />
                  <div className="flex justify-between text-[10px] text-gray-500">
                    <span>Mute (0%)</span>
                    <span>Original Level (100%)</span>
                    <span>Loud (150%)</span>
                  </div>
                </div>
              </div>

              {/* Live VU Meters: Microphone & Game Sound */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Voice VU Meter */}
                <div className="bg-gray-950/70 border border-gray-800 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Activity size={14} className="text-purple-400" />
                      <span>Voice Input Meter</span>
                    </span>
                    <button
                      onClick={isTestingMic ? stopMicTest : startMicTest}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 shadow ${
                        isTestingMic
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}
                    >
                      <Mic size={12} />
                      <span>{isTestingMic ? 'Stop Test' : 'Test Mic'}</span>
                    </button>
                  </div>
                  <div className="w-full bg-gray-900 border border-gray-800 rounded-full h-2.5 overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-75 ${
                        micLevel > 75 ? 'bg-red-500' : micLevel > 40 ? 'bg-yellow-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                    <span>Silent</span>
                    <span>{isTestingMic ? `${micLevel}%` : 'Idle'}</span>
                    <span>Max</span>
                  </div>
                </div>

                {/* Game / Screen Sound VU Meter */}
                <div className="bg-gray-950/70 border border-gray-800 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <Volume2 size={14} className="text-blue-400" />
                      <span>Game Sound Meter</span>
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                        hasScreenAudio ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {hasScreenAudio ? 'Active' : 'No Sound'}
                    </span>
                  </div>
                  <div className="w-full bg-gray-900 border border-gray-800 rounded-full h-2.5 overflow-hidden p-0.5">
                    <div
                      className="h-full rounded-full bg-blue-400 transition-all duration-75"
                      style={{ width: `${hasScreenAudio && !isScreenAudioMuted ? screenAudioLevel : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                    <span>Silent</span>
                    <span>{hasScreenAudio && !isScreenAudioMuted ? `${screenAudioLevel}%` : 'Muted/Off'}</span>
                    <span>Peak</span>
                  </div>
                </div>
              </div>

              {/* Noise Suppression & Audio Processing Toggles */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <ShieldCheck size={18} className="text-purple-400" />
                    <span>Microphone Noise Suppression & Voice Processing</span>
                  </h3>
                </div>

                <div className="space-y-3 bg-gray-950/80 border border-gray-800 rounded-2xl p-4 shadow-inner">
                  {/* Noise Suppression Toggle */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">AI / WebRTC Noise Suppression</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            audioProcessing.noiseSuppression
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {audioProcessing.noiseSuppression ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 block">
                        Cuts background keyboard typing, mouse clicks, fan hum, AC, and room noise.
                      </span>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={audioProcessing.noiseSuppression}
                        onChange={(e) => onAudioProcessingChange('noiseSuppression', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </div>
                  </label>

                  <div className="border-t border-gray-800/80" />

                  {/* Echo Cancellation Toggle */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">Acoustic Echo Cancellation</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            audioProcessing.echoCancellation
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {audioProcessing.echoCancellation ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 block">
                        Prevents microphone from picking up incoming audio and speaker output.
                      </span>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={audioProcessing.echoCancellation}
                        onChange={(e) => onAudioProcessingChange('echoCancellation', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </div>
                  </label>

                  <div className="border-t border-gray-800/80" />

                  {/* Automatic Gain Control */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="space-y-0.5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">Automatic Gain Control</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            audioProcessing.autoGainControl
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {audioProcessing.autoGainControl ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400 block">
                        Balances your voice volume automatically so you are never too quiet or clipping.
                      </span>
                    </div>
                    <div className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={audioProcessing.autoGainControl}
                        onChange={(e) => onAudioProcessingChange('autoGainControl', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stream' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
                  <Sparkles size={16} className="text-purple-400" />
                  Streaming Quality Preset (Universal High-Bitrate)
                </h3>
                <p className="text-gray-400 text-xs mb-3">
                  Resolution and bitrates are optimized to stream in 60fps across Windows, Linux, and macOS.
                </p>
              </div>

              <div className="grid gap-2.5">
                {Object.entries(STREAM_QUALITIES).map(([key, item]) => {
                  const isSelected = selectedQuality === key
                  return (
                    <label
                      key={key}
                      onClick={() => onQualityChange(key)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        isSelected
                          ? 'border-purple-500 bg-purple-950/40 text-white'
                          : 'border-gray-800 bg-gray-950/60 hover:border-gray-700 text-gray-300'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-xs sm:text-sm flex items-center gap-2">
                          <span>{item.label}</span>
                          {key === '1080p60' && (
                            <span className="bg-purple-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                              Recommended
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] sm:text-xs text-gray-400">{item.description}</div>
                      </div>
                      <input
                        type="radio"
                        name="streamQuality"
                        checked={isSelected}
                        onChange={() => onQualityChange(key)}
                        className="accent-purple-500 w-4 h-4 cursor-pointer"
                      />
                    </label>
                  )
                })}
              </div>

              {/* How to Stream Game Sound Guide */}
              <div className="bg-blue-950/40 border border-blue-900/60 rounded-2xl p-4 text-xs text-blue-200 space-y-2">
                <p className="font-bold flex items-center gap-1.5 text-white text-sm">
                  <CheckCircle2 size={16} className="text-blue-400" />
                  <span>How to Stream Game & Desktop Audio (Without Echo):</span>
                </p>
                <div className="space-y-1.5 text-xs text-gray-300">
                  <p>1. Click the purple <strong>Share</strong> button on the bottom bar (or press <strong>S</strong>).</p>
                  <p>2. Select <strong>Entire Screen</strong> or a specific <strong>Browser Tab</strong>.</p>
                  <p>3. At the bottom-left of the browser popup, make sure <strong>"Also share system audio"</strong> (or "Share tab audio") is checked!</p>
                  <p>4. <strong>Zero Setup Needed</strong>: OpenStream captures the sound natively without needing Stereo Mix or virtual cables!</p>
                </div>
              </div>

              {/* Advanced optional loopback device (for Linux or special audio interfaces only) */}
              <details className="bg-gray-950/50 border border-gray-800/80 rounded-xl p-3 text-xs text-gray-400">
                <summary className="cursor-pointer font-semibold text-gray-300 flex items-center gap-1.5">
                  <Info size={14} className="text-purple-400" />
                  <span>Advanced: External Loopback Audio Device (Optional / Linux / Specialized Hardware)</span>
                </summary>
                <div className="mt-3 space-y-2 pt-2 border-t border-gray-800">
                  <p>
                    Most users do NOT need this. If your browser captures audio directly from the share dialog, leave this as Browser Default.
                  </p>
                  <select
                    value={screenAudioDevice || ''}
                    onChange={(e) => onScreenAudioDeviceChange && onScreenAudioDeviceChange(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-purple-500"
                  >
                    <option value="">Browser Default (Native System / Tab Audio)</option>
                    {devices.audioInputs.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Audio Device ${d.deviceId.slice(0, 5)}`}
                      </option>
                    ))}
                  </select>
                </div>
              </details>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-semibold mb-1">Keyboard Shortcuts</h3>
                <p className="text-gray-400 text-xs">Quick controls for seamless streaming like Discord.</p>
              </div>

              <div className="bg-gray-950/60 border border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-800 text-xs sm:text-sm">
                <div className="p-3 flex items-center justify-between">
                  <span>Toggle Microphone (Mute / Unmute)</span>
                  <kbd className="bg-gray-800 px-2 py-1 rounded text-xs font-mono text-gray-300 border border-gray-700">M</kbd>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span>Toggle Camera (On / Off)</span>
                  <kbd className="bg-gray-800 px-2 py-1 rounded text-xs font-mono text-gray-300 border border-gray-700">V</kbd>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span>Toggle Screen Share</span>
                  <kbd className="bg-gray-800 px-2 py-1 rounded text-xs font-mono text-gray-300 border border-gray-700">S</kbd>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span>Toggle Fullscreen (Stream / Stage)</span>
                  <kbd className="bg-gray-800 px-2 py-1 rounded text-xs font-mono text-gray-300 border border-gray-700">F</kbd>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span>Toggle In-Call Chat</span>
                  <kbd className="bg-gray-800 px-2 py-1 rounded text-xs font-mono text-gray-300 border border-gray-700">C</kbd>
                </div>
                <div className="p-3 flex items-center justify-between">
                  <span>Exit Fullscreen / Close Modals</span>
                  <kbd className="bg-gray-800 px-2 py-1 rounded text-xs font-mono text-gray-300 border border-gray-700">Esc</kbd>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-950 flex justify-end">
          <button
            onClick={() => {
              stopMicTest()
              onClose()
            }}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition shadow text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
