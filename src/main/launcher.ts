import { spawn, execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LaunchResult } from '@shared/types'
import { app } from 'electron'
import { checkWt, resolveShellName } from './environment'
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
 * 以管理员身份启动终端：用 Start-Process -Verb RunAs 触发 UAC，
 * 在提升后的窗口中运行 shell + -EncodedCommand。
 * 返回「外层脚本」的 -EncodedCommand 参数列表（外层由非提升 pwsh 执行）。
 */
export function buildAdminArgs(encoded: string, shell = 'pwsh'): string[] {
  const inner = `Start-Process -FilePath '${psEscape(shell)}' -Verb RunAs -ArgumentList '-NoExit','-EncodedCommand','${encoded}'`
  return ['-NoProfile', '-EncodedCommand', encodeCommand(inner)]
}

/** 以管理员身份打开 Windows Terminal 并新建标签运行 shell */
export function buildAdminWtArgs(encoded: string, shell = 'pwsh'): string[] {
  const inner = `Start-Process -FilePath 'wt.exe' -Verb RunAs -ArgumentList '-w','0','nt','${shell}','-NoExit','-EncodedCommand','${encoded}'`
  return ['-NoProfile', '-EncodedCommand', encodeCommand(inner)]
}

export function launchInTerminal(
  spec: LaunchSpec,
  opencodePath: string | null,
  runAsAdmin = false
): LaunchResult {
  if (!spec.dir || !existsSync(spec.dir)) {
    return { ok: false, error: `目录不存在：${spec.dir}` }
  }
  const resolvedOc = opencodePath ?? resolveOpencodeExecutable()
  const command = buildPsCommand(spec, resolvedOc)
  const encoded = encodeCommand(command)
  const shell = resolveShellName()
  const wtFound = checkWt().found
  logDebug(`spec=${JSON.stringify(spec)} shell=${shell} opencodePath=${opencodePath} resolved=${resolvedOc} runAsAdmin=${runAsAdmin} wt=${wtFound}`)
  logDebug(`command=${command}`)
  logDebug(`encoded=${encoded}`)

  try {
    if (runAsAdmin) {
      // 外层 pwsh（隐藏）执行 Start-Process -Verb RunAs，弹出 UAC 后打开提升窗口
      let outerArgs: string[]
      if (wtFound) {
        // 提升的 Windows Terminal：字体/UTF-8 渲染正常
        outerArgs = buildAdminWtArgs(encoded, shell)
      } else {
        // 回退提升的 conhost：先 chcp 65001 解决乱码（字体清晰度受 conhost 限制）
        const fixed = encodeCommand(`${chcp65001(command)}`)
        outerArgs = buildAdminArgs(fixed, shell)
      }
      logDebug(`runas outer args=${JSON.stringify(outerArgs)}`)
      const child = spawn(shell, outerArgs, { windowsHide: true, stdio: 'ignore' })
      child.on('error', (err) => logDebug(`runas spawn error: ${err.message}`))
      child.unref()
      return { ok: true }
    }
    if (wtFound) {
      // Windows Terminal 新标签（字体/UTF-8 渲染正常）
      const child = spawn(
        'wt.exe',
        ['-w', '0', 'nt', shell, '-NoExit', '-EncodedCommand', encoded],
        { detached: true, stdio: 'ignore' }
      )
      child.on('error', (err) => logDebug(`wt spawn error: ${err.message}`))
      child.unref()
      return { ok: true }
    }
    // 无 Windows Terminal：用 cmd /c start 开控制台窗口（真实键盘 stdin，-NoExit 不闪退）
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

/** 无 Windows Terminal 时，让提升的 conhost 先切到 UTF-8 代码页，缓解中文乱码 */
export function chcp65001(command: string): string {
  return `chcp 65001 > $null; ${command}`
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
