'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Game } from '@/lib/golf/game'
import { applyOp, opKey } from '@/lib/live'
import type { LiveOp, LiveRoundStatus } from '@/lib/live'

const POLL_MS = 4000
const RETRY_MIN_MS = 2000
const RETRY_MAX_MS = 30000
const CACHE_KEY = 'golf_live_round_cache'

export const LIVE_ID_KEY = 'golf_live_round_id'

export interface LiveRound {
  /** Server state with our pending (unacked) ops overlaid — safe to render directly. */
  game: Game | null
  status: 'loading' | LiveRoundStatus | 'gone'
  /** The persisted rounds.id, once finished. */
  roundId: number | null
  /** How many local ops are still waiting to reach the server. */
  pendingCount: number
  mutate: (op: LiveOp) => void
  finish: () => Promise<{ roundId: number } | { error: string }>
  discard: () => Promise<{ ok: boolean; error?: string }>
}

interface ServerState {
  game: Game | null
  version: number
  status: LiveRound['status']
  roundId: number | null
}

interface PendingEntry {
  key: string
  op: LiveOp
  /** Server version returned when the op was acked. The op stays overlaid until
   *  a poll delivers a game at ≥ this version (which provably includes it) —
   *  otherwise a poll racing the ack would briefly un-render the tap. */
  acked?: number
}

function initialState(id: number | null): ServerState {
  // Instant paint from the last cached snapshot before the first poll returns.
  if (id !== null && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const cached = JSON.parse(raw) as { id: number; game: Game }
        if (cached.id === id) return { game: cached.game, version: 0, status: 'loading', roundId: null }
      }
    } catch { /* cold start is fine */ }
  }
  return { game: null, version: 0, status: 'loading', roundId: null }
}

/** Live-synced round: optimistic local ops + a 4s poll while visible.
 *  Your own taps render instantly and are never bounced by a poll; ops queue
 *  and retry with backoff when offline, so scoring keeps working in a signal
 *  dead zone and flushes when the connection returns. */
export function useLiveRound(id: number | null): LiveRound {
  const [attachedId, setAttachedId] = useState(id)
  const [server, setServer] = useState<ServerState>(() => initialState(id))
  const [pending, setPending] = useState<PendingEntry[]>([])
  // Mirrors for async callbacks (never read during render).
  const versionRef = useRef(0)
  const pendingRef = useRef<PendingEntry[]>([])
  const sendingRef = useRef(false)
  const backoffRef = useRef(RETRY_MIN_MS)
  const retryAtRef = useRef(0)

  // Reset when the hook is pointed at a different round (React's guarded
  // adjust-state-during-render pattern; the refs reset in the poll effect).
  if (id !== attachedId) {
    setAttachedId(id)
    setServer(initialState(id))
    setPending([])
  }

  const applyServer = useCallback((data: {
    version: number; status: LiveRoundStatus; changed?: boolean; game?: Game; roundId?: number | null
  }) => {
    if (data.changed !== false && data.game) {
      versionRef.current = data.version
      // This game state includes every op acked at or below its version.
      pendingRef.current = pendingRef.current.filter(
        (e) => e.acked === undefined || e.acked > data.version,
      )
      setPending(pendingRef.current)
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ id, game: data.game }))
      } catch { /* cache is best-effort */ }
    }
    setServer((s) => ({
      game: data.changed !== false && data.game ? data.game : s.game,
      version: data.version,
      status: data.status,
      roundId: data.roundId != null ? data.roundId : s.roundId,
    }))
  }, [id])

  const pump = useCallback(async () => {
    if (sendingRef.current || id === null) return
    if (Date.now() < retryAtRef.current) return
    sendingRef.current = true
    try {
      for (;;) {
        const entry = pendingRef.current.find((e) => e.acked === undefined)
        if (!entry) break
        let res: Response
        try {
          res = await fetch(`/api/live-rounds/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry.op),
          })
        } catch {
          // Offline — everything stays queued; the poll tick retries after a backoff.
          retryAtRef.current = Date.now() + backoffRef.current
          backoffRef.current = Math.min(backoffRef.current * 2, RETRY_MAX_MS)
          return
        }
        backoffRef.current = RETRY_MIN_MS
        retryAtRef.current = 0
        if (res.ok) {
          const data = await res.json()
          // Keep the op overlaid (and versionRef untouched) — the next poll
          // fetches the full game at ≥ this version and prunes it.
          entry.acked = Number(data.version)
          setPending([...pendingRef.current])
        } else if (res.status === 409) {
          // Round finished/discarded under us — drop the queue and surface it.
          const data = await res.json().catch(() => ({}))
          pendingRef.current = []
          setPending([])
          setServer((s) => ({
            ...s,
            status: (data.status as LiveRoundStatus) ?? 'gone',
            roundId: data.roundId != null ? Number(data.roundId) : s.roundId,
          }))
        } else {
          // 400/401/403 — the op is invalid for us; dropping beats an infinite loop.
          pendingRef.current = pendingRef.current.filter((e) => e !== entry)
          setPending(pendingRef.current)
        }
      }
    } finally {
      sendingRef.current = false
    }
  }, [id])

  const poll = useCallback(async () => {
    if (id === null) return
    try {
      const res = await fetch(`/api/live-rounds/${id}?v=${versionRef.current}`)
      if (res.status === 404) {
        setServer((s) => ({ ...s, status: 'gone' }))
        return
      }
      if (!res.ok) return
      applyServer(await res.json())
    } catch { /* offline — next tick will retry */ }
  }, [id, applyServer])

  useEffect(() => {
    versionRef.current = 0
    pendingRef.current = []
    backoffRef.current = RETRY_MIN_MS
    retryAtRef.current = 0
    if (id === null) return
    const t0 = setTimeout(poll, 0)
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      poll()
      if (pendingRef.current.length > 0) pump()
    }, POLL_MS)
    const onWake = () => {
      if (document.visibilityState === 'visible') { poll(); pump() }
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onWake)
    return () => {
      clearTimeout(t0)
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onWake)
    }
  }, [id, poll, pump])

  const mutate = useCallback((op: LiveOp) => {
    const key = opKey(op)
    pendingRef.current = [...pendingRef.current.filter((e) => e.key !== key), { key, op }]
    setPending(pendingRef.current)
    pump()
  }, [pump])

  const finish = useCallback(async (): Promise<{ roundId: number } | { error: string }> => {
    if (id === null) return { error: 'No live round' }
    // Flush queued scores first so the persisted card is complete (acked
    // entries are already on the server — only unacked ones block a save).
    await pump()
    if (pendingRef.current.some((e) => e.acked === undefined)) {
      return { error: 'Some scores have not synced yet — check your signal and try again' }
    }
    try {
      const res = await fetch(`/api/live-rounds/${id}/finish`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { error: data.error ?? 'Save failed' }
      const roundId = Number(data.roundId)
      setServer((s) => ({ ...s, status: 'finished', roundId }))
      return { roundId }
    } catch {
      return { error: 'Network error — try again' }
    }
  }, [id, pump])

  const discard = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (id === null) return { ok: false, error: 'No live round' }
    try {
      const res = await fetch(`/api/live-rounds/${id}/discard`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: data.error ?? 'Discard failed' }
      pendingRef.current = []
      setPending([])
      setServer((s) => ({ ...s, status: 'discarded' }))
      return { ok: true }
    } catch {
      return { ok: false, error: 'Network error — try again' }
    }
  }, [id])

  const game = useMemo(() => {
    let g = server.game
    if (g) for (const { op } of pending) g = applyOp(g, op)
    return g
  }, [server.game, pending])

  return {
    game,
    status: server.status,
    roundId: server.roundId,
    pendingCount: pending.filter((e) => e.acked === undefined).length,
    mutate,
    finish,
    discard,
  }
}

export function loadLiveRoundId(): number | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(LIVE_ID_KEY)
  return raw ? Number(raw) : null
}

export function saveLiveRoundId(id: number | null): void {
  if (typeof window === 'undefined') return
  if (id === null) {
    localStorage.removeItem(LIVE_ID_KEY)
    localStorage.removeItem(CACHE_KEY)
  } else {
    localStorage.setItem(LIVE_ID_KEY, String(id))
  }
}
