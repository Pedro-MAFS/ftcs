import * as nodeModule from 'node:module'

type ResolveHook = (
  specifier: string,
  context: { parentURL?: string },
  next: (specifier: string, context: { parentURL?: string }) => { url: string; shortCircuit?: boolean },
) => { url: string; shortCircuit?: boolean; format?: string }

const registerHooks = (
  nodeModule as unknown as {
    registerHooks?: (hooks: { resolve: ResolveHook }) => void
  }
).registerHooks

export const electronMockReady = typeof registerHooks === 'function'

if (registerHooks) {
  const mockUrl = new URL('./electron-mock.mjs', import.meta.url).href
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'electron') {
        return { url: mockUrl, shortCircuit: true, format: 'module' }
      }
      return nextResolve(specifier, context)
    },
  })
}
