import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function validateTag(tag) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(tag ?? '')) throw new Error('RELEASE_TAG 必须为 v1.2.3 或 v1.2.3-beta.1 格式');
  return tag;
}

export async function loadAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries.filter(entry => entry.isFile() && /\.(exe|msi|dmg|deb|AppImage)$/.test(entry.name)).map(entry => entry.name).sort();
  if (!names.length) throw new Error('没有找到可发布的安装包');
  const manifest = await readFile(join(directory, 'SHA256SUMS.txt'));
  const checksums = new Map();
  for (const line of manifest.toString('utf8').trim().split(/\r?\n/)) {
    const match = line.match(/^([a-fA-F0-9]{64}) [ *](.+)$/);
    if (!match || basename(match[2]) !== match[2] || checksums.has(match[2])) throw new Error('SHA256SUMS.txt 格式无效或文件名重复');
    checksums.set(match[2], match[1].toLowerCase());
  }
  if (checksums.size !== names.length) throw new Error('安装包数量与校验清单不一致');
  const assets = [];
  for (const name of names) {
    const bytes = await readFile(join(directory, name));
    const hash = sha256(bytes);
    if (checksums.get(name) !== hash) throw new Error(`安装包校验失败：${name}`);
    assets.push({ name, bytes, hash });
  }
  assets.push({ name: 'SHA256SUMS.txt', bytes: manifest, hash: sha256(manifest) });
  return assets;
}

export async function publishGitee({ token, tag, commit, notes, assets, fetchImpl = fetch, log = console.log }) {
  validateTag(tag);
  if (!token) throw new Error('缺少 GITEE_TOKEN：请在 GitHub 仓库 Actions secrets 中配置 Gitee 私人令牌（projects 权限）');
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('发布目标必须是完整的 Git commit SHA');
  const base = 'https://gitee.com/api/v5/repos/maoxiaoquan/my-assistant';
  async function api(path, { method = 'GET', json, form, optional = false } = {}) {
    let response;
    try {
      response = await fetchImpl(base + path, {
        method, redirect: 'error', signal: AbortSignal.timeout(form ? 300000 : 30000),
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(json ? { 'Content-Type': 'application/json' } : {}) },
        body: form ?? (json ? JSON.stringify(json) : undefined),
      });
    } catch { throw new Error(`Gitee ${method} ${path} 网络请求失败，可重试同步`); }
    if (optional && response.status === 404) return null;
    // Do not echo server response bodies: authentication errors may contain request data.
    if (!response.ok) throw new Error(`Gitee ${method} ${path} 返回 HTTP ${response.status}，请检查令牌权限、仓库权限和附件限制`);
    return response.status === 204 ? null : response.json();
  }
  const source = `https://github.com/maoxiaoquan/my-assistant/releases/tag/${tag}`;
  const finalBody = `${notes.trim()}\n\n---\n安装包与 [GitHub ${tag}](${source}) 相同，可使用 SHA256SUMS.txt 校验。\n`;
  let release = await api(`/releases/tags/${encodeURIComponent(tag)}`, { optional: true });
  if (!release) release = await api('/releases', { method: 'POST', json: {
    tag_name: tag, target_commitish: commit, name: `小助手 ${tag}`, prerelease: true,
    body: `安装包正在同步，完成前请从 [GitHub 下载](${source})。\n\n${finalBody}`,
  } });
  const list = async () => {
    const result = [];
    for (let page = 1; ; page++) {
      const batch = await api(`/releases/${release.id}/attach_files?per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('Gitee 附件列表格式无效');
      result.push(...batch);
      if (batch.length < 100) return result;
    }
  };
  const existing = await list();
  for (const asset of assets) {
    const found = existing.filter(file => file.name === asset.name);
    if (found.length > 1) throw new Error(`远端存在重复附件：${asset.name}，请人工检查`);
    if (found.length) {
      const file = found[0];
      if (file.size !== asset.bytes.length || !file.browser_download_url?.startsWith('https://')) throw new Error(`已有附件不一致：${asset.name}，不会覆盖已发布文件`);
      // Public download: never send the Gitee token to an attachment CDN.
      const response = await fetchImpl(file.browser_download_url, { signal: AbortSignal.timeout(300000) });
      if (!response.ok || sha256(Buffer.from(await response.arrayBuffer())) !== asset.hash) throw new Error(`已有附件校验失败：${asset.name}，不会覆盖已发布文件`);
      log(`已核验，跳过：${asset.name}`);
    } else {
      const form = new FormData();
      form.append('file', new Blob([asset.bytes]), asset.name);
      await api(`/releases/${release.id}/attach_files`, { method: 'POST', form });
      log(`已上传：${asset.name}`);
    }
  }
  const uploaded = await list();
  for (const asset of assets) {
    const matching = uploaded.filter(file => file.name === asset.name && file.size === asset.bytes.length);
    if (matching.length !== 1) throw new Error(`附件上传检查未通过：${asset.name}`);
  }
  await api(`/releases/${release.id}`, { method: 'PATCH', json: {
    tag_name: tag, name: `小助手 ${tag}`, body: finalBody, prerelease: tag.includes('-'),
  } });
  log(`Gitee 发行版同步完成：https://gitee.com/maoxiaoquan/my-assistant/releases/tag/${tag}`);
}

async function main() {
  const tag = validateTag(process.env.RELEASE_TAG);
  if (!process.env.GITEE_TOKEN) throw new Error('缺少 GITEE_TOKEN，请先配置 Actions secret 或本机环境变量');
  const commit = execFileSync('git', ['rev-parse', `${tag}^{commit}`], { encoding: 'utf8' }).trim();
  const remote = execFileSync('git', ['ls-remote', 'https://gitee.com/maoxiaoquan/my-assistant.git', `refs/tags/${tag}`, `refs/tags/${tag}^{}`], { encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const refs = new Map(remote.trim().split('\n').filter(Boolean).map(line => { const [sha, ref] = line.trim().split(/\s+/); return [ref, sha]; }));
  if ((refs.get(`refs/tags/${tag}^{}`) ?? refs.get(`refs/tags/${tag}`)) !== commit) throw new Error('Gitee 标签不存在或指向不同提交，请先推送同一个版本标签到 Gitee');
  await publishGitee({
    token: process.env.GITEE_TOKEN, tag, commit,
    notes: await readFile(process.env.RELEASE_NOTES_FILE ?? 'docs/release-notes.md', 'utf8'),
    assets: await loadAssets(resolve(process.env.RELEASE_ASSETS_DIR ?? 'release-assets')),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
