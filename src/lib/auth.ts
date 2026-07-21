import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import { verifySessionToken } from '@/lib/pin'

export const SESSION_COOKIE = 'golf_session'
export const SESSION_MAX_AGE_S = 365 * 24 * 60 * 60

/**
 * The picked group (PMT or Gazelle), as a slug.
 *
 * THIS COOKIE CARRIES NO AUTHORITY — IT SELECTS A VIEW.
 *
 * It is deliberately not folded into the signed session token, because the group
 * picker runs BEFORE login and a signed token cannot express "a group is chosen
 * but nobody is authenticated yet". Editing this cookie by hand gains a
 * non-member nothing: requireGroupMember() re-reads player_groups on every
 * request and 403s. Do not "optimise" that check away by trusting this value.
 */
export const GROUP_COOKIE = 'golf_group'

export type Group = { id: number; slug: string; name: string; tracksMoney: boolean }

/** The logged-in player's id from the session cookie, or null. */
export async function sessionPlayerId(): Promise<number | null> {
  const secret = process.env.AUTH_SECRET
  if (!secret) return null
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token, secret)
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
}

export function forbidden(): NextResponse {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

/**
 * The group named by the golf_group cookie. No membership check — callers that
 * need one use requireGroupMember().
 *
 * Falls back to the session player's first membership when the cookie is
 * missing. That case is not hypothetical: every player carries a year-long
 * golf_session cookie predating this feature, so on the first load after the
 * multi-group deploy nobody has a group cookie yet. Without the fallback they
 * would all land in a groupless state with no way out short of logging out.
 */
export async function currentGroup(): Promise<Group | null> {
  const slug = (await cookies()).get(GROUP_COOKIE)?.value
  if (slug) return groupBySlug(slug)
  const playerId = await sessionPlayerId()
  if (playerId === null) return null
  return firstGroupOf(playerId)
}

/** A player's default group — the one they joined first. */
export async function firstGroupOf(playerId: number): Promise<Group | null> {
  const [g] = await sql`
    SELECT g.id, g.slug, g.name, g.tracks_money
    FROM groups g
    JOIN player_groups pg ON pg.group_id = g.id AND pg.player_id = ${playerId}
    ORDER BY g.id LIMIT 1`
  return g ? { id: Number(g.id), slug: g.slug, name: g.name, tracksMoney: g.tracks_money } : null
}

export async function groupBySlug(slug: string): Promise<Group | null> {
  const [g] = await sql`SELECT id, slug, name, tracks_money FROM groups WHERE slug = ${slug}`
  return g ? { id: Number(g.id), slug: g.slug, name: g.name, tracksMoney: g.tracks_money } : null
}

/** The group a round or live round is filed under. Used on write paths where
 *  authority and money rules must follow the ROUND's group, not the viewer's. */
export async function groupById(id: number): Promise<Group | null> {
  const [g] = await sql`SELECT id, slug, name, tracks_money FROM groups WHERE id = ${id}`
  return g ? { id: Number(g.id), slug: g.slug, name: g.name, tracksMoney: g.tracks_money } : null
}

/**
 * Group-scoped admin rights.
 *
 * Reads player_groups ONLY. There is deliberately no `OR players.is_admin`
 * fallback: Poky is a global admin from the single-group era and a Gazelle
 * member, but he is explicitly NOT a Gazelle admin. A convenience fallback
 * would promote him silently — nothing would error. players.is_admin is
 * retained for one release for grant-admin.mjs, but it is no longer an
 * authorization input.
 */
export async function isAdminOf(playerId: number, groupId: number): Promise<boolean> {
  const [row] = await sql`
    SELECT is_admin FROM player_groups WHERE player_id = ${playerId} AND group_id = ${groupId}`
  return row?.is_admin === true
}

export type GroupSession = {
  playerId: number
  group: Group
  isAdmin: boolean
  displayName: string
}

/**
 * The gate every group-scoped route handler calls: who you are, which group you
 * are viewing, and proof you actually belong to it. One query does all three.
 */
export async function requireGroupMember(): Promise<GroupSession | NextResponse> {
  const playerId = await sessionPlayerId()
  if (playerId === null) return unauthorized()
  const slug = (await cookies()).get(GROUP_COOKIE)?.value

  // A cookie that names a group is taken strictly: belong to it or get 403.
  // That is what makes the cookie safe to treat as untrusted input — editing it
  // to another group's slug grants nothing.
  //
  // NO cookie is a different case, and it is the one every existing player is in
  // on the first load after this deploy: their session cookie predates groups.
  // Those players fall back to their own first membership, which is a lookup
  // against player_groups and so grants nothing either.
  const rows = slug
    ? await sql`
        SELECT g.id, g.slug, g.name, g.tracks_money, pg.is_admin, pg.display_name
        FROM groups g
        JOIN player_groups pg ON pg.group_id = g.id AND pg.player_id = ${playerId}
        WHERE g.slug = ${slug}`
    : await sql`
        SELECT g.id, g.slug, g.name, g.tracks_money, pg.is_admin, pg.display_name
        FROM groups g
        JOIN player_groups pg ON pg.group_id = g.id AND pg.player_id = ${playerId}
        ORDER BY g.id LIMIT 1`
  const [row] = rows
  if (!row) return forbidden()
  return {
    playerId,
    group: { id: Number(row.id), slug: row.slug, name: row.name, tracksMoney: row.tracks_money },
    isAdmin: row.is_admin === true,
    displayName: row.display_name,
  }
}

/** Narrowing helper: `if (isErr(s)) return s` at the top of a handler. */
export function isErr(v: GroupSession | NextResponse): v is NextResponse {
  return v instanceof NextResponse
}

/** Is this player a member of this group? */
export async function isMemberOf(playerId: number, groupId: number): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM player_groups WHERE player_id = ${playerId} AND group_id = ${groupId}`
  return rows.length > 0
}

/** Are all of these players members of this group? Guards every round write. */
export async function allMembersOf(playerIds: number[], groupId: number): Promise<boolean> {
  if (playerIds.length === 0) return true
  const [row] = await sql`
    SELECT COUNT(*) c FROM player_groups
    WHERE group_id = ${groupId} AND player_id = ANY(${playerIds})`
  return Number(row.c) === new Set(playerIds).size
}

/** Is this player one of the live round's fourball? (Edit rights are fourball-wide.) */
export async function requireRoundMember(liveRoundId: number, playerId: number): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM live_rounds WHERE id = ${liveRoundId} AND ${playerId} = ANY(player_ids)`
  return rows.length > 0
}
