/**
 * 界面版本同步：把 package.json 的 version 写入 client.js 的 __dshPurgeVersion 常量。
 * 版本只在 package.json 维护，client.js 不再手写第二份。
 *
 * 用法：node scripts/sync-client-version.mjs [--check]
 *   --check 只校验不写入，不一致时以非 0 退出，可用于发布前检查。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = join(root, "package.json");
const clientPath = join(root, "client.js");

const version = JSON.parse(readFileSync(pkgPath, "utf8")).version;
const text = readFileSync(clientPath, "utf8");
const pattern = /(var __dshPurgeVersion = ")([^"]*)(";)/;
const matched = pattern.exec(text);
if (!matched) {
  console.error("client.js 缺少 __dshPurgeVersion 常量，无法同步版本");
  process.exit(1);
}

const current = matched[2];
if (current === version) {
  console.log(`界面版本一致：${version}`);
  process.exit(0);
}
if (process.argv.includes("--check")) {
  console.error(`界面版本不一致：client.js=${current} package.json=${version}`);
  process.exit(1);
}
writeFileSync(clientPath, text.replace(pattern, `$1${version}$3`));
console.log(`已同步界面版本：${current} -> ${version}`);
