import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const lock = JSON.parse(await read('package-lock.json'));
const tauri = JSON.parse(await read('src-tauri/tauri.conf.json'));
const cargo = (await read('src-tauri/Cargo.toml')).match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1].match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const cargoLock = (await read('src-tauri/Cargo.lock')).match(/\[\[package\]\]\s+name = "my-assistant"\s+version = "([^"]+)"/)?.[1];
const versions = { package: pkg.version, packageLock: lock.version, packageLockRoot: lock.packages?.['']?.version, tauri: tauri.version, cargo, cargoLock };
const version = pkg.version;
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(version)) {
  throw new Error('版本号必须为 x.y.z 或 x.y.z-beta.1 格式');
}
for (const [file, value] of Object.entries(versions)) {
  if (value !== version) throw new Error(`${file} 版本 ${value} 与 package.json ${version} 不一致`);
}
const tag = process.env.RELEASE_TAG;
if (tag !== `v${version}`) throw new Error(`发布标签 ${tag ?? '(未指定 RELEASE_TAG)'} 必须为 v${version}`);
console.log(`版本检查通过：${tag}`);
