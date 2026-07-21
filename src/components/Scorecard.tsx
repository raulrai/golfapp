import { courseOf } from '@/lib/golf/game'
import type { Game } from '@/lib/golf/game'
import type { Hole } from '@/lib/golf/course'
import { isGuest } from '@/lib/golf/types'
import type { PlayerId } from '@/lib/golf/types'

/* Filled-out scorecard: front nine + back nine, gross coloured vs par.
   Shared by the Play screen (live) and History (a saved round). */
export default function Scorecard({ game }: { game: Game }) {
  const holes = courseOf(game).holes
  return (
    <div className="scorecard">
      <NineTable game={game} holes={holes.slice(0, 9)} label="OUT" />
      <NineTable game={game} holes={holes.slice(9, 18)} label="IN" grand />
      <div className="sc-legend">
        <span><i className="sc-key sc-eagle" />Eagle−</span>
        <span><i className="sc-key sc-birdie" />Birdie</span>
        <span><i className="sc-key sc-bogey" />Bogey</span>
        <span><i className="sc-key sc-dbl" />Dbl+</span>
      </div>
    </div>
  )
}

const relClass = (rel: number) =>
  rel <= -2 ? 'sc-eagle' : rel === -1 ? 'sc-birdie' : rel === 0 ? 'sc-par' : rel === 1 ? 'sc-bogey' : 'sc-dbl'

function NineTable({ game, holes, label, grand }: {
  game: Game; holes: Hole[]; label: 'OUT' | 'IN'; grand?: boolean
}) {
  const allHoles = courseOf(game).holes
  const sumGross = (pid: PlayerId, hs: Hole[]) => {
    let sum = 0, any = false
    for (const h of hs) {
      const s = game.scores[h.n]?.[pid]
      if (typeof s === 'number') { sum += s; any = true }
    }
    return any ? sum : null
  }
  const parSub = holes.reduce((a, h) => a + h.par, 0)
  const parAll = allHoles.reduce((a, h) => a + h.par, 0)

  return (
    <table className="sc-table">
      <thead>
        <tr>
          <th className="sc-name">{label === 'OUT' ? 'Front' : 'Back'}</th>
          {holes.map((h) => <th key={h.n}>{h.n}</th>)}
          <th className="sc-sub">{label}</th>
          {grand && <th className="sc-tot">Tot</th>}
        </tr>
        <tr className="sc-par-row">
          <th className="sc-name">Par</th>
          {holes.map((h) => <td key={h.n}>{h.par}</td>)}
          <td className="sc-sub">{parSub}</td>
          {grand && <td className="sc-tot">{parAll}</td>}
        </tr>
      </thead>
      <tbody>
        {game.players.map((p) => {
          const nineTot = sumGross(p.id, holes)
          const allTot = sumGross(p.id, allHoles)
          return (
            <tr key={p.id}>
              <th className="sc-name">
                {p.name.split(' ')[0]}
                {isGuest(p.id) && <span className="sc-guest" title="Guest">G</span>}
              </th>
              {holes.map((h) => {
                const s = game.scores[h.n]?.[p.id]
                const cls = typeof s === 'number' ? relClass(s - h.par) : ''
                return (
                  <td key={h.n} className={`sc-cell ${cls}`}>
                    {typeof s === 'number' ? <span className="sc-val">{s}</span> : ''}
                  </td>
                )
              })}
              <td className="sc-sub">{nineTot ?? '–'}</td>
              {grand && <td className="sc-tot">{allTot ?? '–'}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
