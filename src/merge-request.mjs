import { createHash } from 'node:crypto';
import { existsSync, readFileSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { globalConfigPath, loadConfig } from './config.mjs';
import { atomicJson } from './telegram-store.mjs';
import { Git, repository } from './git.mjs';
import { summarizeWork } from './work-summary.mjs';
import { fail, redact } from './process.mjs';

const clean = text => redact(String(text)).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 180);
const defaultDirectory = () => join(dirname(globalConfigPath()), 'merge-requests');
function identity(git, branch, remote) {
  const common = realpathSync(resolve(repository(git.root), git.exec('rev-parse', '--git-common-dir')));
  return createHash('sha256').update(JSON.stringify([common, git.exec('remote', 'get-url', remote), branch])).digest('hex');
}
export function gitLabNewMRUrl(remote, { source = '', target = '', title = '', description = '' } = {}) {
  try {
    let url;
    const scp = /^(?:[^@/:]+@)?([^/:]+):([^/].*)$/.exec(remote);
    if (!remote.includes('://') && scp) url = new URL(`https://${scp[1]}/${scp[2]}`);
    else url = new URL(remote);
    if (!['https:', 'ssh:'].includes(url.protocol) || !/(^|[.-])gitlab([.-]|$)/i.test(url.hostname)) return null;
    const path = url.pathname.replace(/\.git\/?$/, '').replace(/\/$/, '');
    if (!path || path === '/') return null;
    const link = new URL(`https://${url.hostname}${url.protocol === 'https:' && url.port ? ':' + url.port : ''}${path}/-/merge_requests/new`);
    for (const [key, value] of Object.entries({ source_branch: source, target_branch: target, title, description })) link.searchParams.set(`merge_request[${key}]`, value);
    return link.href.length <= 12000 ? link.href : null;
  } catch { return null; }
}
export function createMergeRequestDraft(context, { directory = defaultDirectory() } = {}) {
  const { git, branch, remote, after, baseHead, config, notes = [], checks = [] } = context;
  const files = git.raw('diff', '--name-only', '--no-renames', '-z', baseHead, after, '--').split('\0').filter(Boolean);
  const items = summarizeWork({ files });
  for (const note of summarizeWork({ notes })) if (!items.includes(note)) items.push(note);
  const title = (items.length ? items[0].replace(/\.$/, '') : `${clean(branch)}: o‘zgarishlar`).slice(0, 100);
  const description = [`Qilingan ishlar`, ...(items.length ? items.map(item => `- ${item}`) : ['- Sahifa nomi bo‘yicha qisqa tavsif aniqlanmadi; matnni to‘ldiring.']), '', `Branch: ${clean(branch)} → ${clean(config.base)}`, `O‘zgargan fayllar: ${files.length}`, '', `Tekshiruvlar: pushdan oldin ${checks.length} ta sozlangan vazifa muvaffaqiyatli tugadi.`, '', 'Matnni ko‘rib chiqing va kerak bo‘lsa aniq ish tafsilotlari bilan to‘ldiring.'].join('\n');
  const draft = { version: 1, branch, target: config.base, after, baseHead, pushedAt: context.pushedAt, title, description, fileCount: files.length,
    url: gitLabNewMRUrl(git.exec('remote', 'get-url', remote), { source: branch, target: config.base, title, description }) };
  atomicJson(join(directory, `${identity(git, branch, remote)}.json`), draft);
  context.log?.('Merge Request matni tayyor. Ko‘rish: ds mr');
  return draft;
}
export function readMergeRequestDraft({ git, branch, remote, directory = defaultDirectory() }) {
  const file = join(directory, `${identity(git, branch, remote)}.json`);
  if (!existsSync(file)) fail('MR', 'Bu loyiha/branch uchun matn yo‘q. Keyingi muvaffaqiyatli ds pushdan keyin tayyorlanadi.');
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 100000) fail('MR', 'MR matni fayli noto‘g‘ri.');
  let draft; try { draft = JSON.parse(readFileSync(file, 'utf8')); } catch { fail('MR', 'MR matni o‘qilmadi.'); }
  if (draft?.version !== 1 || draft.branch !== branch || !/^[a-f0-9]{40,64}$/.test(draft.after) || typeof draft.title !== 'string' || typeof draft.description !== 'string') fail('MR', 'MR matni noto‘g‘ri.');
  return { draft, stale: git.oid() !== draft.after };
}
export function showMergeRequest({ cwd = process.cwd(), log = console.log } = {}) {
  const root = repository(cwd), config = loadConfig(root), git = new Git(root);
  const { draft, stale } = readMergeRequestDraft({ git, branch: git.branch(), remote: config.remote });
  if (stale) log('Diqqat: saqlangan matndan keyin lokal HEAD o‘zgargan. Bu oxirgi tasdiqlangan push matni.');
  log(`Sarlavha: ${clean(draft.title)}\n\n${redact(draft.description)}`);
  if (draft.url) log(`\nGitLab’da tekshirib ochish: ${redact(draft.url)}`);
}
