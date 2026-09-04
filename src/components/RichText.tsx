import { Fragment } from 'react'

/**
 * Renders a small safe markdown subset — bold, italic, [text](url) links
 * and bare URLs — as React nodes. No HTML parsing or dangerouslySetInnerHTML,
 * so there's no sanitization to get wrong.
 */
export function RichText({ text }: { text: string }) {
  return <>{parseInline(text)}</>
}

const TOKEN = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s]+)/g

function parseInline(text: string) {
  const parts = text.split(TOKEN)
  return parts.map((part, i) => {
    if (!part) return null
    const key = i

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if ((part.startsWith('*') && part.endsWith('*') && part.length > 2) ||
        (part.startsWith('_') && part.endsWith('_') && part.length > 2)) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
          {link[1]}
        </a>
      )
    }
    if (/^https?:\/\/[^\s]+$/.test(part)) {
      return (
        <a key={key} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
          {part}
        </a>
      )
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}
