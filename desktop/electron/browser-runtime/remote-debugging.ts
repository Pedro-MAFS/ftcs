import net from 'node:net'
import { app } from 'electron'

export function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((err) => (err ? reject(err) : resolve(port)))
    })
  })
}

/** 必须在 app.whenReady() 之前调用，否则调试端口不会打开。 */
export function installRemoteDebuggingSwitch(port: number): void {
  const origin = `http://127.0.0.1:${port}`
  app.commandLine.appendSwitch('remote-debugging-port', String(port))
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  app.commandLine.appendSwitch('remote-allow-origins', origin)
}
