export interface AdminAuthStatus {
  passwordSet: boolean
  loggedIn: boolean
}

export interface TokenRow {
  id: number
  name: string | null
  keyPrefix: string | null
  expiresAt: number | null
  lastUsedAt: number | null
  createdAt: number
}

export async function fetchAdminAuthStatus(): Promise<AdminAuthStatus> {
  const res = await fetch('/api/admin/')
  if (!res.ok) throw new Error('Failed to fetch auth status')
  return res.json()
}

export async function adminSetup(password: string): Promise<void> {
  const res = await fetch('/api/admin/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? 'Setup failed')
  }
}

export async function adminLogin(password: string): Promise<void> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? 'Login failed')
  }
}

export async function adminLogout(): Promise<void> {
  const res = await fetch('/api/admin/logout', { method: 'POST' })
  if (!res.ok) throw new Error('Logout failed')
}

export async function adminChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch('/api/admin/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? 'Password change failed')
  }
}

export async function fetchApiTokens(): Promise<TokenRow[]> {
  const res = await fetch('/api/tokens')
  if (!res.ok) throw new Error('Failed to fetch tokens')
  return res.json()
}

export async function createApiToken(
  name: string,
  expiresAt?: number
): Promise<{ id: number; name: string; key: string }> {
  const res = await fetch('/api/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, expiresAt }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? 'Failed to create token')
  }
  return res.json()
}

export async function renameApiToken(
  id: number,
  name: string
): Promise<void> {
  const res = await fetch(`/api/tokens/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) throw new Error('Failed to rename token')
}

export async function deleteApiToken(id: number): Promise<void> {
  const res = await fetch(`/api/tokens/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete token')
}
