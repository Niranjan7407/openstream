export function getApiUrl() {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('openstream_backend_url')
    if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '')
  }

  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '')
  }

  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location
    // If accessing via local network IP (e.g., 192.168.x.x or 10.x.x.x)
    if (/^(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(hostname)) {
      return `${protocol}//${hostname}:3001`
    }
  }

  return 'http://localhost:3001'
}

export const API_URL = getApiUrl()
