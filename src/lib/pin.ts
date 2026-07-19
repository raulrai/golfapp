/**
 * PIN hashing + stateless session tokens. Pure node:crypto — no Next imports —
 * so the node test runner (tests/auth.test.ts) can exercise it directly.
 *
 * pin_hash format: 's1$<saltHex>$<scryptHex>'
 * session token:   '<playerId>.<expiresAtMs>.<base64url hmac-sha256>'
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashPin(pin: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(pin, salt, 64)
  return `s1$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 's1' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signSession(playerId: number, expiresAtMs: number, secret: string): string {
  const payload = `${playerId}.${expiresAtMs}`
  return `${payload}.${sign(payload, secret)}`
}

/** Returns the playerId, or null if the token is malformed, tampered or expired. */
export function verifySessionToken(token: string, secret: string, now = Date.now()): number | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [pidStr, expStr, mac] = parts
  const expected = sign(`${pidStr}.${expStr}`, secret)
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const exp = Number(expStr)
  const pid = Number(pidStr)
  if (!Number.isInteger(pid) || !Number.isFinite(exp) || now >= exp) return null
  return pid
}
