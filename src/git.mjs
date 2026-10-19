import { existsSync, lstatSync, readFileSync, realpathSync, openSync, writeFileSync, closeSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { run, fail } from './process.mjs';
import { hash, inspectPath, inspectContent, protectedBranch } from './safety.mjs';
import { acquireLock } from './locks.mjs';

export const splitZ = text => text.split('\0').filter(Boolean);
export function repository(cwd) {
  for (const name of ['GIT_DIR', 'GIT_COMMON_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_PARAMETERS', 'GIT_SHALLOW_FILE', 'GIT_GRAFT_FILE'])
    if (process.env[name] !== undefined) fail('GIT_ENV', `${name} o‘rnatilgan. Alohida Git muhitini o‘chirib qayta urinib ko‘ring.`);
  const result = run('git', ['--no-optional-locks', 'rev-parse', '--show-toplevel'], { cwd, allowFailure: true });
  if (!result.ok) fail('REPO', 'Bu Git working tree emas. Loyiha papkasida devship ni ishga tushiring.');
  return realpathSync(result.stdout.trim());
}
export class Git {
  constructor(root, timeoutMs = 600000) { this.root = root; this.timeoutMs = timeoutMs; }
  result(args) { return run('git', ['--no-optional-locks', ...args], { cwd: this.root, timeoutMs: this.timeoutMs, allowFailure: true }); }
  exec(...args) {
    const r = run('git', ['--no-optional-locks', ...args], { cwd: this.root, timeoutMs: this.timeoutMs }); return r.stdout.trimEnd();
  }
  raw(...args) { return run('git', ['--no-optional-locks', ...args], { cwd: this.root, timeoutMs: this.timeoutMs }).stdout; }
  oid(ref = 'HEAD') { return this.exec('rev-parse', '--verify', ref); }
  exists(ref) { return this.result(['show-ref', '--verify', '--quiet', ref]).ok; }
  branch() {
    const result = this.result(['symbolic-ref', '--quiet', '--short', 'HEAD']);
    if (!result.ok) fail('BRANCH', 'Detached HEAD: avval feature branchga o‘ting.');
    return result.stdout.trim();
  }
  pending() {
    return [...new Set([...splitZ(this.raw('diff', '--name-only', '--no-renames', '-z', 'HEAD', '--')),
      ...splitZ(this.raw('diff', '--cached', '--name-only', '--no-renames', '-z', '--')),
      ...splitZ(this.raw('ls-files', '--others', '--exclude-standard', '-z'))])].sort();
  }
  toStage() {
    return [...new Set([...splitZ(this.raw('diff', '--name-only', '--no-renames', '-z', '--')),
      ...splitZ(this.raw('ls-files', '--others', '--exclude-standard', '-z'))])].sort();
  }
  state() {
    const parts = [this.oid(), this.branch(), this.raw('status', '--porcelain=v1', '-z', '--untracked-files=all'),
      this.raw('diff', '--cached', '--raw', '--no-abbrev', '-z'), this.raw('ls-files', '-v', '-z'), this.workState(this.pending())];
    return hash(parts);
  }
  workState(paths) {
    const parts = [];
    for (const path of paths) {
      parts.push(path);
      try {
        const stat = lstatSync(join(this.root, path));
        parts.push(String(stat.mode));
        if (stat.isFile() && stat.size <= 10 * 1024 * 1024) parts.push(readFileSync(join(this.root, path)));
        else parts.push(`not-file-or-oversize:${stat.size}:${stat.mtimeMs}`);
      } catch (e) { if (e.code === 'ENOENT') parts.push('deleted'); else throw e; }
    }
    return hash(parts);
  }
  assertIdentity(branch, head) {
    if (this.branch() !== branch || (head && this.oid() !== head)) fail('CHANGED', 'Branch yoki HEAD boshqa jarayon tomonidan o‘zgardi. Qayta ko‘rib chiqing.');
  }
  assertClean() { if (this.raw('status', '--porcelain=v1', '-z', '--untracked-files=all')) fail('DIRTY', 'Working tree/index toza emas. O‘zgarishlar saqlandi; ko‘rib chiqib qayta ishga tushiring.'); }
}

export function lockRepository(git) {
  const directory = resolve(git.root, git.exec('rev-parse', '--git-common-dir'));
  return acquireLock(join(directory, 'devship.lock'), git.root);
}

export function preflight(git, config) {
  const branch = git.branch();
  if (!git.result(['rev-parse', '--verify', 'HEAD']).ok) fail('BRANCH', 'Repo hali commitsiz. Birinchi commit va origin/main ni qo‘lda yarating.');
  if (protectedBranch(branch, config)) fail('PROTECTED', `Himoyalangan branch: ${branch}. Feature branchda ishlang.`);
  if (!git.result(['check-ref-format', '--branch', config.base]).ok) fail('CONFIG', 'Base branch nomi noto‘g‘ri.');
  for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer', 'BISECT_LOG']) {
    if (existsSync(resolve(git.root, git.exec('rev-parse', '--git-path', marker)))) fail('IN_PROGRESS', `Tugallanmagan Git operatsiyasi: ${marker}. Uni qo‘lda tugating yoki bekor qiling.`);
  }
  if (git.exec('rev-parse', '--is-shallow-repository') === 'true') fail('SHALLOW', 'Shallow clone qo‘llanmaydi. Avval to‘liq tarixni oling.');
  if (git.exec('ls-files', '--stage').split('\n').some(line => line.startsWith('160000 '))) fail('SUBMODULE', 'Submodule mavjud. Uni qo‘lda tekshirish/push qilish kerak; DevShip to‘xtadi.');
  if (git.exec('ls-files', '-u')) fail('IN_PROGRESS', 'Indexda hal qilinmagan konflikt bor.');
  const hidden = splitZ(git.raw('ls-files', '-v', '-z')).find(entry => entry[0] === 'S' || /[a-z]/.test(entry[0]));
  if (hidden) fail('INDEX_FLAGS', `Indexda assume-unchanged yoki skip-worktree belgisi bor: ${JSON.stringify(hidden.slice(2))}. Disk va commit nusxalari farq qilishi mumkin. Belgilarni/sparse checkoutni qo‘lda ko‘rib chiqing.`);
  const staged = splitZ(git.raw('diff', '--cached', '--name-only', '--no-renames', '-z'));
  const unstaged = new Set(splitZ(git.raw('diff', '--name-only', '--no-renames', '-z')));
  if (staged.some(path => unstaged.has(path))) fail('PARTIAL', 'Fayl qisman stage qilingan. Stage chegarasini qo‘lda hal qiling; DevShip indexni o‘zgartirmadi.');
  const remotes = git.exec('remote').split('\n');
  if (!remotes.includes(config.remote)) fail('REMOTE', `Remote topilmadi: ${config.remote}`);
  const urls = git.exec('remote', 'get-url', '--all', config.remote).split('\n');
  const pushUrls = git.exec('remote', 'get-url', '--push', '--all', config.remote).split('\n');
  if (urls.length !== 1 || pushUrls.length !== 1 || urls[0] !== pushUrls[0]) fail('REMOTE', 'Fetch va push bitta bir xil remote URLga yo‘naltirilgan bo‘lishi kerak.');
  const upstream = git.result(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (upstream.ok && upstream.stdout.trim() !== `${config.remote}/${branch}`) fail('UPSTREAM', 'Upstream boshqa branch/remote ga qaragan. Avval uni qo‘lda to‘g‘rilang.');
  return branch;
}

export function scanHistory(git, config, remoteFeature, baseRef, verifiedBlobs = new Set()) {
  const exclusions = [baseRef]; if (git.exists(remoteFeature)) exclusions.push(remoteFeature);
  const publishedTrees = exclusions.map(ref => git.oid(ref));
  const publishedAtPath = new Map();
  const alreadyPublished = (path, mode, oid) => {
    if (!publishedAtPath.has(path)) {
      const entries = new Set();
      for (const ref of publishedTrees) {
        const match = /^(\d+) (\w+) ([a-f0-9]+)\t/.exec(git.raw('--literal-pathspecs', 'ls-tree', '-z', ref, '--', path));
        if (match?.[2] === 'blob') entries.add(`${match[1]}:${match[3]}`);
      }
      publishedAtPath.set(path, entries);
    }
    return publishedAtPath.get(path).has(`${mode}:${oid}`);
  };
  const commits = git.exec('rev-list', 'HEAD', '--not', ...publishedTrees).split('\n').filter(Boolean);
  for (const commit of commits) {
    // Compare against all parents (including merge commits); deleted blobs were scanned in earlier commits.
    const paths = splitZ(git.raw('diff-tree', '--root', '-m', '-r', '--no-commit-id', '--name-only', '--no-renames', '-z', commit, '--'));
    for (const path of new Set(paths)) {
      const entry = git.raw('--literal-pathspecs', 'ls-tree', '-z', commit, '--', path);
      if (!entry) continue;
      const match = /^(\d+) (\w+) ([a-f0-9]+)\t/.exec(entry);
      if (!match || match[2] !== 'blob' || match[1] === '120000') fail('SAFETY', `Tarixda symlink/submodule mavjud: ${JSON.stringify(path)}. Qo‘lda tekshiring.`);
      inspectPath(path, config, { history: true });
      // A merge compares against every parent, so it can mention content already on main.
      // Trust only the exact published path+mode+OID; never put this exemption in the
      // content-scan cache, which would incorrectly exempt copies at a new path.
      if (alreadyPublished(path, match[1], match[3])) continue;
      const oid = match[3]; if (verifiedBlobs.has(oid)) continue;
      const size = Number(git.exec('cat-file', '-s', oid));
      if (size > config.maxScanBytes) fail('SAFETY', `Push qilinmagan tarixda katta blob: ${JSON.stringify(path)}. Qo‘lda tekshiring.`);
      inspectContent(path, git.raw('cat-file', 'blob', oid));
      verifiedBlobs.add(oid);
    }
  }
}
