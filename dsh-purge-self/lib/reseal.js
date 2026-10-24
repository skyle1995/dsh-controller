// 还原官方封签(Reseal)。
// 官方 DeepSeek Harness.app 把宿主封在 Contents/Resources/app.asar 里；破甲为了改
// 主进程会把 asar 改名成 app.asar.purge-<token>.bak、解包出 Resources/app/，并在
// runtime/cli/bin/dsh 旁边留下 .dsh-purge.bak。这三处都在代码签名封条(CodeResources)
// 的覆盖范围内，只要留在 bundle 里，codesign --verify 就报
// "a sealed resource is missing or invalid"，electron-updater 把更新交给
// Squirrel.Mac 时拿不到运行中 app 的签名，更新在下载完成后必然失败。
//
// 本模块只做一件事：把 bundle 恢复成官方封签状态。补丁随解包目录一起丢弃，
// 需要时重新 apply 即可。只动 Resources 下的这些受管文件，不碰其他内容。
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import * as desktop from "./desktop.js";

const CLI_NAMES = ["dsh", "dsh.cmd", "dsh.ps1"];
const ASAR_BAK_RE = /^app\.asar(\.purge-[^/]+)?\.bak$/;
const ASAR_META_RE = /^app\.asar(\.purge-[^/]+)?\.json$/;
const PREV_DIR_RE = /^app\.dshpurge-prev/;

function lstat(p) {
  try { return fs.lstatSync(p); } catch { return null; }
}
function isFile(p) {
  const st = lstat(p);
  return Boolean(st && st.isFile());
}
function isDir(p) {
  const st = lstat(p);
  return Boolean(st && st.isDirectory());
}
function list(p) {
  try { return fs.readdirSync(p); } catch { return []; }
}
function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function findDshHome() {
  const env = String(process.env.DSH_HOME || "").trim();
  return env || path.join(os.homedir(), ".dsh");
}

function bundleFor(exe) {
  let dir = path.dirname(path.normalize(String(exe || "")));
  for (let i = 0; i < 6 && dir && dir !== path.dirname(dir); i += 1) {
    if (dir.toLowerCase().endsWith(".app")) return dir;
    dir = path.dirname(dir);
  }
  return "";
}

function moveAway(src, dstDir, options = {}) {
  if (options.discard) {
    fs.rmSync(src, { recursive: true, force: true });
    return { action: "discard", path: src };
  }
  fs.mkdirSync(dstDir, { recursive: true });
  let target = path.join(dstDir, path.basename(src));
  if (lstat(target)) target = path.join(dstDir, `${path.basename(src)}-${stamp()}`);
  try {
    fs.renameSync(src, target);
  } catch (error) {
    // /Applications 与 ~ 可能不在同一卷，rename 会 EXDEV；退回拷贝后删除。
    if (error && error.code === "EXDEV") {
      fs.cpSync(src, target, { recursive: true, force: true, verbatimSymlinks: true });
      fs.rmSync(src, { recursive: true, force: true });
    } else {
      throw error;
    }
  }
  return { action: "move", path: src, to: target };
}

function run(cmd, args) {
  try {
    const out = execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { ok: true, output: String(out || "").trim() };
  } catch (error) {
    const output = String((error && (error.stderr || error.stdout)) || (error && error.message) || "").trim();
    return { ok: false, output };
  }
}

export function verifySeal(bundle) {
  if (process.platform !== "darwin" || !bundle) return { skipped: true };
  const codesign = run("codesign", ["--verify", "--deep", "--strict", bundle]);
  const spctl = run("spctl", ["-a", "-vv", bundle]);
  return { codesign, spctl };
}

/** 只算计划，不落盘。 */
export function planReseal(input = {}) {
  const exe = String(input.execPath || desktop.findDesktopAppExecutable({ discover: true }) || "").trim();
  if (!exe) return { ok: false, error: "未定位到 DeepSeek Harness 可执行文件", exe };
  if (!desktop.isOfficialHarnessExecutable(exe)) {
    return { ok: false, error: `不是官方 DeepSeek Harness: ${exe}`, exe };
  }
  const resources = desktop.resourcesDirForExecutable(exe);
  if (!resources || !isDir(resources)) {
    return { ok: false, error: `resources 目录不存在: ${resources || "(空)"}`, exe };
  }
  const asar = path.join(resources, "app.asar");
  const appDir = path.join(resources, "app");
  const names = list(resources);
  const backups = names.filter((n) => ASAR_BAK_RE.test(n)).map((n) => path.join(resources, n));
  const metas = names.filter((n) => ASAR_META_RE.test(n)).map((n) => path.join(resources, n));
  const locks = names.filter((n) => n.endsWith(".rename-pending")).map((n) => path.join(resources, n));
  const prevDirs = names.filter((n) => PREV_DIR_RE.test(n)).map((n) => path.join(resources, n));
  const cliDir = path.join(resources, "runtime", "cli", "bin");
  const cliBaks = CLI_NAMES.map((n) => path.join(cliDir, `${n}.dsh-purge.bak`)).filter(isFile);
  const clean = !isDir(appDir) && isFile(asar) && metas.length === 0
    && locks.length === 0 && prevDirs.length === 0 && cliBaks.length === 0;
  return {
    ok: true,
    exe,
    resources,
    bundle: bundleFor(exe),
    asar,
    appDir,
    hasAsar: isFile(asar),
    hasAppDir: isDir(appDir),
    backups,
    metas,
    locks,
    prevDirs,
    cliBaks,
    clean,
  };
}

/**
 * 把官方 bundle 还原成封签状态。
 * @param input - { execPath } 可显式指定 exe，默认自动定位。
 * @param options - { discard?: boolean 直接丢弃解包目录，不归档；dryRun?: boolean 只出计划 }
 */
export function resealDesktopHost(input = {}, options = {}) {
  const plan = planReseal(input);
  if (!plan.ok) return { ...plan, actions: [], errors: [plan.error] };
  const archiveDir = path.join(findDshHome(), "dsh-purge", "archive");
  const actions = [];
  const errors = [];

  if (options.dryRun) {
    const would = [];
    if (plan.hasAppDir) would.push({ action: "move-app-dir", from: plan.appDir, to: options.discard ? "(discard)" : archiveDir });
    for (const bak of plan.backups) would.push({ action: "restore-asar", from: bak, to: plan.asar });
    for (const p of [...plan.metas, ...plan.locks, ...plan.prevDirs]) would.push({ action: "move-out", from: p, to: archiveDir });
    for (const bak of plan.cliBaks) would.push({ action: "restore-cli", from: bak, to: bak.replace(/\.dsh-purge\.bak$/, "") });
    return { ...plan, dryRun: true, clean: plan.clean, actions: would, errors, verify: null };
  }

  // 1) 先把 CLI 备份写回原位：官方 dsh 一定在 reference 里，越早还原越好。
  for (const bak of plan.cliBaks) {
    const target = bak.replace(/\.dsh-purge\.bak$/, "");
    try {
      fs.rmSync(target, { force: true });
      fs.renameSync(bak, target);
      actions.push({ action: "restore-cli", detail: target });
    } catch (error) {
      errors.push(`还原 ${target} 失败: ${error.message || error}`);
    }
  }

  // 2) 解包目录会遮蔽 app.asar，必须先从 bundle 里移走。
  if (plan.hasAppDir) {
    try {
      const moved = moveAway(plan.appDir, archiveDir, { discard: options.discard === true });
      actions.push({ action: options.discard ? "discard-app-dir" : "move-app-dir", detail: moved.to || moved.path });
    } catch (error) {
      errors.push(`移走解包目录失败: ${error.message || error}`);
    }
  }

  // 3) asar 回位。已有 asar 时不覆盖（可能是刚更新完的新包）。
  if (!isFile(plan.asar)) {
    const bak = plan.backups[0];
    if (!bak) {
      errors.push("app.asar 与其 .purge-*.bak 都不存在，bundle 无法还原");
    } else {
      try {
        fs.renameSync(bak, plan.asar);
        actions.push({ action: "restore-asar", detail: plan.asar });
      } catch (error) {
        errors.push(`还原 app.asar 失败: ${error.message || error}`);
      }
    }
  } else {
    actions.push({ action: "keep-asar", detail: plan.asar });
  }

  // 4) handoff 记录、rename 锁、上次挪走的旧目录都移出 bundle（留着就破封条）。
  for (const p of [...plan.metas, ...plan.locks, ...plan.prevDirs]) {
    try {
      const moved = moveAway(p, archiveDir, {});
      actions.push({ action: "move-out", detail: moved.to });
    } catch (error) {
      errors.push(`移走 ${path.basename(p)} 失败: ${error.message || error}`);
    }
  }

  // 5) 多余备份：asar 已回位后，剩下的 .bak 一律移出 bundle。
  for (const bak of plan.backups) {
    if (!lstat(bak)) continue;
    try {
      const moved = moveAway(bak, archiveDir, {});
      actions.push({ action: "move-out", detail: moved.to });
    } catch (error) {
      errors.push(`移走 ${path.basename(bak)} 失败: ${error.message || error}`);
    }
  }

  const verify = verifySeal(plan.bundle);
  const sealed = verify.skipped ? errors.length === 0 : Boolean(verify.codesign && verify.codesign.ok);
  return {
    ...plan,
    ok: errors.length === 0 && sealed,
    sealed,
    actions,
    errors,
    verify,
    archiveDir,
    needRestart: true,
  };
}

export function resealSummary(result) {
  if (!result) return "封签还原: 无结果";
  if (result.error) return `封签还原失败: ${result.error}`;
  if (result.dryRun) return `封签还原计划: ${result.actions.length} 步`;
  const state = result.sealed ? "已封签" : "封签未通过";
  return `封签还原: ${result.actions.length} 步 · ${state}`;
}
