import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { run } from '../src/process.mjs';
import { packageRoot, currentVersion, validatePackage } from '../src/updates.mjs';

const directory = resolve(process.argv[2] || 'dist'); mkdirSync(directory, { recursive: true });
const result = run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', directory], { cwd: packageRoot });
const packed = JSON.parse(result.stdout); if (packed.length !== 1) throw new Error('Expected one npm package');
const tarball = join(directory, 'devship-cli-local.tgz'); renameSync(join(directory, packed[0].filename), tarball);
const bytes = readFileSync(tarball), sha256 = value => createHash('sha256').update(value).digest('hex');
const manifest = { schemaVersion: 1, package: 'devship-cli-local', version: currentVersion, asset: 'devship-cli-local.tgz', sha256: sha256(bytes), size: bytes.length };
validatePackage(bytes, manifest);
writeFileSync(join(directory, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
const source = execFileSync('git', ['archive', '--format=zip', '--prefix=devship/', 'HEAD'], { cwd: packageRoot, maxBuffer: 32 * 1024 * 1024 });
writeFileSync(join(directory, 'devship-source.zip'), source);
writeFileSync(join(directory, 'SHA256SUMS.txt'), ['devship-cli-local.tgz', 'devship-source.zip', 'release.json'].map(name => `${sha256(readFileSync(join(directory, name)))}  ${name}`).join('\n') + '\n');
console.log(`Release assets ready: ${currentVersion}`);
