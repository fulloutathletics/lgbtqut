import type { CSSProperties, ReactNode } from 'react'
import { C } from '../lib/theme'
import { useStore } from '../lib/store'
import { font } from './ui'

/**
 * A small Markdown subset for directory prose — descriptions and bios.
 *
 * Listings were already being written in Markdown before anything rendered it:
 * the imported directory has `**Our aims:**`, `## Let's grow together.` and
 * `- ` bullets sitting in plain-text fields, showing their own punctuation to
 * readers. This renders what the authors were already writing.
 *
 * It builds React elements and never uses dangerouslySetInnerHTML, so there is
 * no path from a description to markup — entity admins can write their own
 * events, and a directory of queer resources is the wrong place to trust an
 * author with raw HTML. Link targets are limited to http(s), mailto and tel;
 * anything else (a `javascript:` URL above all) renders as inert text.
 *
 * Supported: `#`–`######` headings, `**bold**`, `_italic_`, `[text](url)`,
 * bare URLs, `-`/`*`/`•` bullets, `1.` numbered lists, blank-line paragraphs
 * and single newlines as line breaks. Plain prose passes through unchanged, so
 * every existing listing reads exactly as it did.
 *
 * Single-asterisk italics are deliberately NOT supported. "Trans*" is a term
 * this directory uses in earnest — "Affirmation Trans* is an inclusive group
 * for Trans* Mormons" would otherwise italicise the words between them.
 */

const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^\s{0,3}[-*•]\s+(.+)$/
const ORDERED = /^\s{0,3}(\d{1,3})[.)]\s+(.+)$/

// One pass: **bold**, _italic_, [text](url), bare URL. Emphasis markers must
// hug their content, so a stray asterisk or an underscore_inside_a_word never
// opens a span. A link target may carry one level of balanced parentheses —
// Wikipedia puts them in real URLs, and stopping at the first `)` would both
// break those and leave a stray bracket on screen.
const INLINE =
  /\*\*(\S(?:[^*]*\S)?)\*\*|(?<![A-Za-z0-9_])_(\S(?:[^_]*\S)?)_(?![A-Za-z0-9_])|\[([^\]\n]+)\]\(\s*((?:[^()\s]|\([^()\s]*\))+)\s*\)|((?:https?:\/\/|www\.)[^\s<>]+)/g

/**
 * The href to actually navigate to, or null to leave the text inert. Only
 * three schemes are ever emitted; a scheme-less target is assumed to be a
 * domain and gets https.
 */
function safeHref(raw: string): string | null {
  const url = raw.trim()
  if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return null // javascript:, data:, anything else
  if (/^[^\s/]+\.[a-z]{2,}(?=[/?#]|$)/i.test(url)) return `https://${url}`
  return null
}

/** Trailing sentence punctuation belongs to the sentence, not to the URL. */
function trimUrlTail(url: string): [string, string] {
  let end = url.length
  while (end > 0) {
    const ch = url[end - 1]
    if ('.,;:!?"\''.includes(ch)) { end--; continue }
    // A closing paren is part of the URL only if this URL opened one.
    if (ch === ')') {
      const inner = url.slice(0, end)
      if ((inner.match(/\(/g)?.length ?? 0) >= (inner.match(/\)/g)?.length ?? 0)) break
      end--
      continue
    }
    break
  }
  return [url.slice(0, end), url.slice(end)]
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  const { accent } = useStore()
  return (
    <a href={href} target="_blank" rel="noreferrer noopener"
       onClick={(e) => e.stopPropagation()}
       style={{ color: accent, textDecoration: 'underline', overflowWrap: 'anywhere' }}>
      {children}
    </a>
  )
}

/** One line of prose → text, emphasis and links. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0

  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    last = at + m[0].length
    const k = `${key}-${n++}`

    if (m[1] !== undefined) out.push(<strong key={k} style={{ fontWeight: 700 }}>{inline(m[1], k)}</strong>)
    else if (m[2] !== undefined) out.push(<em key={k}>{inline(m[2], k)}</em>)
    else if (m[3] !== undefined) {
      const href = safeHref(m[4])
      out.push(href ? <Link key={k} href={href}>{m[3]}</Link> : <span key={k}>{m[3]}</span>)
    } else if (m[5] !== undefined) {
      const [url, tail] = trimUrlTail(m[5])
      const href = safeHref(url)
      out.push(href ? <Link key={k} href={href}>{url}</Link> : <span key={k}>{url}</span>)
      if (tail) out.push(tail)
    }
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Consecutive non-blank lines are one paragraph, broken where they broke. */
function Paragraph({ lines, first }: { lines: string[]; first: boolean }) {
  return (
    <p style={{ margin: `${first ? 0 : 10}px 0 0`, textWrap: 'pretty' }}>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {inline(line, `p${i}`)}
        </span>
      ))}
    </p>
  )
}

const HEADING_SIZE = [17, 16, 15, 14.5, 14, 14]

export function RichText({ text, style }: { text: string; style?: CSSProperties }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let para: string[] = []

  const flush = () => {
    if (!para.length) return
    blocks.push(<Paragraph key={`p${blocks.length}`} lines={para} first={blocks.length === 0} />)
    para = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (!line.trim()) { flush(); continue }

    const h = HEADING.exec(line)
    if (h) {
      flush()
      const level = h[1].length
      blocks.push(
        <div key={`h${blocks.length}`}
             style={{ font: font(700, HEADING_SIZE[level - 1], 1.3), color: C.ink,
                      margin: `${blocks.length === 0 ? 0 : 14}px 0 0`, textWrap: 'pretty' }}>
          {inline(h[2], `h${i}`)}
        </div>,
      )
      continue
    }

    // A run of list items is one list; gather it here rather than emitting a
    // list per line, so the bullets share their indent and spacing.
    const ordered = ORDERED.test(line)
    if (ordered || BULLET.test(line)) {
      flush()
      const items: string[] = []
      let start = 1
      while (i < lines.length) {
        const m = ordered ? ORDERED.exec(lines[i]) : BULLET.exec(lines[i])
        if (!m) break
        if (ordered && items.length === 0) start = Number(m[1])
        items.push(ordered ? m[2] : m[1])
        i++
      }
      i--
      const List = ordered ? 'ol' : 'ul'
      blocks.push(
        <List key={`l${blocks.length}`} start={ordered ? start : undefined}
              style={{ margin: `${blocks.length === 0 ? 0 : 8}px 0 0`, paddingLeft: 22 }}>
          {items.map((item, n) => (
            <li key={n} style={{ margin: n === 0 ? 0 : '4px 0 0', textWrap: 'pretty' }}>
              {inline(item, `l${i}-${n}`)}
            </li>
          ))}
        </List>,
      )
      continue
    }

    para.push(line)
  }
  flush()

  return <div style={style}>{blocks}</div>
}
