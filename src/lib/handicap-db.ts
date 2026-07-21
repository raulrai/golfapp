import sql from '@/lib/db'
import { calcHandicap } from '@/lib/handicap'

/**
 * A player's handicap, from their last 12 scores.
 *
 * DELIBERATELY NOT GROUP-FILTERED, and that is the whole point of this file.
 *
 * A handicap is a property of the human, not of the group being viewed. Ten
 * players are in both PMT and Gazelle; a score one of them posts in Gazelle
 * counts towards their PMT handicap and vice versa. That is the requirement,
 * and it works precisely because `scores` has no group_id and this query never
 * joins `rounds`.
 *
 * So: do NOT add `JOIN rounds r ... AND r.group_id = $g` here. If you want a
 * group filter you want a money or history query, not this one — those live in
 * the route handlers and filter on `rounds.group_id` themselves.
 *
 * This used to be five identical copies across api/players, api/leaderboard,
 * api/stroke-calculator, api/rounds and api/players/[id]. It is one function so
 * there is one place to read this comment.
 */
export async function handicapFor(
  playerId: number,
  startingHandicap?: number | null,
): Promise<number> {
  const rows = await sql`
    SELECT handicap_score FROM scores WHERE player_id = ${playerId}
    ORDER BY played_at DESC LIMIT 12`
  return calcHandicap(rows.map((s) => Number(s.handicap_score)), startingHandicap)
}

/** As above, rounded the way the API surfaces it. */
export async function handicapForRounded(
  playerId: number,
  startingHandicap?: number | null,
): Promise<number> {
  return Math.round((await handicapFor(playerId, startingHandicap)) * 100) / 100
}
