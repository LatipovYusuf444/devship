import test from 'node:test';
import assert from 'node:assert/strict';
import { schedulerManifest } from '../src/report-scheduler.mjs';
test('Windows scheduler uses hidden current-user execution and catch-up without shell interpolation', () => {
  const result = schedulerManifest({ platform: 'win32', node: 'C:\\Program Files\\nodejs\\node.exe', cli: 'C:\\User Files\\devship\\bin\\devship.mjs', directory: 'C:\\User Files\\reports', config: 'C:\\User Files\\config.json', sid: 'S-1-5-21-123-123-123-1001' });
  assert.match(result.content, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
  assert.match(result.content, /<Interval>PT1M<\/Interval>/);
  assert.match(result.content, /InteractiveToken/); assert.match(result.content, /LeastPrivilege/);
  assert.match(result.runner, /WindowStyle Hidden/); assert(!result.content.includes('BotToken'));
});
test('launchd and systemd preserve paths with spaces and do not depend on interactive PATH', () => {
  for (const platform of ['darwin', 'linux']) {
    const result = schedulerManifest({ platform, node: '/opt/Node Tools/node', cli: '/home/a/tools%$&/devship.mjs', directory: '/home/a/reports', config: '/home/a/config.json' });
    assert(result.content.includes('/opt/Node Tools/node'));
    assert(!result.content.includes('npm '));
    if (platform === 'linux') assert.match(result.content, /tools%%\$\$&/);
    else assert.match(result.content, /tools%\$&amp;/);
  }
});
test('scheduler manifests reject control characters and unsupported platforms', () => {
  assert.throws(() => schedulerManifest({ platform: 'win32', node: 'bad\npath', cli: 'x', directory: 'y', config: 'z' }));
  assert.throws(() => schedulerManifest({ platform: 'unknown', node: '/node', cli: '/cli', directory: '/reports', config: '/config' }));
});
