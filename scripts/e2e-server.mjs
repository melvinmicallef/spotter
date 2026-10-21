import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const port = process.argv[2] ?? '3100';
const runtimeDirectory = mkdtempSync(join(tmpdir(), 'spotter-e2e-'));
const databasePath = join(runtimeDirectory, 'spotter.sqlite');
const mediaPath = join(runtimeDirectory, 'media');

const build = spawn(npmCommand, ['run', 'build'], { stdio: 'inherit' });
const buildExitCode = await new Promise((resolve, reject) => {
  build.once('error', reject);
  build.once('exit', resolve);
});

if (buildExitCode !== 0) {
  rmSync(runtimeDirectory, { recursive: true, force: true });
  process.exit(typeof buildExitCode === 'number' ? buildExitCode : 1);
}

const [{ createApp }, { openDatabase }, { MediaStorage }, { SpotterStore }] =
  await Promise.all([
    import('../apps/server/dist/app.js'),
    import('../apps/server/dist/database.js'),
    import('../apps/server/dist/media.js'),
    import('../apps/server/dist/store.js'),
  ]);

const database = openDatabase(databasePath);
const store = new SpotterStore(database);
const config = {
  NODE_ENV: 'production',
  PORT: Number(port),
  DATABASE_PATH: databasePath,
  MEDIA_PATH: mediaPath,
  APP_VERSION: '0.1.0-e2e',
  GIT_COMMIT: 'e2e',
};
const app = createApp(config, {
  isDatabaseReady: () => database.open,
  store,
  mediaStorage: new MediaStorage(mediaPath),
  websiteImportDependencies: {
    resolve: async () => ['93.184.216.34'],
    fetch: async (url) => {
      if (new URL(url).hostname !== 'import.test')
        return new Response('Not found', { status: 404 });
      return new Response(
        `<!doctype html><html><head>
          <meta property="og:title" content="Imported row">
          <meta property="og:description" content="Pause at the top">
          <meta property="og:image" content="https://cdn.import.test/row.gif">
        </head></html>`,
        { headers: { 'Content-Type': 'text/html' } },
      );
    },
  },
});
const server = app.listen(config.PORT);

let stopping = false;

function stop(signal) {
  void signal;
  if (stopping) return;
  stopping = true;
  server.close((error) => {
    store.close();
    rmSync(runtimeDirectory, { recursive: true, force: true });
    process.exit(error ? 1 : 0);
  });
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

server.once('error', (error) => {
  console.error(error);
  rmSync(runtimeDirectory, { recursive: true, force: true });
  process.exit(1);
});
