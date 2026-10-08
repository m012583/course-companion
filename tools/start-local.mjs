import { copyFileSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';

const major = Number(process.versions.node.split('.')[0]);
if (!Number.isInteger(major) || major < 22) {
  console.error(
    `Node.js 22 or newer is required. Current version: ${process.version}`,
  );
  process.exit(1);
}

const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!existsSync('node_modules/.package-lock.json')) {
  console.log('First run: installing the locked dependencies...');
  const install =
    process.platform === 'win32'
      ? spawnSync(
          process.env.ComSpec || 'cmd.exe',
          ['/d', '/s', '/c', 'npm ci'],
          { stdio: 'inherit' },
        )
      : spawnSync(command, ['ci'], { stdio: 'inherit' });
  if (install.status !== 0) {
    console.error(
      'Dependency installation failed. Check the network, then run the launcher again.',
    );
    process.exit(1);
  }
}

if (!existsSync('.env.local') && existsSync('.env.example'))
  copyFileSync('.env.example', '.env.local');

const requestedPort = process.env.COURSE_KB_PORT || '3000';
if (
  !/^\d+$/.test(requestedPort) ||
  Number(requestedPort) < 1 ||
  Number(requestedPort) > 65535
) {
  console.error(`Invalid COURSE_KB_PORT: ${requestedPort}`);
  process.exit(1);
}

const url = `http://localhost:${requestedPort}/#view=home`;
const serverArgs = [
  'run',
  'dev',
  '--',
  '--host',
  '127.0.0.1',
  '--port',
  requestedPort,
  '--strictPort',
];
const server =
  process.platform === 'win32'
    ? spawn(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', command, ...serverArgs],
        { stdio: 'inherit' },
      )
    : spawn(command, serverArgs, {
        stdio: 'inherit',
      });
let stopped = false;
server.on('exit', (code) => {
  if (!stopped && code)
    console.error(`The local server stopped with code ${code}.`);
  process.exitCode = code ?? 0;
});

const stop = () => {
  stopped = true;
  if (!server.killed) server.kill('SIGINT');
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

async function waitForSite() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null)
      throw new Error(
        `The local server exited before it became ready. Port ${requestedPort} may already be in use.`,
      );
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('The local server did not become ready within 30 seconds.');
}

try {
  await waitForSite();
  console.log(`Ready: ${url}`);
  if (process.env.COURSE_KB_NO_BROWSER !== '1') {
    if (process.platform === 'win32') {
      const opener = spawn(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', 'start', '', url],
        { detached: true, stdio: 'ignore', windowsHide: true },
      );
      opener.unref();
    } else {
      const opener = spawn(
        process.platform === 'darwin' ? 'open' : 'xdg-open',
        [url],
        { detached: true, stdio: 'ignore' },
      );
      opener.unref();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  stop();
  process.exitCode = 1;
}
