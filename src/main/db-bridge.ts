import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { findNodeBinary, nodeSqliteArgs } from './environment'
import { helperPath } from './paths'

/** 优先使用打包内置的 Node，否则在 PATH 与常见安装目录中查找 */
export function nodeBinary(): string {
  return findNodeBinary() ?? 'node'
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

const TIMEOUT_MS = 15000

export class DbBridge {
  private child: ChildProcess | null = null
  private pending = new Map<number, Pending>()
  private seq = 0
  private stderrTail = ''

  private reset(): void {
    this.child = null
    this.stderrTail = ''
  }

  private ensureChild(): void {
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) return
    const child = spawn(nodeBinary(), [...nodeSqliteArgs(), helperPath()], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    })
    this.child = child

    child.stderr!.on('data', (d: Buffer) => {
      const text = d.toString('utf8')
      this.stderrTail = (this.stderrTail + text).slice(-2000)
    })

    const rl = createInterface({ input: child.stdout! })
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      let msg: { id?: number; ok?: boolean; data?: unknown; error?: string }
      try {
        msg = JSON.parse(trimmed)
      } catch {
        return
      }
      const id = msg.id
      if (id === undefined || id === null) return
      const p = this.pending.get(id)
      if (!p) return
      this.pending.delete(id)
      clearTimeout(p.timer)
      if (msg.ok) p.resolve(msg.data)
      else p.reject(new Error(msg.error ?? '未知错误'))
    })

    child.on('error', (err) => {
      const code = (err as NodeJS.ErrnoException).code
      const message =
        code === 'ENOENT'
          ? '无法启动 Node.js（未找到可用的 Node.js，请安装 Node.js ≥ 22.5，或设置环境变量 OPENCODE_MANAGER_NODE）'
          : `数据库助手启动失败：${err.message}`
      this.rejectAll(new Error(message))
      this.reset()
    })

    child.on('exit', (code, signal) => {
      if (this.pending.size > 0) {
        const detail = this.stderrTail.trim()
        this.rejectAll(
          new Error(
            `数据库助手进程异常退出（code=${code} signal=${signal}）${detail ? `：${detail}` : ''}`
          )
        )
      }
      this.reset()
    })
  }

  private rejectAll(err: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(err)
    }
    this.pending.clear()
  }

  request<T>(op: string, payload: Record<string, unknown> = {}): Promise<T> {
    this.ensureChild()
    const id = ++this.seq
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`数据库请求超时：${op}`))
      }, TIMEOUT_MS)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      const child = this.child!
      child.stdin!.write(JSON.stringify({ id, op, ...payload }) + '\n')
    })
  }

  kill(): void {
    this.rejectAll(new Error('管理器已关闭'))
    if (this.child) {
      try {
        this.child.kill()
      } catch {
        /* ignore */
      }
    }
    this.reset()
  }
}
