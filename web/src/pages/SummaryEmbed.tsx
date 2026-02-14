import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { getShareGame } from '../api/client'
import type { ShareGameResponse } from '../types'
import { GameSummary } from '../components/GameSummary'
import { buildGameSummaryData } from '../utils/share'

export function SummaryEmbed() {
  const { gameId, playerName } = useParams<{ gameId: string; playerName: string }>()
  const [data, setData] = useState<ShareGameResponse | null>(null)
  const [error, setError] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!gameId || !playerName) return
    getShareGame(gameId, playerName)
      .then(setData)
      .catch(() => setError(true))
  }, [gameId, playerName])

  useEffect(() => {
    if (!containerRef.current) return
    if (error) {
      containerRef.current.setAttribute('data-embed-ready', 'true')
      return
    }
    if (!data) return

    const el = containerRef.current
    const images = el.querySelectorAll('img')
    if (images.length === 0) {
      el.setAttribute('data-embed-ready', 'true')
      return
    }

    let loaded = 0
    const total = images.length
    const onDone = () => {
      loaded++
      if (loaded >= total) {
        el.setAttribute('data-embed-ready', 'true')
      }
    }
    images.forEach((img) => {
      if (img.complete) {
        onDone()
      } else {
        img.addEventListener('load', onDone, { once: true })
        img.addEventListener('error', onDone, { once: true })
      }
    })
  }, [data, error])

  const summaryData = data ? buildGameSummaryData(data) : null

  return (
    <div
      ref={containerRef}
      style={{ width: 1200, height: 630 }}
      className="bg-gray-900 text-white overflow-hidden"
    >
      {summaryData ? (
        <div className="w-full h-full flex flex-col">
          <GameSummary
            player={summaryData.selfPlayer}
            players={summaryData.players}
            useUpgrades={data!.use_upgrades}
          />
        </div>
      ) : (
        <div className="w-full h-full" />
      )}
    </div>
  )
}
