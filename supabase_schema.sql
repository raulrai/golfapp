-- Run this in Supabase SQL Editor before seeding

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
  is_default BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS rounds (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  course_id BIGINT REFERENCES courses(id),
  handicap_pct REAL DEFAULT 75,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
  played_at DATE NOT NULL,
  entered_at TIMESTAMPTZ DEFAULT NOW()
);
