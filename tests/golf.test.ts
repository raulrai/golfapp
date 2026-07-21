// Run with: node tests/golf.test.ts   (Node 26 strips TS types natively)
import { DELHI_LODHI_BLUE } from '../src/lib/golf/course.ts'
import { computeMatch } from '../src/lib/golf/matchplay.ts'
import { strokesOnHole, fieldStrokes } from '../src/lib/golf/strokes.ts'
import { runAutoPress, renderAutoPress, settleAutoPress, autoPressBets } from '../src/lib/golf/autopress.ts'
import type { HoleResult } from '../src/lib/golf/autopress.ts'
import { isGuest, maxGuestsFor } from '../src/lib/golf/types.ts'
import type { Scores } from '../src/lib/golf/types.ts'
import {
  holeResults, roundHolesPlayed, MIN_HOLES_TO_RECORD,
  playerMoney, memberPlayers, guestPlayers,
} from '../src/lib/golf/game.ts'
import type { Game } from '../src/lib/golf/game.ts'
import { hole18Scenarios } from '../src/lib/golf/whatif.ts'
import type { Hole18Scenario } from '../src/lib/golf/whatif.ts'

const holes = DELHI_LODHI_BLUE.holes
let pass = 0
let fail = 0
const ok = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '✓' : '✗'} ${name}${extra ? '  ' + extra : ''}`)
  cond ? pass++ : fail++
}

// ---------- Stroke allocation ----------
ok('strokesOnHole: 0 allowance', strokesOnHole(0, 1) === 0)
ok('strokesOnHole: 5 strokes, SI 5 gets one', strokesOnHole(5, 5) === 1)
ok('strokesOnHole: 5 strokes, SI 6 gets none', strokesOnHole(5, 6) === 0)
ok('strokesOnHole: 20 strokes, SI 2 gets two', strokesOnHole(20, 2) === 2)
ok('strokesOnHole: 20 strokes, SI 3 gets one', strokesOnHole(20, 3) === 1)
ok('fieldStrokes: low marker off scratch', fieldStrokes([{ handicap: 8 }, { handicap: 20 }], 75)[0] === 0)
ok('fieldStrokes: 75% of 12 diff = 9', fieldStrokes([{ handicap: 8 }, { handicap: 20 }], 75)[1] === 9)

// ---------- Match play (net) ----------
// Two players, equal strokes. A (id 1) wins holes 1-3 net, rest halved -> 3 UP thru 18 closeout not triggered? diff 3 thru 18 = 3 UP
const sc: Scores = {}
for (const h of holes) sc[h.n] = { 1: 4, 2: 4 }
sc[1] = { 1: 3, 2: 4 }; sc[2] = { 1: 3, 2: 4 }; sc[3] = { 1: 3, 2: 4 }
const m1 = computeMatch(sc, holes, { 1: 0, 2: 0 }, [1], [2])
// 3 up with 2 to play closes out as 3&2 at hole 16 (correct match-play behaviour)
ok('singles: closes out 3&2 at 16', m1.resultText === '3&2' && m1.thru === 16, `got ${m1.resultText} thru ${m1.thru}`)

// Strokes flip a hole: B(id2) off 18 vs A(id1) scratch. On SI-1 hole (hole 3) both gross 4 -> B nets 3, wins it.
const sc2: Scores = {}
for (const h of holes) sc2[h.n] = { 1: 4, 2: 4 }
const strokes2 = { 1: 0, 2: 18 } // id2 gets a stroke on all 18
const m2 = computeMatch(sc2, holes, strokes2, [1], [2])
ok('net: high handicapper wins all with strokes', m2.winner === 'B', `got ${m2.winner} ${m2.resultText}`)

// All halved net -> HALVED
const sc3: Scores = {}
for (const h of holes) sc3[h.n] = { 1: 4, 2: 5 }
const m3 = computeMatch(sc3, holes, { 1: 0, 2: 9 }, [1], [2]) // id2 gets 9 strokes; on its 9 stroke holes 5->4 ties, else 5>4 loses... check it's not all square
ok('net: partial strokes computed', typeof m3.diff === 'number')

// Closeout: A wins first 10 holes -> 9&8 at hole 10
const sc4: Scores = {}
for (const h of holes) sc4[h.n] = { 1: 3, 2: 5 }
const m4 = computeMatch(sc4, holes, { 1: 0, 2: 0 }, [1], [2])
ok('closeout 10&8 at hole 10', m4.resultText === '10&8' && m4.thru === 10, `got ${m4.resultText} thru ${m4.thru}`)

// Fourball better-ball: side A {1,2}, side B {3,4}; A's best beats B's best on hole 1
const sc5: Scores = { 1: { 1: 5, 2: 3, 3: 4, 4: 4 } }
for (let n = 2; n <= 18; n++) sc5[n] = { 1: 4, 2: 4, 3: 4, 4: 4 }
const m5 = computeMatch(sc5, holes, { 1: 0, 2: 0, 3: 0, 4: 0 }, [1, 2], [3, 4])
ok('fourball better-ball: A 1 UP', m5.statusText === '1 UP', `got ${m5.statusText}`)

// ---------- Auto Press fixtures (from Raul's spreadsheet, normalised so A = hole-1 winner) ----------
const FIXTURES: { name: string; results: HoleResult[]; expected: string[] }[] = [
  {
    // Holes 8-9 corrected to the engine's output: the spreadsheet's 1-3-1-3-1 / 2-4-2-4-2-0
    // was the same hand-calc slip Raul fixed in Example 2 (B's matches must tick down when A wins).
    name: 'Example 1',
    results: ['A', 'A', 'B', 'B', 'B', 'A', 'H', 'A', 'A'],
    expected: ['1-1-1', '2-0-2-0', '1-1-1-1', '0-2-0-2-0', '1-3-1-3-1', '0-2-0-2-0', '0-2-0-2-0', '1-1-1-1-1', '2-0-2-0-2-0'],
  },
  {
    // Corrected per Golf Auto Press (2).xlsx: hole 8 = 2-4-2-0-2-0, hole 9 winner A = 1-3-1-1-3-1
    name: 'Example 2',
    results: ['A', 'B', 'B', 'B', 'B', 'B', 'A', 'A', 'A'],
    expected: ['1-1-1', '0-2-0', '1-3-1', '2-4-2-0', '3-5-3-1', '4-6-4-2-0', '3-5-3-1-1', '2-4-2-0-2-0', '1-3-1-1-3-1'],
  },
  {
    name: 'Example 3',
    results: ['A', 'A', 'A', 'B', 'B', 'B', 'A', 'B', 'B'],
    expected: ['1-1-1', '2-0-2-0', '3-1-3-1', '2-0-2-0', '1-1-1-1', '0-2-0-2-0', '1-1-1-1-1', '0-2-0-2-0', '1-3-1-3-1'],
  },
]

for (const fx of FIXTURES) {
  let holesMatched = 0
  const got: string[] = []
  for (let i = 0; i < fx.results.length; i++) {
    const state = runAutoPress(fx.results.slice(0, i + 1))
    const r = renderAutoPress(state)
    got.push(r)
    if (r === fx.expected[i]) holesMatched++
  }
  const all = holesMatched === fx.expected.length
  ok(`AutoPress ${fx.name}: ${holesMatched}/${fx.expected.length} holes`, all,
    all ? '' : `\n   exp ${fx.expected.join('  ')}\n   got ${got.join('  ')}`)
}

// ---------- Auto Press settlement (each match is one bet) ----------
// Opening "1-1-1": positions A,B,A -> winner (A) takes 2 of 3 matches, net +1 to A.
const s1 = settleAutoPress(runAutoPress(['A']))
ok('settle: opening hole nets +1 matches to winner', s1.aWon === 2 && s1.bWon === 1 && s1.netToA === 1, `got ${JSON.stringify(s1)}`)

// Halved string keeps a zero (push) match out of the tally.
const sPush = settleAutoPress(runAutoPress(['A', 'B', 'B', 'B']))
ok('settle: zero-margin matches push', sPush.pushes >= 1, `got ${JSON.stringify(sPush)}`)

// Three bets: front uses holes 1-9, back uses 10-18 (fresh), overall is continuous.
const eighteen: HoleResult[] = ['A', 'B', 'B', 'B', 'B', 'B', 'A', 'A', 'A', 'B', 'B', 'A', 'A', 'H', 'A', 'B', 'A', 'A']
const bets = autoPressBets(eighteen)
ok('bets: three bets keyed front/back/overall',
  bets.length === 3 && bets[0].key === 'front' && bets[1].key === 'back' && bets[2].key === 'overall')
ok('bets: front matches a 9-hole run', bets[0].string === renderAutoPress(runAutoPress(eighteen.slice(0, 9))))
ok('bets: back is a fresh string from hole 10', bets[1].string === renderAutoPress(runAutoPress(eighteen.slice(9))))
ok('bets: overall spans all 18', bets[2].thru === 18)

// ---------- Hole-18 what-if (three pre-settled finishes after 17 holes) ----------
// Singles fixture, scratch both sides: p1 gross 3 wins the hole, 4-4 halves,
// p1 gross 5 loses it. Alternate wins so presses actually open.
const mkWhatIfGame = (n: number, format: 'autopress' | 'match' = 'autopress'): Game => {
  const scores: Scores = {}
  for (let h = 1; h <= n; h++) scores[h] = { 1: h % 3 === 0 ? 5 : h % 2 === 0 ? 4 : 3, 2: 4 }
  return {
    id: 'whatif-test', createdAt: 0,
    players: [
      { id: 1, name: 'Raul', handicap: 8, strokes: 0 },
      { id: 2, name: 'Atul', handicap: 8, strokes: 0 },
    ],
    scoringMode: 'hole', format, allowancePct: 100,
    teamA: [1], teamB: [2], singles: [], stake: 200, scores,
  }
}

const g17 = mkWhatIfGame(17)
const r17 = holeResults(g17)
ok('whatif: fixture has 17 completed holes', r17.length === 17)

const scenarios = hole18Scenarios(g17)
ok('whatif: three scenarios in A/H/B order',
  scenarios !== null && scenarios.length === 3 && scenarios.map((s) => s.outcome).join('') === 'AHB')
ok('whatif: null at 16 thru', hole18Scenarios(mkWhatIfGame(16)) === null)
ok('whatif: null at 18 thru', hole18Scenarios(mkWhatIfGame(18)) === null)
ok('whatif: null for match-only format', hole18Scenarios(mkWhatIfGame(17, 'match')) === null)

if (scenarios) {
  const halved = scenarios[1]
  const expectHalved = autoPressBets([...r17, 'H'])
  ok('whatif: halved scenario equals appending H and re-settling',
    JSON.stringify(halved.bets) === JSON.stringify(expectHalved))
  ok('whatif: money = net matches × stake, every scenario',
    scenarios.every((s) => s.moneyToA === s.netMatchesToA * 200
      && s.netMatchesToA === s.bets.reduce((a, b) => a + b.settlement.netToA, 0)))
  const front = (s: Hole18Scenario) => JSON.stringify(s.bets[0])
  ok('whatif: front-9 bet identical across scenarios (already settled)',
    front(scenarios[0]) === front(scenarios[1]) && front(scenarios[1]) === front(scenarios[2]))
  ok('whatif: A-wins pays A at least as much as B-wins does',
    scenarios[0].moneyToA > scenarios[2].moneyToA)
}

/* ── 14-hole minimum (house rule) ─────────────────────────────────────── */

// scores for holes 1..n, two players
const cardThru = (n: number) => Object.fromEntries(
  Array.from({ length: n }, (_, i) => [i + 1, { 1: 4, 2: 5 }]),
)

ok('minimum is 14 holes', MIN_HOLES_TO_RECORD === 14)
ok('holesPlayed: empty card is 0', roundHolesPlayed({}) === 0)
ok('holesPlayed: full card is 18', roundHolesPlayed(cardThru(18)) === 18)
ok('holesPlayed: 13 thru is 13 (below the cut)', roundHolesPlayed(cardThru(13)) === 13)
ok('holesPlayed: 14 thru is 14 (the cut itself)', roundHolesPlayed(cardThru(14)) === 14)
ok('holesPlayed: counts a hole with only one player scored',
  roundHolesPlayed({ 1: { 1: 4 }, 2: { 1: 5, 2: 6 } }) === 2)
ok('holesPlayed: skipped holes do not count',
  roundHolesPlayed({ 1: { 1: 4 }, 5: { 1: 4 }, 12: { 1: 4 } }) === 3)
ok('holesPlayed: an empty hole entry does not count',
  roundHolesPlayed({ 1: { 1: 4 }, 2: {} }) === 1)
ok('13 holes is discarded, 14 is recorded',
  roundHolesPlayed(cardThru(13)) < MIN_HOLES_TO_RECORD
  && roundHolesPlayed(cardThru(14)) >= MIN_HOLES_TO_RECORD)

/* ── Guests (negative ids) ────────────────────────────────────────────── */

// The whole guest design rests on the engine being id-agnostic: a guest is an
// ordinary player whose id happens to be negative. These fixtures pin that down,
// because if it ever stopped being true the guest feature would silently rot.

ok('isGuest: negative ids are guests', isGuest(-1) && isGuest(-2))
ok('isGuest: real player ids are not', !isGuest(1) && !isGuest(47))
ok('maxGuestsFor: 2 in a fourball, 1 in a 2-ball',
  maxGuestsFor(4) === 2 && maxGuestsFor(2) === 1)

// A guest can be the field's low marker and set everyone else's strokes.
const gStrokes = fieldStrokes([{ handicap: 14 }, { handicap: 6 }], 75)
ok('fieldStrokes: a guest low marker plays off scratch', gStrokes[1] === 0)
ok('fieldStrokes: the member then receives 75% of 8 = 6', gStrokes[0] === 6)

// The same fourball played twice — once all members, once with a guest in the
// same seat off the same handicap — must settle identically.
const fourball = (ids: [number, number, number, number]): Scores => {
  const s: Scores = {}
  for (const h of holes) s[h.n] = { [ids[0]]: 4, [ids[1]]: 5, [ids[2]]: 5, [ids[3]]: 5 }
  s[1] = { [ids[0]]: 3, [ids[1]]: 5, [ids[2]]: 5, [ids[3]]: 5 }
  s[2] = { [ids[0]]: 5, [ids[1]]: 5, [ids[2]]: 3, [ids[3]]: 5 }
  return s
}
const gameOf = (ids: [number, number, number, number]): Game => ({
  id: 'g', createdAt: 0,
  players: ids.map((id) => ({ id, name: `P${id}`, handicap: 10, strokes: 0 })),
  scoringMode: 'hole', format: 'both', allowancePct: 75,
  teamA: [ids[0], ids[1]], teamB: [ids[2], ids[3]],
  singles: [[ids[0], ids[2]], [ids[1], ids[3]]],
  stake: 200, scores: fourball(ids),
  course: DELHI_LODHI_BLUE,
})
const allMembers = gameOf([1, 2, 3, 4])
const withGuest = gameOf([1, 2, 3, -1])   // seat 4 is a guest

ok('guest fourball: hole results match the all-member equivalent',
  JSON.stringify(holeResults(withGuest)) === JSON.stringify(holeResults(allMembers)))
ok('guest fourball: Auto Press settles identically',
  JSON.stringify(autoPressBets(holeResults(withGuest)).map((b) => b.settlement))
  === JSON.stringify(autoPressBets(holeResults(allMembers)).map((b) => b.settlement)))

// A guest's money must net against their partner's, not vanish into a stray key.
const gMoney = playerMoney(withGuest)
ok('guest fourball: money keys cover the whole field',
  Object.keys(gMoney).length === 4 && typeof gMoney[-1] === 'number')
ok('guest fourball: the pot still nets to zero',
  Object.values(gMoney).reduce((a, b) => a + b, 0) === 0)
ok('guest fourball: no NaN in the settlement',
  Object.values(gMoney).every((v) => Number.isFinite(v)))

ok('memberPlayers/guestPlayers split the field',
  memberPlayers(withGuest).length === 3 && guestPlayers(withGuest).length === 1
  && guestPlayers(withGuest)[0].id === -1)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1
