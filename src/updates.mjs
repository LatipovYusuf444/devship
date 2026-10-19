import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, basename, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { globalConfigPath } from './config.mjs';
import { atomicJson } from './telegram-store.mjs';
import { acquireLock } from './locks.mjs';
import { fail, run } from './process.mjs';

export const releaseRepository = 'LatipovYusuf444/devship';
export const packageRoot = fileURLToPath(new URL('../', import.meta.url));
export const currentVersion = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
export const updateDirectory = () => join(dirname(globalConfigPath()), 'updates');
const latestUrl = `https://api.github.com/repos/${releaseRepository}/releases/latest`;
const assetName = 'devship-cli-local.tgz', maximumPackageBytes = 16 * 1024 * 1024;
function updateError(message) { fail('UPDATE', message); }
function versionParts(value) {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(value)) updateError('Release versiyasi noto‘g‘ri.');
  return value.split('.').map(Number);
}
export function newerVersion(candidate, current) {
  const a = versionParts(candidate), b = versionParts(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
async function requestBytes(url, { fetchFn = globalThis.fetch, limit = 1024 * 1024, timeoutMs = 15000 } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for (let redirects = 0; redirects < 6; redirects++) {
      const target = new URL(url);
      if (target.protocol !== 'https:' || target.username || target.password || target.port || !['api.github.com', 'github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].includes(target.hostname))
        updateError('Yangilanish manzili ishonchli GitHub HTTPS manzili emas.');
      const response = await fetchFn(target.href, { redirect: 'manual', signal, headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'DevShip' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location'); await response.body?.cancel();
        if (!location) updateError('GitHub yo‘naltirish manzili yo‘q.'); url = new URL(location, target).href; continue;
      }
      if (!response.ok) { await response.body?.cancel(); updateError(`GitHub Release o‘qilmadi (HTTP ${response.status}). Internetni va public release mavjudligini tekshiring.`); }
      if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); updateError('Yangilanish javobi limitdan katta.'); }
      if (!response.body) updateError('Yangilanish javobi bo‘sh.');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > limit) updateError('Yangilanish javobi limitdan katta.'); chunks.push(Buffer.from(chunk)); }
      return Buffer.concat(chunks);
    }
    updateError('GitHub yo‘naltirishlar soni limitdan oshdi.');
  } catch (e) { if (e.code === 'UPDATE') throw e; updateError('Yangilanish serveriga ulanilmadi. Internetni tekshirib ds update ni qaytaring.'); }
}
async function jsonRequest(url, options) {
  const bytes = await requestBytes(url, options);
  try { return JSON.parse(bytes.toString('utf8')); } catch { updateError('GitHub Release JSON javobi noto‘g‘ri.'); }
}
async function latest(options) {
  const release = await jsonRequest(latestUrl, options);
  const version = typeof release?.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : '';
  versionParts(version);
  if (release.draft !== false || release.prerelease !== false || release.tag_name !== `v${version}` || !Array.isArray(release.assets)) updateError('Faqat tasdiqlangan barqaror vX.Y.Z reliz qo‘llanadi.');
  return { release, version };
}
function assetUrl(release, version, name) {
  const matches = release.assets.filter(a => a.name === name);
  const expected = `https://github.com/${releaseRepository}/releases/download/v${version}/${name}`;
  if (matches.length !== 1 || matches[0].browser_download_url !== expected) updateError(`Release fayli topilmadi yoki manzili noto‘g‘ri: ${name}`);
  return expected;
}
function validateManifest(manifest, expectedVersion) {
  if (manifest?.schemaVersion !== 1 || manifest.package !== 'devship-cli-local' || manifest.asset !== assetName || manifest.version !== expectedVersion
    || !/^[a-f0-9]{64}$/.test(manifest.sha256 || '') || !Number.isSafeInteger(manifest.size) || manifest.size < 1 || manifest.size > maximumPackageBytes)
    updateError('Release manifesti noto‘g‘ri. Hech narsa o‘rnatilmadi.');
  versionParts(manifest.version);
}
export function validatePackage(bytes, manifest) {
  validateManifest(manifest, manifest?.version);
  if (bytes.length !== manifest.size || createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) updateError('Yangilanish nazorat summasi/hajmi mos emas. Hech narsa o‘rnatilmadi.');
  let tar; try { tar = gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }); } catch { updateError('Yangilanish arxivi ochilmadi yoki juda katta.'); }
  let metadata, hasBin = false, count = 0, ended = false; const names = new Set();
  const text = buffer => buffer.toString('utf8').split('\0')[0];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(n => n === 0)) { ended = true; if (tar.subarray(offset).some(n => n !== 0)) updateError('Arxiv oxirida noma’lum ma’lumot bor.'); break; }
    if (++count > 2000) updateError('Arxivda juda ko‘p fayl bor.');
    const octal = field => { const value = text(field).trim(); if (!/^[0-7]+$/.test(value)) updateError('Arxiv raqam formati noto‘g‘ri.'); return parseInt(value, 8); };
    const checksum = octal(header.subarray(148, 156)); let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
    if (sum !== checksum) updateError('Arxiv sarlavhasi nazorat summasi noto‘g‘ri.');
    const size = octal(header.subarray(124, 136)), type = String.fromCharCode(header[156] || 48);
    const prefix = text(header.subarray(345, 500)), name = (prefix ? prefix + '/' : '') + text(header.subarray(0, 100));
    const start = offset + 512, end = start + size; if (end > tar.length) updateError('Arxiv fayli kesilgan.');
    const content = tar.subarray(start, end); offset = start + Math.ceil(size / 512) * 512;
    if (type === 'x' || type === 'g') {
      // npm pack may emit timestamps as PAX metadata. Path/link/size overrides are forbidden.
      const records = content.toString('utf8');
      if (!/^(\d+ (mtime|atime|ctime|uid|gid|uname|gname)=[^\n]*\n)+$/.test(records)) updateError('Arxiv PAX yo‘l yoki boshqa xavfli override saqlaydi.');
      continue;
    }
    const components = name.replace(/\/$/, '').split('/'), canonical = name.replace(/\/$/, '').toLowerCase();
    if (!['0', '5'].includes(type) || !name.startsWith('package/') || components.some(p => !/^[A-Za-z0-9_.-]+$/.test(p) || p === '.' || p === '..' || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)) || names.has(canonical))
      updateError('Arxivda xavfli/takror yo‘l yoki link mavjud.');
    names.add(canonical);
    if (type === '5') { if (size !== 0) updateError('Arxiv katalogi noto‘g‘ri.'); continue; }
    if (name === 'package/package.json') { try { metadata = JSON.parse(content.toString('utf8')); } catch { updateError('Paket package.json fayli noto‘g‘ri.'); } }
    if (name === 'package/bin/devship.mjs') hasBin = size > 0;
  }
  if (!ended || !hasBin || metadata?.name !== 'devship-cli-local' || metadata.version !== manifest.version
    || metadata.bin?.devship !== 'bin/devship.mjs' || metadata.bin?.ds !== 'bin/devship.mjs' || Object.keys(metadata.bin).sort().join(',') !== 'devship,ds'
    || ['dependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies', 'bundledDependencies'].some(k => metadata[k] && Object.keys(metadata[k]).length)
    || metadata.engines?.node !== '>=22') updateError('Yangilanish paketi DevShip formati/versiyasiga mos emas.');
  if (Number(process.versions.node.split('.')[0]) < 22) updateError('Avval Node.js 22 yoki yangirog‘ini o‘rnating.');
  return metadata;
}
export async function downloadUpdate(current = currentVersion, options = {}) {
  const { release, version } = await latest(options);
  if (!newerVersion(version, current)) return { status: 'current', version };
  const manifest = await jsonRequest(assetUrl(release, version, 'release.json'), options); validateManifest(manifest, version);
  const bytes = await requestBytes(assetUrl(release, version, assetName), { ...options, limit: maximumPackageBytes, timeoutMs: 60000 });
  validatePackage(bytes, manifest); return { status: 'available', version, manifest, bytes };
}
export async function checkUpdate({ current = currentVersion, fetchFn, log = console.log } = {}) {
  const { version } = await latest({ fetchFn });
  log(newerVersion(version, current) ? `DevShip ${version} chiqdi. Yangilash: ds update` : `DevShip ${current} — joriy versiya.`);
  return { version, available: newerVersion(version, current) };
}
export async function updateNotice({ directory = updateDirectory(), current = currentVersion, fetchFn, log = console.log, now = Date.now() } = {}) {
  if (process.env.DEVSHIP_UPDATES === 'off') return;
  try {
    const file = join(directory, 'notice.json'); let cache;
    try { cache = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first run */ }
    if (!cache || !Number.isFinite(cache.checkedAt) || now < cache.checkedAt || now - cache.checkedAt >= 86400000) {
      try { const result = await latest({ fetchFn, timeoutMs: 1500 }); cache = { checkedAt: now, version: result.version }; }
      catch { cache = { checkedAt: now, version: current }; }
      atomicJson(file, cache);
    }
    if (newerVersion(cache.version, current)) log(`DevShip ${cache.version} chiqdi. Yangilash: ds update`);
  } catch { /* Update notices must never block project operations. */ }
}
export function installationPrefix(root, configuredPrefix) {
  const path = realpathSync(root), parent = dirname(path);
  if (basename(path) !== 'devship-cli-local' || basename(parent) !== 'node_modules') updateError('Bu source/lokal ishga tushirish. Global o‘rnating: npm install --global --ignore-scripts https://github.com/' + releaseRepository + '/releases/latest/download/' + assetName);
  const above = dirname(parent);
  if (process.platform !== 'win32' && basename(above) !== 'lib') updateError('Lokal/npx paket yangilanmaydi. Avval DevShip’ni global o‘rnating.');
  const prefix = process.platform !== 'win32' ? dirname(above) : above;
  if (typeof configuredPrefix !== 'string' || !isAbsolute(configuredPrefix.trim()) || /[\r\n\0]/.test(configuredPrefix.trim())) updateError('npm global prefix aniqlanmadi. Global npm sozlamasini tekshiring.');
  let reported; try { reported = realpathSync(configuredPrefix.trim()); } catch { updateError('npm global prefix papkasi topilmadi.'); }
  const normalized = text => process.platform === 'win32' ? text.toLowerCase() : text;
  if (normalized(realpathSync(prefix)) !== normalized(reported)) updateError('Bu paket joriy npm global prefixida emas. Lokal loyiha/npx o‘rnatilishi yangilanmadi; DevShip’ni global o‘rnating.');
  return prefix;
}
export function installationLockFile({ directory = updateDirectory(), root = packageRoot } = {}) {
  const key = createHash('sha256').update(realpathSync(root)).digest('hex').slice(0, 24);
  return join(directory, `installation-${key}.lock`);
}
export function installationGate({ directory = updateDirectory(), root = packageRoot } = {}) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return acquireLock(installationLockFile({ directory, root }), realpathSync(root));
}
export async function applyUpdate({ current = currentVersion, packageRoot: root = packageRoot, directory = updateDirectory(), fetchFn, runFn = run, log = console.log } = {}) {
  const release = installationGate({ directory, root });
  try {
    const reported = runFn('npm', ['prefix', '--global'], { cwd: directory, timeoutMs: 15000, allowFailure: true });
    if (!reported.ok) updateError('npm global prefix aniqlanmadi. Hech narsa o‘rnatilmadi.');
    const prefix = installationPrefix(root, reported.stdout);
    log('DevShip yangilanishi tekshirilmoqda…');
    const candidate = await downloadUpdate(current, { fetchFn });
    if (candidate.status === 'current') { log(`DevShip ${current} — joriy versiya.`); return candidate; }
    const folder = mkdtempSync(join(directory, 'install-')), file = join(folder, 'candidate.tgz');
    writeFileSync(file, candidate.bytes, { mode: 0o600, flag: 'wx' });
    const options = { cwd: folder, timeoutMs: 300000, allowFailure: true };
    const backup = runFn('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', folder, resolve(root)], options);
    let backupName;
    try { const parsed = JSON.parse(backup.stdout); if (backup.ok && parsed.length === 1 && /^[a-zA-Z0-9_.-]+\.tgz$/.test(parsed[0].filename)) backupName = parsed[0].filename; } catch { /* handled below */ }
    if (!backupName || backupName === 'candidate.tgz' || !existsSync(join(folder, backupName)) || !lstatSync(join(folder, backupName)).isFile()) updateError('Oldingi versiya zaxiralanmadi. O‘rnatish boshlanmadi.');
    const install = archive => runFn('npm', ['install', '--global', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', archive], options);
    let result; try { result = install(file); } catch { result = { ok: false }; }
    if (result.ok) {
      let installed; try { installed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch { /* rollback below */ }
      if (installed?.name === 'devship-cli-local' && installed.version === candidate.version) {
        log(`DevShip ${candidate.version} o‘rnatildi. Sozlamalar saqlandi. Keyingi buyruq: ds`); return { status: 'updated', version: candidate.version };
      }
    }
    let rollback; try { rollback = install(join(folder, backupName)); } catch { rollback = { ok: false }; }
    let restored; try { restored = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')); } catch { /* handled below */ }
    if (!rollback.ok || restored?.name !== 'devship-cli-local' || restored.version !== current) updateError(`Yangilash va oldingi versiyani tiklash tasdiqlanmadi. Zaxira: ${join(folder, backupName)}. Uni npm install --global --ignore-scripts orqali o‘rnating.`);
    log('Yangilash bajarilmadi; oldingi versiya qayta o‘rnatildi. Keyinroq ds update ni qaytaring.');
    return { status: 'rolled-back', version: current };
  } finally { release(); }
}
