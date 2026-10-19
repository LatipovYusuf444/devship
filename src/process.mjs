import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, extname, isAbsolute, join } from 'node:path';

export class ShipError extends Error {
  constructor(code, message) { super(message); this.name = 'ShipError'; this.code = code; }
}
export function fail(code, message) { throw new ShipError(code, message); }

export function redact(text) {
  return String(text).replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[hidden]@')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{16,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{30,}|AIza[A-Za-z0-9_-]{35}|(?:AKIA|ASIA)[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g, '[hidden-token]')
    .replace(/(?<!\d)\d{5,15}:[A-Za-z0-9_-]{30,100}(?![A-Za-z0-9_-])/g, '[hidden-token]')
    .replace(/((?:api[_-]?key|secret[_-]?key|access[_-]?token|bot[_-]?token|password)["']?\s*[=:]\s*["']?)[A-Za-z0-9_+\/=.-]{8,}/gi, '$1[hidden-secret]');
}

export function windowsBatchLine(command, args) {
  const tokens = [command, ...args];
  if (tokens.some(x => /["%!^&|<>\r\n\0]/.test(x)))
    fail('COMMAND', 'Windows .cmd/.bat argumentida xavfli shell belgisi bor. Node .js yoki .exe buyrug‘ini checks orqali tanlang.');
  return `"${tokens.map(x => `"${x}"`).join(' ')}"`;
}

function executable(command, cwd) {
  if (process.platform !== 'win32') return command;
  const dirs = isAbsolute(command) || /[\\/]/.test(command) ? [''] : (process.env.PATH || '').split(delimiter);
  for (const dir of dirs) for (const suffix of extname(command) ? [''] : ['.exe', '.cmd', '.bat', '']) {
    const candidate = dir ? join(dir, command + suffix) : isAbsolute(command) ? command + suffix : join(cwd, command + suffix);
    if (existsSync(candidate)) return candidate;
  }
  return command;
}

export function run(command, args, { cwd, timeoutMs = 600000, input, allowFailure = false } = {}) {
  let program = executable(command, cwd), argv = args;
  let windowsVerbatimArguments = false;
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(program)) {
    argv = ['/d', '/s', '/c', windowsBatchLine(program, args)];
    program = process.env.ComSpec || 'cmd.exe'; windowsVerbatimArguments = true;
  }
  const result = spawnSync(program, argv, {
    cwd, input, encoding: 'utf8', shell: false, windowsHide: true, windowsVerbatimArguments,
    timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_MERGE_AUTOEDIT: 'no', GIT_EDITOR: 'true', GIT_NO_REPLACE_OBJECTS: '1' }
  });
  if (result.error) fail('COMMAND', `Buyruq ishga tushmadi (${result.error.code || 'error'}): ${command}. O‘rnatilganini va vaqt limitini tekshiring.`);
  const response = { ok: result.status === 0, status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
  if (!response.ok && !allowFailure)
    fail('COMMAND', `Buyruq bajarilmadi: ${command} (exit ${result.status ?? result.signal}).\n${redact(response.stderr || response.stdout).slice(-8000)}`);
  return response;
}
