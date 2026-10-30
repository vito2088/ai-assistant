import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

test('collect all platform installers with stable ASCII names and matching checksums', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'assistant-collect-test-'));
  try {
    await writeFile(join(directory, 'package.json'), JSON.stringify({ version: '0.2.0' }));
    for (const [target, extensions] of [
      ['x86_64-pc-windows-msvc', ['exe', 'msi']], ['aarch64-apple-darwin', ['dmg']],
      ['x86_64-apple-darwin', ['dmg']], ['x86_64-unknown-linux-gnu', ['deb', 'AppImage']],
    ]) {
      const folder = join(directory, 'installers', `installers-${target}`, 'bundle');
      await mkdir(folder, { recursive: true });
      for (const extension of extensions) await writeFile(join(folder, `桌面小助手.${extension}`), `${target}-${extension}`);
    }
    execFileSync(process.execPath, [fileURLToPath(new URL('./collect-release-assets.mjs', import.meta.url))], { cwd: directory });
    const output = join(directory, 'release-assets');
    const names = await readdir(output);
    assert.equal(names.length, 7);
    assert.equal(names.every(name => /^[\x20-\x7e]+$/.test(name)), true);
    assert.equal(names.filter(name => name.endsWith('.dmg')).length, 2);
    const lines = (await readFile(join(output, 'SHA256SUMS.txt'), 'utf8')).trim().split('\n');
    assert.equal(lines.length, 6);
    const manifest = new Map(lines.map(line => {
      const match = line.match(/^([a-f0-9]{64})  (my-assistant_0\.2\.0_.+)$/);
      assert.ok(match, `Invalid checksum line: ${line}`);
      return [match[2], match[1]];
    }));
    assert.deepEqual([...manifest.keys()].sort(), names.filter(name => name !== 'SHA256SUMS.txt').sort());
    for (const [name, checksum] of manifest) {
      const bytes = await readFile(join(output, name));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), checksum);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
