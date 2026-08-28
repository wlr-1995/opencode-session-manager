# OpenCode 会话管理器（Windows）

一个轻量的 Windows 桌面管理器，读取 opencode 本地会话数据库，选择项目后**一键用 PowerShell 打开 opencode TUI**，并可列出、续接历史会话。

技术栈：Electron + React + TypeScript（electron-vite），零原生模块 —— 数据库读取依赖系统自带的 Node 24 `node:sqlite`。

## 功能

- **项目列表**：自动读取 `~/.local/share/opencode/opencode.db` 中的项目（按最近使用排序），也可手动添加任意文件夹
- **会话管理**：按项目列出历史会话（标题 / 相对时间 / agent / model），一键续接
- **一键启动**：`打开项目`、`续接会话`、`仅打开 PowerShell`、`资源管理器`，均在**新 PowerShell 窗口**中运行（支持切换 Windows Terminal）
- **最近 / 收藏**：跨项目最近会话、项目收藏星标，本地持久化
- **引导页**：找不到数据库时提示，支持手动指定数据目录

## 快速开始

```bash
npm install        # 国内镜像已配置在 .npmrc
npm run dev        # 启动开发模式
```

其他命令：

```bash
npm run build      # 构建到 out/
npm run test       # 单元测试（vitest）
npm run typecheck  # 类型检查
npm run preview    # 预览构建产物
```

## 打包

```bash
npm run package          # 生成 NSIS 安装包（release/OpenCodeSessionManager-Setup-*.exe）
npm run package:portable # 生成免安装便携版（release/OpenCodeSessionManager-Portable-*.exe）
```

- 打包产物位于 `release/`；`db-helper.mjs` 会随 `extraResources` 打进 `resources/`。
- 安装/运行包会依赖系统 `node` 与 `pwsh`（opencode 本身也依赖 Node）。
- 未配置自定义图标时使用 Electron 默认图标；如需自定义，放置 `build/icon.ico` 即可。

## 工作原理

- 主进程通过 stdio JSON 协议驱动 `src/helper/db-helper.mjs`（纯 Node 边车），以**只读**方式查询 SQLite 中的 `project` / `session` 表；opencode 正在运行时也能安全读取（WAL 模式）。
- 启动方式：`pwsh -NoExit -EncodedCommand <base64>`，命令内先 `Set-Location` 到目标目录再执行 `opencode`（或 `opencode -s <sessionId>`），彻底规避空格 / 中文 / 引号问题。
- 手动项目、收藏、最近记录存放在 Electron 用户数据目录的 `manager-store.json`。

## 结构

```
src/
├── helper/db-helper.mjs    # node:sqlite 只读查询边车（可独立测试）
├── main/                   # 主进程：db-bridge / launcher / store / ipc / 窗口
├── preload/                # contextBridge 暴露 window.api
└── renderer/               # React 中文界面
```

## 已知限制

- 数据目录默认 `~/.local/share/opencode`；若为自定义安装（如 WSL / 其他 XDG 路径），在设置中手动选择。
- 启动依赖系统 `node` 与 `pwsh` 在 PATH 中（opencode 本身即依赖 Node）。
