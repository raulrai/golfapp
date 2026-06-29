-- Run this in Supabase SQL Editor before seeding.
-- Mirrors the live database schema.

CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  course_rating REAL NOT NULL,
  slope_rating REAL NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  short TEXT,
  tees TEXT,
  par SMALLINT
);

CREATE TABLE IF NOT EXISTS holes (
  id BIGSERIAL PRIMARY KEY,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  hole SMALLINT NOT NULL,
  par SMALLINT NOT NULL,
  stroke_index SMALLINT NOT NULL,
  yards INTEGER,
  tip TEXT,
  UNIQUE (course_id, hole)
);

CREATE TABLE IF NOT EXISTS rounds (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  course_id BIGINT REFERENCES courses(id),
  handicap_pct REAL DEFAULT 75,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  format TEXT,
  stake INTEGER,
  team_a BIGINT[],
  team_b BIGINT[]
);

CREATE TABLE IF NOT EXISTS round_players (
  id BIGSERIAL PRIMARY KEY,
  round_id BIGINT REFERENCES rounds(id) ON DELETE CASCADE,
  player_id BIGINT REFERENCES players(id),
  stroke_allowance INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS scores (
  id BIGSERIAL PRIMARY KEY,
  round_id BIGINT REFERENCES rounds(id) ON DELETE CASCADE,
  player_id BIGINT REFERENCES players(id) NOT NULL,
  adjusted_gross_score REAL,
  handicap_score REAL NOT NULL,
  money_inr INTEGER DEFAULT 0,
  -- holes actually scored; < 18 means adjusted_gross_score is pro-rated to 18
  holes_played SMALLINT DEFAULT 18,
  played_at DATE NOT NULL,
  entered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hole_scores (
  id BIGSERIAL PRIMARY KEY,
  round_id BIGINT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id),
  hole SMALLINT NOT NULL,
  strokes SMALLINT NOT NULL,
  UNIQUE (round_id, player_id, hole)
);

-- The round's diary: one-tap tagged moments captured during play (read-only on History).
CREATE TABLE IF NOT EXISTS round_moments (
  id BIGSERIAL PRIMARY KEY,
  round_id BIGINT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  hole SMALLINT,
  player_ids BIGINT[],
  tag TEXT NOT NULL,
  note TEXT,
  ts TIMESTAMPTZ DEFAULT NOW()
);
