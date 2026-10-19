import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { within } from './config.mjs';
import { fail, run, redact, ShipError } from './process.mjs';
import { nodeProject, projectManager } from './project-settings.mjs';

export function detectTasks(root, config, { preferencesFile } = {}) {
  if (config.checks !== undefined && config.checks !== null) return config.checks.map(check => ({
    argv: Array.isArray(check) ? check : check.argv,
    cwd: within(root, resolve(root, Array.isArray(check) ? '.' : check.cwd || '.'))
  }));
  const tasks = [], has = name => existsSync(join(root, name));
  const add = argv => tasks.push({ argv, cwd: root });
  if (has('pom.xml')) add([has(process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw')
    ? join(root, process.platform === 'win32' ? 'mvnw.cmd' : 'mvnw') : 'mvn', '--batch-mode', 'verify']);
  if (['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'].some(has))
    add([has(process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')
      ? join(root, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew') : 'gradle', '--no-daemon', 'build']);
  if (has('package.json')) {
    const info = nodeProject(root), pkg = info.pkg, manager = projectManager(root, info, preferencesFile);
    const hasScript = name => typeof pkg.scripts?.[name] === 'string' && !!pkg.scripts[name].trim();
    const scripts = [['check:types', 'typecheck', 'type-check'], ['test', 'test:unit'], ['build']]
      .map(group => group.find(hasScript)).filter(Boolean);
    for (const script of scripts)
      add([manager, 'run', script]);
  }
  return tasks;
}

export function requireTasks(tasks, config) {
  if (!tasks.length && !config.allowNoChecks) fail('TASKS', 'Build/test topilmadi. .devship.json ichida checks yozing; tekshiruvsiz loyiha uchun allowNoChecks: true ni ongli ravishda belgilang.');
}
export function executeTasks(tasks, config, log) {
  requireTasks(tasks, config);
  if (!tasks.length) log('Ogohlantirish: allowNoChecks=true; build/test bajarilmaydi.');
  for (const task of tasks) {
    const started = performance.now();
    log(`Tekshiruv: ${task.argv[0]} ${task.argv.slice(1).join(' ')}`);
    let result;
    try { result = run(task.argv[0], task.argv.slice(1), { cwd: task.cwd, timeoutMs: config.timeoutMs, allowFailure: true }); }
    catch (error) { error.check = { argv: task.argv, cwd: task.cwd }; throw error; }
    if (!result.ok) {
      const diagnostics = redact(result.stdout + '\n' + result.stderr).trim().slice(-12000);
      const error = new ShipError('COMMAND', `Tekshiruv bajarilmadi: ${task.argv[0]} (exit ${result.status ?? 'signal'}).\n${diagnostics}`);
      error.check = { argv: task.argv, cwd: task.cwd }; throw error;
    }
    const output = redact(result.stdout + result.stderr).trim(); if (output) log(output.slice(-12000));
    log(`Tekshiruv tugadi: ${task.argv[0]} ${task.argv.slice(1, 3).join(' ')} — ${((performance.now() - started) / 1000).toFixed(2)} soniya.`);
  }
}
