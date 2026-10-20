import { mkdirSync, writeFileSync, readFileSync, existsSync, lstatSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { globalConfigPath } from './config.mjs';
import { reportDirectory } from './daily-reports.mjs';
import { run, fail } from './process.mjs';

const xml = value => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
const ps = value => "'" + String(value).replaceAll("'", "''") + "'";
const systemd = (value, expand = true) => '"' + String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%').replaceAll('$', () => expand ? '$$' : '$') + '"';
export function schedulerManifest({ platform = process.platform, node = process.execPath, cli = fileURLToPath(new URL('../bin/devship.mjs', import.meta.url)), directory = reportDirectory(), config = globalConfigPath(), sid = '' } = {}) {
  for (const value of [node, cli, directory, config, sid]) if (typeof value !== 'string' || /[\u0000-\u001f]/.test(value)) fail('REPORT', 'Jadval manzilida boshqaruv belgisi bor.');
  const name = 'devship-report-' + createHash('sha256').update(directory).digest('hex').slice(0, 12);
  if (platform === 'win32') {
    const runner = `$ErrorActionPreference='Stop'\n$env:DEVSHIP_GLOBAL_CONFIG=${ps(config)}\n$p=Start-Process -FilePath ${ps(node)} -ArgumentList ${ps('"' + cli + '" reports run-due')} -WindowStyle Hidden -Wait -PassThru\nexit $p.ExitCode\n`;
    const runnerPath = join(directory, 'scheduled-report.ps1');
    const args = `-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${Buffer.from(runner, 'utf16le').toString('base64')}`;
    const content = `<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><RegistrationInfo><Description>DevShip daily work report — current user only</Description></RegistrationInfo><Triggers><TimeTrigger><Repetition><Interval>PT1M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><StartBoundary>2026-01-01T00:00:00</StartBoundary><Enabled>true</Enabled></TimeTrigger><LogonTrigger><Enabled>true</Enabled>${sid ? `<UserId>${xml(sid)}</UserId>` : ''}</LogonTrigger></Triggers><Principals><Principal id="User">${sid ? `<UserId>${xml(sid)}</UserId>` : ''}<LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals><Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><Enabled>true</Enabled><Hidden>true</Hidden><ExecutionTimeLimit>PT5M</ExecutionTimeLimit></Settings><Actions Context="User"><Exec><Command>${xml(join(process.env.SystemRoot || 'C:/Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'))}</Command><Arguments>${xml(args)}</Arguments><WorkingDirectory>${xml(directory)}</WorkingDirectory></Exec></Actions></Task>`;
    return { name, content, runner, runnerPath, filename: name + '.xml' };
  }
  if (platform === 'darwin') {
    const content = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${name}</string><key>ProgramArguments</key><array>${[node, cli, 'reports', 'run-due'].map(x => `<string>${xml(x)}</string>`).join('')}</array><key>EnvironmentVariables</key><dict><key>DEVSHIP_GLOBAL_CONFIG</key><string>${xml(config)}</string></dict><key>RunAtLoad</key><true/><key>StartInterval</key><integer>60</integer><key>ProcessType</key><string>Background</string></dict></plist>`;
    return { name, content, filename: name + '.plist' };
  }
  if (platform === 'linux') {
    const content = `[Unit]\nDescription=DevShip daily work report\n[Service]\nType=oneshot\nEnvironment=${systemd('DEVSHIP_GLOBAL_CONFIG=' + config, false)}\nExecStart=${systemd(node)} ${systemd(cli)} reports run-due\n`;
    const timer = `[Unit]\nDescription=Check DevShip work report deadline\n[Timer]\nOnStartupSec=30s\nOnCalendar=*-*-* *:*:00\nAccuracySec=1s\nPersistent=true\n[Install]\nWantedBy=timers.target\n`;
    return { name, content, timer, filename: name + '.service' };
  }
  fail('REPORT', 'Bu tizimda avtomatik jadval qo‘llanmaydi; reports run-due buyrug‘ini OS jadvaliga ulang.');
}
export function installReportScheduler({ directory = reportDirectory(), runFn = run, platform = process.platform, home = homedir(), ...options } = {}) {
  let sid = '';
  if (platform === 'win32') {
    const result = runFn('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { cwd: directory, allowFailure: true });
    sid = /S-1-\d+(?:-\d+)+/.exec(result.stdout)?.[0] || '';
    if (!sid) fail('REPORT', 'Windows foydalanuvchi SIDsi aniqlanmadi. Jadval o‘rnatilmadi.');
  }
  const manifest = schedulerManifest({ ...options, directory, platform, sid });
  const execute = (cmd, args) => {
    const result = runFn(cmd, args, { cwd: directory, timeoutMs: 30000, allowFailure: true });
    if (!result.ok) fail('REPORT', 'OS hisobot jadvalini qabul qilmadi. Scheduler ruxsatlarini tekshiring; hisobot hali yoqilmadi.');
    return result;
  };
  if (platform === 'win32') {
    writeFileSync(manifest.runnerPath, '\uFEFF' + manifest.runner, { mode: 0o600 });
    const path = join(directory, manifest.filename); writeFileSync(path, Buffer.from('\uFEFF' + manifest.content, 'utf16le'), { mode: 0o600 });
    execute('schtasks.exe', ['/Create', '/TN', manifest.name, '/XML', path, '/F']);
    execute('schtasks.exe', ['/Query', '/TN', manifest.name, '/XML']);
  } else if (platform === 'darwin') {
    const path = join(home, 'Library', 'LaunchAgents', manifest.filename); mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); writeFileSync(path, manifest.content, { mode: 0o600 });
    runFn('launchctl', ['bootout', `gui/${process.getuid()}/${manifest.name}`], { cwd: directory, allowFailure: true });
    execute('launchctl', ['bootstrap', `gui/${process.getuid()}`, path]);
  } else {
    const parent = join(process.env.XDG_CONFIG_HOME || join(home, '.config'), 'systemd', 'user'); mkdirSync(parent, { recursive: true, mode: 0o700 });
    writeFileSync(join(parent, manifest.filename), manifest.content, { mode: 0o600 }); writeFileSync(join(parent, manifest.name + '.timer'), manifest.timer, { mode: 0o600 });
    execute('systemctl', ['--user', 'daemon-reload']); execute('systemctl', ['--user', 'enable', '--now', manifest.name + '.timer']);
  }
  return { name: manifest.name, platform };
}
export function schedulerStatus({ directory = reportDirectory(), runFn = run } = {}) {
  const { name } = schedulerManifest({ directory });
  const result = process.platform === 'win32' ? runFn('schtasks.exe', ['/Query', '/TN', name, '/XML'], { cwd: directory, allowFailure: true })
    : process.platform === 'darwin' ? runFn('launchctl', ['print', `gui/${process.getuid()}/${name}`], { cwd: directory, allowFailure: true })
      : runFn('systemctl', ['--user', 'is-enabled', name + '.timer'], { cwd: directory, allowFailure: true });
  if (!result.ok || /<Enabled>false<\/Enabled>/.test(result.stdout)) return false;
  return process.platform !== 'linux' || runFn('systemctl', ['--user', 'is-active', name + '.timer'], { cwd: directory, allowFailure: true }).ok;
}
export function disableReportScheduler({ directory = reportDirectory(), runFn = run } = {}) {
  const { name } = schedulerManifest({ directory });
  const args = process.platform === 'win32' ? ['schtasks.exe', ['/Change', '/TN', name, '/Disable']]
    : process.platform === 'darwin' ? ['launchctl', ['bootout', `gui/${process.getuid()}/${name}`]] : ['systemctl', ['--user', 'disable', '--now', name + '.timer']];
  const ok = runFn(args[0], args[1], { cwd: directory, allowFailure: true }).ok;
  if (ok && process.platform === 'darwin') {
    const path = join(homedir(), 'Library', 'LaunchAgents', name + '.plist');
    if (existsSync(path) && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink() && readFileSync(path, 'utf8').includes(`<string>${name}</string>`)) unlinkSync(path);
  }
  return ok;
}
