import type { ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'

/** IPC request sent to daemon */
interface IpcRequest {
  id: string
  method: string
  params: Record<string, unknown>
}

/** IPC success response from daemon */
interface IpcSuccess {
  id: string
  result: unknown
}

/** IPC error response from daemon */
interface IpcError {
  id: string
  error: { code: string; message: string }
}

/** Unsolicited event from daemon */
interface IpcEvent {
  event: string
  data: Record<string, unknown>
}

type IpcMessage = IpcSuccess | IpcError | IpcEvent

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export type EventHandler = (
  event: string,
  data: Record<string, unknown>
) => void

const DEFAULT_TIMEOUT_MS = 30_000

export class IpcClient {
  private pending = new Map<string, PendingRequest>()
  private buffer = ''
  private eventHandler: EventHandler | null = null
  private proc: ChildProcess

  constructor(proc: ChildProcess) {
    this.proc = proc
    proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString()
      this.processLines()
    })
  }

  /** Register a handler for unsolicited events (2fa, progress, etc.) */
  onEvent(handler: EventHandler): void {
    this.eventHandler = handler
  }

  /** Send a request and wait for the correlated response */
  async request<T>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Promise<T> {
    const id = randomUUID()
    const msg: IpcRequest = { id, method, params }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(
          new Error(`IPC request timed out after ${timeoutMs}ms: ${method}`)
        )
      }, timeoutMs)

      this.pending.set(id, {
        resolve: resolve as (v: unknown) => void,
        reject,
        timer,
      })

      const line = JSON.stringify(msg) + '\n'
      this.proc.stdin!.write(line)
    })
  }

  private processLines(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      let msg: IpcMessage
      try {
        msg = JSON.parse(trimmed)
      } catch {
        continue
      }

      if ('event' in msg) {
        // Unsolicited event
        this.eventHandler?.(msg.event, msg.data)
      } else if ('id' in msg) {
        const pending = this.pending.get(msg.id)
        if (!pending) continue
        this.pending.delete(msg.id)
        clearTimeout(pending.timer)

        if ('error' in msg) {
          pending.reject(new Error(`[${msg.error.code}] ${msg.error.message}`))
        } else {
          pending.resolve(msg.result)
        }
      }
    }
  }

  /** Clean up: reject all pending requests */
  dispose(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(new Error('IPC client disposed'))
      this.pending.delete(id)
    }
  }
}
