import crypto from 'node:crypto'
import net from 'node:net'

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const MAX_PAYLOAD = 32 * 1024 * 1024

export interface DecodedFrame {
  fin: boolean
  opcode: number
  payload: Buffer
}

export function encodeFrame(opcode: number, payload: Buffer, mask: boolean): Buffer {
  const length = payload.length
  let headerLength = 2
  if (length >= 65536) headerLength += 8
  else if (length >= 126) headerLength += 2
  if (mask) headerLength += 4
  const out = Buffer.allocUnsafe(headerLength + length)
  out[0] = 0x80 | (opcode & 0x0f)
  let offset = 2
  if (length < 126) {
    out[1] = (mask ? 0x80 : 0) | length
  } else if (length < 65536) {
    out[1] = (mask ? 0x80 : 0) | 126
    out.writeUInt16BE(length, 2)
    offset = 4
  } else {
    out[1] = (mask ? 0x80 : 0) | 127
    out.writeUInt32BE(0, 2)
    out.writeUInt32BE(length, 6)
    offset = 10
  }
  if (mask) {
    const key = crypto.randomBytes(4)
    key.copy(out, offset)
    offset += 4
    for (let i = 0; i < length; i += 1) {
      out[offset + i] = payload[i]! ^ key[i & 3]!
    }
  } else if (length) {
    payload.copy(out, offset)
  }
  return out
}

export class FrameDecoder {
  private buffer = Buffer.alloc(0)
  private fragments: Buffer[] = []
  private fragmentOpcode = 1

  push(chunk: Buffer): DecodedFrame[] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk])
    const frames: DecodedFrame[] = []
    while (this.buffer.length >= 2) {
      const parsed = this.tryFrame()
      if (!parsed) break
      if (parsed.opcode === 0x0) {
        this.fragments.push(parsed.payload)
        if (parsed.fin) {
          frames.push({
            fin: true,
            opcode: this.fragmentOpcode,
            payload: Buffer.concat(this.fragments),
          })
          this.fragments = []
        }
        continue
      }
      if ((parsed.opcode === 0x1 || parsed.opcode === 0x2) && !parsed.fin) {
        this.fragmentOpcode = parsed.opcode
        this.fragments = [parsed.payload]
        continue
      }
      frames.push(parsed)
    }
    return frames
  }

  private tryFrame(): DecodedFrame | null {
    const buf = this.buffer
    const second = buf[1]!
    const masked = (second & 0x80) !== 0
    let length = second & 0x7f
    let offset = 2
    if (length === 126) {
      if (buf.length < 4) return null
      length = buf.readUInt16BE(2)
      offset = 4
    } else if (length === 127) {
      if (buf.length < 10) return null
      const high = buf.readUInt32BE(2)
      const low = buf.readUInt32BE(6)
      if (high !== 0 || low > MAX_PAYLOAD) {
        throw new Error('websocket payload too large')
      }
      length = low
      offset = 10
    }
    if (length > MAX_PAYLOAD) throw new Error('websocket payload too large')
    const maskLength = masked ? 4 : 0
    if (buf.length < offset + maskLength + length) return null
    const key = masked ? buf.subarray(offset, offset + 4) : null
    offset += maskLength
    const payload = Buffer.from(buf.subarray(offset, offset + length))
    if (key) {
      for (let i = 0; i < payload.length; i += 1) {
        payload[i] = payload[i]! ^ key[i & 3]!
      }
    }
    this.buffer = buf.subarray(offset + length)
    return { fin: (buf[0]! & 0x80) !== 0, opcode: buf[0]! & 0x0f, payload }
  }
}

export function acceptKey(secWebSocketKey: string): string {
  return crypto.createHash('sha1').update(secWebSocketKey + WS_GUID).digest('base64')
}

type MessageHandler = (text: string) => void
type CloseHandler = () => void

export class WsSocket {
  private readonly decoder = new FrameDecoder()
  private readonly messageHandlers: MessageHandler[] = []
  private readonly closeHandlers: CloseHandler[] = []
  private closed = false
  private readonly mask: boolean
  private readonly socket: net.Socket

  constructor(socket: net.Socket, mask: boolean) {
    this.socket = socket
    this.mask = mask
    socket.on('data', (chunk: Buffer) => {
      let frames: DecodedFrame[]
      try {
        frames = this.decoder.push(chunk)
      } catch {
        this.close()
        return
      }
      for (const frame of frames) this.onFrame(frame)
    })
    socket.on('close', () => this.markClosed())
    socket.on('error', () => this.close())
  }

  send(text: string): void {
    if (this.closed || this.socket.destroyed) return
    this.socket.write(encodeFrame(0x1, Buffer.from(text), this.mask))
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler)
    return () => {
      const index = this.messageHandlers.indexOf(handler)
      if (index >= 0) this.messageHandlers.splice(index, 1)
    }
  }

  onClose(handler: CloseHandler): void {
    this.closeHandlers.push(handler)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      if (!this.socket.destroyed) {
        this.socket.write(encodeFrame(0x8, Buffer.alloc(0), this.mask))
        this.socket.end()
      }
    } catch {
      // 对端已经断开
    }
    this.markClosed()
  }

  private onFrame(frame: DecodedFrame): void {
    if (frame.opcode === 0x8) {
      this.close()
      return
    }
    if (frame.opcode === 0x9) {
      if (!this.closed && !this.socket.destroyed) {
        this.socket.write(encodeFrame(0xa, frame.payload, this.mask))
      }
      return
    }
    if (frame.opcode === 0xa) return
    if (frame.opcode !== 0x1 && frame.opcode !== 0x2) return
    const text = frame.payload.toString('utf8')
    for (const handler of this.messageHandlers) handler(text)
  }

  private markClosed(): void {
    if (this.closeHandlers.length === 0 && this.closed) return
    this.closed = true
    const handlers = this.closeHandlers.splice(0)
    for (const handler of handlers) handler()
  }
}

export function acceptWebSocket(
  socket: net.Socket,
  head: Buffer,
  secWebSocketKey: string | undefined,
): WsSocket | null {
  if (!secWebSocketKey) {
    socket.destroy()
    return null
  }
  const accept = acceptKey(secWebSocketKey)
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n` +
      '\r\n',
  )
  socket.pause()
  if (head.length) socket.unshift(head)
  const ws = new WsSocket(socket, false)
  socket.resume()
  return ws
}

export function connectWebSocket(
  urlStr: string,
  headers: Record<string, string> = {},
): Promise<WsSocket> {
  const url = new URL(urlStr)
  const port = Number(url.port || 80)
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: url.hostname, port })
    const key = crypto.randomBytes(16).toString('base64')
    let buffered = Buffer.alloc(0)
    let settled = false
    const timer = setTimeout(() => fail(new Error(`websocket connect timeout ${urlStr}`)), 4000)
    const fail = (err: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      reject(err)
    }
    socket.once('error', fail)
    socket.once('connect', () => {
      const lines = [
        `GET ${url.pathname}${url.search} HTTP/1.1`,
        `Host: ${url.host}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
      ]
      for (const [name, value] of Object.entries(headers)) {
        lines.push(`${name}: ${value}`)
      }
      lines.push('', '')
      socket.write(lines.join('\r\n'))
    })
    const onData = (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk])
      const splitAt = buffered.indexOf('\r\n\r\n')
      if (splitAt < 0) return
      socket.off('data', onData)
      const header = buffered.subarray(0, splitAt).toString('utf8')
      const rest = buffered.subarray(splitAt + 4)
      if (!header.startsWith('HTTP/1.1 101') && !header.startsWith('HTTP/1.0 101')) {
        fail(new Error(`websocket upgrade failed: ${header.split('\r\n')[0]}`))
        return
      }
      socket.off('error', fail)
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.pause()
      const ws = new WsSocket(socket, true)
      if (rest.length) socket.unshift(rest)
      socket.resume()
      resolve(ws)
    }
    socket.on('data', onData)
  })
}
