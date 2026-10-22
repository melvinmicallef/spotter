import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

import { BUILT_IN_MUSCLES } from '@spotter/shared';

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
  {
    version: 4,
    name: 'active_templates_and_exercise_images',
    sql: `
      ALTER TABLE workout_templates ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0
        CHECK (is_active IN (0, 1));
      UPDATE workout_templates SET is_active = 1
      WHERE id = (
        SELECT id FROM workout_templates ORDER BY created_at, id LIMIT 1
      );
      CREATE UNIQUE INDEX workout_templates_one_active_idx
        ON workout_templates(is_active) WHERE is_active = 1;

      CREATE TABLE exercise_images (
        id TEXT PRIMARY KEY,
        mime_type TEXT NOT NULL
          CHECK (mime_type IN ('image/gif', 'image/png', 'image/jpeg')),
        byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
        original_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      INSERT INTO exercise_images (id, mime_type, byte_size, original_name, created_at)
      SELECT id, mime_type, byte_size, original_name, created_at
      FROM exercise_media;
      ALTER TABLE exercises ADD COLUMN image_id TEXT
        REFERENCES exercise_images(id) ON DELETE SET NULL;
      UPDATE exercises SET image_id = media_id WHERE media_id IS NOT NULL;
      UPDATE exercises SET media_id = NULL;
      DELETE FROM exercise_media;
      CREATE UNIQUE INDEX exercises_image_id_idx ON exercises(image_id)
        WHERE image_id IS NOT NULL;
    `,
  },
  {
    version: 5,
    name: 'split_exercise_instructions',
    sql: `
      ALTER TABLE exercises ADD COLUMN preparation TEXT;
      ALTER TABLE exercises ADD COLUMN execution TEXT;
      UPDATE exercises SET execution = instructions
      WHERE instructions IS NOT NULL;
    `,
  },
  {
    version: 6,
    name: 'built_in_muscle_hierarchy_and_exercise_references',
    sql: `
      ALTER TABLE exercise_muscles RENAME TO exercise_muscles_v6;
      ALTER TABLE muscles RENAME TO muscles_v6;

      CREATE TABLE muscles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE,
        group_name TEXT NOT NULL,
        subgroup_name TEXT,
        reference_url TEXT,
        is_builtin INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
        group_order INTEGER NOT NULL DEFAULT 999,
        muscle_order INTEGER NOT NULL DEFAULT 999,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX muscles_hierarchy_idx
        ON muscles(group_name, COALESCE(subgroup_name, ''), name COLLATE NOCASE);
      INSERT INTO muscles
        (id, name, group_name, subgroup_name, reference_url, is_builtin,
         group_order, muscle_order, created_at, updated_at)
      SELECT id, name, 'Legacy', NULL, NULL, 0, 999, 999, created_at, updated_at
      FROM muscles_v6;

      CREATE TABLE exercise_muscles (
        exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        muscle_id TEXT NOT NULL REFERENCES muscles(id) ON DELETE RESTRICT,
        role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
        PRIMARY KEY (exercise_id, muscle_id)
      );
      INSERT INTO exercise_muscles (exercise_id, muscle_id, role)
      SELECT exercise_id, muscle_id, role FROM exercise_muscles_v6;
      DROP TABLE exercise_muscles_v6;
      DROP TABLE muscles_v6;

      ALTER TABLE workout_exercises ADD COLUMN reference_url TEXT;
      UPDATE app_metadata
      SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
      WHERE key = 'reference_revision';
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
  seedBuiltInMuscles(database);
  return database;
}

function seedBuiltInMuscles(database: SpotterDatabase) {
  const timestamp = '2026-10-21T00:00:00.000Z';
  const upsert = database.prepare(`
    INSERT INTO muscles
      (id, name, group_name, subgroup_name, reference_url, is_builtin,
       group_order, muscle_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      group_name = excluded.group_name,
      subgroup_name = excluded.subgroup_name,
      reference_url = excluded.reference_url,
      is_builtin = 1,
      group_order = excluded.group_order,
      muscle_order = excluded.muscle_order,
      updated_at = excluded.updated_at
  `);
  database.transaction(() => {
    for (const muscle of BUILT_IN_MUSCLES) {
      upsert.run(
        muscle.id,
        muscle.name,
        muscle.group,
        muscle.subgroup,
        muscle.referenceUrl,
        muscle.groupOrder,
        muscle.muscleOrder,
        timestamp,
        timestamp,
      );
    }
  })();
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
