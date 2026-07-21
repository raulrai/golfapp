'use client'
import { liveMatches, liveAutoPress, playerName } from '@/lib/golf/game'
import { useTracksMoney } from '@/components/GroupProvider'
import type { Game } from '@/lib/golf/game'
import type { PlayerId } from '@/lib/golf/types'

export const shortSide = (game: Game, side: PlayerId[]) =>
  side.map((id) => playerName(game, id).split(' ')[0]).join('&')

/** Auto Press settles in matches. A money group prices those matches at the
 *  stake; a non-money group (Gazelle) shows the matches themselves, which is
 *  the same information without a phantom ₹0. */
export const apUnit = (matches: number, stake: number, tracksMoney: boolean) =>
  tracksMoney
    ? `₹${Math.abs(matches * stake).toLocaleString('en-IN')}`
    : `${Math.abs(matches)} match${Math.abs(matches) === 1 ? '' : 'es'}`

export default function MatchBar({ game, children }: { game: Game; children?: React.ReactNode }) {
  const tracksMoney = useTracksMoney()
  const showMatch = game.format === 'match' || game.format === 'both'
  const showAp = game.format === 'autopress' || game.format === 'both'
  const matches = showMatch ? liveMatches(game) : []
  const ap = showAp ? liveAutoPress(game) : null

  return (
    <div className="match-bar">
      {matches.map((m, i) => {
        const s = m.state
        const cls = s.thru === 0 || s.diff === 0 ? 'as' : s.diff > 0 ? 'up-a' : 'up-b'
        const lead = s.diff > 0 ? m.a : m.b
        const status = s.thru === 0
          ? '—'
          : s.decided
            ? (s.winner === 'half' ? 'HALVED' : `${shortSide(game, lead)} ${s.resultText}`)
            : (s.diff === 0 ? `${s.statusText} · ${s.thru}` : `${shortSide(game, lead)} ${s.statusText} · ${s.thru}`)
        return (
          <div className="mline" key={i}>
            <span className="mkind">{m.kind === 'fourball' ? '4-Ball' : 'Singles'}</span>
            <span className="mwho">{m.label}</span>
            <span className={`mstat ${cls}`}>{status}</span>
          </div>
        )
      })}
      {ap && (
        <div className={`ap-block ${matches.length ? 'ap-line' : ''}`}>
          <div className="mline ap-head">
            <span className="mkind">Auto Press</span>
            <span className="mwho">
              {ap.thru === 0
                ? 'starts at hole 1'
                : ap.leader
                  ? `${shortSide(game, ap.leader)} leads ${apUnit(ap.netMatchesToA, game.stake, tracksMoney)}`
                  : 'all square'}
            </span>
            {tracksMoney && <span className="mstat">@ ₹{game.stake}/match</span>}
          </div>
          {ap.bets.map((b) => (
            <div className="ap-bet" key={b.key}>
              <span className="ap-betlbl">{b.label}</span>
              <span className="ap-string">{b.thru === 0 ? '—' : b.string}</span>
              <span className={`ap-money ${b.settlement.netToA === 0 ? 'as' : b.settlement.netToA > 0 ? 'up-a' : 'up-b'}`}>
                {b.settlement.netToA === 0
                  ? 'level'
                  : `${shortSide(game, b.settlement.netToA > 0 ? game.teamA : game.teamB)} ${apUnit(b.settlement.netToA, game.stake, tracksMoney)}`}
              </span>
            </div>
          ))}
          {children}
        </div>
      )}
    </div>
  )
}
