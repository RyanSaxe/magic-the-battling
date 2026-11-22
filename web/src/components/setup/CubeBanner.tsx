import type { ReactNode } from 'react'
import type { CubeLook } from '../../hooks/useCubeLook'
import type { PlayMode } from '../../types'
import { Tag } from '../common/Tag'
import { CubeBandArt } from '../dashboard/CubeArt'

// The band is one height whatever the cube is called, so a long name steps down in size instead of being cut.
function nameSize(name: string): string {
  if (name.length > 44) return 'is-longest'
  return name.length > 22 ? 'is-long' : ''
}

/** The top of Play and the Lobby: the cube over its art, then a walnut row of that screen's controls. */
export function CubeBanner({
  look,
  playMode,
  href,
  action,
  children,
}: {
  /** null before a player in constructed has a deck. */
  look: CubeLook | null
  playMode: PlayMode
  href?: string
  action?: ReactNode
  children: ReactNode
}) {
  const name = look?.name ?? 'No deck yet'
  return (
    <div className={`cube-banner ${look?.imageUri ? 'has-art' : ''}`}>
      <div className="cube-banner-art">{look?.imageUri && <CubeBandArt src={look.imageUri} />}</div>
      <div className="cube-banner-top">
        {name ? (
          <div className="cube-banner-title">
            <h2 className={`cube-banner-name ${nameSize(name)}`}>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="cube-banner-link">
                  <span>
                    {name}
                    <span aria-hidden="true" className="cube-banner-arrow">{'\u00a0'}↗</span>
                  </span>
                </a>
              ) : (
                name
              )}
            </h2>
            <Tag tone="muted">{playMode === 'constructed' ? 'Deck' : 'Cube'}</Tag>
          </div>
        ) : (
          <span />
        )}
        {action && <div className="cube-banner-action">{action}</div>}
      </div>
      <div className="cube-banner-strip">{children}</div>
    </div>
  )
}
