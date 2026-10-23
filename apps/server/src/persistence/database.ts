import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

import { BUILT_IN_MUSCLES } from '@spotter/shared';

interface Migration {
  version: number;
  name: string;
  sql: string;
  rebuildsReferencedTables?: boolean;
}

// This is the clean pre-user baseline. Future releases append migrations here;
// applied versions and names must never be edited or reused.
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'baseline',
    sql: `
      CREATE TABLE app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO app_metadata (key, value) VALUES ('reference_revision', '0');

      CREATE TABLE exercise_images (
        id TEXT PRIMARY KEY,
        mime_type TEXT NOT NULL
          CHECK (mime_type IN ('image/gif', 'image/png', 'image/jpeg')),
        byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
        original_name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

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

      CREATE TABLE exercises (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        exercise_category TEXT NOT NULL
          CHECK (exercise_category IN ('strength', 'calisthenics', 'cardio')),
        preparation TEXT,
        execution TEXT,
        comments TEXT,
        image_id TEXT REFERENCES exercise_images(id) ON DELETE SET NULL,
        source_url TEXT,
        source_title TEXT,
        source_media_url TEXT,
        source_imported_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX exercises_image_id_idx ON exercises(image_id)
        WHERE image_id IS NOT NULL;

      CREATE TABLE exercise_muscles (
        exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
        muscle_id TEXT NOT NULL REFERENCES muscles(id) ON DELETE RESTRICT,
        role TEXT NOT NULL CHECK (role IN ('primary', 'secondary')),
        PRIMARY KEY (exercise_id, muscle_id)
      );
      CREATE INDEX exercise_muscles_muscle_idx ON exercise_muscles(muscle_id);

      CREATE TABLE workout_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        notes TEXT,
        is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
        active_since TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        CHECK ((is_active = 1 AND active_since IS NOT NULL)
          OR (is_active = 0 AND active_since IS NULL))
      );
      CREATE UNIQUE INDEX workout_templates_one_active_idx
        ON workout_templates(is_active) WHERE is_active = 1;

      CREATE TABLE template_day_names (
        template_id TEXT NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
        PRIMARY KEY (template_id, day_of_week)
      );

      CREATE TABLE template_exercises (
        id TEXT PRIMARY KEY,
        template_id TEXT NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
        exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
        day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        position INTEGER NOT NULL CHECK (position >= 0),
        target_sets INTEGER CHECK (target_sets > 0),
        target_reps INTEGER CHECK (target_reps > 0),
        target_duration_seconds INTEGER CHECK (target_duration_seconds > 0),
        target_distance REAL CHECK (target_distance > 0),
        target_distance_unit TEXT NOT NULL DEFAULT 'km'
          CHECK (target_distance_unit IN ('km', 'mi')),
        cardio_mode TEXT CHECK (cardio_mode IN ('duration', 'interval')),
        interval_prep_seconds INTEGER
          CHECK (interval_prep_seconds IS NULL OR interval_prep_seconds >= 0),
        interval_work_seconds INTEGER
          CHECK (interval_work_seconds IS NULL OR interval_work_seconds > 0),
        interval_rest_seconds INTEGER
          CHECK (interval_rest_seconds IS NULL OR interval_rest_seconds >= 0),
        interval_iterations INTEGER
          CHECK (interval_iterations IS NULL OR interval_iterations BETWEEN 1 AND 999),
        UNIQUE (template_id, day_of_week, position)
      );
      CREATE INDEX template_exercises_exercise_idx ON template_exercises(exercise_id);

      CREATE TABLE app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        stretching_poster_id TEXT REFERENCES exercise_images(id) ON DELETE SET NULL
      );
      INSERT INTO app_settings (id, stretching_poster_id) VALUES (1, NULL);

      CREATE TABLE workout_sessions (
        id TEXT PRIMARY KEY,
        template_id TEXT REFERENCES workout_templates(id) ON DELETE SET NULL,
        template_day INTEGER CHECK (template_day BETWEEN 1 AND 7),
        template_day_name TEXT
          CHECK (template_day_name IS NULL OR length(trim(template_day_name)) BETWEEN 1 AND 100),
        name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        notes TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX workout_sessions_started_idx ON workout_sessions(started_at DESC);
      CREATE INDEX workout_sessions_template_idx
        ON workout_sessions(template_id) WHERE template_id IS NOT NULL;

      CREATE TABLE workout_exercises (
        id TEXT PRIMARY KEY,
        workout_id TEXT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
        exercise_id TEXT REFERENCES exercises(id) ON DELETE SET NULL,
        exercise_name TEXT NOT NULL,
        exercise_category TEXT NOT NULL
          CHECK (exercise_category IN ('strength', 'calisthenics', 'cardio')),
        reference_url TEXT,
        position INTEGER NOT NULL CHECK (position >= 0),
        notes TEXT,
        target_sets INTEGER CHECK (target_sets > 0),
        target_reps INTEGER CHECK (target_reps > 0),
        target_duration_seconds INTEGER CHECK (target_duration_seconds > 0),
        target_distance REAL CHECK (target_distance > 0),
        target_distance_unit TEXT NOT NULL DEFAULT 'km'
          CHECK (target_distance_unit IN ('km', 'mi')),
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        cardio_mode TEXT CHECK (cardio_mode IN ('duration', 'interval')),
        interval_prep_seconds INTEGER
          CHECK (interval_prep_seconds IS NULL OR interval_prep_seconds >= 0),
        interval_work_seconds INTEGER
          CHECK (interval_work_seconds IS NULL OR interval_work_seconds > 0),
        interval_rest_seconds INTEGER
          CHECK (interval_rest_seconds IS NULL OR interval_rest_seconds >= 0),
        interval_iterations INTEGER
          CHECK (interval_iterations IS NULL OR interval_iterations BETWEEN 1 AND 999),
        UNIQUE (workout_id, position)
      );
      CREATE INDEX workout_exercises_exercise_idx
        ON workout_exercises(exercise_id) WHERE exercise_id IS NOT NULL;

      CREATE TABLE workout_sets (
        id TEXT PRIMARY KEY,
        workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
        position INTEGER NOT NULL CHECK (position >= 0),
        reps INTEGER CHECK (reps >= 0),
        weight REAL CHECK (weight >= 0),
        weight_unit TEXT NOT NULL CHECK (weight_unit IN ('kg', 'lb')),
        duration_seconds INTEGER CHECK (duration_seconds >= 0),
        distance REAL CHECK (distance >= 0),
        distance_unit TEXT NOT NULL DEFAULT 'km'
          CHECK (distance_unit IN ('km', 'mi')),
        notes TEXT,
        completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
        UNIQUE (workout_exercise_id, position)
      );

      CREATE TABLE processed_operations (
        operation_id TEXT PRIMARY KEY,
        processed_at TEXT NOT NULL
      );
    `,
  },
];

export type SpotterDatabase = Database.Database;

export function openDatabase(path: string): SpotterDatabase {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const database = new Database(path);
  try {
    database.pragma('foreign_keys = ON');
    database.pragma('busy_timeout = 5000');
    if (path !== ':memory:') database.pragma('journal_mode = WAL');
    migrate(database);
    seedBuiltInMuscles(database);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
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

  const appliedRows = database
    .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
    .all() as { version: number; name: string }[];
  for (const [index, row] of appliedRows.entries()) {
    const known = migrations[index];
    if (!known || row.version !== known.version || row.name !== known.name) {
      throw new Error(
        `Unsupported database migration ${row.version} (${row.name}); expected ${known ? `${known.version} (${known.name})` : 'no further migrations'}`,
      );
    }
  }
  const applied = new Set(appliedRows.map((row) => row.version));

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const rebuildsReferencedTables =
      'rebuildsReferencedTables' in migration &&
      migration.rebuildsReferencedTables;
    if (rebuildsReferencedTables) database.pragma('foreign_keys = OFF');
    try {
      database.transaction(() => {
        database.exec(migration.sql);
        if (rebuildsReferencedTables) {
          const violations = database.pragma('foreign_key_check') as unknown[];
          if (violations.length > 0)
            throw new Error(
              `Migration ${migration.version} left ${violations.length} foreign key violations`,
            );
        }
        database
          .prepare(
            'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
          )
          .run(migration.version, migration.name, new Date().toISOString());
      })();
    } finally {
      if (rebuildsReferencedTables) database.pragma('foreign_keys = ON');
    }
  }
}
