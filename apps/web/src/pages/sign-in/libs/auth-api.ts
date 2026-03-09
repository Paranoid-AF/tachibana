export async function startSignIn(email: string, password: string) {
  const res = await fetch('/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message ?? 'Sign in failed')
  return body as { loggedIn: true } | { requiresTwoFa: true; type: string }
}

export async function submitTwoFa(code: string) {
  const res = await fetch('/api/auth/2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message ?? '2FA failed')
  return body as { loggedIn: true }
}
