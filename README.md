<p align="center">
  <img src="build/icon.png" width="120" height="120" style="border-radius: 24px;" alt="QuickStart Logo">
</p>

<h1 align="center">QuickStart</h1>

<p align="center">
  <strong>桌面快捷效率工具 —— 记录、清单、翻译、AI 对话，一键直达</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.5.0-purple?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/electron-40-blue?style=flat-square&logo=electron" alt="Electron">
  <img src="https://img.shields.io/badge/react-19-61dafb?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
</p>

---

## 简介

QuickStart 是一款基于 **Electron + React + TypeScript** 构建的桌面侧边栏效率工具。

写代码时突然有个想法？按下快捷键，侧边栏弹出，直接记录。遇到不认识的单词？切到翻译 Tab，AI 即时翻译。需要问 AI 一个问题？不用打开浏览器，直接在侧边栏对话。

**所有数据 100% 存储在本地，不上传任何服务器。**

---

## 功能模块

### 记录

<p align="center">
  <img src="screenshots/notes.png" width="360" alt="记录模块">
</p>

- **多工作区隔离** —— 下拉菜单快速创建、切换、重命名、删除工作区，每个工作区的记录完全独立
- **标题 + 正文** —— 结构化编辑，标题自动用于文件命名（智能清理特殊字符）
- **Markdown 编辑** —— 支持标准 Markdown 语法，`Ctrl+Enter` 快速保存
- **图片粘贴** —— `Ctrl+V` 直接从剪贴板粘贴图片，自动保存到本地并渲染缩略图
- **图片预览** —— 点击缩略图可放大查看，通过自定义协议 `quickstart://` 本地极速加载
- **按日期归档** —— 笔记自动按 `YYYY-MM/` 月份文件夹存储
- **编辑与删除** —— 点击卡片即可回填编辑，删除带 30 秒撤销保护
- **沉浸式搜索** —— 顶栏无缝展开搜索框，macOS 风格的平滑动画

---

### 清单

<p align="center">
  <img src="screenshots/todos.png" width="360" alt="清单模块">
</p>

- **按日管理** —— 每天一份独立的清单，左右箭头快速切换日期
- **全局存储** —— 清单数据不随工作区切换，始终可用
- **日历选择器** —— 点击日期弹出日历面板，标记有事项和未完成的日期
- **拖拽排序** —— 按住左侧六点手柄拖动即可调整事项顺序，松手自动保存
- **颜色标记** —— 8 种颜色可选，为不同优先级的事项设置醒目标识
- **进度条** —— 实时显示今日完成进度（如 1/2），一目了然
- **编辑弹窗** —— 点击事项文字弹出底部编辑卡片，宽敞的编辑区域

---

### 翻译

<p align="center">
  <img src="screenshots/translator.png" width="360" alt="翻译模块">
</p>

- **AI 驱动翻译** —— 基于配置的 AI 节点进行智能翻译，非简单词典查询
- **自动检测语言** —— 输入中文自动翻译为英文，输入英文自动翻译为中文
- **流式输出** —— 翻译结果逐字显示，无需等待完整响应
- **一键复制** —— 翻译结果可一键复制到剪贴板
- **字数统计** —— 实时显示输入文本字数
- **快捷键** —— `Ctrl+Enter` 快速发起翻译

---

### AI 对话

<p align="center">
  <img src="screenshots/ai-chat.png" width="360" alt="AI 对话模块">
</p>

- **DeepSeek 深度集成** —— 支持 DeepSeek-V3、DeepSeek-R1 等模型，兼容 OpenAI 协议
- **流式打字机效果** —— 实时看到 AI 思考和回复过程
- **多会话管理** —— 创建、切换、删除独立对话，左侧滑出历史记录侧边栏
- **文件上传** —— 支持图片、文本、PDF 等多种格式作为上下文发送
- **自动标题** —— 新对话自动取首句作为标题
- **会话时间戳** —— 每条消息显示发送时间

---

### 设置

<p align="center">
  <img src="screenshots/settings.png" width="360" alt="设置模块">
</p>

- **记录存储** —— 独立配置记录根目录，工作区自动创建子文件夹，包含 Markdown 文本与图片附件
- **清单存储** —— 独立配置清单数据目录，全局存储不随工作区变化
- **数据导出** —— 选择"记录"或"清单"，设定日期范围，一键导出为 Markdown 或 PDF
- **快捷日期预设** —— 今天、近 7 天、近 30 天、近 90 天一键选择
- **AI 节点管理** —— 多节点配置（支持对话、翻译或两者兼用），拖拽排序，独立开关
- **API Key 加密** —— 使用 AES-256-GCM 加密存储，验证连接后才保存
- **快捷键自定义** —— 可自定义全局唤起/隐藏快捷键
- **开机自启动** —— 一键开关，托盘菜单同步联动
- **危险操作保护** —— 清空数据需 10 秒倒计时确认，执行前自动备份

---

## 版本更新

### v0.5.0 (2026-02-09)

- **工作区下拉菜单** —— 移除侧边栏抽屉，改为记录页顶部的轻量下拉菜单，支持创建/切换/重命名/删除工作区
- **删除工作区安全确认** —— 删除操作带 5 秒倒计时确认，明确警示"将同时删除本地记录文件"
- **存储路径分离** —— 设置页将"记录存储"与"清单存储"拆分为两个独立配置模块，各自可更改目录、恢复默认、清空数据
- **清单存储路径可配置** —— 新增清单数据目录的自定义配置（此前仅记录支持）
- **沉浸式搜索** —— 搜索栏改为 macOS 风格的顶栏无缝展开动画，左侧返回箭头 + 内联清除按钮
- **工作区按钮极简化** —— 去除紫色实色背景，改为纯文字 + 圆点 + 箭头的低调设计
- **标题栏简化** —— 移除标题栏的工作区指示器按钮，界面更干净
- **搜索空状态优化** —— 轻量化的搜索图标提示，减少视觉干扰

### v0.4.0

- 工作区作用域调整：只有"记录"受工作区隔离，清单/翻译/AI 为全局功能
- 清单数据迁移至全局 todos 目录

### v0.3.0

- 全局根目录 + 工作区命名子文件夹存储架构
- 设置页简化为单一根目录配置

### v0.2.0

- 引入工作区概念，支持多工作区隔离
- 记录重构为"标题 + 正文"模式，标题用于文件命名
- v0.1.0 数据自动迁移至默认工作区

### v0.1.0

- 基础功能：记录、清单、翻译、AI 对话
- 本地文件存储，自定义协议图片加载
- NSIS 安装包，自定义安装路径，用户协议

---

## 安装

### 下载安装包

前往 [Releases](https://github.com/ReappealXy/QuickStart/releases) 页面，下载最新版本的 `QuickStart Setup 0.5.0.exe`。

安装过程支持：
- 自定义安装目录
- 用户许可协议确认
- 安装完成后立即启动
- 自动创建桌面快捷方式

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/ReappealXy/QuickStart.git
cd QuickStart

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 打包为安装程序
npm run build
```

---

## 隐私与安全

| 项目 | 说明 |
|------|------|
| 数据存储 | 所有数据存储在用户自定义的本地目录，不上传任何服务器 |
| API Key | 使用 AES-256-GCM 加密后保存在本地 config.json |
| 网络请求 | 仅在调用 AI 服务 API 时发起，无数据采集、无遥测 |
| 开源透明 | 完整源码公开，可审计 |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Electron 40 + electron-vite |
| 前端 | React 19 + TypeScript |
| 样式 | Tailwind CSS 4 + 毛玻璃设计 |
| 状态管理 | Zustand |
| 拖拽排序 | @dnd-kit |
| AI 协议 | OpenAI 兼容 (流式 SSE) |
| 加密 | Node.js crypto (AES-256-GCM) |
| 导出 | markdown-it + Electron printToPDF |
| 打包 | electron-builder (NSIS) |

---

## 项目结构

```
QuickStart/
├── electron/
│   ├── main.ts          # 主进程（IPC、文件IO、AI请求、协议注册）
│   └── preload.ts       # 安全桥接层
├── src/
│   ├── components/
│   │   ├── AI/          # AI 对话界面
│   │   ├── Notes/       # 记录界面 + 工作区下拉菜单
│   │   ├── Todo/        # 清单界面
│   │   ├── Translator/  # 翻译界面
│   │   ├── Settings/    # 设置界面
│   │   └── Layout/      # 标题栏、导航栏
│   ├── stores/          # Zustand 状态管理
│   └── styles/          # 全局样式
├── build/
│   ├── icon.ico         # 应用图标
│   └── license.txt      # 安装协议
└── package.json
```

---

## 存储结构

```
记录存储根目录/
├── 默认/                 # 默认工作区文件夹
│   └── Notes/
│       ├── 2026-02/
│       │   ├── 标题名.md
│       │   └── ...
│       ├── attachments/  # 粘贴的图片附件
│       └── index.json    # 元数据索引
├── 学习记录/             # 自定义工作区文件夹
│   └── Notes/
│       └── ...
└── ...

清单存储目录/             # 全局清单（不随工作区切换）
├── 2026-02-08.json
├── 2026-02-09.json
└── ...
```

---

## Roadmap

### 近期计划
- [ ] 笔记标签系统 —— 为记录添加标签并按标签筛选
- [ ] Markdown 实时预览 —— 编辑时旁边实时渲染格式化效果
- [ ] 导出 PDF 分页优化 —— 长文本自动分页，添加页眉页脚
- [ ] 清单定时提醒 —— 为事项设置提醒时间，到期系统通知弹窗

### 中期计划
- [ ] 数据统计面板 —— 记录数量趋势图、清单完成率周/月统计
- [ ] 更多 AI 模型 —— 支持 OpenAI、Claude、本地 Ollama 等
- [ ] 自定义 CSS 主题 —— 用户可导入自定义样式文件
- [ ] 数据导入 —— 支持从其他笔记工具导入 Markdown 文件

### 长期规划
- [ ] WebDAV 加密同步
- [ ] 插件系统
- [ ] Linux / macOS 支持
- [ ] 多语言 UI

---

## 许可证

本项目基于 [MIT License](LICENSE) 发布。

## 作者

**ReappealXy** — [GitHub](https://github.com/ReappealXy)

---

<p align="center">
  <sub>本程序由 Cursor (Claude Opus 4.6) 辅助开发完成</sub>
</p>
