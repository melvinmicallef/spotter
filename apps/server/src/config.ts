import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  DATABASE_PATH: z.string().min(1).default('./data/spotter.sqlite'),
  WEB_DIST_PATH: z.string().min(1).optional(),
  APP_VERSION: z.string().min(1).default('0.1.0'),
  GIT_COMMIT: z.string().min(1).default('development'),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  return configSchema.parse(environment);
}
