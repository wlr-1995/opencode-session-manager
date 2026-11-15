import { describe, expect, it } from 'vitest'
import { normalizeDir, projectDisplayPaths } from '../src/shared/dir'

describe('normalizeDir', () => {
  it('统一分隔符并去掉结尾斜杠', () => {
    expect(normalizeDir('D:\\proj\\alpha\\')).toBe('D:/proj/alpha')
    expect(normalizeDir('D:/proj/alpha///')).toBe('D:/proj/alpha')
    expect(normalizeDir('')).toBe('')
  })
})

describe('projectDisplayPaths', () => {
  it('项目名不重复时显示完整路径', () => {
    const items = [
      { name: 'alpha', worktree: 'D:/proj/alpha' },
      { name: 'beta', worktree: 'C:/Users/u/AppData/Roaming/npm/bin' }
    ]
    expect(projectDisplayPaths(items)).toEqual([
      'D:/proj/alpha',
      'C:/Users/u/AppData/Roaming/npm/bin'
    ])
  })

  it('同名项目显示能区分的最短路径尾部', () => {
    const items = [
      {
        name: 'bin',
        worktree:
          'C:/Users/19083/AppData/Roaming/npm/node_modules/@opencode/cli/node_modules/@opencode/cli-windows-x64-baseline/bin'
      },
      {
        name: 'bin',
        worktree:
          'C:/Users/19083/AppData/Roaming/npm/node_modules/@opencode/cli/node_modules/@opencode/cli-windows-x64/bin'
      }
    ]
    expect(projectDisplayPaths(items)).toEqual([
      '…/cli-windows-x64-baseline/bin',
      '…/cli-windows-x64/bin'
    ])
  })

  it('尾部已覆盖整条路径时不再加省略号', () => {
    const items = [
      { name: 'bin', worktree: 'C:/bin' },
      { name: 'bin', worktree: 'D:/bin' }
    ]
    expect(projectDisplayPaths(items)).toEqual(['C:/bin', 'D:/bin'])
  })

  it('只对重名项目截断，其它项目保持完整路径', () => {
    const items = [
      { name: 'tmp', worktree: 'D:/wlr/tmp' },
      { name: 'bin', worktree: 'C:/a/x/bin' },
      { name: 'bin', worktree: 'C:/b/y/bin' }
    ]
    expect(projectDisplayPaths(items)).toEqual(['D:/wlr/tmp', '…/x/bin', '…/y/bin'])
  })

  it('空列表返回空数组', () => {
    expect(projectDisplayPaths([])).toEqual([])
  })
})
