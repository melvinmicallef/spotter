import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import { ZodError } from 'zod';

import { createApiRouter } from './api.js';
import type { AppConfig } from './config.js';
import { AppError } from './errors.js';
import type { SpotterStore } from './persistence/store.js';
import type { MediaStorage } from './features/media/storage.js';

export interface AppDependencies {
  isDatabaseReady: () => boolean;
  store?: SpotterStore;
  mediaStorage?: MediaStorage;
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

  if (dependencies.store)
    app.use(
      '/api',
      createApiRouter(dependencies.store, {
        mediaStorage: dependencies.mediaStorage,
      }),
    );

  app.use('/api', (_request, response) => {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'API endpoint not found' },
    });
  });

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;
      if (error instanceof ZodError) {
        response.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: error.issues,
          },
        });
        return;
      }
      if (error instanceof AppError) {
        response.status(error.status).json({
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        });
        return;
      }
      if (
        typeof error === 'object' &&
        error !== null &&
        'type' in error &&
        error.type === 'entity.too.large'
      ) {
        response.status(413).json({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'The request body exceeds the allowed size',
          },
        });
        return;
      }
      console.error(
        JSON.stringify({ level: 'error', message: 'Unhandled request error' }),
      );
      response.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
      });
    },
  );

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
