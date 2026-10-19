import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupTemp, put, fixture, git } from './helpers.mjs';

export function tarFixture(entries) {
  const pieces = [];
  for (const [name, content, type = '0'] of entries) {
    const data = Buffer.from(content), header = Buffer.alloc(512);
    header.write(name, 0, 100); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.fill(32, 148, 156); header.write(type, 156);
    header.write('ustar\0', 257); header.write('00', 263);
    const sum = header.reduce((a, b) => a + b, 0); header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    pieces.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...pieces, Buffer.alloc(1024)]));
}
const pkg = version => JSON.stringify({ name: 'devship-cli-local', version, engines: { node: '>=22' }, bin: { devship: 'bin/devship.mjs', ds: 'bin/devship.mjs' } });
const candidate = () => tarFixture([['package/package.json', pkg('2.1.0')], ['package/bin/devship.mjs', '#!/usr/bin/env node\nconsole.log("2.1.0");']]);
const manifest = data => ({ schemaVersion: 1, package: 'devship-cli-local', version: '2.1.0', asset: 'devship-cli-local.tgz', sha256: createHash('sha256').update(data).digest('hex'), size: data.length });
const base = 'https://github.com/LatipovYusuf444/devship/releases/download/v2.1.0/';
const release = { tag_name: 'v2.1.0', draft: false, prerelease: false, assets: [
  { name: 'release.json', browser_download_url: base + 'release.json' }, { name: 'devship-cli-local.tgz', browser_download_url: base + 'devship-cli-local.tgz' }
] };
function transport(data, changes = {}) {
  return async url => {
    if (url.endsWith('/releases/latest')) return Response.json(release);
    if (url.endsWith('release.json')) return Response.json({ ...manifest(data), ...changes });
    if (url.endsWith('devship-cli-local.tgz')) return new Response(data);
    throw new Error('unexpected network destination');
  };
}
function temp(t) { const root = mkdtempSync(join(tmpdir(), 'devship-update-')); t.after(() => cleanupTemp(root)); return root; }

test('updater validates package identity and rejects traversal, symlink and checksum corruption', async () => {
  const { validatePackage } = await import('../src/updates.mjs'); const data = candidate();
  assert.equal(validatePackage(data, manifest(data)).version, '2.1.0');
  assert.throws(() => validatePackage(Buffer.concat([data, Buffer.from('bad')]), manifest(data)), e => e.code === 'UPDATE');
  for (const entry of [['package/../escape', 'bad'], ['package/link', '', '2'], ['package/package.json', pkg('9.0.0')]]) {
    const invalid = tarFixture([['package/package.json', pkg('2.1.0')], ['package/bin/devship.mjs', 'code'], entry]);
    assert.throws(() => validatePackage(invalid, manifest(invalid)), e => e.code === 'UPDATE');
  }
});

test('download refuses an altered digest and an asset hosted outside the pinned repository', async () => {
  const { downloadUpdate } = await import('../src/updates.mjs'); const data = candidate();
  await assert.rejects(downloadUpdate('2.0.0', { fetchFn: transport(data, { sha256: '0'.repeat(64) }) }), e => e.code === 'UPDATE');
  await assert.rejects(downloadUpdate('2.0.0', { fetchFn: async () => Response.json({ ...release, assets: [{ name: 'release.json', browser_download_url: 'https://evil.invalid/release.json' }] }) }), e => e.code === 'UPDATE');
});

test('update notice caches new version, tolerates offline and never invokes an installer', async t => {
  const { updateNotice } = await import('../src/updates.mjs'); const directory = temp(t), logs = []; let calls = 0;
  const options = { directory, current: '2.0.0', log: text => logs.push(text), fetchFn: async () => { calls++; return Response.json(release); } };
  await updateNotice(options); await updateNotice(options);
  assert.equal(calls, 1); assert.match(logs.join('\n'), /2\.1\.0.*ds update/);
  await updateNotice({ ...options, directory: join(directory, 'offline'), fetchFn: async () => { throw new Error('offline'); } });
});

test('failed installation restores the backup and leaves project untouched', async t => {
  const { applyUpdate } = await import('../src/updates.mjs'); const root = temp(t), prefix = join(root, 'prefix');
  const installed = join(prefix, ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules', 'devship-cli-local'); put(installed, 'package.json', pkg('2.0.0'));
  put(root, 'project/work.txt', 'keep local work'); const operations = [];
  const result = await applyUpdate({ current: '2.0.0', packageRoot: installed, directory: join(root, 'state'),
    fetchFn: transport(candidate()), log: () => {}, runFn: (command, args, options) => {
      if (args[0] === 'prefix') return { ok: true, stdout: prefix };
      operations.push(args);
      if (args[0] === 'pack') { put(options.cwd, 'backup.tgz', 'backup'); return { ok: true, stdout: '[{"filename":"backup.tgz"}]' }; }
      if (args.includes(join(options.cwd, 'candidate.tgz'))) return { ok: false, stderr: 'failed' };
      return { ok: true, stdout: '' };
    } });
  assert.equal(result.status, 'rolled-back'); assert.equal(operations.filter(args => args[0] === 'install').length, 2);
  for (const args of operations.filter(args => args[0] === 'install')) assert.ok(args.includes('--ignore-scripts'));
  assert.equal(readFileSync(join(root, 'project/work.txt'), 'utf8'), 'keep local work');
});

test('unsafe HTTPS redirects and oversized metadata are rejected before install', async () => {
  const { downloadUpdate } = await import('../src/updates.mjs');
  await assert.rejects(downloadUpdate('2.0.0', { fetchFn: async () => new Response(null, { status: 302, headers: { location: 'http://github.com/x' } }) }), e => e.code === 'UPDATE');
  await assert.rejects(downloadUpdate('2.0.0', { fetchFn: async () => new Response('x'.repeat(1024 * 1024 + 1)) }), e => e.code === 'UPDATE');
});

test('a real npm global installation upgrades from a verified local archive with no network installer dependencies', async t => {
  const { applyUpdate } = await import('../src/updates.mjs'); const { run } = await import('../src/process.mjs');
  const root = temp(t), prefix = join(root, 'prefix'), folder = join(root, 'bootstrap');
  put(folder, 'package.json', pkg('2.0.0')); put(folder, 'bin/devship.mjs', '#!/usr/bin/env node\nconsole.log("2.0.0");');
  const args = ['install', '--global', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', '--offline', folder];
  // npm install from a folder is a link; pack first so the updater sees a normal global package.
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', root], { cwd: folder });
  args[args.length - 1] = join(root, 'devship-cli-local-2.0.0.tgz'); run('npm', args, { cwd: root });
  const installed = join(prefix, ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules', 'devship-cli-local');
  const result = await applyUpdate({ current: '2.0.0', packageRoot: installed, directory: join(root, 'state'), fetchFn: transport(candidate()), log() {},
    runFn: (program, argv, options) => argv[0] === 'prefix' ? { ok: true, stdout: prefix } : run(program, argv[0] === 'install' ? [...argv, '--offline'] : argv, options) });
  assert.equal(result.status, 'updated');
  assert.equal(JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8')).version, '2.1.0');
  assert.equal(run(process.execPath, [join(installed, 'bin/devship.mjs')], { cwd: root }).stdout.trim(), '2.1.0');
});

test('updater refuses a project dependency when npm reports another global prefix', async t => {
  const { installationPrefix } = await import('../src/updates.mjs'); const root = temp(t);
  const dependency = join(root, 'project', 'node_modules', 'devship-cli-local'); put(dependency, 'package.json', pkg('2.0.0'));
  put(root, 'global/keep.txt', 'keep');
  assert.throws(() => installationPrefix(dependency, join(root, 'global')), e => e.code === 'UPDATE');
});

test('a help-like commit message cannot bypass the installation gate and publish', async t => {
  const { installationGate } = await import('../src/updates.mjs'); const f = fixture(t);
  const release = installationGate({ directory: join(f.root, 'updates') });
  try {
    const diagnostic = f.run('doctor');
    assert.match(diagnostic.text, /Branch\/remote/, 'doctor must inspect readiness even while the installation gate is held');
    const result = f.run('-m', '-h');
    assert.equal(result.status, 1, result.text); assert.match(result.text, /\[LOCK\]/);
    assert.throws(() => git(f.remote, 'rev-parse', '--verify', 'refs/heads/feature/demo'));
  } finally { release(); }
});

test('archive validation rejects filesystem aliases', async () => {
  const { validatePackage } = await import('../src/updates.mjs');
  for (const name of ['package//package.json', 'package/PACKAGE.JSON', 'package/package.json.', 'package/aux.txt', 'package/src/file.']) {
    const data = tarFixture([['package/package.json', pkg('2.1.0')], ['package/bin/devship.mjs', 'code'], [name, '{}']]);
    assert.throws(() => validatePackage(data, manifest(data)), e => e.code === 'UPDATE', name);
  }
});
for (const [name, change] of [['unexpected global command', { bin: { devship: 'bin/devship.mjs', ds: 'bin/devship.mjs', git: 'bin/devship.mjs' } }], ['unexpected dependency', { dependencies: { unwanted: '*' } }]]) {
  test(`archive validation rejects ${name}`, async () => {
    const { validatePackage } = await import('../src/updates.mjs');
    const data = tarFixture([['package/package.json', JSON.stringify({ ...JSON.parse(pkg('2.1.0')), ...change })], ['package/bin/devship.mjs', 'code']]);
    assert.throws(() => validatePackage(data, manifest(data)), e => e.code === 'UPDATE');
  });
}

test('rollback success is not claimed unless the old installed version is actually restored', async t => {
  const { applyUpdate } = await import('../src/updates.mjs'); const root = temp(t), prefix = join(root, 'prefix');
  const installed = join(prefix, ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules', 'devship-cli-local'); put(installed, 'package.json', pkg('2.0.0'));
  await assert.rejects(applyUpdate({ current: '2.0.0', packageRoot: installed, directory: join(root, 'state'), fetchFn: transport(candidate()), log() {}, runFn: (program, args, options) => {
    if (args[0] === 'prefix') return { ok: true, stdout: prefix };
    if (args[0] === 'pack') { put(options.cwd, 'backup.tgz', 'backup'); return { ok: true, stdout: '[{"filename":"backup.tgz"}]' }; }
    if (args.includes(join(options.cwd, 'candidate.tgz'))) { put(installed, 'package.json', pkg('2.1.0')); return { ok: false }; }
    return { ok: true };
  } }), e => e.code === 'UPDATE' && /Zaxira/.test(e.message));
});
