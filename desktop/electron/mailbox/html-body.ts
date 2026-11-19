import sanitizeHtml from 'sanitize-html'

// The result is a fragment for the sandboxed mail reader, never for the application document.
export function readableHtml(source: string) {
  let remoteImages = false
  const fragment = sanitizeHtml(source, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      'style',
      'img',
      'font',
      'center',
      's',
      'strike',
      'u',
      'sup',
      'sub',
      'caption',
    ],
    allowVulnerableTags: true, // Stylesheets are scoped by the reader iframe.
    allowedAttributes: {
      '*': ['class', 'id', 'style', 'dir', 'lang', 'align', 'valign', 'width', 'height', 'bgcolor'],
      table: ['cellpadding', 'cellspacing', 'border'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
      font: ['face', 'size', 'color'],
      img: ['src', 'alt', 'title'],
      a: ['data-mail-link', 'role', 'tabindex'],
    },
    parseStyleAttributes: false,
    allowedSchemes: ['https', 'http'],
    allowedSchemesByTag: { img: ['https', 'http', 'data'] },
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => {
        const { href, ...rest } = attributes
        delete rest['data-mail-link']
        if (/^https?:\/\//i.test(href ?? ''))
          Object.assign(rest, { 'data-mail-link': href, role: 'link', tabindex: '0' })
        return { tagName: 'a', attribs: rest }
      },
      img: (_tag, attributes) => {
        let src = attributes.src?.trim() ?? ''
        if (src.startsWith('//')) src = 'https:' + src
        if (/^https?:\/\//i.test(src)) remoteImages = true
        else if (!/^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon);base64,/i.test(src)) src = ''
        const attribs = { ...attributes }
        if (src) attribs.src = src
        else delete attribs.src
        return { tagName: 'img', attribs }
      },
    },
  })
  // CSS background images share the same per-message consent as ordinary images.
  remoteImages ||= /(?:url|image-set)\s*\(\s*["']?(?:https?:)?\/\//i.test(fragment)
  return { fragment, remoteImages }
}
