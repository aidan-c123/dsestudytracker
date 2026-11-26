-- ============================================================================
-- Desk No. 4 — relational schema, for reference and for a SQL-based host
-- (Supabase / Postgres, Cloudflare D1).
--
-- The deployed app uses MongoDB Atlas. See scripts/init-db.js for the live
-- Atlas validators and indexes, and docs/schema.md for the field mapping.
--
-- The security model is the same in both: every row carries user_id, and
-- every statement is scoped to the authenticated user at the server layer.
-- ============================================================================

-- ------------------------------------------------------------------ profiles
CREATE TABLE IF NOT EXISTS profiles (
  id            TEXT PRIMARY KEY,              -- auth user id
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  exam_date     DATE NOT NULL DEFAULT '2027-04-06',
  results_date  DATE NOT NULL DEFAULT '2027-07-14',
  daily_goal_minutes INTEGER NOT NULL DEFAULT 120 CHECK (daily_goal_minutes BETWEEN 10 AND 720),
  theme         TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------ subjects
CREATE TABLE IF NOT EXISTS subjects (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code           TEXT NOT NULL DEFAULT '',     -- CHIN, ENG, MATH, CSD, M1, M2, BIOL…
  name           TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'elective'
                 CHECK (category IN ('core','elective','extended')),
  target_level   SMALLINT NOT NULL DEFAULT 4 CHECK (target_level BETWEEN 1 AND 7),
  predicted_level SMALLINT CHECK (predicted_level BETWEEN 1 AND 7),
  exam_date      DATE,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);
CREATE INDEX IF NOT EXISTS subjects_user_idx ON subjects (user_id, sort_order);

-- --------------------------------------------------------------- past papers
-- One row per (subject, year, paper). Re-logging the same cell updates it.
CREATE TABLE IF NOT EXISTS past_papers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  year            SMALLINT NOT NULL CHECK (year BETWEEN 2012 AND 2035),
  paper           TEXT NOT NULL,               -- P1, P2, P3, P4, SBA
  score           NUMERIC(6,2) CHECK (score >= 0),
  max_score       NUMERIC(6,2) CHECK (max_score > 0),
  percentage      NUMERIC(5,2) CHECK (percentage BETWEEN 0 AND 100),
  estimated_level SMALLINT CHECK (estimated_level BETWEEN 1 AND 7),
  notes           TEXT NOT NULL DEFAULT '',
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subject_id, year, paper)
);
CREATE INDEX IF NOT EXISTS papers_user_idx ON past_papers (user_id, subject_id, year DESC);

-- ---------------------------------------------------------------- study logs
CREATE TABLE IF NOT EXISTS study_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id   UUID REFERENCES subjects(id) ON DELETE SET NULL,
  label        TEXT NOT NULL DEFAULT '',
  minutes      INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 1440),
  mode         TEXT NOT NULL DEFAULT 'focus' CHECK (mode IN ('focus','break')),
  started_at   TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS logs_user_idx ON study_logs (user_id, completed_at DESC);

-- ---------------------------------------------------------------- sba tasks
CREATE TABLE IF NOT EXISTS sba_tasks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'sba' CHECK (kind IN ('sba','revision','mock','other')),
  due_date   DATE,
  status     TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  weight_pct NUMERIC(5,2) CHECK (weight_pct BETWEEN 0 AND 100),
  notes      TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_user_idx ON sba_tasks (user_id, due_date);

-- --------------------------------------------------------------- error logs
CREATE TABLE IF NOT EXISTS error_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id   UUID REFERENCES subjects(id) ON DELETE SET NULL,
  topic        TEXT NOT NULL,
  question_ref TEXT NOT NULL DEFAULT '',
  error_type   TEXT NOT NULL DEFAULT 'concept'
               CHECK (error_type IN ('concept','careless','time','misread','technique')),
  note         TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS errors_user_idx ON error_logs (user_id, created_at DESC);

-- ============================================================================
-- Row-Level Security (Supabase / Postgres only)
-- Auth is handled by Supabase Auth, so auth.uid() is the student's id.
-- ============================================================================

ALTER TABLE profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects     ENABLE ROW LEVEL SECURITY;
ALTER TABLE past_papers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sba_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs   ENABLE ROW LEVEL SECURITY;

-- profiles: read and update only your own row; id must equal the auth uid.
CREATE POLICY profiles_select ON profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_update ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_insert ON profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- A single reusable pattern for every child table: user_id must be the caller.
CREATE POLICY subjects_all ON subjects
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY papers_all ON past_papers
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY logs_all ON study_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY tasks_all ON sba_tasks
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY errors_all ON error_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Defence in depth: a paper's subject must also belong to the same student.
CREATE POLICY papers_own_subject ON past_papers
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM subjects s WHERE s.id = past_papers.subject_id AND s.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM subjects s WHERE s.id = past_papers.subject_id AND s.user_id = auth.uid())
  );

-- ============================================================================
-- Automation: create the profile and seed four core subjects on sign-up
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_profile_id TEXT := NEW.id::text;
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    new_profile_id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.subjects (user_id, code, name, category, sort_order) VALUES
    (new_profile_id, 'CHIN', '中國語文',      'core', 0),
    (new_profile_id, 'ENG',  'English Language', 'core', 1),
    (new_profile_id, 'MATH', 'Mathematics',      'core', 2),
    (new_profile_id, 'CSD',  '公民與社會發展',   'core', 3)
  ON CONFLICT (user_id, code) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
