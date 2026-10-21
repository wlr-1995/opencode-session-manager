import type { ProjectInfo, RecentSession } from './types'
import { normalizeDir } from './dir'

export function matchProjects(projects: ProjectInfo[], keyword: string): ProjectInfo[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return []
  return projects.filter(
    (p) => p.name.toLowerCase().includes(kw) || p.worktree.toLowerCase().includes(kw)
  )
}

export function resolveSessionProject(
  projects: ProjectInfo[],
  session: RecentSession
): ProjectInfo | null {
  return (
    projects.find((p) => p.id === session.projectId) ??
    projects.find(
      (p) =>
        normalizeDir(p.worktree) ===
        normalizeDir(session.projectWorktree ?? session.directory ?? '')
    ) ??
    null
  )
}
