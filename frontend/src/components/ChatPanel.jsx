import { useState, useRef, useEffect } from 'react'
import { X, Send, MessageSquare } from 'lucide-react'

export default function ChatPanel({ isOpen, onClose, messages, onSendMessage, currentUserId }) {
  const [inputText, setInputText] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus()
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [isOpen, messages])

  const handleSend = (e) => {
    e?.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed) return
    onSendMessage(trimmed)
    setInputText('')
  }

  if (!isOpen) return null

  return (
    <div className="absolute sm:relative inset-y-0 right-0 w-full sm:w-80 md:w-96 bg-gray-900 border-l border-gray-800 flex flex-col h-full z-40 shadow-2xl transition-all">
      {/* Header */}
      <div className="p-3.5 sm:p-4 border-b border-gray-800 flex items-center justify-between bg-gray-950">
        <div className="flex items-center gap-2 text-white font-semibold text-sm sm:text-base">
          <MessageSquare size={18} className="text-purple-400" />
          <span>In-Call Chat</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-800 transition"
          title="Close chat"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-12 text-sm">
            <MessageSquare size={32} className="mx-auto mb-2 opacity-40 text-purple-400" />
            <p>No messages yet.</p>
            <p className="text-xs text-gray-600 mt-1">Send a message to everyone in the room!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === currentUserId
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-xs text-gray-400">
                  <span className={`font-semibold ${isMe ? 'text-purple-400' : 'text-gray-300'}`}>
                    {isMe ? 'You' : msg.senderName || 'Participant'}
                  </span>
                  <span className="text-gray-600">•</span>
                  <span className="text-gray-500">{msg.timestamp}</span>
                </div>
                <div
                  className={`px-3 py-2 rounded-2xl max-w-[85%] text-sm break-words ${
                    isMe
                      ? 'bg-purple-600 text-white rounded-tr-none'
                      : 'bg-gray-800 text-gray-200 rounded-tl-none border border-gray-700/50'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Field */}
      <form onSubmit={handleSend} className="p-3 border-t border-gray-800 bg-gray-950 flex gap-2 items-center">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-gray-900 border border-gray-700 text-white placeholder-gray-500 text-sm px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:hover:bg-purple-600 text-white rounded-xl transition shadow"
          title="Send message"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
