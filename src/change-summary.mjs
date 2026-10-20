import { summarizeWork } from './work-summary.mjs';

const pathsOf = text => text.split('\0').filter(Boolean);
function incoming(git, ours, head) {
  if (!head) return { paths: [], items: [] };
  const bases = git.result(['merge-base', '--all', ours, head]);
  const values = bases.stdout.trim().split('\n').filter(Boolean);
  if (!bases.ok || values.length !== 1) return { paths: null, items: [] };
  const paths = pathsOf(git.raw('diff', '--name-only', '--no-renames', '-z', values[0], head, '--')).sort();
  return { paths, items: summarizeWork({ files: paths }) };
}
export function buildChangeSummary({ git, workHead, baseHead, remoteHead, pending = [], notes = [] }) {
  const excluded = [baseHead, remoteHead].filter(Boolean);
  const commits = git.exec('rev-list', workHead, ...(excluded.length ? ['--not', ...excluded] : [])).split('\n').filter(Boolean);
  const ownPaths = new Set(pending);
  // Combined merge diffs retain manual resolutions while excluding clean files
  // that arrived unchanged from either parent.
  for (const commit of commits) for (const path of pathsOf(git.raw('diff-tree', '--cc', '--root', '-r', '--no-commit-id', '--name-only', '--no-renames', '-z', commit, '--'))) ownPaths.add(path);
  const paths = [...ownPaths].sort(), main = incoming(git, workHead, baseHead), remote = incoming(git, workHead, remoteHead);
  const incomingPaths = new Set([...(main.paths || []), ...(remote.paths || [])]);
  return { own: { paths, commits, items: summarizeWork({ files: paths, notes }) }, main, remote, overlap: paths.filter(path => incomingPaths.has(path)) };
}
export function formatChangeSummary(summary, { branch, remote, base, cached = false }) {
  const lines = ['Pushdan oldingi xulosa' + (cached ? ' (lokal kesh; fetch qilinmagan)' : '')];
  const section = (label, value) => {
    lines.push(`${label}: ${value.paths === null ? 'aniq son topilmadi; Git merge tekshiradi' : value.paths.length + ' fayl'}`);
    for (const item of value.items) lines.push(`  • ${item}`);
  };
  section('Sizning yangi lokal ishlaringiz', summary.own);
  section(`${remote}/${branch} dan keladigan`, summary.remote);
  section(`${remote}/${base} dan keladigan`, summary.main);
  if (summary.overlap.length) lines.push(`Ikkala tomonda o‘zgargan: ${summary.overlap.length} fayl; bu konflikt tasdig‘i emas.`, ...summary.overlap.slice(0, 20).map(path => `  ${JSON.stringify(path)}`));
  lines.push('Sonlar manbalar bo‘yicha; bir fayl bir nechta bo‘limda bo‘lishi mumkin. Sahifa nomidan aniq vazifa taxmin qilinmaydi; batafsil nom uchun --work yozing.');
  return lines.join('\n');
}
