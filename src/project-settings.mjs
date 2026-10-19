import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { globalConfigPath } from './config.mjs';
import { atomicJson } from './telegram-store.mjs';
import { fail } from './process.mjs';

export const preferencesPath = () => join(dirname(globalConfigPath()), 'projects');
export function nodeProject(root) {
  const file = join(root, 'package.json'); if (!existsSync(file)) return null;
  let pkg; try { pkg = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch { fail('TASKS', 'package.json noto‘g‘ri JSON.'); }
  const locks = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'].filter(n => existsSync(join(root, n)));
  const managers = [...new Set(locks.map(n => n === 'yarn.lock' ? 'yarn' : n === 'pnpm-lock.yaml' ? 'pnpm' : 'npm'))];
  const declared = typeof pkg.packageManager === 'string' && pkg.packageManager.match(/^(npm|pnpm|yarn)@[^\s]+$/)?.[1];
  if (pkg.packageManager && !declared) fail('TASKS', 'packageManager qo‘llab-quvvatlanmaydi; checks ni aniq belgilang.');
  return { pkg, managers, declared, fingerprint: JSON.stringify([pkg.packageManager || '', locks]) };
}
function preferenceFile(root, file) {
  return file || join(preferencesPath(), createHash('sha256').update(realpathSync(root)).digest('hex') + '.json');
}
export function saveProjectManager(root, manager, file) {
  const info = nodeProject(root);
  if (!info || !['npm', 'pnpm', 'yarn'].includes(manager)) fail('TASKS_SETUP', 'npm, pnpm yoki yarn tanlang.');
  atomicJson(preferenceFile(root, file), { version: 1, root: realpathSync(root), manager, fingerprint: info.fingerprint });
}
export function projectManager(root, info, file) {
  let saved;
  try { saved = JSON.parse(readFileSync(preferenceFile(root, file), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') fail('TASKS_SETUP', 'Saqlangan loyiha tanlovi o‘qilmadi. ds setup ni bajaring.'); }
  if (saved) {
    if (saved.version !== 1 || saved.root !== realpathSync(root) || saved.fingerprint !== info.fingerprint || !['npm', 'pnpm', 'yarn'].includes(saved.manager))
      fail('TASKS_SETUP', 'Loyiha packageManager/lockfile holati o‘zgargan. ds setup bilan tanlovni qayta tekshiring.');
    return saved.manager;
  }
  if (info.managers.length > 1 || (info.declared && info.managers.length && !info.managers.includes(info.declared)))
    fail('TASKS_SETUP', 'Lockfile/packageManager mos emas. ds setup ni bir marta bajarib npm, pnpm yoki yarn tanlang. Fayllar o‘chirilmaydi.');
  return info.declared || info.managers[0] || 'npm';
}
