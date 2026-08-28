import { spawn, execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LaunchResult, TerminalKind } from '@shared/types'
import { app } from 'electron'
import { resolveShellName } from './environment'
function logDebug(entry: string): void {
  try {
    const file = join(app.getPath('userData'), 'launch-debug.log')
    mkdirSync(join(app.getPath('userData')), { recursive: true })
    appendFileSync(file, `${new Date().toISOString()} ${entry}\n`, 'utf8')
  } catch {
    /* ignore */
  }
}

export interface LaunchSpec {
  dir: string
  /** opencode 参数；null 表示只打开 PowerShell 目录，不启动 opencode */
  opencodeArgs?: string | null
}

/** PowerShell 单引号字符串转义：把 ' 替换为 '' */
export function psEscape(value: string): string {
  return value.replace(/'/g, "''")
}

/**
 * 生成传给 PowerShell 的命令。
 * 始终先 Set-Location 到目标目录（用 EncodedCommand，彻底规避空格/中文/引号问题），再执行 opencode。
 */
export function buildPsCommand(spec: LaunchSpec, opencodePath: string | null): string {
  const setLocation = `Set-Location -LiteralPath '${psEscape(spec.dir)}'`
  if (spec.opencodeArgs === null) return setLocation
  const args = (spec.opencodeArgs ?? '').trim()
  let opencode: string
  if (opencodePath) {
    opencode = `& '${psEscape(opencodePath)}' ${args}`.trim()
  } else {
    opencode = args ? `opencode ${args}` : 'opencode'
  }
  return `${setLocation}; ${opencode}`
}

/** UTF-16LE base64 编码，供 pwsh -EncodedCommand 使用 */
export function encodeCommand(command: string): string {
  return Buffer.from(command, 'utf16le').toString('base64')
}

/**
 * start 窗口标题。必须含空格：Node spawn 会对含空格的参数自动加引号，
 * cmd 的 start 才会把第一个带引号的参数当作「窗口标题」而非「要运行的程序」。
 * 若标题无空格（如 OpenCode），start 会把 OpenCode.exe（桌面端）当程序启动。
 */
export const START_WINDOW_TITLE = 'OpenCode 会话'

export function buildStartArgs(encoded: string, shell = 'pwsh'): string[] {
  return ['/c', 'start', START_WINDOW_TITLE, shell, '-NoExit', '-EncodedCommand', encoded]
}

/**
 * 解析 opencode CLI（TUI）的绝对路径，避免依赖子进程窗口里的 PATH。
 * 顺序：npm 全局目录 → where 结果 → npm shim 推导。
 */
export function resolveOpencodeExecutable(): string | null {
  try {
    const prefix = execFileSync('npm', ['prefix', '-g'], { encoding: 'utf8' }).trim()
    if (prefix) {
      const exe = join(prefix, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
      if (existsSync(exe)) return exe
    }
  } catch {
    /* npm 不可用 */
  }
  try {
    const out = execFileSync('where.exe', ['opencode'], { encoding: 'utf8' })
    for (const line of out.split(/\r?\n/)) {
      const t = line.trim()
      if (t && /\.exe$/i.test(t) && existsSync(t)) return t
      if (t && /\.cmd$/i.test(t) && existsSync(t)) {
        const exe = join(dirname(t), 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
        if (existsSync(exe)) return exe
      }
    }
    const first = out.split(/\r?\n/).find(Boolean)?.trim()
    if (first) {
      const exe = join(dirname(first), 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
      if (existsSync(exe)) return exe
    }
  } catch {
    /* where 不可用 */
  }
  return null
}

export function launchInTerminal(
  spec: LaunchSpec,
  terminal: TerminalKind,
  opencodePath: string | null
): LaunchResult {
  if (!spec.dir || !existsSync(spec.dir)) {
    return { ok: false, error: `目录不存在：${spec.dir}` }
  }
  const resolvedOc = opencodePath ?? resolveOpencodeExecutable()
  const command = buildPsCommand(spec, resolvedOc)
  const encoded = encodeCommand(command)
  logDebug(`spec=${JSON.stringify(spec)} terminal=${terminal} opencodePath=${opencodePath} resolved=${resolvedOc}`)
  logDebug(`command=${command}`)
  logDebug(`encoded=${encoded}`)

  try {
    const shell = resolveShellName()
    if (terminal === 'wt') {
      const child = spawn(
        'wt.exe',
        ['-w', '0', 'nt', shell, '-NoExit', '-EncodedCommand', encoded],
        { detached: true, stdio: 'ignore' }
      )
      child.on('error', (err) => logDebug(`wt spawn error: ${err.message}`))
      child.unref()
      return { ok: true }
    }
    // 用 cmd /c start 开新控制台窗口：获得真实键盘 stdin（-NoExit 下窗口不会闪退）
    const args = buildStartArgs(encoded, shell)
    logDebug(`spawn cmd.exe args=${JSON.stringify(args)} cwd=${spec.dir} shell=${shell}`)
    const child = spawn('cmd.exe', args, {
      cwd: spec.dir,
      detached: true,
      stdio: 'ignore'
    })
    child.on('error', (err) => logDebug(`cmd spawn error: ${err.message}`))
    child.unref()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
