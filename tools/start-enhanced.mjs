import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(`Node.js 22.13+ is required. Installed: ${process.version}`);
  process.exit(1);
}
const instance = createHash('sha256')
  .update(root.toLowerCase())
  .digest('hex')
  .slice(0, 16);
process.env.COURSE_KB_INSTANCE = instance;
process.env.WRANGLER_SEND_METRICS = 'false';
mkdirSync('work', { recursive: true });
async function health(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(10000),
    });
    const status = response.ok ? await response.json() : null;
    if (process.env.COURSE_KB_DIAGNOSTICS === '1')
      console.log('Local health:', port, response.status, status);
    return status;
  } catch (error) {
    if (process.env.COURSE_KB_DIAGNOSTICS === '1')
      console.log(
        'Local health unavailable:',
        port,
        error.message,
        error.cause?.code,
      );
    return null;
  }
}
async function available(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once('error', () => resolvePort(false));
    server.listen(port, '127.0.0.1', () =>
      server.close(() => resolvePort(true)),
    );
  });
}
function openBrowser(url) {
  if (process.env.COURSE_KB_NO_BROWSER === '1') return;
  const child =
    process.platform === 'win32'
      ? spawn(
          process.env.ComSpec || 'cmd.exe',
          ['/d', '/s', '/c', 'start', '', url],
          { detached: true, stdio: 'ignore', windowsHide: true },
        )
      : spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {
          detached: true,
          stdio: 'ignore',
        });
  child.on('error', () => console.log(`Open this address: ${url}`));
  child.unref();
}
const first = Number(process.env.COURSE_KB_PORT || 3002);
if (!Number.isInteger(first) || first < 1024 || first > 65525) {
  console.error('COURSE_KB_PORT must be an integer from 1024 to 65525.');
  process.exit(1);
}
let port = first;
for (; port <= first + 10; port++) {
  const existing = await health(port);
  if (existing?.app === 'course-kb-v2' && existing.instance === instance) {
    console.log(`Already running: http://localhost:${port}/`);
    openBrowser(`http://localhost:${port}/`);
    process.exit(0);
  }
  if (await available(port)) break;
  if (process.env.COURSE_KB_PORT) {
    console.error(
      `Port ${port} belongs to another process. Choose another COURSE_KB_PORT.`,
    );
    process.exit(1);
  }
}
if (port > first + 10) {
  console.error('No free local port found.');
  process.exit(1);
}
if (!existsSync('node_modules/.package-lock.json')) {
  console.log(
    'First launch: installing locked dependencies (internet required)...',
  );
  const install =
    process.platform === 'win32'
      ? spawnSync(
          process.env.ComSpec || 'cmd.exe',
          ['/d', '/s', '/c', 'npm ci'],
          { stdio: 'inherit', windowsHide: true },
        )
      : spawnSync('npm', ['ci'], { stdio: 'inherit' });
  if (install.status !== 0) {
    console.error(
      'Dependency installation failed. Check the network and retry.',
    );
    process.exit(1);
  }
}
if (!existsSync('.env.local') && existsSync('.env.example'))
  copyFileSync('.env.example', '.env.local');
const server = spawn(
  process.execPath,
  [
    'node_modules/vinext/dist/cli.js',
    'dev',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ],
  { stdio: 'inherit', windowsHide: true },
);
let stopped = false;
let ready = false;
function stop() {
  if (stopped) return;
  stopped = true;
  if (server.exitCode === null && server.pid) {
    if (process.platform === 'win32')
      spawnSync('taskkill.exe', ['/pid', String(server.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    else server.kill('SIGTERM');
  }
}
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
server.on('exit', (code) => {
  process.exitCode = !ready ? 1 : stopped ? 0 : (code ?? 1);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (let i = 0; i < 90; i++) {
  if (server.exitCode !== null) break;
  const status = await health(port);
  if (status?.app === 'course-kb-v2' && status.instance === instance) {
    ready = true;
    break;
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
}
if (ready) {
  const url = `http://localhost:${port}/`;
  writeFileSync(
    'work/local-server.json',
    JSON.stringify({
      version: 2,
      launcherPid: process.pid,
      serverPid: server.pid,
      port,
      instance,
      url,
    }),
  );
  console.log(
    `Enhanced version ready: ${url}\nData: ${resolve('.wrangler')}\nKeep this launcher running. Closing it stops this local app.`,
  );
  openBrowser(url);
} else {
  console.error(
    'The enhanced version did not become ready. Check the errors above.',
  );
  stop();
  process.exitCode = 1;
}
