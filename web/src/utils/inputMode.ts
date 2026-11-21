// The `touch-area` utility in index.css uses the same query, so text and tap targets switch together.
export const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

export interface InputText {
  text: string
  touch?: string
}

export function textForInput({ text, touch }: InputText, hover = canHover): string {
  return hover ? text : touch ?? text
}
