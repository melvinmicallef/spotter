import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import type { AppConfig } from './config.js';

export interface AppDependencies {
  isDatabaseReady: () => boolean;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export function createApp(config: AppConfig, dependencies: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    if (!dependencies.isDatabaseReady()) {
      response.status(503).json({
        error: { code: 'DATABASE_NOT_READY', message: 'Database is not ready' },
      });
      return;
    }

    response.json({
      status: 'ok',
      database: 'ready',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/version', (_request, response) => {
    response.json({
      name: 'spotter',
      version: config.APP_VERSION,
      commit: config.GIT_COMMIT,
    });
  });

  app.use('/api', (_request, response) => {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'API endpoint not found' },
    });
  });

  const webDist = config.WEB_DIST_PATH
    ? resolve(config.WEB_DIST_PATH)
    : resolve(moduleDirectory, '../../web/dist');

  if (existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*path', (_request, response) =>
      response.sendFile(resolve(webDist, 'index.html')),
    );
  }

  return app;
}
