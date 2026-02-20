import { useState, useEffect, useCallback } from 'react'
import type { IconType } from 'react-icons'
import {
  FaXTwitter,
  FaBluesky,
  FaRedditAlien,
  FaFacebook,
  FaWhatsapp,
  FaMessage,
  FaLink,
} from 'react-icons/fa6'

interface ShareModalProps {
  url: string
  shareText: string
  onClose: () => void
}

interface Platform {
  label: string
  icon: IconType
  mobileOnly?: boolean
  getUrl: (url: string, text: string) => string
}

const PLATFORMS: Platform[] = [
  {
    label: 'Twitter',
    icon: FaXTwitter,
    getUrl: (url, text) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  {
    label: 'Bluesky',
    icon: FaBluesky,
    getUrl: (url, text) =>
      `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    label: 'Reddit',
    icon: FaRedditAlien,
    getUrl: (url, text) =>
      `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`,
  },
  {
    label: 'Facebook',
    icon: FaFacebook,
    getUrl: (url) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    label: 'WhatsApp',
    icon: FaWhatsapp,
    mobileOnly: true,
    getUrl: (url, text) =>
      `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    label: 'Text',
    icon: FaMessage,
    mobileOnly: true,
    getUrl: (url, text) =>
      `sms:?body=${encodeURIComponent(`${text} ${url}`)}`,
  },
]

export function ShareModal({ url, shareText, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  const handlePlatformClick = useCallback(
    (getUrl: (url: string, text: string) => string) => {
      window.open(getUrl(url, shareText), '_blank')
      onClose()
    },
    [url, shareText, onClose],
  )

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [url])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-lg p-6 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white">Share Game</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {PLATFORMS.map(({ label, icon: Icon, mobileOnly, getUrl }) => (
            <button
              key={label}
              onClick={() => handlePlatformClick(getUrl)}
              className={`flex flex-col items-center gap-1.5 p-3 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors ${
                mobileOnly ? 'sm:hidden' : ''
              }`}
            >
              <Icon className="text-2xl text-white" />
              <span className="text-xs text-gray-300">{label}</span>
            </button>
          ))}

          <button
            onClick={handleCopyLink}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg transition-colors ${
              copied
                ? 'bg-emerald-600/80 border border-emerald-400/30'
                : 'bg-gray-800 hover:bg-gray-700'
            }`}
          >
            <FaLink className="text-2xl text-white" />
            <span className="text-xs text-gray-300">
              {copied ? 'Copied!' : 'Copy Link'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
