import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp(config, { isDatabaseReady: () => true });
const server = app.listen(config.PORT, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Spotter server started',
      port: config.PORT,
      version: config.APP_VERSION,
    }),
  );
});

function shutdown(signal: string) {
  console.log(
    JSON.stringify({ level: 'info', message: 'Shutting down', signal }),
  );
  server.close((error) => {
    process.exit(error ? 1 : 0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
