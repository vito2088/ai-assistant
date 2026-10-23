import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateTag, loadAssets, publishGitee } from './gitee-release.mjs';

test('reject unsafe tags and corrupted or incomplete installer manifests', async () => {
  for (const value of ['', '../v1', 'v1;echo', '1.0.0']) assert.throws(() => validateTag(value));
  assert.equal(validateTag('v0.1.1-beta.1'), 'v0.1.1-beta.1');
  const directory = await mkdtemp(join(tmpdir(), 'assistant-release-test-'));
  try {
    const content = Buffer.from('test installer');
    const hash = createHash('sha256').update(content).digest('hex');
    await writeFile(join(directory, 'app.exe'), content);
    await writeFile(join(directory, 'SHA256SUMS.txt'), `${hash}  app.exe\n`);
    const assets = await loadAssets(directory);
    assert.deepEqual(assets.map(a => a.name), ['app.exe', 'SHA256SUMS.txt']);
    await writeFile(join(directory, 'app.exe'), 'changed');
    await assert.rejects(loadAssets(directory), /校验失败/);
    await writeFile(join(directory, 'SHA256SUMS.txt'), `${hash}  ../app.exe\n`);
    await assert.rejects(loadAssets(directory), /格式无效/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('create, upload, verify and finish release; rerun verifies existing bytes without reupload', async () => {
  let release = null;
  const attachments = [];
  let uploads = 0;
  const bytes = Buffer.from('installer');
  const assets = [{ name: 'app.exe', bytes, hash: createHash('sha256').update(bytes).digest('hex') }];
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === 'https://downloads.example/app.exe') {
      assert.equal(options.headers, undefined, 'CDN download must not receive the token');
      return new Response(bytes);
    }
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    const path = new URL(url).pathname;
    if (path.endsWith('/releases/tags/v0.1.0')) return new Response(JSON.stringify(release), { status: release ? 200 : 404 });
    if (path.endsWith('/releases') && options.method === 'POST') {
      release = { id: 1, ...JSON.parse(options.body) };
      assert.equal(release.prerelease, true);
      return Response.json(release, { status: 201 });
    }
    if (path.endsWith('/attach_files')) {
      if (options.method === 'POST') {
        uploads++;
        const file = options.body.get('file');
        attachments.push({ id: 2, name: file.name, size: file.size, browser_download_url: 'https://downloads.example/app.exe' });
        return Response.json(attachments[0], { status: 201 });
      }
      return Response.json(attachments);
    }
    if (options.method === 'PATCH') { release = { ...release, ...JSON.parse(options.body) }; return Response.json(release); }
    throw new Error(`Unexpected request ${url}`);
  };
  const args = { token: 'test-secret', tag: 'v0.1.0', commit: 'a'.repeat(40), notes: 'Release notes', assets, fetchImpl, log() {} };
  await publishGitee(args);
  assert.equal(uploads, 1);
  assert.equal(release.prerelease, false);
  await publishGitee(args);
  assert.equal(uploads, 1);
  assert.equal(calls.some(call => call.options.method === 'DELETE'), false);
  attachments[0].size++;
  await assert.rejects(publishGitee(args), /已有附件不一致/);
});

test('missing credential and API errors fail without disclosing a token', async () => {
  const args = { tag: 'v0.1.0', commit: 'a'.repeat(40), notes: '', assets: [], log() {} };
  await assert.rejects(publishGitee(args), /GITEE_TOKEN/);
  await assert.rejects(publishGitee({ ...args, token: 'sensitive', fetchImpl: async () => new Response('sensitive', { status: 401 }) }), error => {
    assert.match(error.message, /HTTP 401/);
    assert.equal(error.message.includes('sensitive'), false);
    return true;
  });
});
