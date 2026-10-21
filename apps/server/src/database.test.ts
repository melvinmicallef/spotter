import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { migrations, openDatabase } from './database.js';

describe('database migrations', () => {
  it('applies migrations once and enables foreign keys', () => {
    const database = openDatabase(':memory:');
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(
      (
        database
          .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
          .get() as { count: number }
      ).count,
    ).toBe(4);
    expect(
      database
        .prepare(
          "SELECT 1 FROM pragma_table_info('exercises') WHERE name = 'image_id'",
        )
        .get(),
    ).toBeTruthy();
    database.close();
  });

  it('upgrades a version-one database without replacing catalogue data', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spotter-migration-'));
    const path = join(directory, 'spotter.sqlite');
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      ${migrations[0].sql}
    `);
    legacy
      .prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
      )
      .run(1, migrations[0].name, new Date().toISOString());
    legacy
      .prepare(
        'INSERT INTO muscles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
      )
      .run(
        '34d43cac-2469-44f0-92e4-3fe2bd59af83',
        'Back',
        new Date().toISOString(),
        new Date().toISOString(),
      );
    legacy.close();

    const upgraded = openDatabase(path);
    expect(
      (upgraded.prepare('SELECT name FROM muscles').get() as { name: string })
        .name,
    ).toBe('Back');
    expect(
      (
        upgraded
          .prepare('SELECT MAX(version) AS version FROM schema_migrations')
          .get() as { version: number }
      ).version,
    ).toBe(4);
    upgraded.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('migrates version-two workouts and template entries as Monday strength data', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spotter-migration-'));
    const path = join(directory, 'spotter.sqlite');
    const legacy = new Database(path);
    const timestamp = '2026-10-20T10:00:00.000Z';
    const exerciseId = '34d43cac-2469-44f0-92e4-3fe2bd59af83';
    const mediaId = '9920d274-a80b-484a-8bb1-7e8a4a3af726';
    const templateId = '13c278ce-b0cb-45dd-885c-4c6637af95c7';
    const templateExerciseId = 'fb0b70d8-bbad-4c52-90fe-f2f29d34a89d';
    const workoutId = 'ea35e18d-6868-4d37-a79b-3b1b129705dc';
    const workoutExerciseId = 'f21e3387-9985-443b-a15b-ec72e26df978';
    const setId = 'a491643c-d141-43fd-90e5-d9d1d87baf7b';
    legacy.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      ${migrations[0].sql}
      ${migrations[1].sql}
    `);
    const recordMigration = legacy.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    );
    recordMigration.run(1, migrations[0].name, timestamp);
    recordMigration.run(2, migrations[1].name, timestamp);
    legacy
      .prepare(
        `INSERT INTO exercise_media
         (id, kind, mime_type, byte_size, original_name, created_at)
         VALUES (?, 'gif', 'image/gif', ?, ?, ?)`,
      )
      .run(mediaId, 128, 'legacy.gif', timestamp);
    legacy
      .prepare(
        `INSERT INTO exercises
         (id, name, instructions, media_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(exerciseId, 'Legacy press', null, mediaId, timestamp, timestamp);
    legacy
      .prepare(
        `INSERT INTO workout_templates (id, name, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(templateId, 'Legacy plan', null, timestamp, timestamp);
    legacy
      .prepare(
        `INSERT INTO template_exercises
         (id, template_id, exercise_id, position, notes, target_sets, target_reps)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(templateExerciseId, templateId, exerciseId, 0, null, 3, 8);
    legacy
      .prepare(
        `INSERT INTO workout_sessions
         (id, template_id, name, status, started_at, completed_at, notes, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        workoutId,
        templateId,
        'Legacy workout',
        'completed',
        timestamp,
        timestamp,
        null,
        timestamp,
      );
    legacy
      .prepare(
        `INSERT INTO workout_exercises
         (id, workout_id, exercise_id, exercise_name, position, notes, target_sets, target_reps)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        workoutExerciseId,
        workoutId,
        exerciseId,
        'Legacy press',
        0,
        null,
        3,
        8,
      );
    legacy
      .prepare(
        `INSERT INTO workout_sets
         (id, workout_exercise_id, position, reps, weight, weight_unit, notes, completed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(setId, workoutExerciseId, 0, 8, 60, 'kg', null, 1);
    legacy.close();

    const upgraded = openDatabase(path);
    expect(
      upgraded
        .prepare('SELECT exercise_type FROM exercises WHERE id = ?')
        .get(exerciseId),
    ).toEqual({ exercise_type: 'strength' });
    expect(
      upgraded
        .prepare(
          `SELECT exercises.image_id, exercise_images.mime_type,
            exercise_images.original_name, workout_templates.is_active
           FROM exercises
           JOIN exercise_images ON exercise_images.id = exercises.image_id
           JOIN workout_templates ON workout_templates.id = ?
           WHERE exercises.id = ?`,
        )
        .get(templateId, exerciseId),
    ).toEqual({
      image_id: mediaId,
      mime_type: 'image/gif',
      original_name: 'legacy.gif',
      is_active: 1,
    });
    expect(
      upgraded
        .prepare(
          `SELECT day_of_week, position, target_sets, target_reps,
            target_duration_seconds, target_distance
           FROM template_exercises WHERE id = ?`,
        )
        .get(templateExerciseId),
    ).toEqual({
      day_of_week: 1,
      position: 0,
      target_sets: 3,
      target_reps: 8,
      target_duration_seconds: null,
      target_distance: null,
    });
    expect(
      upgraded
        .prepare(
          `SELECT workout_sessions.template_day, workout_exercises.exercise_type,
            workout_sets.reps, workout_sets.weight, workout_sets.duration_seconds,
            workout_sets.distance
           FROM workout_sessions
           JOIN workout_exercises ON workout_exercises.workout_id = workout_sessions.id
           JOIN workout_sets ON workout_sets.workout_exercise_id = workout_exercises.id
           WHERE workout_sessions.id = ?`,
        )
        .get(workoutId),
    ).toEqual({
      template_day: null,
      exercise_type: 'strength',
      reps: 8,
      weight: 60,
      duration_seconds: null,
      distance: null,
    });
    upgraded.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
