import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

export const migrations = [
  {
    version: 1,
    name: 'initial_domain',
    sql: `
      CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO app_metadata (key, value) VALUES ('reference_revision', '0');

      CREATE TABLE muscles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        instructions TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE exercise_muscles (
        exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        muscle_id TEXT NOT NULL REFERENCES muscles(id) ON DELETE RESTRICT,
        role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
        PRIMARY KEY (exercise_id, muscle_id)
      );

      CREATE TABLE workout_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE template_exercises (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
        exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
        position INTEGER NOT NULL CHECK (position >= 0),
        notes TEXT,
        target_sets INTEGER CHECK (target_sets > 0),
        target_reps INTEGER CHECK (target_reps > 0),
        UNIQUE (template_id, position)
      );

      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY,
        template_id TEXT REFERENCES workout_templates(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        notes TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE workout_exercises (
        id TEXT PRIMARY KEY,
        workout_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
        exercise_id TEXT REFERENCES exercises(id) ON DELETE SET NULL,
        exercise_name TEXT NOT NULL,
        position INTEGER NOT NULL CHECK (position >= 0),
        notes TEXT,
        target_sets INTEGER CHECK (target_sets > 0),
        target_reps INTEGER CHECK (target_reps > 0),
        UNIQUE (workout_id, position)
      );

      CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY,
        workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
        position INTEGER NOT NULL CHECK (position >= 0),
        reps INTEGER CHECK (reps >= 0),
        weight REAL CHECK (weight >= 0),
        weight_unit TEXT NOT NULL CHECK (weight_unit IN ('kg', 'lb')),
        notes TEXT,
        completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
        UNIQUE (workout_exercise_id, position)
      );

      CREATE TABLE processed_operations (
        operation_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL
      );

      CREATE INDEX workout_sessions_status_idx ON workout_sessions(status, started_at DESC);
      CREATE INDEX workout_exercises_workout_idx ON workout_exercises(workout_id, position);
      CREATE INDEX workout_sets_exercise_idx ON workout_sets(workout_exercise_id, position);
    `,
  },
  {
    version: 2,
    name: 'exercise_media_and_sources',
    sql: `
      CREATE TABLE exercise_media (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind = 'gif'),
        mime_type TEXT NOT NULL CHECK (mime_type = 'image/gif'),
        byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
        original_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      ALTER TABLE exercises ADD COLUMN media_id TEXT
        REFERENCES exercise_media(id) ON DELETE SET NULL;
      ALTER TABLE exercises ADD COLUMN source_url TEXT;
      ALTER TABLE exercises ADD COLUMN source_title TEXT;
      ALTER TABLE exercises ADD COLUMN source_media_url TEXT;
      ALTER TABLE exercises ADD COLUMN source_imported_at TEXT;
      CREATE UNIQUE INDEX exercises_media_id_idx ON exercises(media_id)
        WHERE media_id IS NOT NULL;
    `,
  },
  {
    version: 3,
    name: 'typed_exercises_and_weekly_templates',
    sql: `
      ALTER TABLE exercises ADD COLUMN exercise_type TEXT NOT NULL DEFAULT 'strength'
        CHECK (exercise_type IN ('strength', 'cardio'));

      ALTER TABLE template_exercises RENAME TO template_exercises_v2;
      CREATE TABLE template_exercises (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
        exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        position INTEGER NOT NULL CHECK (position >= 0),
        notes TEXT,
        target_sets INTEGER CHECK (target_sets > 0),
        target_reps INTEGER CHECK (target_reps > 0),
        target_duration_seconds INTEGER CHECK (target_duration_seconds > 0),
        target_distance REAL CHECK (target_distance > 0),
        target_distance_unit TEXT NOT NULL DEFAULT 'km'
          CHECK (target_distance_unit IN ('km', 'mi')),
        UNIQUE (template_id, day_of_week, position)
      );
      INSERT INTO template_exercises
        (id, template_id, exercise_id, day_of_week, position, notes,
         target_sets, target_reps, target_duration_seconds, target_distance,
         target_distance_unit)
      SELECT id, template_id, exercise_id, 1, position, notes,
        target_sets, target_reps, NULL, NULL, 'km'
      FROM template_exercises_v2;
      DROP TABLE template_exercises_v2;

      ALTER TABLE workout_sessions ADD COLUMN template_day INTEGER
        CHECK (template_day BETWEEN 1 AND 7);
      ALTER TABLE workout_exercises ADD COLUMN exercise_type TEXT NOT NULL DEFAULT 'strength'
        CHECK (exercise_type IN ('strength', 'cardio'));
      ALTER TABLE workout_exercises ADD COLUMN target_duration_seconds INTEGER
        CHECK (target_duration_seconds > 0);
      ALTER TABLE workout_exercises ADD COLUMN target_distance REAL
        CHECK (target_distance > 0);
      ALTER TABLE workout_exercises ADD COLUMN target_distance_unit TEXT NOT NULL DEFAULT 'km'
        CHECK (target_distance_unit IN ('km', 'mi'));
      ALTER TABLE workout_sets ADD COLUMN duration_seconds INTEGER
        CHECK (duration_seconds >= 0);
      ALTER TABLE workout_sets ADD COLUMN distance REAL CHECK (distance >= 0);
      ALTER TABLE workout_sets ADD COLUMN distance_unit TEXT NOT NULL DEFAULT 'km'
        CHECK (distance_unit IN ('km', 'mi'));
    `,
  },
] as const;

export type SpotterDatabase = Database.Database;

export function openDatabase(path: string): SpotterDatabase {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  if (path !== ':memory:') database.pragma('journal_mode = WAL');
  migrate(database);
  return database;
}

function migrate(database: SpotterDatabase) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    database
      .prepare('SELECT version FROM schema_migrations')
      .all()
      .map((row) => (row as { version: number }).version),
  );

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      database
        .prepare(
          'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
        )
        .run(migration.version, migration.name, new Date().toISOString());
    })();
  }
}
