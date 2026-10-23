import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { migrations, openDatabase } from './database.js';

describe('database baseline and migrations', () => {
  it('creates the canonical schema with foreign keys and no legacy columns', () => {
    const database = openDatabase(':memory:');
    expect(migrations).toHaveLength(1);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('foreign_key_check')).toEqual([]);
    expect(
      database.prepare('SELECT version, name FROM schema_migrations').all(),
    ).toEqual([{ version: 1, name: 'baseline' }]);
    expect(
      database
        .prepare(
          "SELECT name FROM pragma_table_info('exercises') WHERE name IN ('instructions', 'media_id', 'exercise_type')",
        )
        .all(),
    ).toEqual([]);
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE name IN ('exercise_media', 'workout_sessions_status_idx', 'workout_sets_exercise_idx')",
        )
        .all(),
    ).toEqual([]);
    expect(
      (
        database
          .prepare('SELECT COUNT(*) AS count FROM muscles WHERE is_builtin = 1')
          .get() as { count: number }
      ).count,
    ).toBe(45);
    database.close();
  });

  it('retains data when opening the same database again', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spotter-database-'));
    const path = join(directory, 'spotter.sqlite');
    const first = openDatabase(path);
    first
      .prepare(
        `INSERT INTO exercises
         (id, name, exercise_category, created_at, updated_at)
         VALUES ('exercise', 'Pull-up', 'calisthenics', ?, ?)`,
      )
      .run('2026-10-23T00:00:00.000Z', '2026-10-23T00:00:00.000Z');
    first.close();

    const second = openDatabase(path);
    expect(
      second
        .prepare(
          "SELECT exercise_category FROM exercises WHERE id = 'exercise'",
        )
        .get(),
    ).toEqual({ exercise_category: 'calisthenics' });
    expect(
      (
        second
          .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
          .get() as {
          count: number;
        }
      ).count,
    ).toBe(1);
    second.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('enforces categories, active timestamps, and unique workout positions', () => {
    const database = openDatabase(':memory:');
    const timestamp = '2026-10-23T00:00:00.000Z';
    expect(() =>
      database
        .prepare(
          `INSERT INTO exercises
           (id, name, exercise_category, created_at, updated_at)
           VALUES ('invalid', 'Invalid', 'powerlifting', ?, ?)`,
        )
        .run(timestamp, timestamp),
    ).toThrow();
    expect(() =>
      database
        .prepare(
          `INSERT INTO workout_templates
           (id, name, is_active, created_at, updated_at)
           VALUES ('invalid', 'Invalid', 1, ?, ?)`,
        )
        .run(timestamp, timestamp),
    ).toThrow();
    database
      .prepare(
        `INSERT INTO workout_sessions
         (id, name, status, started_at, updated_at)
         VALUES ('workout', 'Workout', 'in_progress', ?, ?)`,
      )
      .run(timestamp, timestamp);
    const insertEntry = database.prepare(
      `INSERT INTO workout_exercises
       (id, workout_id, exercise_name, exercise_category, position)
       VALUES (?, 'workout', 'Pull-up', 'calisthenics', 0)`,
    );
    insertEntry.run('first');
    expect(() => insertEntry.run('second')).toThrow();
    expect(database.pragma('foreign_key_check')).toEqual([]);
    database.close();
  });

  it('rejects database histories from a different or newer schema', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spotter-database-'));
    const path = join(directory, 'spotter.sqlite');
    const database = new Database(path);
    database.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations VALUES (1, 'old_baseline', '2026-10-23T00:00:00.000Z');
    `);
    database.close();
    expect(() => openDatabase(path)).toThrow('Unsupported database migration');

    const newer = new Database(path);
    newer.exec(`
      UPDATE schema_migrations SET name = 'baseline' WHERE version = 1;
      INSERT INTO schema_migrations VALUES (2, 'future', '2026-10-23T00:00:00.000Z');
    `);
    newer.close();
    expect(() => openDatabase(path)).toThrow('Unsupported database migration');
    rmSync(directory, { recursive: true, force: true });
  });

  it('rolls back a failed baseline migration', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spotter-database-'));
    const path = join(directory, 'spotter.sqlite');
    const database = new Database(path);
    database.exec('CREATE TABLE exercises (id TEXT PRIMARY KEY)');
    database.close();

    expect(() => openDatabase(path)).toThrow('table exercises already exists');
    const unchanged = new Database(path);
    expect(
      unchanged
        .prepare("SELECT name FROM sqlite_master WHERE name = 'app_metadata'")
        .get(),
    ).toBeUndefined();
    expect(unchanged.prepare('SELECT * FROM schema_migrations').all()).toEqual(
      [],
    );
    unchanged.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
