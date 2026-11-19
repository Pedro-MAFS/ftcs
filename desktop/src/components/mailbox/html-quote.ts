import { hasOriginalHeaders, originalMailDivider } from '../../../electron/mailbox/reply-quote'

function hasContent(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) return !!node.textContent?.trim()
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  const el = node as Element
  return (
    !el.matches('style,br') &&
    (!!el.textContent?.trim() || el.matches('img,hr') || !!el.querySelector('img,hr'))
  )
}
function contentFollows(node: Node, body: Element) {
  for (let ancestor: Node | null = node; ancestor && ancestor !== body; ancestor = ancestor.parentNode)
    for (let sibling = ancestor.nextSibling; sibling; sibling = sibling.nextSibling)
      if (hasContent(sibling)) return true
  return false
}

// BR and block boundaries delimit lines. Inline formatting often splits a single divider
// or field label across several text nodes, particularly in mobile mail.
function* lineParts(element: Element): Generator<Text | null> {
  for (const child of element.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      yield child as Text
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement
      if (el.matches('style,script,[hidden]') || el.style.display === 'none') continue
      const block =
        el.style.display === 'block' ||
        el.matches(
          'br,hr,div,p,section,article,header,footer,blockquote,pre,table,tr,td,th,li,h1,h2,h3,h4,h5,h6',
        )
      if (block) yield null
      yield* lineParts(el)
      if (block) yield null
    }
  }
}
function* mailLines(body: HTMLElement) {
  let first: Text | undefined
  let last: Text | undefined
  let text = ''
  for (const part of lineParts(body)) {
    if (part) {
      first ??= part
      last = part
      text += part.data
    } else if (first && last) {
      if (text.trim()) yield { first, last, text }
      first = last = undefined
      text = ''
    }
  }
  if (first && last && text.trim()) yield { first, last, text }
}

// undefined means there was no verified divider. null means the message has an
// ambiguous tail, so a weaker quote marker must not hide it either.
function dividerBoundary(body: HTMLElement): Node | null | undefined {
  let divider: Text | undefined
  let headers = ''
  for (const line of mailLines(body)) {
    if (originalMailDivider.test(line.text.replace(/[\u200b\ufeff]/g, ''))) {
      divider = line.first
      headers = ''
      continue
    }
    if (!divider) continue
    headers += ' ' + line.text
    if (!hasOriginalHeaders(headers)) {
      if (headers.length > 900) divider = undefined
      continue
    }

    // A container with only the divider and headers can end before the old body.
    // A container already holding quoted content followed by a postscript is ambiguous.
    const end = line.last.parentElement?.closest('tr') ?? line.last
    for (let el = divider.parentElement; el && el !== body; el = el.parentElement) {
      if (el.contains(end) && contentFollows(end, el) && contentFollows(el, body)) return null
    }
    for (const quote of body.querySelectorAll('blockquote')) {
      if (
        !quote.contains(divider) &&
        divider.compareDocumentPosition(quote) & Node.DOCUMENT_POSITION_FOLLOWING
      ) {
        if (contentFollows(quote, body)) return null
        break
      }
    }
    return divider
  }
}

// Work only in the sanitized, sandboxed mail document. Keep the entire original DOM for expansion.
export function replyPrefix(doc: Document): DocumentFragment | undefined {
  const body = doc.body
  const range = doc.createRange()
  const wrapped = body.querySelector(
    'blockquote[type="cite" i], .gmail_quote, .yahoo_quoted, .protonmail_quote',
  )
  const divider = dividerBoundary(body)
  if (divider === null) return
  let boundary: Node | undefined = divider
  if (
    wrapped &&
    (!divider ||
      wrapped.contains(divider) ||
      wrapped.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING)
  ) {
    boundary = wrapped
    // Replies below or interleaved with a quote must remain readable.
    if (contentFollows(wrapped, body)) return
    // Some clients leave user edits inside their quote container, beside an inner blockquote.
    if (!wrapped.matches('blockquote')) {
      const inner = wrapped.querySelector('blockquote')
      if (inner && contentFollows(inner, wrapped)) return
      if (inner) boundary = inner
    }
    let previous = boundary.previousSibling
    while (previous && !hasContent(previous)) previous = previous.previousSibling
    if (
      previous?.nodeType === Node.ELEMENT_NODE &&
      (previous as Element).matches('.gmail_attr, .moz-cite-prefix')
    )
      boundary = previous
  } else if (!boundary) {
    const outlook = body.querySelector('[id="divRplyFwdMsg" i]')
    if (outlook && hasOriginalHeaders(outlook.textContent ?? '') && !body.querySelector('blockquote'))
      boundary = outlook
  }
  if (!boundary) return
  range.selectNodeContents(body)
  range.setEndBefore(boundary)
  return range.cloneContents()
}
