export function normalizeDir(path: string): string {
  if (!path) return ''
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function splitDir(path: string): string[] {
  return normalizeDir(path).split('/').filter(Boolean)
}

/**
 * 侧栏展示用的路径。项目名重复时（例如两个不同目录都叫 bin），
 * 只显示能区分彼此的最短路径尾部，其余项目仍显示完整路径。
 */
export function projectDisplayPaths(items: { name: string; worktree: string }[]): string[] {
  const display = items.map((item) => normalizeDir(item.worktree))
  const groups = new Map<string, number[]>()
  items.forEach((item, index) => {
    const group = groups.get(item.name)
    if (group) group.push(index)
    else groups.set(item.name, [index])
  })
  const segments = items.map((item) => splitDir(item.worktree))

  for (const indexes of groups.values()) {
    if (indexes.length < 2) continue
    const maxDepth = Math.max(...indexes.map((i) => segments[i].length))
    for (let depth = 1; depth <= maxDepth; depth++) {
      const tails = indexes.map((i) => segments[i].slice(-depth).join('/'))
      if (new Set(tails).size !== indexes.length) continue
      indexes.forEach((i, k) => {
        display[i] = depth >= segments[i].length ? segments[i].join('/') : `…/${tails[k]}`
      })
      break
    }
  }

  return display
}
