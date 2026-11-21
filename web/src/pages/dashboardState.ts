export type FirstPageStatus = 'idle' | 'loading' | 'loaded' | 'failed'

export function visitLoadsFirstPage(status: FirstPageStatus): boolean {
  return status === 'idle' || status === 'failed'
}
