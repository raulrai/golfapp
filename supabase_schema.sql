-- Run this in Supabase SQL Editor before seeding.
-- Mirrors the live database schema.

CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_admin BOOLEAN NOT NULL DEFAULT false,  -- admins may enter rounds they didn't play in
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
  -- No FK on the array elements, which is what lets a guest's negative id sit
  -- in a side and still resolve when History rebuilds the match.
  team_a BIGINT[],
  team_b BIGINT[],
  -- Guests (negative ids) have no players row, so their whole card lives here
  -- rather than in round_players/scores/hole_scores. NULL when no guests played.
  guests JSONB
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

-- Name + PIN auth. Kept separate from players so SELECT * on players never leaks hashes.
-- pin_hash format: 's1$<saltHex>$<scryptHex>'.
CREATE TABLE IF NOT EXISTS player_auth (
  player_id BIGINT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  failed_attempts SMALLINT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- An in-progress round, shared live across the fourball's phones. `game` is the full
-- Game object (src/lib/golf/game.ts); mutations are atomic jsonb_set ops server-side.
-- On finish the game is persisted into rounds/scores/hole_scores and round_id links there.
CREATE TABLE IF NOT EXISTS live_rounds (
  id BIGSERIAL PRIMARY KEY,
  game JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'live', -- live | finishing | finished | discarded
  version BIGINT NOT NULL DEFAULT 1,
  player_ids BIGINT[] NOT NULL,        -- denormalized from game.players for permission checks
  created_by BIGINT REFERENCES players(id),
  round_id BIGINT REFERENCES rounds(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS live_rounds_status_idx ON live_rounds(status);

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

-- ---------------------------------------------------------------- groups
-- The app serves two golf groups, PMT and Gazelle. One players row per HUMAN,
-- shared across groups; membership lives in player_groups. That is what makes a
-- score entered in one group count in the other with nothing to synchronise.
--
-- The rule the schema encodes: a ROUND belongs to a group, a SCORE does not.
-- Handicaps read scores by player_id alone (global); history, money and live
-- listings filter on rounds.group_id.
CREATE TABLE IF NOT EXISTS groups (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,           -- 'pmt' | 'gazelle'
  name TEXT NOT NULL,
  tracks_money BOOLEAN NOT NULL DEFAULT true,  -- Gazelle keeps no Order of Merit
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Membership + the group's own nickname for that player (PMT 'Gags' is Gazelle
-- 'Gaggy'), and per-group admin rights. players.is_admin is vestigial: authority
-- is player_groups.is_admin, so a PMT admin is not automatically a Gazelle one.
CREATE TABLE IF NOT EXISTS player_groups (
  player_id BIGINT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  group_id  BIGINT NOT NULL REFERENCES groups(id)  ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (player_id, group_id),
  UNIQUE (group_id, display_name)
);
CREATE INDEX IF NOT EXISTS player_groups_group_idx ON player_groups(group_id);

ALTER TABLE rounds      ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES groups(id);
ALTER TABLE live_rounds ADD COLUMN IF NOT EXISTS group_id BIGINT REFERENCES groups(id);
CREATE INDEX IF NOT EXISTS rounds_group_date_idx        ON rounds(group_id, date DESC);
CREATE INDEX IF NOT EXISTS live_rounds_group_status_idx ON live_rounds(group_id, status);

-- players.starting_handicap seeds a player with no rounds yet (see src/lib/handicap.ts).
ALTER TABLE players ADD COLUMN IF NOT EXISTS starting_handicap REAL;
