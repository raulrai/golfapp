'use client'
import { hole18Scenarios } from '@/lib/golf/whatif'
import type { Game } from '@/lib/golf/game'
import { shortSide } from '@/components/MatchBar'

/** After the 17th hole: what each possible 18th-hole result does to the
 *  Auto Press money. Shown automatically once, reopenable from the match bar. */
export default function WhatIfSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const scenarios = hole18Scenarios(game)
  if (!scenarios) return null

  const label = (outcome: 'A' | 'H' | 'B') =>
    outcome === 'H' ? 'If the 18th is halved' : `If ${shortSide(game, outcome === 'A' ? game.teamA : game.teamB)} win the 18th`

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grip" />
        <h2>The 18th decides</h2>
        <div className="end-note">
          17 holes in — here&apos;s where the Auto Press money lands on every possible finish
          (front 9 is already settled). @ ₹{game.stake}/match.
        </div>
        {scenarios.map((s) => (
          <div key={s.outcome} className="ap-block" style={{ marginBottom: 14 }}>
            <div className="mline ap-head">
              <span className="mwho" style={{ fontWeight: 700 }}>{label(s.outcome)}</span>
            </div>
            {s.bets.map((b) => (
              <div className="ap-bet" key={b.key} style={b.key === 'front' ? { opacity: 0.55 } : undefined}>
                <span className="ap-betlbl">{b.label}</span>
                <span className="ap-string">{b.thru === 0 ? '—' : b.string}</span>
                <span className={`ap-money ${b.settlement.netToA === 0 ? 'as' : b.settlement.netToA > 0 ? 'up-a' : 'up-b'}`}>
                  {b.settlement.netToA === 0
                    ? 'level'
                    : `${shortSide(game, b.settlement.netToA > 0 ? game.teamA : game.teamB)} ₹${Math.abs(b.settlement.netToA * game.stake).toLocaleString('en-IN')}`}
                </span>
              </div>
            ))}
            <div className="mline" style={{ marginTop: 4 }}>
              <span className="mkind">Net</span>
              <span className={`mstat ${s.moneyToA === 0 ? 'as' : s.moneyToA > 0 ? 'up-a' : 'up-b'}`} style={{ fontWeight: 800 }}>
                {s.moneyToA === 0
                  ? 'all square — no money moves'
                  : `${shortSide(game, s.moneyToA > 0 ? game.teamA : game.teamB)} collect ₹${Math.abs(s.moneyToA).toLocaleString('en-IN')}`}
              </span>
            </div>
          </div>
        ))}
        <button className="primary" onClick={onClose}>Play the 18th</button>
      </div>
    </div>
  )
}
