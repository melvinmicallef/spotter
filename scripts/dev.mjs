import { spawn } from 'node:child_process';

const commands = [
  ['shared', ['run', 'dev', '-w', '@spotter/shared']],
  ['server', ['run', 'dev', '-w', '@spotter/server']],
  ['web', ['run', 'dev', '-w', '@spotter/web']],
];

const children = commands.map(([name, args]) => {
  const child = spawn('npm', args, { stdio: ['inherit', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) =>
    process.stdout.write(`[${name}] ${chunk}`),
  );
  child.stderr.on('data', (chunk) =>
    process.stderr.write(`[${name}] ${chunk}`),
  );
  return child;
});

function stop(signal) {
  for (const child of children) child.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
