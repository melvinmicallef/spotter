import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const port = process.argv[2] ?? '3100';
const runtimeDirectory = mkdtempSync(join(tmpdir(), 'spotter-e2e-'));
const databasePath = join(runtimeDirectory, 'spotter.sqlite');

const build = spawn(npmCommand, ['run', 'build'], { stdio: 'inherit' });
const buildExitCode = await new Promise((resolve, reject) => {
  build.once('error', reject);
  build.once('exit', resolve);
});

if (buildExitCode !== 0) {
  rmSync(runtimeDirectory, { recursive: true, force: true });
  process.exit(typeof buildExitCode === 'number' ? buildExitCode : 1);
}

const server = spawn(process.execPath, ['apps/server/dist/index.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    DATABASE_PATH: databasePath,
  },
});

let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  server.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

server.once('error', (error) => {
  console.error(error);
  rmSync(runtimeDirectory, { recursive: true, force: true });
  process.exit(1);
});

server.once('exit', (code) => {
  rmSync(runtimeDirectory, { recursive: true, force: true });
  process.exit(stopping ? 0 : (code ?? 1));
});
