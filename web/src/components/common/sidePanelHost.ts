import { createContext } from 'react'

/** The box that side panels open into, inside the felt's gold edge. The page that draws the felt provides it. */
export const SidePanelHostContext = createContext<HTMLElement | null>(null)
