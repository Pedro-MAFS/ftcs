const stubUrl = new URL('./electron-test-stub.mjs', import.meta.url).href

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') {
    return { url: stubUrl, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
