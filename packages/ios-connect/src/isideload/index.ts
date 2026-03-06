export { resolveBinary } from './binary.ts'
export {
  getDaemon,
  stopDaemon,
  configureDaemon,
  onDaemonEvent,
} from './daemon.ts'
export { IpcClient, type EventHandler } from './ipc.ts'

export * as auth from './commands/auth.ts'
export * as team from './commands/team.ts'
export * as cert from './commands/cert.ts'
export * as appId from './commands/app-id.ts'
export * as device from './commands/device.ts'
export * as sideloader from './commands/install.ts'
export * as screenshot from './commands/screenshot.ts'
export * as tunnel from './commands/tunnel.ts'
