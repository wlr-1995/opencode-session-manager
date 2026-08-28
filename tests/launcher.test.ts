import { describe, expect, it } from 'vitest'
import {
  buildPsCommand,
  buildStartArgs,
  encodeCommand,
  psEscape,
  START_WINDOW_TITLE
} from '../src/main/launcher'

describe('psEscape', () => {
  it('转义单引号', () => {
    expect(psEscape(`a'b`)).toBe(`a''b`)
  })
  it('普通路径不变', () => {
    expect(psEscape(`D:/sources/实验数据`)).toBe(`D:/sources/实验数据`)
  })
})

describe('buildPsCommand', () => {
  it('生成 Set-Location + opencode', () => {
    const cmd = buildPsCommand({ dir: `D:/sources/实验数据`, opencodeArgs: '' }, null)
    expect(cmd).toContain(`Set-Location -LiteralPath 'D:/sources/实验数据'`)
    expect(cmd).toContain(`; opencode`)
  })

  it('带会话参数续接', () => {
    const cmd = buildPsCommand({ dir: 'D:/a', opencodeArgs: '-s ses_abc' }, null)
    expect(cmd).toContain(`opencode -s ses_abc`)
  })

  it('opencodeArgs 为 null 时只打开目录', () => {
    const cmd = buildPsCommand({ dir: 'D:/a', opencodeArgs: null }, null)
    expect(cmd).toContain(`Set-Location -LiteralPath 'D:/a'`)
    expect(cmd).not.toContain('opencode')
  })

  it('指定 opencodePath 时用 & 调用', () => {
    const cmd = buildPsCommand({ dir: 'D:/a', opencodeArgs: '-s x' }, `C:/oc/opencode.cmd`)
    expect(cmd).toContain(`& 'C:/oc/opencode.cmd' -s x`)
    expect(cmd).not.toContain('opencode -s')
  })

  it('目录含单引号时正确转义', () => {
    const cmd = buildPsCommand({ dir: `D:/it's`, opencodeArgs: null }, null)
    expect(cmd).toContain(`Set-Location -LiteralPath 'D:/it''s'`)
  })
})

describe('encodeCommand', () => {
  it('UTF-16LE base64 可还原', () => {
    const raw = `Set-Location -LiteralPath 'D:/实验/项目'`
    const encoded = encodeCommand(raw)
    const decoded = Buffer.from(encoded, 'base64').toString('utf16le')
    expect(decoded).toBe(raw)
    // base64 不含空格，pwsh -EncodedCommand 无需引号
    expect(encoded).not.toContain(' ')
  })
})

describe('buildStartArgs', () => {
  it('start 标题必须含空格（否则 cmd 会把无引号首参当程序，误启动 OpenCode.exe 桌面端）', () => {
    const args = buildStartArgs('UwBlAHQ')
    expect(START_WINDOW_TITLE).toMatch(/\s/)
    expect(args[0]).toBe('/c')
    expect(args[1]).toBe('start')
    expect(args[2]).toBe(START_WINDOW_TITLE)
    expect(args.slice(3)).toEqual(['pwsh', '-NoExit', '-EncodedCommand', 'UwBlAHQ'])
  })

  it('未安装 PowerShell 7 时可指定 powershell.exe 回退', () => {
    const args = buildStartArgs('UwBlAHQ', 'powershell.exe')
    expect(args.slice(3)).toEqual(['powershell.exe', '-NoExit', '-EncodedCommand', 'UwBlAHQ'])
  })
})
