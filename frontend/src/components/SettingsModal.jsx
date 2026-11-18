import { useState, useEffect } from 'react'
import { X, Settings, Mic, Monitor, Sparkles, HelpCircle, Volume2 } from 'lucide-react'
import { STREAM_QUALITIES } from '../utils/webrtcUtils'

export default function SettingsModal({
  isOpen,
  onClose,
  selectedQuality,
  onQualityChange,
  audioProcessing,
  onAudioProcessingChange,
  screenAudioDevice,
  onScreenAudioDeviceChange,
}) {
  const [devices, setDevices] = useState({ audioInputs: [], videoInputs: [] })
  const [selectedAudioInput, setSelectedAudioInput] = useState('')
  const [selectedVideoInput, setSelectedVideoInput] = useState('')
  const [activeTab, setActiveTab] = useState('stream')

  useEffect(() => {
    if (!isOpen) return

    const fetchDevices = async () => {
      try {
        const devList = await navigator.mediaDevices.enumerateDevices()
        setDevices({
          audioInputs: devList.filter((d) => d.kind === 'audioinput'),
          videoInputs: devList.filter((d) => d.kind === 'videoinput'),
        })
      } catch (err) {
        console.warn('Could not enumerate devices:', err)
      }
    }

    fetchDevices()
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800 flex items-center justify-between bg-gray-950">
          <div className="flex items-center gap-2.5 text-white font-bold text-base sm:text-lg">
            <Settings size={20} className="text-purple-400" />
            <span>Settings & Stream Quality</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 bg-gray-950/50 px-4 sm:px-5 gap-3 sm:gap-4 overflow-x-auto">
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
            onClick={() => setActiveTab('audio')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition flex items-center gap-1.5 sm:gap-2 shrink-0 ${
              activeTab === 'audio'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Mic size={16} />
            <span>Audio & Voice</span>
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
          {activeTab === 'stream' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
                  <Sparkles size={16} className="text-purple-400" />
                  Streaming Quality Preset (No Quality Drop / Locked Bitrate)
                </h3>
                <p className="text-gray-400 text-xs mb-3">
                  Resolution and bitrates are strictly locked so your stream never automatically degrades.
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
                  <span>Entire Screen / Game Audio Source</span>
                </div>
                <p className="text-xs text-gray-400">
                  If Chrome does not capture audio when sharing your Entire Screen (especially on Linux/Windows), select your desktop loopback audio device below (e.g. "Monitor of Built-in Audio", "Stereo Mix", or Virtual Cable).
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
                <p className="font-semibold">💡 Tips for Entire Screen Game Audio:</p>
                <p>1. When the Chrome share dialog opens, tick <strong>"Also share system audio"</strong>.</p>
                <p>2. If on Linux or sharing a separate game, select your <strong>Monitor/Stereo Mix</strong> device above to broadcast 100% of game audio!</p>
              </div>
            </div>
          )}

          {activeTab === 'audio' && (
            <div className="space-y-4">
              {/* Device Selectors */}
              {devices.audioInputs.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Microphone Input Device
                  </label>
                  <select
                    value={selectedAudioInput}
                    onChange={(e) => setSelectedAudioInput(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
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
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Camera Device
                  </label>
                  <select
                    value={selectedVideoInput}
                    onChange={(e) => setSelectedVideoInput(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500"
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

              <div>
                <h3 className="text-white font-semibold mb-1">Audio Processing</h3>
                <p className="text-gray-400 text-xs">Configure microphone processing options for voice chat.</p>
              </div>

              <div className="space-y-3 bg-gray-950/60 border border-gray-800 rounded-xl p-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="font-medium text-white block">Echo Cancellation</span>
                    <span className="text-xs text-gray-400">Prevents microphone from picking up speaker output</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={audioProcessing.echoCancellation}
                    onChange={(e) => onAudioProcessingChange('echoCancellation', e.target.checked)}
                    className="accent-purple-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                <div className="border-t border-gray-800" />

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="font-medium text-white block">Noise Suppression</span>
                    <span className="text-xs text-gray-400">Filters out background room and fan noises</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={audioProcessing.noiseSuppression}
                    onChange={(e) => onAudioProcessingChange('noiseSuppression', e.target.checked)}
                    className="accent-purple-500 w-4 h-4 cursor-pointer"
                  />
                </label>

                <div className="border-t border-gray-800" />

                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="font-medium text-white block">Automatic Gain Control</span>
                    <span className="text-xs text-gray-400">Automatically balances microphone input levels</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={audioProcessing.autoGainControl}
                    onChange={(e) => onAudioProcessingChange('autoGainControl', e.target.checked)}
                    className="accent-purple-500 w-4 h-4 cursor-pointer"
                  />
                </label>
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
            onClick={onClose}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl transition shadow text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
