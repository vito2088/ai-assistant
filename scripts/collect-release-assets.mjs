import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createHash } from 'node:crypto';

const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const targets = [
  ['x86_64-pc-windows-msvc', '.exe', 'windows_x64-setup.exe'],
  ['x86_64-pc-windows-msvc', '.msi', 'windows_x64.msi'],
  ['aarch64-apple-darwin', '.dmg', 'macos_aarch64.dmg'],
  ['x86_64-apple-darwin', '.dmg', 'macos_x64.dmg'],
  ['x86_64-unknown-linux-gnu', '.deb', 'linux_amd64.deb'],
  ['x86_64-unknown-linux-gnu', '.AppImage', 'linux_x86_64.AppImage'],
];
async function filesIn(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesIn(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
await mkdir('release-assets');
const hashes = [];
for (const [target, extension, suffix] of targets) {
  const matches = (await filesIn(join('installers', `installers-${target}`))).filter(path => extname(path) === extension);
  if (matches.length !== 1) throw new Error(`${target} ${extension} 必须且只能有一个安装包，实际 ${matches.length}`);
  const bytes = await readFile(matches[0]);
  const name = `my-assistant_${version}_${suffix}`;
  await writeFile(join('release-assets', name), bytes);
  hashes.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
}
await writeFile('release-assets/SHA256SUMS.txt', hashes.join('\n') + '\n');
console.log('已汇总六个安装包，使用统一英文下载文件名并生成校验文件');
