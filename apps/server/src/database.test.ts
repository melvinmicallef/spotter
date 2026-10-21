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
    ).toBe(2);
    expect(
      database
        .prepare(
          "SELECT 1 FROM pragma_table_info('exercises') WHERE name = 'media_id'",
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
    ).toBe(2);
    upgraded.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
