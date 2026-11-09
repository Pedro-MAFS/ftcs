import assert from 'node:assert/strict'
import { isAdoptableTabUrl, isShellPageUrl } from '../../desktop/electron/browser-runtime/cdp-filter.ts'

for (const host of ['localhost', '127.0.0.1']) {
  for (const port of [5173, 5174]) {
    const url = `http://${host}:${port}/`
    const shell = isShellPageUrl(url)
    const adoptable = isAdoptableTabUrl(url, url)
    console.log(JSON.stringify({ url, shell, adoptable }))
    assert.equal(shell, port === 5173)
    assert.equal(adoptable, port !== 5173)
  }
}
