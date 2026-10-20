import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Git, repository, preflight, lockRepository, scanHistory } from './git.mjs';
import { loadConfig } from './config.mjs';
import { detectTasks, requireTasks, executeTasks } from './tasks.mjs';
import { inspectWorkFile, sensibleMessage, inspectContent, inspectPath } from './safety.mjs';
import { fail, redact, ShipError } from './process.mjs';
import { mergeFailureDetails } from './conflicts.mjs';
import { notifyPush, notifyFailure } from './telegram.mjs';
import { setupProject } from './project-setup.mjs';
import { recordSuccessfulPush, prepareSuccessfulPush, settleWorkIntent } from './daily-reports.mjs';
import { summarizeWork } from './work-summary.mjs';

function scanPending(git, config) {
  const paths = git.pending();
  for (const path of paths) {
    inspectWorkFile(git.root, path, config);
    const index = git.result(['--literal-pathspecs', 'ls-files', '--stage', '-z', '--', path]);
    if (/^(120000|160000) /.test(index.stdout)) fail('SAFETY', `Indexda symlink/submodule bor: ${JSON.stringify(path)}`);
    const entry = /^\d+ ([a-f0-9]+) 0\t/.exec(index.stdout);
    if (entry) {
      inspectPath(path, config);
      if (Number(git.exec('cat-file', '-s', entry[1])) > config.maxScanBytes) fail('SAFETY', `Stage fayli scan limitidan katta: ${JSON.stringify(path)}`);
      inspectContent(path, git.raw('cat-file', 'blob', entry[1]));
    }
  }
  return paths;
}

function merge(git, ref, branch, config, log) {
  git.assertIdentity(branch); git.assertClean();
  const oursHead = git.oid(), incomingHead = git.oid(ref);
  log(`Merge: ${ref}`);
  const r = git.result(['-c', 'merge.autoStash=false', '-c', 'rerere.enabled=false', '-c', 'merge.ff=true',
    '-c', `branch.${branch}.mergeOptions=`,
    'merge', '--ff', '--no-squash', '--commit', '--no-edit', '--no-autostash', '--no-verify-signatures', ref]);
  if (!r.ok) {
    let conflictReport;
    const details = mergeFailureDetails(git, { branch, ref, oursHead, incomingHead, result: r, maxScanBytes: config.maxScanBytes,
      onReport: report => { conflictReport = report; } });
    const error = new ShipError('MERGE', details); error.conflictReport = conflictReport; throw error;
  }
  git.assertIdentity(branch); git.assertClean();
}

export async function ship({ cwd = process.cwd(), dryRun = false, message, configFile, init = false, work = [], log = console.log, notify = notifyPush, notifyError = notifyFailure, recordWork = recordSuccessfulPush, prepareWork = prepareSuccessfulPush } = {}) {
  const output = log; log = value => output(redact(value));
  const root = repository(cwd), config = loadConfig(root, configFile);
  const git = new Git(root, config.timeoutMs);
  summarizeWork({ notes: work });
  if (init) {
    const path = join(root, '.devship.json');
    try { writeFileSync(path, JSON.stringify({ base: 'main', remote: 'origin', protectedBranches: ['release/*'], exclude: [] }, null, 2) + '\n', { flag: 'wx' }); }
    catch (e) { if (e.code === 'EEXIST') fail('CONFIG', '.devship.json allaqachon mavjud; ustidan yozilmadi.'); throw e; }
    log(`Config yaratildi: ${path}`); return;
  }
  const release = dryRun ? () => {} : lockRepository(git);
  let branch, stage = 'preflight', published = false;
  const verifiedHistoryBlobs = new Set();
  try {
    branch = preflight(git, config); const originalHead = git.oid(); stage = 'prepare';
    let tasks;
    try { tasks = detectTasks(root, config); }
    catch (e) {
      if (e.code !== 'TASKS_SETUP' || dryRun || !process.stdin.isTTY) throw e;
      await setupProject({ root, config, log }); tasks = detectTasks(root, config);
    }
    requireTasks(tasks, config);
    const paths = scanPending(git, config);
    if (message !== undefined && (!message.trim() || /[\r\n\0]/.test(message) || message.length > 200)) fail('MESSAGE', 'Commit matni 1..200 belgidan iborat bitta qator bo‘lsin.');
    log(`DevShip: ${branch} → ${config.remote}/${branch}; base: ${config.remote}/${config.base}`);
    log(config.checksMode === 'final' ? 'Tekshiruv rejimi: final — barcha checks merge’dan keyin, pushdan oldin bir marta.' : 'Tekshiruv rejimi: both — commitdan oldin va merge’dan keyin.');
    if (dryRun) {
      log('DRY RUN: buyruqlar bajarilmaydi; fetch qilinmaydi, remote holati tekshirilmaydi.');
      for (const task of tasks) log(`Reja: ${task.argv.join(' ')} (cwd: ${task.cwd})`);
      for (const path of paths) log(`Fayl: ${JSON.stringify(path)}`);
      log(paths.length ? `Commit: ${message || sensibleMessage(paths)}` : 'Yangi commit kerak emas.');
      log('Keyin: fetch → remote feature merge → base merge → tekshiruvlar → faqat joriy branch push.'); return;
    }
    if (config.checksMode === 'both') {
      const state = git.state();
      stage = 'checks-before-commit';
      executeTasks(tasks, config, log);
      git.assertIdentity(branch, originalHead);
      if (git.state() !== state) fail('CHANGED', 'Tekshiruv paytida fayl/index o‘zgardi. Avval natijani ko‘rib chiqing va devship ni qayta bajaring. Commit yaratilmagan.');
    }
    scanPending(git, config);
    stage = 'commit';
    if (paths.length) {
      const expectedWork = git.workState(paths);
      const toStage = git.toStage();
      for (let i = 0; i < toStage.length; i += 50) git.exec('--literal-pathspecs', 'add', '--', ...toStage.slice(i, i + 50));
      scanPending(git, config);
      if (git.workState(paths) !== expectedWork) fail('CHANGED', 'Stage vaqtida fayllar o‘zgardi. Index va working tree ni tekshiring; commit bajarilmadi.');
      git.assertIdentity(branch, originalHead);
      const text = message || sensibleMessage(paths); log(`Commit: ${text}`);
      git.exec('commit', '-m', text);
      git.assertIdentity(branch); git.assertClean();
    } else log('Working tree toza; bo‘sh commit yaratilmaydi.');
    log(`Fetch: ${config.remote}`);
    stage = 'fetch';
    const beforeFetch = git.oid();
    git.exec('fetch', '--no-tags', '--no-prune-tags', '--prune', '--refmap=', '--no-recurse-submodules', '--no-auto-maintenance', '--', config.remote,
      `+refs/heads/*:refs/remotes/${config.remote}/*`);
    git.assertIdentity(branch, beforeFetch); git.assertClean();
    const baseRef = `refs/remotes/${config.remote}/${config.base}`;
    const remoteFeature = `refs/remotes/${config.remote}/${branch}`;
    if (!git.exists(baseRef)) fail('BASE', `${config.remote}/${config.base} topilmadi. base sozlamasini tekshiring. Lokal commitlar saqlangan.`);
    const notificationBase = git.oid(git.exists(remoteFeature) ? remoteFeature : baseRef);
    scanHistory(git, config, remoteFeature, baseRef, verifiedHistoryBlobs);
    stage = 'merge';
    if (git.exists(remoteFeature)) merge(git, remoteFeature, branch, config, log);
    merge(git, baseRef, branch, config, log);
    const finalHead = git.oid(), finalState = git.state();
    stage = 'checks-after-merge';
    const finalTasks = detectTasks(root, config); requireTasks(finalTasks, config);
    executeTasks(finalTasks, config, log);
    git.assertIdentity(branch, finalHead); git.assertClean();
    if (git.state() !== finalState) fail('CHANGED', 'Oxirgi tekshiruv fayl/indexni o‘zgartirdi. Push bajarilmadi.');
    stage = 'before-push';
    scanHistory(git, config, remoteFeature, baseRef, verifiedHistoryBlobs);
    // Re-evaluate identity, protection and remote URL immediately before publishing.
    if (preflight(git, config) !== branch) fail('CHANGED', 'Branch o‘zgardi.');
    git.assertIdentity(branch, finalHead); git.assertClean();
    if (git.exists(remoteFeature) && git.oid(remoteFeature) === finalHead) { log('Tayyor: remote branch allaqachon shu commitda. Push kerak emas.'); return; }
    const context = { git, config, branch, remote: config.remote, before: notificationBase, after: finalHead, workHead: beforeFetch, baseHead: git.oid(baseRef), notes: work, pushedAt: new Date().toISOString(), log };
    context.reportIntent = await prepareWork(context);
    log(`Push: ${config.remote}/${branch}`);
    stage = 'push';
    const result = git.result(['-c', 'push.followTags=false', '-c', `remote.${config.remote}.mirror=false`,
      '-c', 'push.recurseSubmodules=no', 'push', '--porcelain', '--no-follow-tags', '--recurse-submodules=no', '--set-upstream', '--',
      config.remote, `refs/heads/${branch}:refs/heads/${branch}`]);
    if (!result.ok) {
      if (result.stdout.split(/\r?\n/).some(line => line.startsWith('!\t'))) {
        try { settleWorkIntent(context, 'rejected'); } catch { /* unconfirmed intents cannot claim historical success */ }
      }
      fail('PUSH', 'Push rad etildi (remote yangilangan, server himoyasi yoki autentifikatsiya). Lokal commitlar saqlangan. Muammoni tuzatib devship ni qayta bajaring.\n' + result.stderr.slice(-3000));
    }
    published = true;
    const updated = result.stdout.split(/\r?\n/).some(line => {
      const [flag, refs] = line.split('\t');
      return [' ', '*'].includes(flag) && refs === `refs/heads/${branch}:refs/heads/${branch}`;
    });
    if (!updated) { log('Tayyor: remote branch allaqachon shu commitda. Yangi push xabari yuborilmadi.'); return; }
    log(`Tayyor: ${branch} tekshirildi va push qilindi.`);
    context.pushedAt = new Date().toISOString();
    try { settleWorkIntent(context); } catch { log('Push tasdiqlandi; kundalik hisobot checkpointini yakunlashda xato. Keyingi tasdiqlashda sana qayta tekshiriladi.'); }
    try { await recordWork(context); }
    catch (error) { log(`Push muvaffaqiyatli; kundalik hisobotga saqlanmadi: ${redact(error.message)}. Push takrorlanmadi.`); }
    try { await notify(context); }
    catch { log('Push muvaffaqiyatli; Telegram hisoboti tayyorlanmadi. devship telegram status/setup orqali sozlamani tekshiring. Git push takrorlanmadi.'); }
  } catch (error) {
    if (!dryRun && branch && !published && config.telegram !== false && error.code !== 'TASKS_SETUP') {
      try { await notifyError({ git, config, branch, remote: config.remote, stage, error, failedAt: new Date().toISOString(), log }); }
      catch { log('Telegram xato xabari tayyorlanmadi. Asl xato saqlandi; push qayta bajarilmadi.'); }
    }
    throw error;
  } finally { release(); }
}
