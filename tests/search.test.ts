import { describe, expect, it } from 'vitest'
import type { ProjectInfo, RecentSession } from '@shared/types'
import { matchProjects, resolveSessionProject } from '../src/shared/search'

function project(over: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    id: 'p1',
    name: 'Alpha',
    worktree: 'D:/proj/alpha',
    vcs: 'git',
    timeUpdated: 1000,
    lastSessionAt: 900,
    sessionCount: 2,
    ...over
  }
}

function session(over: Partial<RecentSession> = {}): RecentSession {
  return {
    id: 's1',
    projectId: 'p1',
    directory: 'D:/proj/alpha',
    title: '修复登录',
    agent: 'build',
    model: null,
    timeCreated: 100,
    timeUpdated: 900,
    projectWorktree: 'D:/proj/alpha',
    ...over
  }
}

describe('matchProjects', () => {
  const projects = [
    project(),
    project({ id: 'p2', name: 'beta', worktree: 'D:/proj/beta', vcs: null }),
    project({ id: 'manual:D:/other', name: 'other', worktree: 'D:/other', isManual: true })
  ]

  it('空关键词不返回任何项目', () => {
    expect(matchProjects(projects, '')).toEqual([])
    expect(matchProjects(projects, '   ')).toEqual([])
  })

  it('按项目名匹配且忽略大小写', () => {
    expect(matchProjects(projects, 'ALPHA').map((p) => p.id)).toEqual(['p1'])
    expect(matchProjects(projects, 'et').map((p) => p.id)).toEqual(['p2'])
  })

  it('按目录匹配', () => {
    expect(matchProjects(projects, 'proj/be').map((p) => p.id)).toEqual(['p2'])
    expect(matchProjects(projects, 'D:\\other').map((p) => p.id)).toEqual([])
    expect(matchProjects(projects, 'd:/other').map((p) => p.id)).toEqual(['manual:D:/other'])
  })
})

describe('resolveSessionProject', () => {
  const projects = [
    project(),
    project({ id: 'p3', name: 'other', worktree: 'D:/proj/other', vcs: null })
  ]

  it('优先按 projectId 命中', () => {
    expect(resolveSessionProject(projects, session())?.id).toBe('p1')
  })

  it('global 会话回退到目录匹配', () => {
    const s = session({
      id: 's4',
      projectId: 'global',
      directory: 'D:/proj/other',
      projectWorktree: 'D:/proj/other'
    })
    expect(resolveSessionProject(projects, s)?.id).toBe('p3')
  })

  it('目录分隔符与结尾斜杠归一化后仍能命中', () => {
    const s = session({
      projectId: 'global',
      directory: 'D:\\proj\\other\\',
      projectWorktree: 'D:\\proj\\other\\'
    })
    expect(resolveSessionProject(projects, s)?.id).toBe('p3')
  })

  it('项目被隐藏或不存在时返回 null', () => {
    const s = session({ projectId: 'gone', projectWorktree: 'D:/proj/gone', directory: 'D:/proj/gone' })
    expect(resolveSessionProject(projects, s)).toBeNull()
  })
})
