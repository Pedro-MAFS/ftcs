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

// Work only in the sanitized, sandboxed mail document. Keep the entire original DOM for expansion.
export function replyPrefix(doc: Document): DocumentFragment | undefined {
  const body = doc.body
  const range = doc.createRange()
  const wrapped = body.querySelector(
    'blockquote[type="cite" i], .gmail_quote, .yahoo_quoted, .protonmail_quote',
  )
  let boundary: Node | null = wrapped
  if (wrapped) {
    // Replies below or interleaved with a quote must remain readable.
    if (contentFollows(wrapped, body)) return
    // Some clients leave user edits inside their quote container, beside an inner blockquote.
    if (!wrapped.matches('blockquote')) {
      const inner = wrapped.querySelector('blockquote')
      if (inner && contentFollows(inner, wrapped)) return
      if (inner) boundary = inner
    }
    let previous = boundary!.previousSibling
    while (previous && !hasContent(previous)) previous = previous.previousSibling
    if (
      previous?.nodeType === Node.ELEMENT_NODE &&
      (previous as Element).matches('.gmail_attr, .moz-cite-prefix')
    )
      boundary = previous
  } else {
    const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      if (!originalMailDivider.test(node.textContent ?? '')) continue
      let headers = ''
      while (headers.length < 900 && walker.nextNode()) {
        headers += (walker.currentNode.textContent ?? '').slice(0, 900) + '\n'
        if (hasOriginalHeaders(headers)) break
      }
      if (hasOriginalHeaders(headers)) {
        // A postscript outside a self-contained original-message block is authored content.
        let container = node.parentElement
        while (container && !container.contains(walker.currentNode)) container = container.parentElement
        if (container && !contentFollows(container, body)) boundary = node
      }
      break
    }
    const outlook = body.querySelector('[id="divRplyFwdMsg" i]')
    if (!boundary && outlook && hasOriginalHeaders(outlook.textContent ?? '')) boundary = outlook
    if (body.querySelector('blockquote')) return
  }
  if (!boundary) return
  range.selectNodeContents(body)
  range.setEndBefore(boundary)
  return range.cloneContents()
}
