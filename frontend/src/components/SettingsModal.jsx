import { useState, useEffect, useRef } from 'react'
import { X, Settings, Mic, Monitor, Sparkles, HelpCircle, Volume2, ShieldCheck, Activity, CheckCircle2 } from 'lucide-react'
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
}) {
  const [devices, setDevices] = useState({ audioInputs: [], videoInputs: [] })
  const [activeTab, setActiveTab] = useState('audio') // Default to audio/voice for quick access
  const [isTestingMic, setIsTestingMic] = useState(false)
  const [micLevel, setMicLevel] = useState(0)

  const testStreamRef = useRef(null)
  const audioContextRef = useRef(null)
  const animFrameRef = useRef(null)

  // Enumerate audio and video input devices
  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    const fetchDevices = async () => {
      try {
        // Enumerate available devices
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
        // Scale 0-255 to 0-100%
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupTestAudio()
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
            <span>Settings & Audio Controls</span>
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
            <span>Audio & Noise Cancellation</span>
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
              {/* Device Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {devices.audioInputs.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                      Microphone Device
                    </label>
                    <select
                      value={selectedAudioInput || ''}
                      onChange={(e) => onAudioInputChange && onAudioInputChange(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-purple-500"
                    >
                      <option value="">Default Microphone</option>
                      {devices.audioInputs.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                        </option>
                      ))}
                    </select>
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

              {/* Noise Suppression & Audio Processing Toggles */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-semibold flex items-center gap-2">
                    <ShieldCheck size={18} className="text-purple-400" />
                    <span>Microphone Noise Suppression & Voice Processing</span>
                  </h3>
                </div>
                <p className="text-gray-400 text-xs">
                  Settings apply in real time across Windows, Linux, and macOS in Chrome and Firefox.
                </p>

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

              {/* Live Microphone Test & Visual VU Meter */}
              <div className="bg-gray-950/70 border border-gray-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs sm:text-sm">
                    <Activity size={16} className="text-purple-400" />
                    <span>Microphone & Noise Suppression Test</span>
                  </div>
                  <button
                    onClick={isTestingMic ? stopMicTest : startMicTest}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shadow ${
                      isTestingMic
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                    }`}
                  >
                    <Mic size={13} />
                    <span>{isTestingMic ? 'Stop Test' : 'Test Mic'}</span>
                  </button>
                </div>

                <p className="text-xs text-gray-400">
                  Speak into your microphone to verify voice pickup and check background noise filtering.
                </p>

                {/* Level Bar */}
                <div className="space-y-1.5">
                  <div className="w-full bg-gray-900 border border-gray-800 rounded-full h-3 overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-75 ${
                        micLevel > 75
                          ? 'bg-red-500'
                          : micLevel > 40
                          ? 'bg-yellow-400'
                          : 'bg-emerald-400'
                      }`}
                      style={{ width: `${micLevel}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-500 font-mono">
                    <span>Silent (Noise Filtered)</span>
                    <span>{isTestingMic ? `${micLevel}% Input` : 'Mic Idle'}</span>
                    <span>Max Volume</span>
                  </div>
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

              {/* Dedicated Screen Audio Source Selector */}
              <div className="bg-gray-950/70 border border-gray-800 rounded-xl p-3.5 space-y-2 mt-4">
                <div className="flex items-center gap-2 text-white font-semibold text-xs sm:text-sm">
                  <Volume2 size={16} className="text-purple-400" />
                  <span>Entire Screen / Game Audio Loopback</span>
                </div>
                <p className="text-xs text-gray-400">
                  If your browser cannot capture audio directly (e.g. sharing individual windows on Windows or using Firefox), select your desktop loopback audio device below (e.g. "Stereo Mix", "What U Hear", or Virtual Cable).
                </p>

                <select
                  value={screenAudioDevice || ''}
                  onChange={(e) => onScreenAudioDeviceChange && onScreenAudioDeviceChange(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-white text-xs sm:text-sm focus:outline-none focus:border-purple-500"
                >
                  <option value="">Browser Default (System / Tab Audio)</option>
                  {devices.audioInputs.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Audio Device ${d.deviceId.slice(0, 5)}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-blue-950/40 border border-blue-900/60 rounded-xl p-3 text-xs text-blue-300 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-blue-400" />
                  <span>Cross-Browser Compatibility Tips:</span>
                </p>
                <p>• <strong>Chrome / Edge (Windows/Linux/Mac):</strong> Tick <em>"Also share system audio"</em> at the bottom-left of the screen share prompt.</p>
                <p>• <strong>Firefox:</strong> Firefox shares crisp 60fps video. To stream game sound in Firefox, select <em>Stereo Mix</em> or <em>Virtual Cable</em> above.</p>
              </div>
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
