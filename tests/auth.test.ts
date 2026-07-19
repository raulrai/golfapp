// Run with: node tests/auth.test.ts   (Node 26 strips TS types natively)
import { hashPin, verifyPin, signSession, verifySessionToken } from '../src/lib/pin.ts'

let pass = 0
let fail = 0
const ok = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`)
  cond ? pass++ : fail++
}

// ---------- PIN hashing ----------
const h = hashPin('1234')
ok('hashPin format s1$salt$hash', /^s1\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(h), h.slice(0, 20))
ok('verifyPin: correct PIN', verifyPin('1234', h))
ok('verifyPin: wrong PIN', !verifyPin('4321', h))
ok('verifyPin: garbage stored value', !verifyPin('1234', 'nonsense'))
ok('hashPin: salted (two hashes differ)', hashPin('1234') !== hashPin('1234'))

// ---------- Session tokens ----------
const secret = 'test-secret'
const exp = Date.now() + 60_000
const tok = signSession(42, exp, secret)
ok('token roundtrip', verifySessionToken(tok, secret) === 42)
ok('expired token rejected', verifySessionToken(signSession(42, Date.now() - 1, secret), secret) === null)
ok('tampered playerId rejected', verifySessionToken(tok.replace(/^42\./, '43.'), secret) === null)
ok('tampered mac rejected', verifySessionToken(tok.slice(0, -2) + 'zz', secret) === null)
ok('wrong secret rejected', verifySessionToken(tok, 'other-secret') === null)
ok('malformed token rejected', verifySessionToken('abc', secret) === null)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1
