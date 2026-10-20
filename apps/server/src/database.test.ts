import { describe, expect, it } from 'vitest';

import { openDatabase } from './database.js';

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
    ).toBe(1);
    database.close();
  });
});
