import { redact, fail } from './process.mjs';

const technical = /(?:https?:\/\/|(?:^|\s)\/[\w-]+(?:\/|\b)|\b(?:npm|pnpm|yarn|tsc|vitest|eslint|typecheck|check:types|test:unit)\b|\b(?:api|endpoint|lockfile|ci\/cd)\b|\b(?:tekshiruv|sinov|testlar)\w*|(?:^|[\s/])(?:build|tests?|checks?)(?:[\s/:]|$)|\.(?:tsx?|jsx?|mjs|json|lock)\b)/i;
export function businessText(value, strict = false) {
  const original = String(value ?? '');
  const text = redact(original).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim();
  if (!text || text.length > 240 || technical.test(text) || text !== original.trim() || text.includes('[hidden-')) {
    if (strict) fail('REPORT', 'Ish hisoboti 1..240 belgilik qisqa matn bo‘lsin; texnik buyruq, API yo‘li yoki maxfiy qiymat yozmang.');
    return null;
  }
  return text;
}
const labels = new Map(Object.entries({
  savdo: 'Savdo', sotuv: 'Savdo', sales: 'Savdo', mahsulotlar: 'Mahsulotlar', products: 'Mahsulotlar', ombor: 'Ombor', warehouse: 'Ombor', warehouses: 'Ombor',
  bosh_sahifa: 'Bosh sahifa', boshsahifa: 'Bosh sahifa', dashboard: 'Bosh sahifa', monitoring: 'Monitoring', users: 'Foydalanuvchilar',
  sozlamalar: 'Sozlamalar', sozlamalaruchot: 'Sozlamalar', settings: 'Sozlamalar', hisobotuchot: 'Hisobotlar', reports: 'Hisobotlar',
  hisobotlar: 'Hisobotlar', orders: 'Buyurtmalar', kirim: 'Kirim', navoiyazot: 'Navoiyazot', login: 'Kirish', profile: 'Profil',
  leftovers: 'Qoldiqlar', 'export-contracts': 'Eksport shartnomalari', 'ticket-groups': 'Yuk hujjatlari', lots: 'Yuklash', payments: 'To‘lovlar'
}));
export function pageLabel(path) {
  const lower = path.toLowerCase().replaceAll('\\', '/');
  if (/(?:^|\/)(?:api|services?|tests?|__tests__|node_modules|\.next|dist)(?:\/|$)|\.(?:test|spec)\.|(?:^|\/)(?:middleware|next\.config|vite\.config)/.test(lower)) return null;
  if (!/\.(?:[jt]sx?|vue|svelte)$/.test(lower)) return null;
  if (!/(?:^|\/)(?:app|pages|views|components)(?:\/|$)/.test(lower)) return null;
  const parts = lower.split('/').filter(x => x && !x.startsWith('(') && !x.startsWith('['));
  const route = parts.indexOf('app');
  if (route >= 0) {
    const boundary = parts.findIndex((part, i) => i > route && part.startsWith('_'));
    const end = boundary < 0 ? parts.length - 1 : boundary;
    for (let i = end - 1; i > route; i--) if (labels.has(parts[i])) return labels.get(parts[i]);
    const name = parts[end - 1];
    if (end - 1 > route && /^[\p{L}\p{N}_-]{2,45}$/u.test(name)) return name[0].toUpperCase() + name.slice(1).replace(/[_-]/g, ' ');
    if (/\/(?:page|layout)\.[jt]sx?$/.test(lower)) return 'Bosh sahifa';
  }
  for (let i = parts.length - 2; i >= 0; i--) if (labels.has(parts[i])) return labels.get(parts[i]);
  if (/endload|startload|yuklash/.test(lower)) return 'Yuklash';
  const marker = parts.findIndex(p => ['pages', 'views'].includes(p));
  if (marker >= 0 && parts.length <= marker + 2 && /^(?:index|\[.*\])\.[jt]sx?$/.test(lower.split('/').at(-1))) return 'Bosh sahifa';
  if (marker >= 0 && parts[marker + 1] && !parts[marker + 1].includes('.')) {
    const name = parts[marker + 1].replace(/[_-]/g, ' ');
    if (/^[\p{L}\p{N} ]{2,45}$/u.test(name)) return name[0].toUpperCase() + name.slice(1);
  }
  return null;
}
export function summarizeWork({ files = [], subjects = [], notes = [] } = {}) {
  if (notes.length) return [...new Set(notes.map(note => businessText(note, true)))];
  const pages = [...new Set(files.map(path => pageLabel(typeof path === 'string' ? path : path.path)).filter(Boolean))];
  if (!pages.length) return [];
  // Arbitrary Git subjects may be English, technical or misleading. Only explicit
  // human work notes override the conservative Uzbek page description.
  return pages.map(page => `${page}${page.endsWith('sahifa') ? '' : ' sahifasi'} yangilandi.`);
}
