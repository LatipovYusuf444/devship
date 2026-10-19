import { openSync, writeFileSync, readFileSync, closeSync, unlinkSync, lstatSync } from 'node:fs';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fail } from './process.mjs';

function readLock(file) {
  try { if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) return null; return JSON.parse(readFileSync(file, 'utf8')); }
  catch { return null; }
}
function isDead(owner, root) {
  if (owner?.version !== 2 || owner.host !== hostname() || owner.root !== root || !/^[a-f0-9-]{36}$/.test(owner.token || '') || !Number.isSafeInteger(owner.pid) || owner.pid < 1) return false;
  try { process.kill(owner.pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; }
}
export function acquireLock(file, root) {
  const busy = () => fail('LOCK', `DevShip lock mavjud: ${file}. Boshqa DevShip tugashini kuting. Egasi noma’lum/ishlayotgan lock o‘chirilmaydi; ds doctor bilan tekshiring.`);
  let fd;
  try { fd = openSync(file, 'wx', 0o600); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const owner = readLock(file); if (!isDead(owner, root)) busy();
    let recovery;
    try { recovery = openSync(`${file}.recovery`, 'wx', 0o600); } catch { busy(); }
    try {
      const current = readLock(file);
      if (current?.token !== owner.token || !isDead(current, root)) busy();
      unlinkSync(file);
      try { fd = openSync(file, 'wx', 0o600); } catch { busy(); }
    } finally { closeSync(recovery); unlinkSync(`${file}.recovery`); }
  }
  const token = randomUUID();
  try { writeFileSync(fd, JSON.stringify({ version: 2, pid: process.pid, host: hostname(), root, token, started: new Date().toISOString() })); }
  catch (e) { closeSync(fd); unlinkSync(file); throw e; }
  closeSync(fd); let released = false;
  const release = () => {
    if (released) return; released = true;
    process.removeListener('exit', release);
    if (readLock(file)?.token === token) unlinkSync(file);
  };
  process.once('exit', release);
  return release;
}
