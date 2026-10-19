import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const cli = process.env.DEVSHIP_TEST_CLI || fileURLToPath(new URL('../bin/devship.mjs', import.meta.url));
export function command(cwd, cmd, args, env = {}) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...inherited,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
    GIT_TERMINAL_PROMPT: '0', ...env }, timeout: 120000 });
  if (r.error) throw r.error;
  return { ...r, text: `${r.stdout || ''}${r.stderr || ''}` };
}
export function git(cwd, ...args) {
  const r = command(cwd, 'git', args);
  if (r.status !== 0) throw new Error(r.text);
  return r.stdout.trim();
}
export function put(root, path, content) {
  const file = join(root, path); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, content);
}
export function cleanupTemp(root, base = tmpdir()) {
  const target = realpathSync(root), parent = realpathSync(base);
  const rel = relative(parent, target);
  if (dirname(target) !== parent || !rel || rel.startsWith('..') || !basename(target).startsWith('devship'))
    throw new Error('Refusing cleanup outside the designated temporary fixture directory');
  rmSync(target, { recursive: true, force: true, maxRetries: 4 });
}
export function fixture(t, config = {}) {
  const base = process.env.DEVSHIP_TEST_TMP || tmpdir();
  const root = mkdtempSync(join(base, 'devship test '));
  t.after(() => cleanupTemp(root, base));
  const remote = join(root, 'origin.git'), repo = join(root, 'project');
  mkdirSync(repo); git(root, 'init', '--bare', remote); git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'DevShip Test'); git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'commit.gpgsign', 'false'); git(repo, 'config', 'core.autocrlf', 'false');
  put(repo, '.devship.json', JSON.stringify({ checks: [[process.execPath, '-e', 'process.exit(0)']], ...config }));
  put(repo, '.gitignore', 'node_modules/\nchecks.log\n'); put(repo, 'app.txt', 'base\n');
  git(repo, 'add', '.'); git(repo, 'commit', '-m', 'initial'); git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', '-u', 'origin', 'main'); git(repo, 'switch', '-c', 'feature/demo');
  const run = (...args) => command(repo, process.execPath, [cli, ...args], { DEVSHIP_GLOBAL_CONFIG: join(root, 'absent.json') });
  const clone = () => {
    const other = join(root, 'other'); git(root, 'clone', '-b', 'main', remote, other);
    git(other, 'config', 'user.name', 'Other'); git(other, 'config', 'user.email', 'other@example.invalid');
    return other;
  };
  return { root, remote, repo, run, clone };
}
