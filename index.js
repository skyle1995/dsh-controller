import { ipcMain, app, BrowserWindow, shell, Tray, Menu, nativeTheme, nativeImage } from "electron";
import { spawn, exec, execSync } from "child_process";
import { mkdir, rm, cp, writeFile, readFile, readdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import path from "path";
import os from "os";
import net from "net";
import http from "http";
import zlib from "zlib";
const DSH_PORT = 3080;
const DSH_HOME = path.join(os.homedir(), ".dsh");
const DSH_SKILLS_DIR = path.join(DSH_HOME, "skills");
const DSH_NPM_PACKAGE = "@deepseek-ai/dsh";
const PLUGIN_PROFILE = "web";
const PLUGIN_HUB = "https://hub.ifunx.com/skyle1995/dsh-plugins";
const PLUGIN_HUB_API = "https://hub.ifunx.com/api/v1/repos/skyle1995/dsh-plugins";
const PLUGIN_PROFILE_PKG = path.join(DSH_HOME, "profiles", PLUGIN_PROFILE, "package.json");
const PACK_VERSION = "2.0.7";
const PACK_SKILL_NAME = "reverse-skill";
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
let dshProcess = null;
let dshUrl = null;
let dshSpawnedAt = null;
let mainWindow = null;
let tray = null;
let isQuitting = false;
let dshVersionPromise = null;
let dshVersionFetched = false;
let dshVersionCache = null;
let sessionWindow = null;
let lastFocusedWindow = null;
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}
function startDsh() {
  return new Promise(async (resolve) => {
    if (dshProcess && dshProcess.exitCode === null) {
      return resolve({ ok: true, alreadyRunning: true, port: DSH_PORT });
    }
    if (await portInUse(DSH_PORT)) {
      return resolve({ ok: true, alreadyRunning: true, external: true, port: DSH_PORT });
    }
    dshUrl = null;
    const cmd = IS_WIN ? "npx" : "dsh";
    const args = IS_WIN ? ["--yes", "@deepseek-ai/dsh", "web", "--no-open"] : ["web", "--no-open"];
    const child = spawn(cmd, args, {
      detached: !IS_WIN,
      shell: IS_WIN,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: spawnEnv()
    });
    let buffer = "";
    child.stdout?.on("data", (chunk) => {
      buffer += String(chunk);
      const m = buffer.match(/http:\/\/\S+/);
      if (m) {
        dshUrl = m[0];
        if (sessionWindow && !sessionWindow.isDestroyed()) sessionWindow.loadURL(dshUrl);
      }
    });
    child.once("error", (err) => resolve({ ok: false, error: err.message }));
    child.once("spawn", () => {
      dshProcess = child;
      dshSpawnedAt = Date.now();
      resolve({ ok: true, pid: child.pid, port: DSH_PORT });
    });
    child.once("exit", () => {
      dshProcess = null;
    });
  });
}
function killProcessTree(pid) {
  if (!pid) return;
  if (IS_WIN) {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } catch {
    }
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
      }
    }
  }
}
function killPort(port) {
  return new Promise((resolve) => {
    if (IS_WIN) {
      exec("netstat -ano -p tcp", (err, stdout) => {
        const pids = /* @__PURE__ */ new Set();
        for (const line of String(stdout || "").split("\n")) {
          if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue;
          const cols = line.trim().split(/\s+/);
          const pid = cols[cols.length - 1];
          if (/^\d+$/.test(pid)) pids.add(pid);
        }
        for (const pid of pids) killProcessTree(Number(pid));
        resolve();
      });
    } else {
      exec(`lsof -ti tcp:${port} -sTCP:LISTEN`, { env: spawnEnv() }, (err, stdout) => {
        if (err || !String(stdout).trim()) return resolve();
        for (const pid of String(stdout).trim().split("\n")) {
          if (!pid.trim()) continue;
          try {
            process.kill(Number(pid.trim()), "SIGTERM");
          } catch {
          }
        }
        resolve();
      });
    }
  });
}
async function stopDsh({ closeSession = true } = {}) {
  if (dshProcess && dshProcess.exitCode === null) {
    killProcessTree(dshProcess.pid);
    dshProcess = null;
  }
  await killPort(DSH_PORT);
  dshUrl = null;
  dshSpawnedAt = null;
  if (closeSession && sessionWindow && !sessionWindow.isDestroyed()) sessionWindow.close();
  return { ok: true };
}
async function restartDsh() {
  await stopDsh({ closeSession: false });
  await new Promise((r) => setTimeout(r, 800));
  return startDsh();
}
async function openSessionUi() {
  const url = dshUrl || `http://127.0.0.1:${DSH_PORT}/`;
  if (sessionWindow && !sessionWindow.isDestroyed()) {
    if (sessionWindow.webContents.getURL() !== url) sessionWindow.loadURL(url);
    if (sessionWindow.isMinimized()) sessionWindow.restore();
    sessionWindow.show();
    sessionWindow.focus();
    return { ok: true, url };
  }
  sessionWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 720,
    minHeight: 480,
    title: "DSH Web UI",
    backgroundColor: "#0f1013",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  sessionWindow.setMenuBarVisibility(false);
  sessionWindow.on("closed", () => {
    sessionWindow = null;
  });
  sessionWindow.on("focus", () => {
    lastFocusedWindow = sessionWindow;
  });
  sessionWindow.loadURL(url);
  return { ok: true, url };
}
async function openInBrowser() {
  const url = dshUrl || `http://127.0.0.1:${DSH_PORT}/`;
  try {
    await shell.openExternal(url);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, url, error: String(e?.message ?? e) };
  }
}
function getPortPid(port) {
  return new Promise((resolve) => {
    if (IS_WIN) {
      exec("netstat -ano -p tcp", (err, stdout) => {
        if (err) return resolve(null);
        for (const line of String(stdout || "").split("\n")) {
          if (!line.includes(`:${port}`) || !/LISTENING/i.test(line)) continue;
          const cols = line.trim().split(/\s+/);
          const pid = cols[cols.length - 1];
          if (/^\d+$/.test(pid)) return resolve({ pid: Number(pid), name: null });
        }
        resolve(null);
      });
    } else {
      exec(`lsof -nP -iTCP:${port} -sTCP:LISTEN`, { env: spawnEnv(), timeout: 3e3 }, (err, stdout) => {
        if (err) return resolve(null);
        for (const line of String(stdout || "").split("\n").slice(1)) {
          const cols = line.trim().split(/\s+/);
          if (/^\d+$/.test(cols[1] ?? "")) return resolve({ pid: Number(cols[1]), name: cols[0] ?? null });
        }
        resolve(null);
      });
    }
  });
}
function etimeToSeconds(etime) {
  const parts = etime.split("-");
  const days = parts.length === 2 ? parseInt(parts[0], 10) || 0 : 0;
  const t = (parts.length === 2 ? parts[1] : parts[0]).split(":").map((n) => parseInt(n, 10) || 0);
  let secs = days * 86400;
  if (t.length === 3) secs += t[0] * 3600 + t[1] * 60 + t[2];
  else if (t.length === 2) secs += t[0] * 60 + t[1];
  else secs += t[0];
  return Number.isFinite(secs) ? secs : null;
}
function getProcessInfo(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve(null);
    const cmd = IS_WIN ? `powershell -NoProfile -Command "$p=Get-Process -Id ${pid}; [PSCustomObject]@{Name=$p.ProcessName;CPU=$p.CPU;WS=$p.WorkingSet64;Start=[long](New-TimeSpan -Start ([datetime]'1970-01-01') -End $p.StartTime.ToUniversalTime()).TotalMilliseconds} | ConvertTo-Json -Compress"` : `ps -p ${pid} -o comm=,etime=,pcpu=,rss=`;
    exec(cmd, { env: spawnEnv(), timeout: 4e3 }, (err, stdout) => {
      if (err) {
        return resolve({ name: null, cpu: null, rssMB: null, startedAtMs: null, blocked: true });
      }
      try {
        if (IS_WIN) {
          const j = JSON.parse(String(stdout));
          return resolve({
            name: typeof j.Name === "string" ? j.Name : null,
            cpu: typeof j.CPU === "number" ? Math.round(j.CPU) : null,
            rssMB: typeof j.WS === "number" ? Math.round(j.WS / 1048576) : null,
            startedAtMs: typeof j.Start === "number" && j.Start > 0 ? j.Start : null,
            blocked: false
          });
        }
        const m = String(stdout).trim().split(/\s+/);
        if (!m[1]) return resolve(null);
        const secs = etimeToSeconds(m[1]);
        return resolve({
          name: m[0] || null,
          cpu: m[2] !== void 0 && m[2] !== "" ? parseFloat(m[2]) : null,
          rssMB: m[3] !== void 0 && m[3] !== "" ? Math.round(parseInt(m[3], 10) / 1024) : null,
          startedAtMs: secs == null ? null : Date.now() - secs * 1e3,
          blocked: false
        });
      } catch {
        resolve(null);
      }
    });
  });
}
function getDshVersion() {
  if (dshVersionFetched) return Promise.resolve(dshVersionCache);
  if (!dshVersionPromise) {
    dshVersionPromise = new Promise((resolve) => {
      const line = IS_WIN ? "npx --yes @deepseek-ai/dsh --version" : "dsh --version";
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
function probeWebUi() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let cookie = "";
    const attempt = (path3, hops) => {
      if (hops > 4) return resolve({ ok: false, code: null, ms: Date.now() - t0 });
      const req = http.get(
        { host: "127.0.0.1", port: DSH_PORT, path: path3, timeout: 2500, headers: cookie ? { Cookie: cookie } : {} },
        (res) => {
          const code = res.statusCode ?? null;
          const setCookie = res.headers["set-cookie"];
          if (Array.isArray(setCookie) && setCookie.length) cookie = setCookie[0].split(";")[0];
          const loc = res.headers.location;
          res.resume();
          if (code && code >= 300 && code < 400 && loc) {
            try {
              const next = new URL(loc, `http://127.0.0.1:${DSH_PORT}${path3}`);
              if (next.host !== `127.0.0.1:${DSH_PORT}`) return resolve({ ok: code < 500, code, ms: Date.now() - t0 });
              return attempt(next.pathname + next.search, hops + 1);
            } catch {
              return resolve({ ok: code < 500, code, ms: Date.now() - t0 });
            }
          }
          resolve({ ok: !!code && code < 500, code, ms: Date.now() - t0 });
        }
      );
      req.on("timeout", () => {
        req.destroy();
        resolve({ ok: false, code: null, ms: null });
      });
      req.on("error", () => resolve({ ok: false, code: null, ms: null }));
    };
    let path2 = "/";
    try {
      path2 = new URL(dshUrl ?? "").pathname + new URL(dshUrl ?? "").search || "/";
    } catch {
    }
    attempt(path2, 0);
  });
}
async function getDshStatus() {
  const spawned = !!(dshProcess && dshProcess.exitCode === null);
  const portBusy = await portInUse(DSH_PORT);
  const running = spawned || portBusy;
  const ext = !spawned && portBusy ? await getPortPid(DSH_PORT) : null;
  const pid = spawned ? dshProcess.pid : ext?.pid ?? null;
  const [proc, version, web] = await Promise.all([
    running && pid ? getProcessInfo(pid) : Promise.resolve(null),
    getDshVersion(),
    running ? probeWebUi() : Promise.resolve(null)
  ]);
  return {
    running,
    port: DSH_PORT,
    pid: pid ?? null,
    procName: proc?.name ?? ext?.name ?? null,
    url: dshUrl || `http://127.0.0.1:${DSH_PORT}/`,
    managedByUs: spawned,
    // 进程详情拿不到启动时间时,本应用自己启动的用记录的时刻兜底
    startedAtMs: proc?.startedAtMs ?? (spawned ? dshSpawnedAt : null),
    cpu: proc?.cpu ?? null,
    rssMB: proc?.rssMB ?? null,
    procBlocked: !!proc?.blocked,
    version,
    web,
    platform: process.platform
  };
}
let opRunning = false;
function sendOpLog(text) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("op:log", text);
}
function winQuote(a) {
  const s = String(a);
  return /[\s&|<>^()]/.test(s) ? `"${s}"` : s;
}
function runOp(cmd, args, { log = true, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    if (opRunning) return reject(new Error("已有操作正在进行,请稍候"));
    opRunning = true;
    if (log) sendOpLog(`$ ${cmd} ${args.join(" ")}
`);
    let output = "";
    const child = IS_WIN ? spawn("cmd", ["/d", "/s", "/c", [cmd, ...args.map(winQuote)].join(" ")], {
      env: spawnEnv(),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    }) : spawn(cmd, args, {
      env: spawnEnv(),
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
        const err = new Error(`命令退出码 ${code}`);
        err.output = output;
        reject(err);
      }
    });
  });
}
let latestVersionCache = null;
let latestVersionAt = 0;
function execText(cmd, timeout = 8e3) {
  return new Promise((resolve) => {
    exec(cmd, { env: spawnEnv(), timeout }, (err, stdout) => {
      resolve(err ? null : String(stdout ?? "").trim());
    });
  });
}
async function getLatestVersion() {
  if (latestVersionCache && Date.now() - latestVersionAt < 6e4) return latestVersionCache;
  const enc = DSH_NPM_PACKAGE.replace("/", "%2F");
  for (const base of ["https://registry.npmjs.org", "https://registry.npmmirror.com"]) {
    try {
      const res = await fetch(`${base}/${enc}/latest`, { signal: AbortSignal.timeout(8e3) });
      if (res.ok) {
        const data = await res.json();
        if (data?.version) {
          latestVersionCache = data.version;
          latestVersionAt = Date.now();
          return latestVersionCache;
        }
      }
    } catch {
    }
  }
  const out = await execText(`npm view ${DSH_NPM_PACKAGE} version`, 2e4);
  if (out) {
    latestVersionCache = out.split("\n")[0].trim();
    latestVersionAt = Date.now();
  }
  return latestVersionCache;
}
async function getVersionInfo() {
  const [installed, latest] = await Promise.all([
    execText("dsh --version"),
    getLatestVersion()
  ]);
  return {
    installed,
    latest,
    latestError: !latest,
    upToDate: !!(installed && latest && installed === latest)
  };
}
function invalidateVersionCache() {
  dshVersionFetched = false;
  dshVersionCache = null;
  dshVersionPromise = null;
  latestVersionCache = null;
}
function hubFetch(url) {
  return fetch(url, { signal: AbortSignal.timeout(15e3) });
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
  const list = await res.json();
  const dirs = (Array.isArray(list) ? list : []).filter((e) => e?.type === "dir" && e?.name);
  const plugins = await Promise.all(dirs.map(async (d) => {
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
  return plugins.filter(Boolean);
}
async function listInstalledPlugins() {
  try {
    const pkg = JSON.parse(await readFile(PLUGIN_PROFILE_PKG, "utf8"));
    const deps = Object.entries(pkg?.dependencies ?? {});
    const plugins = [];
    for (const [name, spec] of deps) {
      let version = null;
      let dshRequired = null;
      let dshRanges = [];
      try {
        const p = JSON.parse(await readFile(
          path.join(path.dirname(PLUGIN_PROFILE_PKG), "node_modules", name, "package.json"),
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
  return path.join(DSH_HOME, "profiles", PLUGIN_PROFILE, "compatibility.json");
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
    PLUGIN_PROFILE,
    enable ? "allow-version" : "revoke-version",
    `${name}@${version}`,
    "--dsh-version",
    dshVersion
  ];
  if (enable) args.push("--accept-risk");
  await runOp("dsh", args);
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
      const { output } = await runOp("dsh", ["plugin", "--profile", PLUGIN_PROFILE, "add", target], { capture: true });
      results.push({ name: p.name, ok: true, spec: target, hints: parseAllowHints(output) });
    } catch (e) {
      results.push({ name: p.name, ok: false, spec: target, error: String(e?.message ?? e), hints: parseAllowHints(e?.output) });
    }
  }
  return results;
}
const PURGE_PACKAGES = ["dsh-purge-community", "dsh-purge", "dsh-purge-panel"];
const PURGE_MARKET_INDEX = "https://kingcharleslzy-ai.github.io/dsh-purge/index.json";
const PURGE_RELEASE_REPO = "kingcharleslzy-ai/dsh-purge";
const PURGE_PROFILE_MODULES = path.join(DSH_HOME, "profiles", PLUGIN_PROFILE, "node_modules");
let purgeMarketCache = null;
let purgeMarketAt = 0;
let purgeCliCache = null;
function purgeInstallDir() {
  for (const name of PURGE_PACKAGES) {
    const dir = path.join(PURGE_PROFILE_MODULES, name);
    if (existsSync(path.join(dir, "package.json"))) return dir;
  }
  return null;
}
async function purgeMarketInfo() {
  if (purgeMarketCache && Date.now() - purgeMarketAt < 5 * 6e4) return purgeMarketCache;
  const res = await hubFetch(PURGE_MARKET_INDEX);
  if (!res.ok) throw new Error(`市场索引返回 ${res.status}`);
  const idx = await res.json();
  const latest = idx?.plugins?.find((p) => p?.name === "dsh-purge-community")?.versions?.[0];
  if (!latest?.version) throw new Error("市场索引里没有可用版本");
  purgeMarketCache = {
    version: latest.version,
    engines: latest.engines ?? null,
    url: `https://github.com/${PURGE_RELEASE_REPO}/releases/download/v${latest.version}/dsh-purge-community-${latest.version}.tgz`
  };
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
  const { output } = await runOp("node", [purgeBin(), ...args], { log, capture: true });
  return output;
}
async function purgeCliJson(args, opts) {
  const output = await purgeCli(args, opts);
  const from = output.indexOf("{");
  const to = output.lastIndexOf("}");
  if (from < 0 || to <= from) throw new Error("CLI 输出不是 JSON");
  return JSON.parse(output.slice(from, to + 1));
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
    backups: null,
    compatibility: null
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
ipcMain.handle("dsh:start", () => startDsh());
ipcMain.handle("dsh:stop", () => stopDsh());
ipcMain.handle("dsh:restart", () => restartDsh());
ipcMain.handle("dsh:open", () => openSessionUi());
ipcMain.handle("dsh:openBrowser", () => openInBrowser());
ipcMain.handle("dsh:status", () => getDshStatus());
ipcMain.handle("dsh:versionInfo", () => getVersionInfo());
ipcMain.handle("dsh:install", async () => {
  const from = await execText("dsh --version");
  await runOp("npm", ["install", "-g", `${DSH_NPM_PACKAGE}@latest`]);
  invalidateVersionCache();
  const to = await execText("dsh --version");
  const upgraded = !!(from && to && from !== to);
  const plugins = upgraded ? await updateAllPlugins() : [];
  return { ok: true, upgraded, from, to, plugins };
});
ipcMain.handle("dsh:uninstall", async () => {
  await runOp("npm", ["uninstall", "-g", DSH_NPM_PACKAGE]);
  invalidateVersionCache();
});
ipcMain.handle("plugins:installed", () => listInstalledPlugins());
ipcMain.handle("plugins:catalog", () => fetchPluginCatalog());
ipcMain.handle("plugins:install", (_e, spec) => runOp("dsh", ["plugin", "--profile", PLUGIN_PROFILE, "add", spec]));
ipcMain.handle("plugins:uninstall", (_e, name) => runOp("dsh", ["plugin", "--profile", PLUGIN_PROFILE, "remove", name]));
ipcMain.handle("plugins:updateAll", () => updateAllPlugins());
ipcMain.handle("plugins:exemptions", () => readPluginExemptions());
ipcMain.handle("plugins:setVersionExemption", (_e, name, version, dshVersion, enable) => setPluginVersionExemption(name, version, dshVersion, enable));
ipcMain.handle("purge:state", () => getPurgeState());
ipcMain.handle("purge:install", async () => {
  const market = await purgeMarketInfo();
  const { output } = await runOp("dsh", ["plugin", "--profile", PLUGIN_PROFILE, "add", market.url], { capture: true });
  purgeCliCache = null;
  return { ok: true, version: market.version, output };
});
ipcMain.handle("purge:apply", async () => {
  const { output } = await runOp("node", [purgeBin("dsh-purge.js"), "--apply"], { capture: true });
  return { ok: true, output };
});
ipcMain.handle("purge:revert", async () => {
  const { output } = await runOp("node", [purgeBin("dsh-purge.js"), "--revert"], { capture: true });
  return { ok: true, output };
});
ipcMain.handle("purge:uninstall", async () => {
  const { output } = await runOp("node", [purgeBin("dsh-purge.js"), "--uninstall"], { capture: true });
  purgeCliCache = null;
  return { ok: true, output };
});
ipcMain.handle("purge:selfcheck", () => purgeCliJson(["selfcheck", "--json"], { log: false }));
ipcMain.handle("purge:backup", () => purgeCliJson(["backup"]));
ipcMain.handle("purge:rollback", (_e, id) => purgeCliJson(["rollback", String(id)]));
ipcMain.handle("purge:prune", () => purgeCliJson(["prune"]));
ipcMain.handle("purge:tune", async (_e, key, value) => {
  const map = { boost: ["boost", "on|off"], retry: ["retry", "on|off"], rewind: ["rewind", "on|off"], inject: ["inject", "head|tail|both"] };
  const spec = map[key];
  if (!spec) throw new Error(`未知开关 ${key}`);
  const result = await purgeCliJson([spec[0], String(value)]);
  return { ok: true, result, tuning: purgeTuning() };
});
const PACK_SKILL_MD = `---
name: reverse-skill
description: 逆向工程 / 授权渗透测试 / 安全研究 / CTF 技能路由包。处理 APK、二进制、JS 加密、协议逆向、恶意样本分析、漏洞复现等任务时使用。
---

# reverse-skill 路由入口

本技能是一个完整的技能路由包。开始任务前:

1. 阅读本目录下的 \`RULES.md\`(总规则与路由矩阵)与 \`README_AI.md\`(AI 引导)
2. 按 RULES.md 的 MASTER-ROUTING 进入对应子技能
3. **先确认任务目标已获得明确授权**,未授权的目标一律拒绝执行
`;
function packResourcesDir() {
  return app.isPackaged ? path.join(process.resourcesPath, "resources", "reverse-skill") : path.join(app.getAppPath(), "resources", "reverse-skill");
}
function packStateFile() {
  return path.join(app.getPath("userData"), "pack.json");
}
async function readPackState() {
  try {
    return JSON.parse(await readFile(packStateFile(), "utf8"));
  } catch {
    return null;
  }
}
async function countPackSkills(packDir) {
  let count = 0;
  for (const sub of ["skills", "skill"]) {
    const dir = path.join(packDir, sub);
    if (!existsSync(dir)) continue;
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory() && existsSync(path.join(dir, e.name, "SKILL.md"))) count++;
    }
  }
  return count;
}
ipcMain.handle("pack:info", async () => {
  const src = packResourcesDir();
  const available = existsSync(path.join(src, "RULES.md"));
  const state = await readPackState();
  return {
    available,
    version: PACK_VERSION,
    skillCount: available ? await countPackSkills(src) : 0,
    installed: existsSync(path.join(DSH_SKILLS_DIR, PACK_SKILL_NAME, "SKILL.md")),
    installedVersion: state?.version ?? null,
    installedAt: state?.installedAt ?? null,
    dest: path.join(DSH_SKILLS_DIR, PACK_SKILL_NAME)
  };
});
ipcMain.handle("pack:install", async () => {
  const src = packResourcesDir();
  if (!existsSync(path.join(src, "RULES.md"))) {
    throw new Error("技能包资源未就绪:请先运行 npm run prepare:pack 再重新打包");
  }
  const dest = path.join(DSH_SKILLS_DIR, PACK_SKILL_NAME);
  await mkdir(DSH_SKILLS_DIR, { recursive: true });
  await rm(dest, { recursive: true, force: true });
  await cp(src, dest, { recursive: true });
  await writeFile(path.join(dest, "SKILL.md"), PACK_SKILL_MD, "utf8");
  await mkdir(path.dirname(packStateFile()), { recursive: true });
  await writeFile(packStateFile(), JSON.stringify({ version: PACK_VERSION, installedAt: Date.now() }, null, 2), "utf8");
  return { ok: true, dest };
});
ipcMain.handle("pack:uninstall", async () => {
  const dest = path.join(DSH_SKILLS_DIR, PACK_SKILL_NAME);
  if (existsSync(dest)) await rm(dest, { recursive: true, force: true });
  const sf = packStateFile();
  if (existsSync(sf)) await rm(sf, { force: true });
  return { ok: true };
});
function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    title: "DSH Controller",
    webPreferences: {
      preload: path.join(import.meta.dirname, "../preload/index.mjs"),
      sandbox: false
    }
  });
  mainWindow = win;
  win.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on("focus", () => {
    lastFocusedWindow = win;
  });
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
function focusLastUsed() {
  if (lastFocusedWindow && !lastFocusedWindow.isDestroyed() && lastFocusedWindow.isVisible()) {
    if (lastFocusedWindow.isMinimized()) lastFocusedWindow.restore();
    lastFocusedWindow.show();
    lastFocusedWindow.focus();
    return;
  }
  showWindow();
}
function crc32(buf) {
  let c = 4294967295;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c >>> 1 ^ 3988292384 & -(c & 1);
  }
  return (c ^ 4294967295) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function makeCirclePng(size, r, g, b) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const radius = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      const alpha = Math.max(0, Math.min(1, radius - dist + 0.5));
      const i = y * (stride + 1) + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = Math.round(alpha * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}
function isWindowsTaskbarDark() {
  try {
    const out = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize" /v SystemUsesLightTheme',
      { encoding: "utf8" }
    );
    const m = out.match(/0x([0-9a-fA-F]+)/);
    if (m) return parseInt(m[1], 16) === 0;
  } catch {
  }
  return nativeTheme.shouldUseDarkColors;
}
function makeTrayIcon() {
  if (process.platform === "darwin") {
    const icon = nativeImage.createFromBuffer(makeCirclePng(18, 0, 0, 0));
    icon.setTemplateImage(true);
    return icon;
  }
  const dark = process.platform === "win32" ? isWindowsTaskbarDark() : nativeTheme.shouldUseDarkColors;
  const [r, g, b] = dark ? [255, 255, 255] : [26, 26, 28];
  return nativeImage.createFromBuffer(makeCirclePng(18, r, g, b));
}
function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip("DSH Controller");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 DSH Controller", click: () => showWindow() },
    { label: "打开会话窗口", click: () => openSessionUi() },
    { label: "在浏览器打开控制台", click: () => {
      void openInBrowser();
    } },
    { type: "separator" },
    { label: "退出", click: () => {
      isQuitting = true;
      app.quit();
    } }
  ]));
  tray.on("click", () => focusLastUsed());
  if (process.platform !== "darwin") {
    nativeTheme.on("updated", () => {
      tray?.setImage(makeTrayIcon());
    });
  }
}
app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on("activate", () => focusLastUsed());
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("will-quit", () => {
  if (dshProcess) killProcessTree(dshProcess.pid);
});
