import { spawn, type ChildProcess } from 'node:child_process'
import { resolveBinary } from './binary.ts'
import { IpcClient, type EventHandler } from './ipc.ts'

interface DaemonOptions {
  /** Override path to kani-isideload binary */
  binaryPath?: string
  /** Data directory for persistent storage (certs, keys) */
  dataDir?: string
  /** Override anisette WebSocket server URL */
  anisetteUrl?: string
}

interface DaemonInstance {
  proc: ChildProcess
  ipc: IpcClient
}

let instance: DaemonInstance | null = null
let globalEventHandler: EventHandler | null = null
let options: DaemonOptions = {}

/** Configure daemon options (call before first getDaemon) */
export function configureDaemon(opts: DaemonOptions): void {
  options = opts
}

/** Set a global event handler for daemon events (2fa, progress) */
export function onDaemonEvent(handler: EventHandler): void {
  globalEventHandler = handler
  if (instance) {
    instance.ipc.onEvent(handler)
  }
}

let readyPromise: Promise<IpcClient> | null = null

/** Get or spawn the singleton daemon, waiting for it to be ready */
export async function getDaemon(): Promise<IpcClient> {
  if (instance && !instance.proc.killed) {
    return instance.ipc
  }

  // If already spawning, wait for the existing readiness probe
  if (readyPromise) return readyPromise

  const binary = resolveBinary(options.binaryPath)
  const args: string[] = []

  if (options.dataDir) {
    args.push('--data-dir', options.dataDir)
  }
  if (options.anisetteUrl) {
    args.push('--anisette-url', options.anisetteUrl)
  }

  const proc = spawn(binary, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  proc.on('error', err => {
    console.error(`[kani-isideload] Failed to spawn daemon: ${err.message}`)
    console.error(`[kani-isideload] Binary path: ${binary}`)
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString()
    if (text.includes('"level":"ERROR"') || text.includes('"level":"WARN"')) {
      process.stderr.write(chunk)
    } else if (process.env.DEBUG) {
      process.stderr.write(chunk)
    }
  })

  const ipc = new IpcClient(proc)

  if (globalEventHandler) {
    ipc.onEvent(globalEventHandler)
  }

  proc.on('close', code => {
    if (code !== 0 && code !== null) {
      console.error(`[kani-isideload] Daemon exited with code ${code}`)
    }
    ipc.dispose()
    if (instance?.proc === proc) {
      instance = null
    }
  })

  instance = { proc, ipc }

  // Wait for daemon readiness by probing with a no-op request
  readyPromise = ipc
    .request<unknown>('getSessionInfo', {}, 10_000)
    .then(() => ipc)
    .catch(err => {
      instance = null
      throw new Error(
        `Daemon failed to start: ${err instanceof Error ? err.message : err}`
      )
    })
    .finally(() => {
      readyPromise = null
    })

  return readyPromise
}

/** Stop the daemon */
export async function stopDaemon(): Promise<void> {
  const inst = instance
  if (!inst || inst.proc.killed) {
    instance = null
    return
  }

  instance = null

  try {
    await inst.ipc.request('shutdown', {}, 5_000)
  } catch {
    // Daemon may have already exited
  }

  inst.ipc.dispose()
  inst.proc.kill()
}
