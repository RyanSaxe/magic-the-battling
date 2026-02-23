declare module '@microflash/remark-callout-directives' {
  import type { Plugin } from 'unified'

  interface CalloutDefinition {
    title: string
    hint?: string
    tagName?: string
  }

  interface CalloutOptions {
    aliases?: Record<string, string>
    callouts?: Record<string, CalloutDefinition>
    tagName?: string
  }

  const remarkCalloutDirectives: Plugin<[CalloutOptions?]>
  export default remarkCalloutDirectives
}
