import path from 'node:path'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

/** 将字符串转换为 PowerShell 字面量。参数 value 为原始文本，返回安全的单引号表达式。 */
export function psLiteral(value) {
  return "'" + String(value).replaceAll("'", "''") + "'"
}

/** 编码 PowerShell 命令。参数 script 为脚本正文，返回 UTF-16LE Base64 文本。 */
export function encodePowerShell(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/** 检查文件是否存在。参数 file 为路径，返回布尔值，不抛出文件系统异常。 */
function isFile(file) {
  try { return statSync(file).isFile() } catch { return false }
}

/** 定位桌面安装。参数包含平台、环境和主目录，返回安装根、资源目录、程序和 CLI 路径。 */
export function locateDesktop({ platform = process.platform, env = process.env, home, exec = execFileSync } = {}) {
  const candidates = []
  if (env.DSH_APP_ROOT) candidates.push(path.resolve(env.DSH_APP_ROOT))
  if (env.DSH_APP) candidates.push(path.resolve(env.DSH_APP))
  if (!candidates.length) switch (platform) {
    case 'win32': {
      try {
        const found = exec('where.exe', ['dsh'], { encoding: 'utf8', timeout: 5000, windowsHide: true })
        for (const line of found.split(/\r?\n/)) {
          const cli = line.trim()
          if (path.basename(cli).toLowerCase() === 'dsh.cmd') candidates.push(path.resolve(path.dirname(cli), '../../../..'))
        }
      } catch {}
      try {
        const script = "$ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $ErrorActionPreference='SilentlyContinue'; Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Where-Object { $_.DisplayName -like '*DeepSeek*' } | ForEach-Object { $_.InstallLocation }"
        const found = exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodePowerShell(script)], { encoding: 'utf8', timeout: 8000, windowsHide: true })
        candidates.push(...found.split(/\r?\n/).map(s => s.trim()).filter(Boolean))
      } catch {}
      for (const base of [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'), env.LOCALAPPDATA, env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean)) {
        for (const name of ['DeepSeek', 'DeepSeek Harness', 'deepseek-harness']) candidates.push(path.join(base, name))
      }
      break
    }
    case 'darwin':
      candidates.push('/Applications/DeepSeek Harness.app')
      if (home) candidates.push(path.join(home, 'Applications', 'DeepSeek Harness.app'))
      break
    default:
      candidates.push('/opt/deepseek-harness', '/opt/DeepSeek Harness', '/usr/lib/deepseek-harness')
  }
  for (let root of [...new Set(candidates)]) {
    if (isFile(root)) root = path.dirname(root)
    const resources = platform === 'darwin' ? path.join(root, 'Contents', 'Resources') : path.join(root, 'resources')
    const cli = path.join(resources, 'runtime', 'cli', 'bin', platform === 'win32' ? 'dsh.cmd' : 'dsh')
    const names = platform === 'win32' ? ['DeepSeek Harness.exe', 'DeepSeek.exe', 'deepseek-harness.exe'] : ['DeepSeek Harness', 'deepseek-harness', 'deepseek']
    const executable = names.map(n => platform === 'darwin' ? path.join(root, 'Contents', 'MacOS', n) : path.join(root, n)).find(isFile)
    if (executable && (isFile(cli) || existsSync(path.join(resources, 'app')) || isFile(path.join(resources, 'app.asar')))) return { root, resources, executable, cli }
  }
  return { root: '', resources: '', executable: '', cli: '' }
}

/** 解析官方 Windows CLI 的直接入口。参数 cli 为 cmd 路径，返回 Electron 程序、参数和环境。 */
export function desktopCliInvocation(cli) {
  const body = readFileSync(cli, 'utf8')
  const base = path.dirname(cli)
  for (const line of body.split(/\r?\n/)) {
    const match = /^\s*"(%~dp0[^"]+\.exe)"\s+(?:--expose-internals\s+)?"(%~dp0[^"]*cli\.js)"/i.exec(line)
    if (!match) continue
    const executable = path.resolve(base, match[1].slice(5))
    const entry = path.resolve(base, match[2].slice(5))
    if (!isFile(executable)) throw new Error('DSH CLI 引用的桌面程序不存在: ' + executable)
    return { command: executable, args: ['--expose-internals', entry], env: { ELECTRON_RUN_AS_NODE: '1' } }
  }
  throw new Error('无法识别 DSH CLI 入口，请更新安装或设置 DSH_APP_ROOT: ' + cli)
}
