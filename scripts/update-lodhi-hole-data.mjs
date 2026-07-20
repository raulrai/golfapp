// Corrects Lodhi course Blue-tee yardages and hole tips against the official
// per-hole pages at delhigolfclub.org/lodhi-course/hole<n>/ (verified 2026-07-20).
// Par and stroke index were already correct (from the Hole19 card); only
// yardages and the invented tip text were wrong. Tips are condensed from the
// site's official descriptions, courtesy Gaurav Ghei. Mirrors src/lib/golf/course.ts.
import postgres from 'postgres'
import fs from 'fs'
const env = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
for (const line of env.split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', prepare: false })

const HOLES = [
  [1, 502, 'Comfortable opener into a left-right headwind. Lay up short of the fairway bunker (~250yds) or challenge it left; the rebuilt green punishes short-siding, especially front-left/right pins.'],
  [2, 361, 'Looks straightforward but the fairway is essential — a ~250yd tee shot centres the approach. The green slopes hard on the right; miss the fairway and holding the green gets very difficult.'],
  [3, 454, "Index 1 for a reason — long, needing a right-to-left tee shot to use the fairway's slope. A narrow opening guards tight front pins; the back is wider and gentler. Spot-on distance or settle for two putts."],
  [4, 395, 'Historically one of the toughest. Favour right-centre off the tee — the fairway tilts right and trees block a pushed approach. A well-guarded green follows; four is always a good score.'],
  [5, 162, "Reshaped green with tough pin positions. Don't short-side your miss — an up-and-down from the right is easier, into the upslope. Top-right pin is the toughest."],
  [6, 385, 'Straightforward but for the bunker cutting the fairway — lay up short of it, leaving 160-190yds in. Avoid the valley short-right of the green; play safe and the left-edge slope makes two putts tough.'],
  [7, 177, 'A great par 3 that can stretch past 200yds from the tips. Heavy bunkering guards the green; anything long on the right-centre catches the downslope into a swale — a tough up-and-down from there.'],
  [8, 511, 'A genuine birdie chance if played right. Keep the tee shot on the fairway (260-275yds) on the dogleg-right corner, leaving ~250 in. Find the right angle — the toughest pins are top and bottom-left.'],
  [9, 432, 'One of the toughest holes on the course. An absolutely precise tee shot favouring left-centre, ideally 270yds to the top of the slope for an easy look at the green. Toughest pin is top-right over the bunker.'],
  [10, 414, 'One of the widest, most inviting fairways on the course — but any miss makes par a real fight. A steep front upslope challenges front pins. Four is always a good score; the only hole here without a bunker.'],
  [11, 411, 'A precise tee shot (3-wood or hybrid) leaves 150-180yds in. The two-tier green rewards a lower pin for birdie; back pins are tough to get close to. Shows its teeth into a left-right breeze.'],
  [12, 180, 'A strong par 3 into the prevailing wind. The right side is guarded by a deep bunker and overhanging trees; a false front can roll shots 15 yards back into the valley. Play safely to the middle.'],
  [13, 367, "A Jekyll-and-Hyde hole — downwind it's a long iron/hybrid plus a short iron to a big green; into the prevailing headwind it's a real fight for the fairway, then the green from the rough. Miss right and the up-and-down is brutal."],
  [14, 477, 'A great risk-reward par 5. A 275yd carry clears the left bunker for a bonus 15-20yds on the downslope; even so, the second is narrow and a back pin behind the greenside bunker is no birdie guarantee. Most play it as a three-shotter.'],
  [15, 322, 'The shortest hole on the course, but never a gimme — the wind is almost always across. Centre the tee shot for a clear look at one of the biggest, most contoured greens; a good second is essential to be on the right level.'],
  [16, 378, "Demands precision in both line and distance. The fairway's central tree is a ball magnet — aim just left of it for a mid/short iron in. The green's false front and left collection area test every short game."],
  [17, 156, 'Arguably the best par 3 on the card — only 150-175yds, but mostly into a left-right wind. Be aggressive at front pins; the top-right pin and right bunker punish any miss with a tough up-and-down.'],
  [18, 533, "A fabulous finishing hole — the fairway bunker is gone, so more players take driver off the tee. The second must carry all the way to the rebuilt green; short or right catches a tough collection area. Front-left is a real sucker pin."],
]

const [course] = await sql`SELECT id FROM courses WHERE is_default = true LIMIT 1`
if (!course) { console.error('No default course found'); process.exit(1) }

const before = await sql`SELECT hole, yards FROM holes WHERE course_id = ${course.id} ORDER BY hole`
console.log('BEFORE yards:', before.map((h) => `${h.hole}:${h.yards}`).join(' '))

await sql.begin(async (tx) => {
  for (const [hole, yards, tip] of HOLES) {
    await tx`UPDATE holes SET yards = ${yards}, tip = ${tip} WHERE course_id = ${course.id} AND hole = ${hole}`
  }
  const totalYards = HOLES.reduce((a, [, y]) => a + y, 0)
  await tx`UPDATE courses SET tees = ${'Blue · ' + totalYards.toLocaleString('en-US') + ' yds'} WHERE id = ${course.id}`
})

const after = await sql`SELECT hole, par, stroke_index, yards FROM holes WHERE course_id = ${course.id} ORDER BY hole`
console.log('AFTER yards:', after.map((h) => `${h.hole}:${h.yards}`).join(' '))
const [courseAfter] = await sql`SELECT tees FROM courses WHERE id = ${course.id}`
console.log('course tees label:', courseAfter.tees)
console.log('total yards:', after.reduce((a, h) => a + Number(h.yards), 0))
console.log('total par:', after.reduce((a, h) => a + Number(h.par), 0))
const sis = after.map((h) => Number(h.stroke_index)).sort((a, b) => a - b)
console.log('stroke indices sorted (should be 1..18):', sis.join(','))

await sql.end()
