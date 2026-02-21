import { createContext, useContext } from 'react'

interface DocNav {
  navigate: (docId: string, tab?: string) => void
}

export const DocNavContext = createContext<DocNav>({ navigate: () => {} })

export function useDocNav() {
  return useContext(DocNavContext)
}
