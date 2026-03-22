import { homedir } from 'os'
import { join, dirname } from 'path'
import { mkdir } from 'fs/promises'
import { z } from 'zod'

import {
  DEFAULT_DEV_PORT,
  DEFAULT_PROD_PORT,
  DEFAULT_HOST,
} from '../consts/server.ts'

const ConfigSchema = z.object({
  server: z.object({
    port: z.number().int().min(1).max(65535),
    host: z.string(),
  }),
  wda: z.object({
    bundleId: z.string(),
  }),
})

const PersistedConfigSchema = z.object(
  Object.fromEntries(
    (
      Object.entries(ConfigSchema.shape) as [
        string,
        z.ZodObject<z.ZodRawShape>,
      ][]
    ).map(([k, v]) => [k, v.partial().optional()])
  )
) as z.ZodObject<{
  [K in keyof typeof ConfigSchema.shape]: z.ZodOptional<
    ReturnType<(typeof ConfigSchema.shape)[K]['partial']>
  >
}>

export type Config = z.infer<typeof ConfigSchema>
export type PersistedConfig = z.infer<typeof PersistedConfigSchema>

const DEFAULTS: Config = {
  server: {
    port: DEFAULT_PROD_PORT,
    host: DEFAULT_HOST,
  },
  wda: {
    bundleId: '',
  },
}

export function getConfigDir(): string {
  if (process.platform === 'win32') {
    const appData = Bun.env.APPDATA ?? homedir()
    return join(appData, 'tachibana')
  }
  return join(homedir(), '.local', 'state', 'tachibana')
}

function getConfigFilePath(): string {
  return join(getConfigDir(), 'config.json')
}

export async function readPersistedConfig(): Promise<PersistedConfig> {
  const path = getConfigFilePath()
  try {
    const text = await Bun.file(path).text()
    return PersistedConfigSchema.parse(JSON.parse(text))
  } catch {
    return {}
  }
}

function deepMerge(defaults: Config, overrides: PersistedConfig): Config {
  const result = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof Config)[]) {
    if (overrides[key])
      result[key] = { ...defaults[key], ...overrides[key] } as never
  }
  return result
}

function stripDefaults(overrides: PersistedConfig): PersistedConfig {
  const result: PersistedConfig = {}
  for (const [section, values] of Object.entries(overrides) as [
    keyof Config,
    Record<string, unknown>,
  ][]) {
    if (!values) continue
    const sectionDefaults = DEFAULTS[section] as Record<string, unknown>
    const stripped = Object.fromEntries(
      Object.entries(values).filter(([k, v]) => v !== sectionDefaults[k])
    )
    if (Object.keys(stripped).length > 0) result[section] = stripped as never
  }
  return result
}

export const getConfig = async (isDev?: boolean): Promise<Config> => {
  const persisted = await readPersistedConfig()
  const config = deepMerge(DEFAULTS, persisted)

  if (isDev) {
    config.server.port = DEFAULT_DEV_PORT
    config.server.host = 'localhost'
  }

  return config
}

export const setConfig = async (partial: PersistedConfig): Promise<void> => {
  const validated = PersistedConfigSchema.parse(partial)
  const existing = await readPersistedConfig()

  const merged: PersistedConfig = {}
  for (const key of Object.keys(DEFAULTS) as (keyof Config)[]) {
    if (existing[key] || validated[key]) {
      merged[key] = { ...existing[key], ...validated[key] } as never
    }
  }
  const cleaned = stripDefaults(merged)

  const path = getConfigFilePath()
  const dir = dirname(path)
  await mkdir(dir, { recursive: true })
  await Bun.write(path, JSON.stringify(cleaned, null, 2))
}
