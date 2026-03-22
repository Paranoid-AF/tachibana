export const TOKEN_PREFIX = 'sk-tb-v1-'
export const JWT_SECRET_NAME = 'jwt-secret'
export const CREDENTIALS_SECRET_NAME = 'apple-credentials'
export const SESSION_SECRET_NAME = 'apple-session'

export const AUTH_TYPE = {
  PASSWORD: 'password',
  TOKEN: 'token',
} as const

export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds
export const JWT_EXPIRY = '7d'
