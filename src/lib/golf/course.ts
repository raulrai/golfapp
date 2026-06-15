// Delhi Golf Club — Lodhi Course, Blue tees.
// Rating/slope: 70.6 / 129 (blue). Par/stroke-index per Hole19 card, confirmed by Raul.
// Tips are caddie notes for the tree-lined Lodhi layout (small greens, tombs, kikuyu rough);
// refine with local knowledge as we play.

export interface Hole {
  n: number
  par: number
  si: number
  yards: number
  tip: string
}

export interface CourseMeta {
  name: string
  short: string
  tees: string
  par: number
  rating: number
  slope: number
  holes: Hole[]
}

const h = (n: number, par: number, si: number, yards: number, tip: string): Hole => ({ n, par, si, yards, tip })

export type TeeColor = 'Black' | 'Blue' | 'Red'

export interface TeeInfo {
  color: TeeColor
  /** short display label, e.g. 'Blue · 6,460 yds' */
  label: string
  rating: number
  slope: number
  /** true until this tee's real yardages / rating / slope are measured */
  provisional?: boolean
}

// Blue is the only measured tee. Red & Black ratings/slopes are placeholders and
// currently share Blue's per-hole yardages — swap in real numbers once measured.
export const TEES: TeeInfo[] = [
  { color: 'Black', label: 'Black · championship', rating: 73.0, slope: 135, provisional: true },
  { color: 'Blue', label: 'Blue · 6,460 yds', rating: 70.6, slope: 129 },
  { color: 'Red', label: 'Red · forward', rating: 68.0, slope: 120, provisional: true },
]

export const DEFAULT_TEE: TeeColor = 'Blue'

export const teeInfo = (color: TeeColor): TeeInfo =>
  TEES.find((t) => t.color === color) ?? TEES.find((t) => t.color === DEFAULT_TEE)!

/** A course meta resolved for a chosen tee (label + rating + slope from that tee). */
export function withTee(base: CourseMeta, color: TeeColor): CourseMeta {
  const tee = teeInfo(color)
  return { ...base, tees: tee.label, rating: tee.rating, slope: tee.slope }
}

export const DELHI_LODHI_BLUE: CourseMeta = {
  name: 'Delhi Golf Club — Lodhi Course',
  short: 'DGC Lodhi',
  tees: 'Blue · 6,460 yds',
  par: 72,
  rating: 70.6,
  slope: 129,
  holes: [
    h(1, 5, 13, 507, 'Gentle par-5 opener to wake up the swing. Keep it down the left; the trees tighten on the right. A par here settles the nerves.'),
    h(2, 4, 7, 420, 'Tree-lined and demanding off the tee. Favour a 3-wood to the corner, leave a mid-iron to a green that runs away at the back.'),
    h(3, 4, 1, 460, 'Index 1 for a reason — long, tight, and unforgiving. Take your four and run; bogey loses nothing here.'),
    h(4, 4, 9, 360, 'Position over power. The trees pinch the landing zone, so club down off the tee and attack with a wedge.'),
    h(5, 3, 17, 137, 'Short one-shotter, but the green is small and well-bunkered. Middle of the green every time; never short.'),
    h(6, 4, 5, 417, 'Dogleg through the trees. Find the fairway or you are chipping out sideways. Patience pays.'),
    h(7, 3, 15, 99, 'A flick of a wedge — but a tomb and bunkers guard the front. Trust the number and commit.'),
    h(8, 5, 11, 480, 'Reachable for the long hitters if the drive splits the gap. Otherwise lay up to a full wedge and take your birdie chance.'),
    h(9, 4, 3, 410, 'Tough closing hole on the front. Long approach to a raised green; bail short rather than long.'),
    h(10, 4, 4, 325, 'Short but snug. Iron off the tee to the corner, then a precise wedge — the green sheds anything long.'),
    h(11, 4, 8, 527, 'The card calls it a four; play it like a long one. Two solid blows, accept the long putt, move on.'),
    h(12, 3, 16, 215, 'Long par 3, usually into the breeze. Take plenty of club and aim for the heart of the green.'),
    h(13, 4, 2, 400, 'Index 2 — narrow and tree-lined both sides. The fairway is the only friend you have; take it.'),
    h(14, 5, 12, 420, 'Birdie chance if you keep the drive in play. The third is the scoring shot — know your wedge yardage.'),
    h(15, 4, 14, 350, 'Short, but the green is the defence. Leave a full shot in and respect the back pin positions.'),
    h(16, 4, 6, 417, 'Strong two-shotter. Drive to the left half for the open angle; the trees block the green from the right.'),
    h(17, 3, 18, 122, 'The easiest index on the card — a short wedge. Take it, but the small green punishes a careless miss.'),
    h(18, 5, 10, 500, 'Grand finale. Reachable in two for the bold, but trouble lurks greenside. Settle the match in style.'),
  ],
}
