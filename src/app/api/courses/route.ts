import { NextRequest, NextResponse } from 'next/server'
import sql from '@/lib/db'
import { sessionPlayerId, unauthorized } from '@/lib/auth'

export async function GET() {
  const courses = await sql`SELECT * FROM courses ORDER BY is_default DESC, name`
  return NextResponse.json(courses)
}

export async function POST(req: NextRequest) {
  if ((await sessionPlayerId()) === null) return unauthorized()
  const { name, course_rating, slope_rating } = await req.json()
  const [course] = await sql`
    INSERT INTO courses (name, course_rating, slope_rating)
    VALUES (${name}, ${course_rating}, ${slope_rating})
    RETURNING id`
  return NextResponse.json({ id: course.id }, { status: 201 })
}
