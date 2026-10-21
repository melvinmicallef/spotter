import { describe, expect, it } from 'vitest';
import request from 'supertest';

import { createApp } from './app.js';
import type { AppConfig } from './config.js';

const config: AppConfig = {
  NODE_ENV: 'test',
  PORT: 3000,
  DATABASE_PATH: ':memory:',
  MEDIA_PATH: './data/test-media',
  APP_VERSION: '0.1.0',
  GIT_COMMIT: 'test',
};

describe('service endpoints', () => {
  it('reports health and version', async () => {
    const app = createApp(config, { isDatabaseReady: () => true });
    await request(app)
      .get('/api/health')
      .expect(200)
      .expect('Content-Type', /json/);
    const version = await request(app).get('/api/version').expect(200);
    expect(version.body).toEqual({
      name: 'spotter',
      version: '0.1.0',
      commit: 'test',
    });
  });

  it('distinguishes readiness failures and unknown API routes', async () => {
    const app = createApp(config, { isDatabaseReady: () => false });
    await request(app).get('/api/health').expect(503);
    await request(app).get('/api/missing').expect(404);
  });
});
