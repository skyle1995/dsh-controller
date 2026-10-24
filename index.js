import { ipcMain, app, BrowserWindow, nativeTheme } from "electron";
import { spawn, execSync, exec } from "child_process";
import { readFile, writeFile, mkdir, cp, rm, rename, copyFile, stat, readdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";
import os from "os";
import "net";
import "http";
import "zlib";
const DSH_HOME = path.join(os.homedir(), ".dsh");
const DSH_SKILLS_DIR = path.join(DSH_HOME, "skills");
const DSH_NPM_PACKAGE = "@deepseek-ai/dsh";
const PLUGIN_HUB = "https://hub.ifunx.com/skyle1995/dsh-plugins";
const PLUGIN_HUB_API = "https://hub.ifunx.com/api/v1/repos/skyle1995/dsh-plugins";
function pluginProfile() {
  return existsSync(path.join(DSH_HOME, "profiles", "desktop", "package.json")) ? "desktop" : "web";
}
function pluginProfilePkg() {
  return path.join(DSH_HOME, "profiles", pluginProfile(), "package.json");
}
let dshCmdCache = null;
function resolveDshCmd() {
  if (dshCmdCache) return dshCmdCache;
  try {
    const found = execSync(IS_WIN ? "where dsh 2>nul" : "command -v dsh 2>/dev/null", { env: spawnEnv(), encoding: "utf8" });
    const first = String(found ?? "").trim().split("\n")[0];
    if (first) {
      dshCmdCache = first;
      return dshCmdCache;
    }
  } catch {
  }
  const candidates = IS_WIN ? [path.join(process.env.LOCALAPPDATA || "", "Programs", "DeepSeek Harness", "resources", "runtime", "cli", "bin", "dsh.cmd")] : ["/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh"];
  for (const c of candidates) {
    if (c && existsSync(c)) {
      dshCmdCache = c;
      return dshCmdCache;
    }
  }
  dshCmdCache = "dsh";
  return dshCmdCache;
}
const IS_WIN = process.platform === "win32";
const EXTRA_PATHS = IS_WIN ? [
  path.join(os.homedir(), ".version-fox", "shims"),
  path.join(os.homedir(), "AppData", "Roaming", "npm")
] : ["/opt/homebrew/bin", "/usr/local/bin", "/opt/homebrew/sbin", "/usr/local/sbin"];
function spawnEnv() {
  const existing = process.env.PATH || "";
  const parts = existing.split(path.delimiter);
  const extra = EXTRA_PATHS.filter((p) => p && !parts.includes(p)).join(path.delimiter);
  return { ...process.env, PATH: extra ? `${extra}${path.delimiter}${existing}` : existing };
}
let mainWindow = null;
let dshVersionPromise = null;
let dshVersionFetched = false;
let dshVersionCache = null;
const DSH_APP_NAME = "DeepSeek Harness";
function desktopProcessInfo() {
  return new Promise((resolve) => {
    const done = (mainPids, hostPid) => resolve({ mainPids: mainPids.filter(Boolean), hostPid: hostPid ?? null });
    if (IS_WIN) {
      exec(`wmic process where "name like 'DeepSeek%'" get ProcessId,CommandLine /FORMAT:LIST`, { env: spawnEnv(), timeout: 5e3 }, (err, out) => {
        if (err) return done([], null);
        const mainPids = [];
        let hostPid = null;
        for (const block of String(out || "").split(/\n\s*\n/)) {
          const pid = Number((block.match(/ProcessId=(\d+)/) || [])[1]);
          const cl = (block.match(/CommandLine=(.*)/) || [])[1] || "";
          if (!pid) continue;
          if (/--expose-internals/.test(cl)) hostPid ??= pid;
          else if (!/ --/.test(cl)) mainPids.push(pid);
        }
        done(mainPids, hostPid);
      });
      return;
    }
    exec("ps ax -o pid=,command=", { env: spawnEnv(), timeout: 5e3 }, (err, out) => {
      if (err) return done([], null);
      const mainPids = [];
      let hostPid = null;
      for (const line of String(out || "").split("\n")) {
        if (!line.includes("DeepSeek Harness.app/Contents/MacOS")) continue;
        if (line.includes("Helper")) continue;
        const pid = Number(line.trim().split(/\s+/)[0]);
        if (!Number.isInteger(pid)) continue;
        if (line.includes("--expose-internals")) {
          hostPid ??= pid;
          continue;
        }
        if (line.includes(" --")) continue;
        mainPids.push(pid);
      }
      done(mainPids, hostPid);
    });
  });
}
function desktopAppPath() {
  return IS_WIN ? path.join(process.env.LOCALAPPDATA || "", "Programs", DSH_APP_NAME, DSH_APP_NAME + ".exe") : "/Applications/" + DSH_APP_NAME + ".app";
}
function launchDesktop() {
  return new Promise((resolve) => {
    if (IS_WIN) {
      const exe = desktopAppPath();
      if (!existsSync(exe)) return resolve({ ok: false, error: "未找到桌面版:" + exe });
      try {
        spawn(exe, [], { detached: true, stdio: "ignore", windowsHide: true }).unref();
        return resolve({ ok: true });
      } catch (e) {
        return resolve({ ok: false, error: e.message });
      }
    }
    exec('open -a "' + DSH_APP_NAME + '"', { env: spawnEnv(), timeout: 1e4 }, (err) => {
      if (err) return resolve({ ok: false, error: "启动桌面版失败:" + err.message });
      resolve({ ok: true });
    });
  });
}
async function quitDesktop() {
  if (IS_WIN) {
    try {
      execSync('taskkill /IM "' + DSH_APP_NAME + '.exe"', { stdio: "ignore" });
    } catch {
    }
  } else {
    try {
      execSync(`osascript -e 'tell application "` + DSH_APP_NAME + `" to quit'`, { stdio: "ignore", timeout: 8e3 });
    } catch {
    }
  }
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const { mainPids: mainPids2 } = await desktopProcessInfo();
    if (!mainPids2.length) return { ok: true };
  }
  const { mainPids } = await desktopProcessInfo();
  for (const pid of mainPids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
    }
  }
  return { ok: true };
}
function getDshVersion() {
  if (dshVersionFetched) return Promise.resolve(dshVersionCache);
  if (!dshVersionPromise) {
    dshVersionPromise = new Promise((resolve) => {
      const line = `"${resolveDshCmd()}" --version`;
      exec(line, { env: spawnEnv(), timeout: 8e3 }, (_err, stdout) => {
        const first = String(stdout || "").trim().split("\n")[0].trim();
        dshVersionCache = first || null;
        resolve(dshVersionCache);
      });
    }).catch(() => null).then((v) => {
      dshVersionFetched = true;
      return v;
    });
  }
  return dshVersionPromise;
}
function hubFetch(url) {
  return fetch(url, { signal: AbortSignal.timeout(15e3) });
}
let opRunning = false;
function sendOpLog(text) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("op:log", text);
}
function winQuote(a) {
  const s = String(a);
  return /[\s&|<>^()]/.test(s) ? `"${s}"` : s;
}
function nodeExec() {
  return { cmd: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } };
}
function runOp(cmd, args, { log = true, capture = false, extraEnv } = {}) {
  return new Promise((resolve, reject) => {
    if (opRunning) return reject(new Error("已有操作正在进行,请稍候"));
    opRunning = true;
    let nodeExtra = {};
    if (cmd === "node") {
      const n = nodeExec();
      cmd = n.cmd;
      nodeExtra = n.env;
    }
    if (log) sendOpLog(`$ ${cmd} ${args.join(" ")}
`);
    let output = "";
    const childEnv = extraEnv ? { ...spawnEnv(), ...nodeExtra, ...extraEnv } : { ...spawnEnv(), ...nodeExtra };
    const child = IS_WIN ? spawn("cmd", ["/d", "/s", "/c", [cmd, ...args.map(winQuote)].join(" ")], {
      env: childEnv,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    }) : spawn(cmd, args, {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const onData = (d) => {
      const text = String(d);
      if (capture) output += text;
      if (log) sendOpLog(text);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", (err) => {
      opRunning = false;
      sendOpLog(`
[错误] ${err.message}
`);
      err.output = output;
      reject(err);
    });
    child.once("exit", (code) => {
      opRunning = false;
      if (log) sendOpLog(`
[完成] 退出码 ${code}
`);
      if (code === 0) resolve({ code, output });
      else {
        const tail = String(output ?? "").trim().split("\n").filter(Boolean).slice(-4).join(" | ").slice(0, 400);
        const err = new Error(`命令退出码 ${code}${tail ? `:${tail}` : ""}`);
        err.output = output;
        reject(err);
      }
    });
  });
}
function dshRequirementsOf(manifest) {
  const engineRange = manifest?.engines?.dsh;
  if (typeof engineRange === "string" && engineRange.trim()) {
    return { display: engineRange.trim(), ranges: [{ name: "engines.dsh", range: engineRange.trim() }] };
  }
  const ranges = [];
  for (const [name, range] of Object.entries(manifest?.peerDependencies ?? {})) {
    if (name !== DSH_NPM_PACKAGE && !name.startsWith(`${DSH_NPM_PACKAGE}-`)) continue;
    if (typeof range === "string" && range.trim()) ranges.push({ name, range: range.trim() });
  }
  return {
    display: ranges.find((r) => r.name === DSH_NPM_PACKAGE)?.range ?? ranges[0]?.range ?? "",
    ranges
  };
}
async function fetchPluginCatalog() {
  const res = await hubFetch(`${PLUGIN_HUB_API}/contents/packages?ref=main`);
  if (!res.ok) throw new Error(`仓库接口返回 ${res.status}`);
  const entries = await res.json();
  const out = await Promise.all((Array.isArray(entries) ? entries : []).map(async (d) => {
    if (d?.type !== "dir") return null;
    try {
      const pr = await hubFetch(`${PLUGIN_HUB_API}/contents/${d.path}/package.json?ref=main`);
      if (!pr.ok) return null;
      const meta = await pr.json();
      const buf = Buffer.from(meta?.content ?? "", meta?.encoding === "base64" ? "base64" : "utf8");
      const pkg = JSON.parse(buf.toString("utf8"));
      const reqs = dshRequirementsOf(pkg);
      return {
        name: pkg.name,
        version: pkg.version ?? "",
        description: pkg.description ?? "",
        dshRequired: reqs.display,
        dshRanges: reqs.ranges,
        spec: `${PLUGIN_HUB}.git#main&path:${d.path}`
      };
    } catch {
      return null;
    }
  }));
  return out.filter(Boolean);
}
async function listInstalledPlugins() {
  try {
    const pkg = JSON.parse(await readFile(pluginProfilePkg(), "utf8"));
    const plugins = [];
    for (const [name, spec] of Object.entries(pkg?.dependencies ?? {})) {
      let version = null;
      let dshRequired = null;
      let dshRanges = [];
      try {
        const p = JSON.parse(await readFile(
          path.join(path.dirname(pluginProfilePkg()), "node_modules", name, "package.json"),
          "utf8"
        ));
        version = p?.version ?? null;
        const reqs = dshRequirementsOf(p);
        dshRequired = reqs.display;
        dshRanges = reqs.ranges;
      } catch {
      }
      plugins.push({ name, spec, version, dshRequired, dshRanges });
    }
    return plugins;
  } catch {
    return [];
  }
}
function profileExemptionsFile() {
  return path.join(DSH_HOME, "profiles", pluginProfile(), "compatibility.json");
}
async function readPluginExemptions() {
  try {
    return JSON.parse(await readFile(profileExemptionsFile(), "utf8"));
  } catch {
    return {};
  }
}
async function setPluginVersionExemption(name, version, dshVersion, enable) {
  const args = [
    "plugin",
    "--profile",
    pluginProfile(),
    enable ? "allow-version" : "revoke-version",
    `${name}@${version}`,
    "--dsh-version",
    dshVersion
  ];
  if (enable) args.push("--accept-risk");
  await runOp(resolveDshCmd(), args);
  return { ok: true, exemptions: await readPluginExemptions() };
}
const ALLOW_HINT_RE = /allow-version\s+(\S+)\s+--dsh-version\s+(\S+)\s+--accept-risk/g;
function parseAllowHints(text) {
  return [...String(text ?? "").matchAll(ALLOW_HINT_RE)].map((m) => ({ pkg: m[1], dshVersion: m[2] }));
}
const COMMIT_REF_RE = /#([0-9a-f]{40})(?=&|$)/i;
function normalizePluginSpec(spec) {
  return String(spec ?? "").replace(COMMIT_REF_RE, "#main");
}
async function updateAllPlugins() {
  const plugins = await listInstalledPlugins();
  let catalog = [];
  try {
    catalog = await fetchPluginCatalog();
  } catch {
  }
  const catalogByName = new Map(catalog.map((p) => [p.name, p]));
  const results = [];
  for (const p of plugins) {
    const installedSpec = String(p.spec ?? "");
    const fromOfficialHub = installedSpec.startsWith(PLUGIN_HUB);
    const target = fromOfficialHub ? catalogByName.get(p.name)?.spec ?? normalizePluginSpec(installedSpec) : installedSpec;
    try {
      const { output } = await runOp(resolveDshCmd(), ["plugin", "--profile", pluginProfile(), "add", target], { capture: true });
      results.push({ name: p.name, ok: true, spec: target, hints: parseAllowHints(output) });
    } catch (e) {
      results.push({ name: p.name, ok: false, spec: target, error: String(e?.message ?? e), hints: parseAllowHints(e?.output) });
    }
  }
  if (existsSync(PURGE_UNRESTRICT_MARK)) {
    try {
      await purgeUnrestricted();
    } catch {
    }
  }
  try {
    await applyClientNoticePatch();
  } catch {
  }
  return results;
}
const PURGE_PACKAGES = ["dsh-purge-self", "dsh-purge-community", "dsh-purge", "dsh-purge-panel"];
const SELF_REPO_GIT = "https://hub.ifunx.com/skyle1995/dsh-controller.git";
const SELF_REPO_API = "https://hub.ifunx.com/api/v1/repos/skyle1995/dsh-controller";
const PURGE_SELF_GIT = SELF_REPO_GIT + "#main&path:dsh-purge-self";
const PURGE_SELF_API = SELF_REPO_API;
function purgeProfileModules() {
  return path.join(DSH_HOME, "profiles", pluginProfile(), "node_modules");
}
let purgeMarketCache = null;
let purgeMarketAt = 0;
let purgeCliCache = null;
let dshBaseCache = null;
let dshBaseAt = 0;
function purgeInstallDir() {
  for (const name of PURGE_PACKAGES) {
    const dir = path.join(purgeProfileModules(), name);
    if (existsSync(path.join(dir, "package.json"))) return dir;
  }
  return null;
}
async function purgeMarketInfo() {
  if (purgeMarketCache && Date.now() - purgeMarketAt < 5 * 6e4) return purgeMarketCache;
  const res = await hubFetch(`${PURGE_SELF_API}/contents/dsh-purge-self/package.json?ref=main`);
  if (!res.ok) throw new Error(res.status === 404 ? "自建源未发布(先提交推送 dsh-purge-self/ 到本项目仓库)" : `自建源接口返回 ${res.status}`);
  const meta = await res.json();
  const pkg = JSON.parse(Buffer.from(meta?.content ?? "", meta?.encoding === "base64" ? "base64" : "utf8").toString("utf8"));
  if (pkg?.name !== "dsh-purge-self" || !pkg?.version) throw new Error("自建源 package.json 异常");
  purgeMarketCache = { version: pkg.version, engines: pkg.engines ?? null, url: `${PURGE_SELF_GIT}#main` };
  purgeMarketAt = Date.now();
  return purgeMarketCache;
}
function purgeTuning() {
  try {
    return JSON.parse(readFileSync(path.join(DSH_HOME, "dsh-purge", "tuning.json"), "utf8"));
  } catch {
    return null;
  }
}
ipcMain.handle("purge:clearAudit", async () => {
  const file = path.join(DSH_HOME, "dsh-purge-community", "audit.jsonl");
  if (!existsSync(file)) return { ok: true, cleared: 0, backup: null };
  const raw = await readFile(file, "utf8");
  const lines = raw.trim() ? raw.trim().split("\n").filter(Boolean).length : 0;
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const backup = `${file}.bak-${stamp}`;
  await writeFile(backup, raw, "utf8");
  await writeFile(file, "", "utf8");
  return { ok: true, cleared: lines, backup };
});
function purgeAuditTail(limit = 8) {
  try {
    const raw = readFileSync(path.join(DSH_HOME, "dsh-purge-community", "audit.jsonl"), "utf8").trim();
    if (!raw) return [];
    return raw.split("\n").slice(-limit).map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean).reverse();
  } catch {
    return [];
  }
}
function purgeBin(which = "community.js") {
  const dir = purgeInstallDir();
  if (!dir) throw new Error("破甲插件未安装");
  const bin = path.join(dir, "bin", which);
  if (!existsSync(bin)) throw new Error(`找不到插件 CLI(${which}),安装可能不完整`);
  return bin;
}
async function purgeCli(args, { log = true } = {}) {
  const { output } = await runOp("node", [purgeBin(), ...args], { log, capture: true, extraEnv: await purgeExtraEnv() });
  return output;
}
async function purgeCliJson(args, opts) {
  const output = await purgeCli(args, opts);
  const from = output.indexOf("{");
  const to = output.lastIndexOf("}");
  if (from < 0 || to <= from) throw new Error("CLI 输出不是 JSON");
  return JSON.parse(output.slice(from, to + 1));
}
const HOST_ORIGINALS_DIR = path.join(DSH_HOME, "dsh-controller", "host-originals");
function hostOriginalId(id) {
  const v = String(id ?? "");
  if (!/^[0-9A-Za-z.\-]{10,64}$/.test(v)) throw new Error("快照 ID 非法");
  return v;
}
async function walkBak(dir, out = []) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith("._")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walkBak(p, out);
    else if (e.name.endsWith(".dshpurge.bak")) out.push(p);
  }
  return out;
}
async function createHostOriginals(reason = "manual") {
  const base = await detectDshBase();
  if (!base) throw new Error("未定位到宿主目录,无法创建原始备份");
  const baks = await walkBak(base);
  if (!baks.length) throw new Error("宿主里没有补丁原始副本(.dshpurge.bak):请先在面板应用一次补丁,或插件从未修改宿主");
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const dir = path.join(HOST_ORIGINALS_DIR, stamp);
  await mkdir(path.join(dir, "files"), { recursive: true });
  const files = [];
  let bytes = 0;
  for (const bak of baks) {
    const rel = path.relative(base, bak).replace(/\.dshpurge\.bak$/, "");
    const target = path.join(dir, "files", rel);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(bak, target);
    const st = await stat(bak);
    files.push({ rel, size: st.size });
    bytes += st.size;
  }
  const manifest = {
    id: stamp,
    base,
    createdAt: Date.now(),
    reason,
    count: files.length,
    bytes,
    files
  };
  await writeFile(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}
async function listHostOriginals() {
  let names = [];
  try {
    names = await readdir(HOST_ORIGINALS_DIR);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names.sort().reverse()) {
    try {
      const raw = await readFile(path.join(HOST_ORIGINALS_DIR, name, "manifest.json"), "utf8");
      const m = JSON.parse(raw);
      out.push({ id: m.id, createdAt: m.createdAt, reason: m.reason, count: m.count, bytes: m.bytes, base: m.base });
    } catch {
    }
  }
  return out;
}
async function restoreHostOriginals(id) {
  const snap = hostOriginalId(id);
  const dir = path.join(HOST_ORIGINALS_DIR, snap);
  const m = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
  const base = await detectDshBase();
  if (!base || path.resolve(base) !== path.resolve(m.base)) {
    throw new Error("宿主目录与快照记录不一致(可能已升级/移动),已拒绝恢复");
  }
  const baseResolved = path.resolve(base) + path.sep;
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  let restored = 0;
  for (const f of m.files ?? []) {
    const target = path.resolve(path.join(base, f.rel));
    if (!target.startsWith(baseResolved)) throw new Error("快照条目越界:" + f.rel);
    const src = path.join(dir, "files", f.rel);
    if (!existsSync(src)) continue;
    if (existsSync(target)) {
      try {
        await copyFile(target, target + ".restore-bak-" + stamp);
      } catch {
      }
    }
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(src, target);
    restored += 1;
  }
  return { ok: true, id: snap, restored };
}
async function deleteHostOriginals(id) {
  const snap = hostOriginalId(id);
  await rm(path.join(HOST_ORIGINALS_DIR, snap), { recursive: true, force: true });
  return { ok: true, id: snap };
}
function validDshBase(dir) {
  return !!(dir && existsSync(path.join(dir, "dsh-agent-instructions", "lib")));
}
async function detectDshBase() {
  if (dshBaseCache !== null && Date.now() - dshBaseAt < 5 * 6e4) return dshBaseCache;
  let base = null;
  const resources = IS_WIN ? path.join(process.env.LOCALAPPDATA || "", "Programs", DSH_APP_NAME, "resources") : "/Applications/" + DSH_APP_NAME + ".app/Contents/Resources";
  for (const layout of ["app", "app.asar"]) {
    const candidate = path.join(resources, layout, "dsh", "node_modules", "@deepseek-ai");
    if (validDshBase(candidate)) {
      base = candidate;
      break;
    }
  }
  if (!base) {
    const root = await execText("npm root -g");
    if (root) {
      const flat = path.join(root.trim(), "@deepseek-ai");
      if (validDshBase(flat)) base = flat;
      else {
        const nested = path.join(root.trim(), "@deepseek-ai", "dsh", "node_modules", "@deepseek-ai");
        if (validDshBase(nested)) base = nested;
      }
    }
  }
  dshBaseCache = base;
  dshBaseAt = base ? Date.now() : Date.now() - 5 * 6e4 + 2e4;
  return base;
}
async function purgeExtraEnv() {
  const base = await detectDshBase();
  return {
    DSH_SURFACE: "desktop",
    DSH_HOME,
    DSH_PROFILE: "desktop",
    PURGE_PROFILE_DIR: path.join(DSH_HOME, "profiles", "desktop"),
    ...base ? { DSH_BASE: base } : {}
  };
}
async function getPurgeState() {
  const dir = purgeInstallDir();
  const state = {
    installed: !!dir,
    package: dir ? path.basename(dir) : null,
    version: null,
    cliAvailable: false,
    latest: null,
    latestUrl: null,
    engines: null,
    tuning: purgeTuning(),
    auditTail: purgeAuditTail(),
    hostOriginals: await listHostOriginals(),
    backups: null,
    compatibility: null,
    unrestricted: await regionGatePatched(),
    unrestrictMarked: existsSync(PURGE_UNRESTRICT_MARK),
    drillGranted: drillGranted(),
    noticeCleaned: await clientNoticeCleaned(),
    dshBase: await detectDshBase()
  };
  if (dir) {
    try {
      const pkg = JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"));
      state.version = pkg?.version ?? null;
      state.cliAvailable = existsSync(path.join(dir, "bin", "community.js"));
    } catch {
    }
  }
  try {
    const market = await purgeMarketInfo();
    state.latest = market.version;
    state.latestUrl = market.url;
    state.engines = market.engines;
  } catch {
  }
  if (state.cliAvailable) {
    if (purgeCliCache && Date.now() - purgeCliCache.at < 6e4) {
      state.backups = purgeCliCache.backups;
      state.compatibility = purgeCliCache.compatibility;
    } else {
      try {
        const s = await purgeCliJson(["status"], { log: false });
        state.backups = Array.isArray(s?.backups) ? s.backups : [];
        state.compatibility = s?.compatibility ?? null;
        purgeCliCache = { at: Date.now(), backups: state.backups, compatibility: state.compatibility };
      } catch {
      }
    }
  }
  return state;
}
ipcMain.handle("dsh:restart", async () => {
  await quitDesktop();
  await new Promise((r) => setTimeout(r, 1200));
  return launchDesktop();
});
ipcMain.handle("dsh:version", () => getDshVersion());
ipcMain.handle("plugins:installed", () => listInstalledPlugins());
ipcMain.handle("plugins:catalog", () => fetchPluginCatalog());
ipcMain.handle("plugins:install", (_e, spec) => runOp(resolveDshCmd(), ["plugin", "--profile", pluginProfile(), "add", spec]));
ipcMain.handle("plugins:uninstall", (_e, name) => runOp(resolveDshCmd(), ["plugin", "--profile", pluginProfile(), "remove", name]));
ipcMain.handle("plugins:updateAll", () => updateAllPlugins());
ipcMain.handle("plugins:exemptions", () => readPluginExemptions());
ipcMain.handle("plugins:setVersionExemption", (_e, name, version, dshVersion, enable) => setPluginVersionExemption(name, version, dshVersion, enable));
ipcMain.handle("purge:state", () => getPurgeState());
ipcMain.handle("purge:install", async () => {
  const market = await purgeMarketInfo();
  const tmpDir = path.join(os.tmpdir(), `dshc-purge-self-${Date.now()}`);
  try {
    await mkdir(tmpDir, { recursive: true });
    const repoDir = path.join(tmpDir, "repo");
    await gitClone(SELF_REPO_GIT, repoDir);
    const srcDir = path.join(repoDir, "dsh-purge-self");
    if (!existsSync(path.join(srcDir, "package.json"))) {
      throw new Error("仓库里没有 dsh-purge-self/(先提交推送本项目仓库)");
    }
    await cp(srcDir, path.join(tmpDir, "package"), { recursive: true });
    await rm(path.join(tmpDir, "package", ".git"), { recursive: true, force: true });
    const tarball = path.join(tmpDir, "dsh-purge-self.tgz");
    await new Promise((resolve, reject) => {
      const child = spawn("tar", ["-czf", tarball, "-C", tmpDir, "package"], { env: spawnEnv(), stdio: "ignore" });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`tar 打包失败(退出码 ${code})`)));
    });
    const { output } = await runOp(resolveDshCmd(), ["plugin", "--profile", pluginProfile(), "add", tarball], { capture: true });
    purgeCliCache = null;
    let reapplied = false;
    if (existsSync(PURGE_UNRESTRICT_MARK)) {
      try {
        await purgeUnrestricted();
        reapplied = true;
      } catch {
      }
    }
    try {
      await applyClientNoticePatch();
    } catch {
    }
    return { ok: true, version: market.version, output, reapplied };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {
    });
  }
});
ipcMain.handle("purge:apply", async () => {
  let snapshot = null;
  try {
    snapshot = await createHostOriginals("pre-apply");
  } catch (e) {
    throw new Error("原始宿主备份失败,已中止应用:" + String(e?.message ?? e));
  }
  const { output } = await runOp("node", [purgeBin("dsh-purge.js"), "--apply"], { capture: true, extraEnv: await purgeExtraEnv() });
  return { ok: true, output, snapshot: snapshot?.id ?? null };
});
ipcMain.handle("purge:revert", async () => {
  const { output } = await runOp("node", [purgeBin("dsh-purge.js"), "--revert"], { capture: true, extraEnv: await purgeExtraEnv() });
  return { ok: true, output };
});
ipcMain.handle("purge:uninstall", async () => {
  const quit = await quitDesktop();
  const { output } = await runOp("node", [purgeBin("dsh-purge.js"), "--uninstall"], { capture: true, extraEnv: await purgeExtraEnv() });
  purgeCliCache = null;
  return { ok: true, quit, output };
});
ipcMain.handle("purge:reseal", async () => {
  const quit = await quitDesktop();
  const { output } = await runOp("node", [purgeBin("dsh-purge.js"), "--reseal", "--discard"], { capture: true, extraEnv: await purgeExtraEnv() });
  purgeCliCache = null;
  return { ok: true, quit, output };
});
ipcMain.handle("purge:selfcheck", () => purgeCliJson(["selfcheck", "--json"], { log: false }));
ipcMain.handle("purge:backup", async () => {
  purgeCliCache = null;
  return purgeCliJson(["backup"]);
});
ipcMain.handle("purge:rollback", async (_e, id) => {
  purgeCliCache = null;
  return purgeCliJson(["rollback", String(id)]);
});
ipcMain.handle("purge:prune", async () => {
  purgeCliCache = null;
  return purgeCliJson(["prune"]);
});
ipcMain.handle("purge:hostBackup", async () => {
  purgeCliCache = null;
  const snap = await createHostOriginals("manual");
  return { ok: true, snapshot: snap };
});
ipcMain.handle("purge:hostOriginals", () => listHostOriginals());
ipcMain.handle("purge:restoreHost", async (_e, id) => {
  const r = await restoreHostOriginals(id);
  purgeCliCache = null;
  return r;
});
ipcMain.handle("purge:deleteHostBackup", async (_e, id) => {
  const r = await deleteHostOriginals(id);
  return r;
});
ipcMain.handle("purge:deleteBackup", async (_e, id) => {
  const name = String(id ?? "");
  if (!/^[0-9TZa-f-]{15,80}$/.test(name)) throw new Error("备份 ID 格式非法");
  const dir = path.join(DSH_HOME, "dsh-purge-community", "backups", name);
  if (!existsSync(dir)) throw new Error("备份不存在(可能已被清理)");
  await rm(dir, { recursive: true, force: true });
  purgeCliCache = null;
  return { ok: true, id: name };
});
ipcMain.handle("purge:tune", async (_e, key, value) => {
  const map = { boost: ["boost", "on|off"], retry: ["retry", "on|off"], rewind: ["rewind", "on|off"], inject: ["inject", "head|tail|both"] };
  const spec = map[key];
  if (!spec) throw new Error(`未知开关 ${key}`);
  const result = await purgeCliJson([spec[0], String(value)]);
  return { ok: true, result, tuning: purgeTuning() };
});
const PURGE_SKILL_STATE = path.join(DSH_HOME, "skills", ".purge-redteam.json");
const PURGE_UNRESTRICT_MARK = path.join(DSH_HOME, "dsh-purge-community", "controller-unrestrict.json");
const REGION_GATE_ANCHOR = 'export function installRegionGate(ctx) {\n  if (!ctx || typeof ctx.on !== "function") return;';
const REGION_GATE_DISABLED_TAG = "// [dsh-controller] region gate disabled";
async function redteamRepoList() {
  if (redteamRepoCache && Date.now() - redteamRepoAt < 5 * 6e4) return redteamRepoCache;
  const res = await hubFetch(`${SELF_REPO_API}/contents/${REDTEAM_SKILL_REPO_PATH}?ref=main`);
  if (!res.ok) throw new Error(res.status === 404 ? "自建源未发布 redteam-skill(先提交推送 resources/redteam-skill/)" : `自建源接口返回 ${res.status}`);
  const items = await res.json();
  if (!Array.isArray(items)) throw new Error("自建源目录响应异常");
  const files = items.filter((i) => i.type === "file" && i.name.endsWith(".md") && !/^(README|INDEX|CONTRIBUTING)\.md$/i.test(i.name));
  redteamRepoCache = files.map((f) => ({ name: f.name, url: f.download_url || f.url }));
  redteamRepoAt = Date.now();
  return redteamRepoCache;
}
async function redteamRepoVersion() {
  try {
    const res = await hubFetch(`${SELF_REPO_API}/contents/${REDTEAM_SKILL_REPO_PATH}/package.json?ref=main`);
    if (!res.ok) return null;
    const meta = await res.json();
    const pkg = JSON.parse(Buffer.from(meta?.content ?? "", meta?.encoding === "base64" ? "base64" : "utf8").toString("utf8"));
    return pkg?.version ?? null;
  } catch {
    return null;
  }
}
function purgeSkillsSrcDir() {
  const dir = purgeInstallDir();
  if (!dir) return null;
  const src = path.join(dir, "skills", "redteam");
  return existsSync(src) ? src : null;
}
function parseSkillName(md) {
  const fm = String(md).match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return null;
  const m = fm[1].match(/^name:\s*(\S+)\s*$/m);
  return m ? m[1] : null;
}
async function listPurgeSkills() {
  const src = purgeSkillsSrcDir();
  if (!src) return [];
  const out = [];
  for (const e of await readdir(src, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith(".md") || e.name.startsWith("._")) continue;
    const md = await readFile(path.join(src, e.name), "utf8");
    const name = parseSkillName(md);
    if (name) out.push({ file: e.name, name });
  }
  return out;
}
async function purgePluginVersion() {
  const dir = purgeInstallDir();
  if (!dir) return null;
  try {
    return JSON.parse(await readFile(path.join(dir, "package.json"), "utf8"))?.version ?? null;
  } catch {
    return null;
  }
}
const REDTEAM_SKILL_DIR = path.join(DSH_SKILLS_DIR, "redteam-skill");
const REDTEAM_SKILL_REPO_PATH = "resources/redteam-skill";
let redteamRepoCache = null;
let redteamRepoAt = 0;
function parseSkillFrontmatter(md) {
  const fm = String(md).match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return {};
  const get = (key) => {
    const m = fm[1].match(new RegExp("^" + key + ":\\s*(.+)$", "m"));
    return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
  };
  return { name: get("name"), description: get("description"), whenToUse: get("whenToUse") };
}
function redteamEntryMd(entries, version) {
  const rows = entries.map(
    (e) => "| " + e.name + " | " + (e.whenToUse || e.description || "") + " |"
  ).join("\n");
  return [
    "---",
    "name: redteam-skill",
    "description: 红队技能包统一入口(测汇/隧道/横向/WebShell/凭据攻击等 " + entries.length + " 个子技能)。处理渗透测试、内网横向、隧道搭建、漏洞扫描、WebShell 管理等任务时使用;按下方索引进入对应子技能。",
    "---",
    "",
    "# 红队技能包(统一入口 v" + version + ")",
    "",
    "本技能是红队技能集的路由入口。开始任务前:",
    "",
    "1. 按下方索引找到匹配的子技能(按任务类型选择)",
    "2. 阅读本目录 SKILLS/<技能名>.md 的完整说明后执行",
    "3. 涉及目标系统的操作,仅在已获明确授权的环境中进行",
    "",
    "## 子技能索引",
    "",
    "| 技能 | 适用场景 |",
    "|---|---|",
    rows,
    "",
    "> 子技能正文:本目录 SKILLS/ 下同名 .md 文件。"
  ].join("\n");
}
async function cleanupLegacyRedteamSkills() {
  const state = await (async () => {
    try {
      return JSON.parse(await readFile(PURGE_SKILL_STATE, "utf8"));
    } catch {
      return null;
    }
  })();
  const names = new Set(state?.skills ?? []);
  try {
    for (const e of await readdir(DSH_SKILLS_DIR, { withFileTypes: true })) {
      if (e.isDirectory() && existsSync(path.join(DSH_SKILLS_DIR, e.name, "SKILL.md"))) names.add(e.name);
    }
  } catch {
  }
  const removed = [];
  for (const name of names) {
    if (name === "redteam-skill" || name === "reverse-skill") continue;
    const dir = path.join(DSH_SKILLS_DIR, name);
    const src = purgeSkillsSrcDir();
    if (src && !existsSync(path.join(src, name + ".md"))) continue;
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}
async function installPurgeSkills() {
  await mkdir(DSH_SKILLS_DIR, { recursive: true });
  let entries = [];
  let version = null;
  let source = "repo";
  try {
    const files = await redteamRepoList();
    if (!files.length) throw new Error("仓库里没有红队子技能");
    version = await redteamRepoVersion();
    for (const f of files) {
      const res = await hubFetch(f.url);
      if (!res.ok) throw new Error(`拉取 ${f.name} 失败:HTTP ${res.status}`);
      const md = await res.text();
      const name = parseSkillName(md) || f.name.replace(/.md$/, "");
      entries.push({ name, md, meta: parseSkillFrontmatter(md) });
    }
  } catch (repoErr) {
    const src = purgeSkillsSrcDir();
    if (!src) throw new Error(`仓库源不可用(${repoErr.message}),且破甲插件未安装`);
    const skills = await listPurgeSkills();
    if (!skills.length) throw new Error("插件内没有可安装的红队技能");
    version = await purgePluginVersion();
    source = "plugin";
    entries = [];
    for (const sk of skills) {
      const md = await readFile(path.join(src, sk.file), "utf8");
      entries.push({ name: sk.name, md, meta: parseSkillFrontmatter(md) });
    }
  }
  await rm(REDTEAM_SKILL_DIR, { recursive: true, force: true });
  await mkdir(path.join(REDTEAM_SKILL_DIR, "SKILLS"), { recursive: true });
  for (const e of entries) {
    await writeFile(path.join(REDTEAM_SKILL_DIR, "SKILLS", e.name + ".md"), e.md, "utf8");
  }
  await writeFile(path.join(REDTEAM_SKILL_DIR, "SKILL.md"), redteamEntryMd(
    entries.map((e) => ({ name: e.name, ...e.meta })),
    version ?? "?"
  ), "utf8");
  const migrated = await cleanupLegacyRedteamSkills();
  await writeFile(PURGE_SKILL_STATE, JSON.stringify({
    source: source === "repo" ? "resources/redteam-skill" : "dsh-purge-self/skills/redteam",
    version,
    layout: "unified",
    skills: entries.map((e) => e.name),
    installedAt: Date.now()
  }, null, 2), "utf8");
  return { ok: true, version, installed: entries.map((e) => e.name), migrated };
}
async function uninstallPurgeSkills() {
  const removed = [];
  if (existsSync(REDTEAM_SKILL_DIR)) {
    await rm(REDTEAM_SKILL_DIR, { recursive: true, force: true });
    removed.push("redteam-skill");
  }
  const migrated = await cleanupLegacyRedteamSkills();
  removed.push(...migrated);
  if (existsSync(PURGE_SKILL_STATE)) await rm(PURGE_SKILL_STATE, { force: true });
  return { ok: true, removed };
}
async function purgeSkillsState() {
  const pluginVersion = await purgePluginVersion();
  let state = null;
  try {
    state = JSON.parse(await readFile(PURGE_SKILL_STATE, "utf8"));
  } catch {
  }
  let available = 0;
  try {
    available = (await listPurgeSkills()).length;
  } catch {
  }
  let legacyCount = 0;
  try {
    const src = purgeSkillsSrcDir();
    if (src) {
      for (const e of await readdir(DSH_SKILLS_DIR, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name === "redteam-skill" || e.name === "reverse-skill") continue;
        if (existsSync(path.join(DSH_SKILLS_DIR, e.name, "SKILL.md")) && existsSync(path.join(src, e.name + ".md"))) legacyCount++;
      }
    }
  } catch {
  }
  return {
    redteam: {
      pluginInstalled: !!purgeInstallDir(),
      pluginVersion,
      available,
      installed: existsSync(path.join(REDTEAM_SKILL_DIR, "SKILL.md")),
      installedVersion: state?.version ?? null,
      installedAt: state?.installedAt ?? null,
      skillCount: state?.skills?.length ?? 0,
      skills: state?.skills ?? [],
      source: state?.source ?? null,
      latestVersion: await redteamRepoVersion(),
      upToDate: !!(state?.version && await redteamRepoVersion() && state.version === await redteamRepoVersion()),
      legacyScattered: legacyCount
    },
    reverse: await reverseSkillsState()
  };
}
const REVERSE_SKILL_GIT = SELF_REPO_GIT;
const REVERSE_SKILL_API = SELF_REPO_API;
const REVERSE_SKILL_DIR = path.join(DSH_HOME, "skills", "reverse-skill");
const REVERSE_SKILL_STATE = path.join(DSH_HOME, "skills", ".reverse-skill.json");
const REVERSE_SKILL_ENTRY_MD = `---
name: reverse-skill
description: 逆向工程 / 授权渗透测试 / 安全研究 / CTF 技能路由包。处理 APK、二进制、JS 加密、协议逆向、恶意样本分析、漏洞复现等任务时使用。
---

# reverse-skill 路由入口

本技能是一个完整的技能路由包。开始任务前:

1. 阅读本目录下的 \`RULES.md\`(总规则与路由矩阵)与 \`README_AI.md\`(AI 引导)
2. 按 RULES.md 的 MASTER-ROUTING 进入对应子技能
3. **先确认任务目标已获得明确授权**,未授权的目标一律拒绝执行
`;
let reverseSkillLatestCache = null;
let reverseSkillLatestAt = 0;
async function reverseSkillLatest() {
  if (reverseSkillLatestCache && Date.now() - reverseSkillLatestAt < 5 * 6e4) return reverseSkillLatestCache;
  const res = await hubFetch(`${REVERSE_SKILL_API}/contents/resources/reverse-skill/package.json?ref=main`);
  if (!res.ok) throw new Error(res.status === 404 ? "自建源未发布(先提交推送 reverse-skill/ 到本项目仓库)" : `自建源接口返回 ${res.status}`);
  const meta = await res.json();
  const pkg = JSON.parse(Buffer.from(meta?.content ?? "", meta?.encoding === "base64" ? "base64" : "utf8").toString("utf8"));
  const version = pkg?.version ?? null;
  if (version) {
    reverseSkillLatestCache = version;
    reverseSkillLatestAt = Date.now();
  }
  return version;
}
function reverseSkillLocalResource() {
  const dir = app.isPackaged ? null : path.join(app.getAppPath(), "resources", "reverse-skill");
  return dir && existsSync(path.join(dir, "RULES.md")) ? dir : null;
}
async function reverseSkillsState() {
  let state = null;
  try {
    state = JSON.parse(await readFile(REVERSE_SKILL_STATE, "utf8"));
  } catch {
  }
  let latest = null;
  try {
    latest = await reverseSkillLatest();
  } catch {
  }
  let skillCount = 0;
  try {
    for (const sub of ["skills", "skill"]) {
      const dir = path.join(REVERSE_SKILL_DIR, sub);
      if (!existsSync(dir)) continue;
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (e.isDirectory() && existsSync(path.join(dir, e.name, "SKILL.md"))) skillCount++;
      }
      if (skillCount) break;
    }
  } catch {
  }
  let installedVersion = state?.version ?? null;
  if (!installedVersion) {
    try {
      installedVersion = JSON.parse(await readFile(path.join(REVERSE_SKILL_DIR, "package.json"), "utf8"))?.version ?? null;
    } catch {
    }
  }
  return {
    installed: existsSync(path.join(REVERSE_SKILL_DIR, "SKILL.md")),
    installedVersion,
    installedAt: state?.installedAt ?? null,
    latest,
    upToDate: !!(installedVersion && latest && installedVersion === latest),
    skillCount,
    localFallback: !!reverseSkillLocalResource()
  };
}
function gitClone(url, destDir) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["clone", "--depth", "1", url, destDir], {
      env: spawnEnv(),
      stdio: ["ignore", "ignore", "pipe"]
    });
    let err = "";
    child.stderr?.on("data", (d) => {
      err += String(d);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`git clone 失败(退出码 ${code})${err ? ":" + err.trim().slice(0, 300) : ""}`));
    });
  });
}
async function installReverseSkill() {
  let version = null;
  try {
    version = await reverseSkillLatest();
  } catch {
  }
  const tmpDir = path.join(os.tmpdir(), `dshc-reverse-skill-${Date.now()}`);
  try {
    await mkdir(tmpDir, { recursive: true });
    const repoDir = path.join(tmpDir, "repo");
    await gitClone(REVERSE_SKILL_GIT, repoDir);
    const pkgDir = path.join(repoDir, "resources", "reverse-skill");
    if (!existsSync(path.join(pkgDir, "RULES.md"))) throw new Error("仓库内容异常:resources/reverse-skill/ 缺少 RULES.md(先提交推送到本项目仓库)");
    await rm(REVERSE_SKILL_DIR, { recursive: true, force: true });
    await mkdir(path.dirname(REVERSE_SKILL_DIR), { recursive: true });
    await cp(pkgDir, REVERSE_SKILL_DIR, { recursive: true });
    await writeFile(path.join(REVERSE_SKILL_DIR, "SKILL.md"), REVERSE_SKILL_ENTRY_MD, "utf8");
    await rm(path.join(REVERSE_SKILL_DIR, ".git"), { recursive: true, force: true });
    await rm(path.join(DSH_SKILLS_DIR, "__MACOSX"), { recursive: true, force: true });
    try {
      const pkg = JSON.parse(await readFile(path.join(REVERSE_SKILL_DIR, "package.json"), "utf8"));
      if (pkg?.version) version = pkg.version;
    } catch {
    }
    await writeFile(REVERSE_SKILL_STATE, JSON.stringify({
      source: "git",
      version,
      installedAt: Date.now()
    }, null, 2), "utf8");
    return { ok: true, source: "git", version };
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {
    });
  }
}
async function uninstallReverseSkill() {
  await rm(REVERSE_SKILL_DIR, { recursive: true, force: true });
  if (existsSync(REVERSE_SKILL_STATE)) await rm(REVERSE_SKILL_STATE, { force: true });
  return { ok: true };
}
const WELCOME_REPO_TAIL = "\\uFF0C\\u6E90\\u7801\\u4ED3\\u5E93\\uFF1A";
const WELCOME_REPO_NODE_RE = /\n\s*h\(\s*"p",\s*null,\s*h\(\s*"a",\s*\{\s*href: repo,\s*target: "_blank",\s*rel: "noopener noreferrer"\s*\},\s*repo\s*\)\s*,?\s*\)\s*,/;
async function applyClientNoticePatch() {
  const dir = purgeInstallDir();
  if (!dir) return { ok: false, skipped: "not-installed" };
  const file = path.join(dir, "client.js");
  if (!existsSync(file)) return { ok: false, skipped: "no-client" };
  const text = await readFile(file, "utf8");
  const hasTail = text.includes(WELCOME_REPO_TAIL);
  const hasNode = WELCOME_REPO_NODE_RE.test(text);
  if (!hasTail && !hasNode) return { ok: true, already: true };
  const bak = file + ".controller-bak";
  if (!existsSync(bak)) await writeFile(bak, text, "utf8");
  const patched = text.replace(WELCOME_REPO_TAIL, "\\u3002").replace(WELCOME_REPO_NODE_RE, "");
  await writeFile(file + ".tmp", patched, "utf8");
  await rename(file + ".tmp", file);
  return { ok: true };
}
async function clientNoticeCleaned() {
  const dir = purgeInstallDir();
  if (!dir) return false;
  try {
    const text = await readFile(path.join(dir, "client.js"), "utf8");
    return !text.includes(WELCOME_REPO_TAIL) && !WELCOME_REPO_NODE_RE.test(text);
  } catch {
    return false;
  }
}
function regionGateFile() {
  const dir = purgeInstallDir();
  return dir ? path.join(dir, "lib", "net-scope.js") : null;
}
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function purgeUnrestricted() {
  const file = regionGateFile();
  if (!file) throw new Error("破甲插件未安装");
  const text = await readFile(file, "utf8");
  if (text.includes(REGION_GATE_DISABLED_TAG)) return { ok: true, already: true };
  if (!text.includes(REGION_GATE_ANCHOR)) throw new Error("未找到 region gate 锚点,插件版本可能已变化");
  const bak = file + ".controller-bak";
  if (!existsSync(bak)) await writeFile(bak, text, "utf8");
  const patched = text.replace(REGION_GATE_ANCHOR, REGION_GATE_ANCHOR + "\n  return; " + REGION_GATE_DISABLED_TAG);
  await writeFile(file + ".tmp", patched, "utf8");
  await rename(file + ".tmp", file);
  await mkdir(path.dirname(PURGE_UNRESTRICT_MARK), { recursive: true });
  await writeFile(PURGE_UNRESTRICT_MARK, JSON.stringify({ at: (/* @__PURE__ */ new Date()).toISOString() }, null, 2), "utf8");
  return { ok: true };
}
async function purgeRestoreRestricted() {
  const file = regionGateFile();
  if (!file) throw new Error("破甲插件未安装");
  const bak = file + ".controller-bak";
  if (existsSync(bak)) {
    await writeFile(file + ".tmp", await readFile(bak, "utf8"), "utf8");
    await rename(file + ".tmp", file);
    await rm(bak, { force: true });
  } else {
    const text = await readFile(file, "utf8");
    const cleaned = text.replace(new RegExp("\\n  return; " + escapeRegExp(REGION_GATE_DISABLED_TAG), "g"), "");
    if (cleaned !== text) {
      await writeFile(file + ".tmp", cleaned, "utf8");
      await rename(file + ".tmp", file);
    }
  }
  if (existsSync(PURGE_UNRESTRICT_MARK)) await rm(PURGE_UNRESTRICT_MARK, { force: true });
  return { ok: true };
}
async function regionGatePatched() {
  const file = regionGateFile();
  if (!file) return false;
  try {
    return (await readFile(file, "utf8")).includes(REGION_GATE_DISABLED_TAG);
  } catch {
    return false;
  }
}
function drillGrantFile() {
  return path.join(DSH_HOME, "dsh-purge", "drill-grant.json");
}
function drillGranted() {
  try {
    return JSON.parse(readFileSync(drillGrantFile(), "utf8"))?.granted === true;
  } catch {
    return false;
  }
}
async function grantDrill() {
  const file = drillGrantFile();
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ granted: true, at: (/* @__PURE__ */ new Date()).toISOString() }, null, 2) + "\n", "utf8");
  return { ok: true };
}
ipcMain.handle("purge:skillsState", () => purgeSkillsState());
ipcMain.handle("purge:skillsInstall", () => installPurgeSkills());
ipcMain.handle("purge:skillsUninstall", () => uninstallPurgeSkills());
ipcMain.handle("reverseSkill:install", () => installReverseSkill());
ipcMain.handle("reverseSkill:uninstall", () => uninstallReverseSkill());
ipcMain.handle("purge:unrestrict", () => purgeUnrestricted());
ipcMain.handle("purge:restoreRestrict", () => purgeRestoreRestricted());
ipcMain.handle("purge:grantDrill", () => grantDrill());
function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    title: "DSH Controller",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0f1013" : "#eef1f6",
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.mjs"),
      sandbox: false
    }
  });
  mainWindow = win;
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(import.meta.dirname, "../renderer/index.html"));
  }
}
function showWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => showWindow());
});
app.on("window-all-closed", () => {
  app.quit();
});
app.on("will-quit", () => {
});
