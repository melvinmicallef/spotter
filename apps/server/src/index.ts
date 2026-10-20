import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './database.js';
import { SpotterStore } from './store.js';

const config = loadConfig();
const database = openDatabase(config.DATABASE_PATH);
const store = new SpotterStore(database);
const app = createApp(config, { isDatabaseReady: () => database.open, store });
const server = app.listen(config.PORT, () => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'Spotter server started',
      port: config.PORT,
      version: config.APP_VERSION,
      databasePath: config.DATABASE_PATH,
    }),
  );
});

function shutdown(signal: string) {
  console.log(
    JSON.stringify({ level: 'info', message: 'Shutting down', signal }),
  );
  server.close((error) => {
    store.close();
    process.exit(error ? 1 : 0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
