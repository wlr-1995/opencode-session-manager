import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const HELPER = fileURLToPath(new URL('../src/helper/db-helper.mjs', import.meta.url))
const FIXTURE = fileURLToPath(new URL('./fixture-create.mjs', import.meta.url))

let dir: string
let dbPath: string

type Resp = { id: number; ok: boolean; data?: unknown; error?: string }

class HelperClient {
  private child: ChildProcess
  private rl: ReturnType<typeof createInterface>
  private pending = new Map<number, { resolve: (r: Resp) => void; reject: (e: Error) => void }>()
  private seq = 0

  constructor() {
    this.child = spawn('node', [HELPER], { stdio: ['pipe', 'pipe', 'inherit'] })
    this.rl = createInterface({ input: this.child.stdout! })
    this.rl.on('line', (line) => {
      const msg = JSON.parse(line.trim()) as Resp
      const p = this.pending.get(msg.id)
      if (p) {
        this.pending.delete(msg.id)
        p.resolve(msg)
      }
    })
  }

  request(op: string, extra: Record<string, unknown> = {}): Promise<Resp> {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child.stdin!.write(JSON.stringify({ id, op, dbPath, ...extra }) + '\n')
    })
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.child.kill()
      }, 2000)
      this.child.on('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      this.child.stdin!.end()
    })
  }
}

let client: HelperClient

function startHelper(schema: 'v1' | 'v2'): HelperClient {
  rmSync(dbPath, { force: true })
  const res = spawnSync('node', [FIXTURE], {
    env: { ...process.env, FIXTURE_DB: dbPath, FIXTURE_SCHEMA: schema },
    stdio: 'inherit'
  })
  if (res.status !== 0) throw new Error('夹具创建失败')
  return new HelperClient()
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ocm-test-'))
  dbPath = join(dir, 'opencode.db')
})

afterEach(async () => {
  await client.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('db-helper 协议（OpenCode 1.x：只有 session 表）', () => {
  beforeEach(() => {
    client = startHelper('v1')
  })
  it('health 识别数据库是否存在', async () => {
    const ok = await client.request('health')
    expect(ok.ok).toBe(true)
    expect((ok.data as { ok: boolean }).ok).toBe(true)
  })

  it('projects 排除 global、聚合 global 会话为派生项目并按最近排序', async () => {
    const res = await client.request('projects')
    expect(res.ok).toBe(true)
    const projects = res.data as { id: string; name: string; sessionCount: number; lastSessionAt: number | null }[]
    expect(projects).toHaveLength(3)
    expect(projects[0].id).toBe('p1')
    expect(projects[0].name).toBe('Alpha')
    // global 会话 s4（D:/proj/other）聚合为派生项目，排在 p2 之前（600 > 500）
    expect(projects[1].id).toBe('dir:D:/proj/other')
    expect(projects[1].name).toBe('other')
    expect(projects[1].sessionCount).toBe(1)
    expect(projects[2].id).toBe('p2')
    expect(projects[2].name).toBe('beta')
    expect(projects[2].sessionCount).toBe(0)
    expect(projects[0].sessionCount).toBe(2)
    expect(projects[0].lastSessionAt).toBe(900)
  })

  it('派生项目按 directory 查询会话', async () => {
    const res = await client.request('sessions', { projectId: 'dir:D:/proj/other' })
    expect(res.ok).toBe(true)
    const sessions = res.data as { id: string }[]
    expect(sessions.map((s) => s.id)).toEqual(['s4'])
  })

  it('sessions 排除已归档并按时间倒序', async () => {
    const res = await client.request('sessions', { projectId: 'p1' })
    expect(res.ok).toBe(true)
    const sessions = res.data as { id: string; model: string | null; title: string | null }[]
    expect(sessions.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(sessions[0].model).toBe('{"id":"m1","providerID":"p","variant":"high"}')
    expect(sessions[0].title).toBe('修复登录')
  })

  it('recentSessions 跨项目按时间倒序且附 project_worktree', async () => {
    const res = await client.request('recentSessions', { limit: 10 })
    expect(res.ok).toBe(true)
    const recent = res.data as { id: string; projectWorktree: string | null }[]
    expect(recent.map((s) => s.id)).toEqual(['s1', 's2', 's4'])
    expect(recent[0].projectWorktree).toBe('D:/proj/alpha')
    // global 会话的 project_worktree 回退到会话 directory
    expect(recent[2].projectWorktree).toBe('D:/proj/other')
  })

  it('searchSessions 按标题与目录匹配，排除归档与子会话', async () => {
    const byTitle = await client.request('searchSessions', { keyword: '登录' })
    expect(byTitle.ok).toBe(true)
    expect((byTitle.data as { id: string }[]).map((s) => s.id)).toEqual(['s1'])

    const byDir = await client.request('searchSessions', { keyword: 'ALPHA' })
    expect((byDir.data as { id: string }[]).map((s) => s.id)).toEqual(['s1', 's2'])

    const archived = await client.request('searchSessions', { keyword: '归档' })
    expect(archived.data).toEqual([])

    const child = await client.request('searchSessions', { keyword: 'explore' })
    expect(child.data).toEqual([])
  })

  it('searchSessions 按最近更新倒序并附带 projectWorktree', async () => {
    const res = await client.request('searchSessions', { keyword: 'proj' })
    expect(res.ok).toBe(true)
    const rows = res.data as { id: string; projectWorktree: string | null }[]
    expect(rows.map((s) => s.id)).toEqual(['s1', 's2', 's4'])
    expect(rows[2].projectWorktree).toBe('D:/proj/other')
  })

  it('searchSessions 对空关键词返回空数组，并转义 LIKE 通配符', async () => {
    const empty = await client.request('searchSessions', { keyword: '   ' })
    expect(empty.data).toEqual([])

    const percent = await client.request('searchSessions', { keyword: '%' })
    expect(percent.data).toEqual([])

    const underscore = await client.request('searchSessions', { keyword: '_' })
    expect(underscore.data).toEqual([])
  })

  it('未知操作返回错误', async () => {
    const res = await client.request('nope')
    expect(res.ok).toBe(false)
    expect((res.error ?? '').length).toBeGreaterThan(0)
  })
})

describe('db-helper 协议（OpenCode 2.x：session 表已冻结，以 session_v2 为准）', () => {
  beforeEach(() => {
    client = startHelper('v2')
  })

  it('projects 用 session_v2 计数，忽略冻结的 session 快照', async () => {
    const res = await client.request('projects')
    expect(res.ok).toBe(true)
    const projects = res.data as {
      id: string
      sessionCount: number
      lastSessionAt: number | null
    }[]
    expect(projects.map((p) => p.id)).toEqual(['p1', 'p3', 'p2'])
    expect(projects[0].sessionCount).toBe(3)
    expect(projects[0].lastSessionAt).toBe(1200)
  })

  it('非 git 目录的 2.0 项目记录会带上挂在 global 下的同名目录会话', async () => {
    const res = await client.request('projects')
    const projects = res.data as {
      id: string
      name: string
      sessionCount: number
      lastSessionAt: number | null
    }[]
    const other = projects.find((p) => p.id === 'p3')
    expect(other).toBeDefined()
    expect(other!.name).toBe('other')
    expect(other!.sessionCount).toBe(1)
    expect(other!.lastSessionAt).toBe(600)
    // 已并入真实项目记录，不再另外生成 dir: 派生项目
    expect(projects.some((p) => p.id === 'dir:D:/proj/other')).toBe(false)
  })

  it('sessions 返回只存在于 session_v2 的 2.0 新会话', async () => {
    const res = await client.request('sessions', { projectId: 'p1' })
    expect(res.ok).toBe(true)
    const sessions = res.data as { id: string; title: string | null; model: string | null }[]
    expect(sessions.map((s) => s.id)).toEqual(['s6', 's1', 's2'])
    expect(sessions[0].title).toBe('V2 新会话')
    expect(sessions[0].model).toBe('{"id":"m2","providerID":"p","variant":"high"}')
  })

  it('按 2.0 项目 id 查询时包含 directory 相同但挂在 global 下的会话', async () => {
    const res = await client.request('sessions', { projectId: 'p3' })
    expect(res.ok).toBe(true)
    const sessions = res.data as { id: string }[]
    expect(sessions.map((s) => s.id)).toEqual(['s4'])
  })

  it('recentSessions 跨项目包含 2.0 新会话', async () => {
    const res = await client.request('recentSessions', { limit: 10 })
    expect(res.ok).toBe(true)
    const recent = res.data as { id: string; projectWorktree: string | null }[]
    expect(recent.map((s) => s.id)).toEqual(['s6', 's1', 's2', 's4'])
    expect(recent[0].projectWorktree).toBe('D:/proj/alpha')
    expect(recent[3].projectWorktree).toBe('D:/proj/other')
  })

  it('searchSessions 覆盖 session_v2 中的新会话', async () => {
    const res = await client.request('searchSessions', { keyword: 'v2' })
    expect(res.ok).toBe(true)
    const rows = res.data as { id: string; projectWorktree: string | null }[]
    expect(rows.map((s) => s.id)).toEqual(['s6'])
    expect(rows[0].projectWorktree).toBe('D:/proj/alpha')
  })
})
