const SERVICE = 'tachibana'
const NAME = 'apple-credentials'

// Bun.secrets is available at runtime but may lack TypeScript definitions
const secrets = (Bun as any).secrets as
  | {
      get(opts: { service: string; name: string }): Promise<string | null>
      set(opts: { service: string; name: string; value: string }): Promise<void>
      delete(opts: { service: string; name: string }): Promise<boolean>
    }
  | undefined

export async function saveCredentials(
  email: string,
  password: string
): Promise<void> {
  try {
    await secrets?.set({
      service: SERVICE,
      name: NAME,
      value: JSON.stringify({ email, password }),
    })
  } catch {
    // Bun.secrets unavailable (e.g. headless Linux) — silently skip
  }
}

export async function getCredentials(): Promise<{
  email: string
  password: string
} | null> {
  try {
    const raw = await secrets?.get({ service: SERVICE, name: NAME })
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function clearCredentials(): Promise<void> {
  try {
    await secrets?.delete({ service: SERVICE, name: NAME })
  } catch {
    // Bun.secrets unavailable — silently skip
  }
}
