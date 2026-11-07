// User-plane agent presets that ship with the plugin.
//
// `unrestricted` is a skeleton: the preset owns the persona and tool plane, while
// approvals/sandbox stay with the host — those gates are removed by host patches,
// not by the preset. Installing it also gives patches #24 / #76 something to act on.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDshHome, ALL_PATCHES, applyReplacementsToText } from "./core.js";
import { atomicFiles } from "./atomic-files.js";

/** 刷新临时文件数据。参数 file 为文件路径，无返回值；刷盘失败则禁止发布。 */
function syncPresetFile(file) {
  const fd = fs.openSync(file, "r+");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

const presetFiles = atomicFiles({
  ...fs,
  /** 写入并刷新临时文件。参数为路径、内容和文件选项，无返回值。 */
  writeFileSync(file, content, options) {
    fs.writeFileSync(file, content, options);
    syncPresetFile(file);
  },
  /** 复制并刷新临时文件。参数为源路径、目标路径和复制标志，无返回值。 */
  copyFileSync(source, destination, flags) {
    fs.copyFileSync(source, destination, flags);
    syncPresetFile(destination);
  },
});

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const UNRESTRICTED_PRESET = "unrestricted";
export const PRESET_FILES = ["preset.yml", "agent.cordis.yml"];
/** 插件自己写的文件带这一行；带它就会被新版覆盖，去掉即视为用户自定义。 */
export const MANAGED_MARKER = "# managed-by: dsh-purge";

export function bundledPresetDir(name = UNRESTRICTED_PRESET) {
  return path.join(ROOT, "presets", name);
}

export function userPresetDir(home, name = UNRESTRICTED_PRESET) {
  const base = home || findDshHome();
  if (!base) throw new Error("未定位 DSH 数据目录");
  return path.join(base, ".agent-presets", name);
}

/**
 * 把自带预设落到用户目录。
 * 已存在的用户自定义文件不覆盖；托管文件内容相同时不写入，force 时强制发布。
 * @returns {{ action: 'installed'|'updated'|'kept', dir: string, files: string[] }}
 */
export function installPreset({ name = UNRESTRICTED_PRESET, force = false, home } = {}) {
  const src = bundledPresetDir(name);
  if (!fs.existsSync(src)) throw new Error(`发行包里没有预设：${src}`);
  const dir = userPresetDir(home, name);
  const agentFile = path.join(dir, "agent.cordis.yml");
  const exists = fs.existsSync(agentFile);
  let managed = false;
  if (exists) {
    try {
      managed = fs.readFileSync(agentFile, "utf8").startsWith(MANAGED_MARKER);
    } catch {
      managed = false;
    }
  }
  if (exists && !force && !managed) return { action: "kept", dir, files: PRESET_FILES.slice() };
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  let changed = false;
  for (const file of PRESET_FILES) {
    const from = path.join(src, file);
    if (!fs.existsSync(from)) continue;
    const target = path.join(dir, file);
    const original = fs.readFileSync(from);
    let wanted = original;
    // 先算出应用 #24 后的目标内容，用于对比；内容未变时不再发布和刷盘。
    if (file === "agent.cordis.yml") {
      try {
        const patch = ALL_PATCHES.find((p) => p.id === 24);
        const applied = applyReplacementsToText(original.toString("utf8"), patch, target);
        if (applied.changed) wanted = Buffer.from(applied.text);
      } catch { /* 补丁表不可用时保留模板，交给正常应用流程。 */ }
    }
    if (!force) {
      try { if (fs.readFileSync(target).equals(wanted)) continue; } catch { /* 缺失文件需要发布。 */ }
    }
    presetFiles.atomicCopyFileSync(from, target);
    if (wanted !== original) presetFiles.atomicWriteSync(target, wanted);
    changed = true;
  }
  return { action: exists ? (changed ? "updated" : "kept") : "installed", dir, files: PRESET_FILES.slice() };
}

export function presetStatus(home, name = UNRESTRICTED_PRESET) {
  let dir = "";
  try {
    dir = userPresetDir(home, name);
  } catch {
    return { name, dir: "", installed: false };
  }
  const file = path.join(dir, "agent.cordis.yml");
  return { name, dir, installed: fs.existsSync(file), file };
}
