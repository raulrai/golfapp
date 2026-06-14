import { NextResponse } from 'next/server'
import sql from '@/lib/db'
import type { CourseMeta } from '@/lib/golf/course'

// Default course (meta + holes) for the Play flow. The DB is the editable
// source of truth; course.ts remains the canonical seed / offline fallback.
export async function GET() {
  const [course] = await sql`SELECT * FROM courses WHERE is_default = true LIMIT 1`
  if (!course) return NextResponse.json({ error: 'No default course' }, { status: 404 })

  const holes = await sql`
    SELECT hole, par, stroke_index, yards, tip
    FROM holes WHERE course_id = ${course.id} ORDER BY hole`

  const meta: CourseMeta = {
    name: course.name,
    short: course.short ?? course.name,
    tees: course.tees ?? '',
    par: Number(course.par ?? 0),
    rating: Number(course.course_rating),
    slope: Number(course.slope_rating),
    holes: holes.map((h) => ({
      n: Number(h.hole),
      par: Number(h.par),
      si: Number(h.stroke_index),
      yards: Number(h.yards),
      tip: h.tip ?? '',
    })),
  }

  return NextResponse.json(meta)
}
