// Delhi Golf Club — Lodhi Course, Blue tees.
// Rating/slope: 70.6 / 129 (blue). Par/stroke-index per Hole19 card, confirmed by Raul.
// Yardages and tips verified 2026-07-20 against delhigolfclub.org/lodhi-course/hole<n>/ —
// tips are condensed from the official per-hole descriptions courtesy Gaurav Ghei.

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
  { color: 'Blue', label: 'Blue · 6,617 yds', rating: 70.6, slope: 129 },
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
  tees: 'Blue · 6,617 yds',
  par: 72,
  rating: 70.6,
  slope: 129,
  holes: [
    h(1, 5, 13, 502, 'Comfortable opener into a left-right headwind. Lay up short of the fairway bunker (~250yds) or challenge it left; the rebuilt green punishes short-siding, especially front-left/right pins.'),
    h(2, 4, 7, 361, 'Looks straightforward but the fairway is essential — a ~250yd tee shot centres the approach. The green slopes hard on the right; miss the fairway and holding the green gets very difficult.'),
    h(3, 4, 1, 454, 'Index 1 for a reason — long, needing a right-to-left tee shot to use the fairway\'s slope. A narrow opening guards tight front pins; the back is wider and gentler. Spot-on distance or settle for two putts.'),
    h(4, 4, 9, 395, 'Historically one of the toughest. Favour right-centre off the tee — the fairway tilts right and trees block a pushed approach. A well-guarded green follows; four is always a good score.'),
    h(5, 3, 17, 162, 'Reshaped green with tough pin positions. Don\'t short-side your miss — an up-and-down from the right is easier, into the upslope. Top-right pin is the toughest.'),
    h(6, 4, 5, 385, 'Straightforward but for the bunker cutting the fairway — lay up short of it, leaving 160-190yds in. Avoid the valley short-right of the green; play safe and the left-edge slope makes two putts tough.'),
    h(7, 3, 15, 177, 'A great par 3 that can stretch past 200yds from the tips. Heavy bunkering guards the green; anything long on the right-centre catches the downslope into a swale — a tough up-and-down from there.'),
    h(8, 5, 11, 511, 'A genuine birdie chance if played right. Keep the tee shot on the fairway (260-275yds) on the dogleg-right corner, leaving ~250 in. Find the right angle — the toughest pins are top and bottom-left.'),
    h(9, 4, 3, 432, 'One of the toughest holes on the course. An absolutely precise tee shot favouring left-centre, ideally 270yds to the top of the slope for an easy look at the green. Toughest pin is top-right over the bunker.'),
    h(10, 4, 4, 414, 'One of the widest, most inviting fairways on the course — but any miss makes par a real fight. A steep front upslope challenges front pins. Four is always a good score; the only hole here without a bunker.'),
    h(11, 4, 8, 411, 'A precise tee shot (3-wood or hybrid) leaves 150-180yds in. The two-tier green rewards a lower pin for birdie; back pins are tough to get close to. Shows its teeth into a left-right breeze.'),
    h(12, 3, 16, 180, 'A strong par 3 into the prevailing wind. The right side is guarded by a deep bunker and overhanging trees; a false front can roll shots 15 yards back into the valley. Play safely to the middle.'),
    h(13, 4, 2, 367, 'A Jekyll-and-Hyde hole — downwind it\'s a long iron/hybrid plus a short iron to a big green; into the prevailing headwind it\'s a real fight for the fairway, then the green from the rough. Miss right and the up-and-down is brutal.'),
    h(14, 5, 12, 477, 'A great risk-reward par 5. A 275yd carry clears the left bunker for a bonus 15-20yds on the downslope; even so, the second is narrow and a back pin behind the greenside bunker is no birdie guarantee. Most play it as a three-shotter.'),
    h(15, 4, 14, 322, 'The shortest hole on the course, but never a gimme — the wind is almost always across. Centre the tee shot for a clear look at one of the biggest, most contoured greens; a good second is essential to be on the right level.'),
    h(16, 4, 6, 378, 'Demands precision in both line and distance. The fairway\'s central tree is a ball magnet — aim just left of it for a mid/short iron in. The green\'s false front and left collection area test every short game.'),
    h(17, 3, 18, 156, 'Arguably the best par 3 on the card — only 150-175yds, but mostly into a left-right wind. Be aggressive at front pins; the top-right pin and right bunker punish any miss with a tough up-and-down.'),
    h(18, 5, 10, 533, 'A fabulous finishing hole — the fairway bunker is gone, so more players take driver off the tee. The second must carry all the way to the rebuilt green; short or right catches a tough collection area. Front-left is a real sucker pin.'),
  ],
}
