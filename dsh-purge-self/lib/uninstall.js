import { removeTreeNoFollow } from "./remove-tree.js";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import * as core from "./core.js";
import * as hostctl from "./host.js";
import * as rules from "./rules.js";
import * as updater from "./update.js";
import { clearDrillGrant } from "./drill-grant.js";
import { PURGE_PACKAGES } from "./community.js";

function isPurgeEntry(item) {
  const id = typeof item === "string" ? item : item?.name || item?.id;
  return typeof id === "string" && PURGE_PACKAGES.some(name => id === name || id.startsWith(name + "@") || id.startsWith(name + "/"));
}

export function wasApplied(state) {
  if (!state) return false;
  if (state.has_backup) return true;
  if (Number(state.patches_applied) > 0) return true;
  return [state.shim_cmd, state.shim_ps1, state.shim_bin].includes("patched");
}

export function shouldDeletePluginTree(dir, dshHome = core.findDshHome()) {
  if (!dir) return false;
  let real;
  try {
    real = fs.realpathSync(dir);
  } catch {
    real = path.resolve(dir);
  }
  const n = real.replace(/[/\\]+/g, "/");
  let home;
  try {
    home = fs.realpathSync(dshHome);
  } catch {
    home = path.resolve(dshHome);
  }
  const relative = path.relative(home, real);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return false;
  return PURGE_PACKAGES.some(name => n.endsWith(`/node_modules/${name}`))
    || PURGE_PACKAGES.includes(readJson(path.join(real, "package.json"))?.name);
}

export function stripPluginFromPackage(pkg) {
  if (!pkg || typeof pkg !== "object") return false;
  let changed = false;
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    for (const name of PURGE_PACKAGES) {
      if (pkg[key] && Object.prototype.hasOwnProperty.call(pkg[key], name)) {
        delete pkg[key][name];
        changed = true;
      }
    }
  }
  for (const container of [pkg, pkg.dsh?.profile].filter(Boolean)) {
    for (const key of ["bundles", "plugins"]) {
      if (!Array.isArray(container[key])) continue;
      const next = container[key].filter(item => !isPurgeEntry(item));
      if (next.length !== container[key].length) {
        container[key] = next;
        changed = true;
      }
    }
  }
  return changed;
}

function readJson(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(fp, value) {
  fs.writeFileSync(fp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function pkgMentionsPurge(pkg) {
  if (!pkg) return false;
  if (["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"].some(key => PURGE_PACKAGES.some(name => Object.prototype.hasOwnProperty.call(pkg[key] || {}, name)))) return true;
  for (const container of [pkg, pkg.dsh?.profile].filter(Boolean)) {
    for (const key of ["bundles", "plugins"]) {
      if (Array.isArray(container[key]) && container[key].some(isPurgeEntry)) return true;
    }
  }
  return false;
}

export function listInstalledProfiles(dshHome = core.findDshHome()) {
  const root = path.join(dshHome, "profiles");
  if (!fs.existsSync(root)) return [];
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const dir = path.join(root, name);
    const pkgPath = path.join(dir, "package.json");
    const pkg = readJson(pkgPath);
    const hasModule = PURGE_PACKAGES.some(id => fs.existsSync(path.join(dir, "node_modules", id)));
    if (!pkgMentionsPurge(pkg) && !hasModule) continue;
    const spec = PURGE_PACKAGES.map(id => pkg?.dependencies?.[id] || pkg?.devDependencies?.[id]).find(Boolean) || "";
    out.push({ name, dir, spec: String(spec), pkgPath, hasModule });
  }
  return out;
}

async function unlinkIfExists(fp) {
  try {
    await fsp.unlink(fp);
    return true;
  } catch (e) {
    if (e && e.code === "ENOENT") return false;
    throw e;
  }
}

async function rmIfExists(fp) {
  try {
    await removeTreeNoFollow(fp);
    return true;
  } catch {
    return false;
  }
}

async function removeOverride(dshHome) {
  const fp = core.findOverrideFile(dshHome);
  const ok = await unlinkIfExists(fp);
  return { path: fp, removed: ok };
}

async function resetRules(dshHome) {
  const reset = await rules.resetToOriginal(dshHome);
  const dir = rules.rulesDir(dshHome);
  const removedDir = await rmIfExists(dir);
  return { ...reset, rules_dir: dir, rules_dir_removed: removedDir };
}

export function collectCleanupDirs(profiles, dshHome) {
  const seen = new Set();
  const cleanup = [];
  const remember = (dir) => {
    if (!dir) return;
    // Keep the link itself in the plan. realpath here would turn unlink into
    // recursive deletion of a user-owned source checkout or shared package.
    const entry = path.resolve(dir);
    const key = process.platform === "win32" ? entry.toLowerCase() : entry;
    if (seen.has(key)) return;
    seen.add(key);
    cleanup.push(entry);
  };

  for (const p of profiles) {
    for (const name of PURGE_PACKAGES) {
      const nm = path.join(p.dir, "node_modules", name);
      let stat;
      try { stat = fs.lstatSync(nm); }
      catch (error) { if (error.code === "ENOENT") continue; throw error; }
      // A profile/package directory may itself be a link. Never clean a path
      // whose parent resolves outside this DSH home.
      const parent = fs.realpathSync(path.dirname(nm));
      const home = fs.realpathSync(dshHome);
      const relative = path.relative(home, parent);
      if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) continue;
      if (stat.isSymbolicLink()) remember(nm); // includes dangling links / Windows junctions
      else if (shouldDeletePluginTree(nm, dshHome)) remember(nm);
    }
  }

  const dataDir = path.join(dshHome, "dsh-purge");
  remember(dataDir);

  const root = updater.pluginRoot();
  if (shouldDeletePluginTree(root, dshHome)) remember(root);

  return cleanup;
}

function unregisterProfiles(profiles) {
  const stripped = [];
  const errors = [];
  for (const p of profiles) {
    try {
      const pkg = readJson(p.pkgPath) || {};
      if (stripPluginFromPackage(pkg)) {
        writeJson(p.pkgPath, pkg);
        stripped.push(p.name);
      }
    } catch (e) {
      errors.push({ profile: p.name, error: String(e && e.message ? e.message : e) });
    }
  }
  return { stripped, errors };
}

export async function uninstallPurge() {
  const state = await core.gatherState();
  const applied = wasApplied(state);
  const dshHome = state.dsh_home || core.findDshHome();
  const report = {
    ok: true,
    applied,
    reverted: false,
    needRestart: true,
    patches: null,
    shim: null,
    flash: null,
    override: null,
    rules: null,
    profiles: [],
    cleanup: [],
    errors: [],
    warnings: [],
    reseal: null,
  };

  try {
    if (state.ai_base) {
      report.patches = await core.revertAll(state.ai_base);
      if (applied) report.reverted = true;
    }
  } catch (e) {
    report.warnings.push(`revert patches: ${e.message || e}`);
  }
  // 旧行为:revert 有错就直接判定卸载失败并清空清理计划,但错误只留在
  // patches.errors 里,CLI 一条都不打印 —— 用户只看到「卸载未完成」却无从下手。
  // 现在 revert 失败降级为警告,末尾统一靠 reseal 丢弃解包目录收尾。
  for (const item of report.patches?.errors || []) {
    const pair = Array.isArray(item) ? item : [item?.patch_id ?? item?.name ?? "", item?.error ?? item?.message ?? String(item)];
    report.warnings.push(`revert ${String(pair[0] || "patch")}: ${String(pair[1] ?? "")}`);
  }

  // 卸载前把官方 bundle 还原成封签状态:补丁都写在解包目录里,目录一丢就等于还原完;
  // 同时修掉「卸载后 app.asar 仍是 .bak、签名继续坏、更新继续失败」的残留。
  try {
    const { resealDesktopHost } = await import("./reseal.js");
    report.reseal = resealDesktopHost({}, { discard: true });
    for (const e of report.reseal?.errors || []) report.errors.push(`reseal: ${e}`);
    if (report.reseal?.sealed === false) report.errors.push("reseal: codesign 校验未通过");
  } catch (e) {
    report.errors.push(`reseal: ${e.message || e}`);
  }

  try {
    report.shim = await core.revertAllShims();
    if (state.shim_cmd === "patched" || state.shim_ps1 === "patched" || state.shim_bin === "patched") {
      report.reverted = true;
    }
  } catch (e) {
    report.errors.push(`revert shims: ${e.message || e}`);
  }

  try {
    report.flash = core.revertCmdFlash(state.ai_base, dshHome);
  } catch (e) {
    report.errors.push(`revert flash: ${e.message || e}`);
  }

  try {
    report.override = await removeOverride(dshHome);
  } catch (e) {
    report.errors.push(`remove override: ${e.message || e}`);
  }

  try {
    report.rules = await resetRules(dshHome);
  } catch (e) {
    report.errors.push(`reset rules: ${e.message || e}`);
  }

  const profiles = listInstalledProfiles(dshHome);
  report.profiles = profiles.map((p) => p.name);
  const unreg = unregisterProfiles(profiles);
  report.stripped = unreg.stripped;
  report.errors.push(...unreg.errors.map((x) => `${x.profile}: ${x.error}`));
  if (unreg.errors.length) {
    report.ok = false;
    report.needRestart = false;
    report.cleanup = [];
    report.drillGrantCleared = false;
    return report;
  }

  try {
    report.drillGrantCleared = clearDrillGrant(dshHome);
  } catch (e) {
    report.ok = false;
    report.needRestart = false;
    report.cleanup = [];
    report.errors.push(`clear drill grant: ${e.message || e}`);
    return report;
  }

  report.cleanup = collectCleanupDirs(profiles, dshHome);
  return report;
}

export function scheduleCleanupRestart(opts = {}) {
  hostctl.scheduleCleanupRestart(opts);
}

/** CLI has no restart helper to consume the cleanup plan. Complete it directly. */
export async function finishUninstallCleanup(report) {
  if (!report.ok || report.errors.length) {
    report.ok = false;
    return report;
  }
  report.cleaned = [];
  for (const dir of report.cleanup || []) {
    try {
      await removeTreeNoFollow(dir, { maxRetries: 8, retryDelay: 120 });
      report.cleaned.push(dir);
    } catch (e) {
      report.errors.push(`cleanup ${dir}: ${e.message || e}`);
    }
  }
  report.ok = report.errors.length === 0;
  return report;
}
