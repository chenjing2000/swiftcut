# SwiftCut — 开发交接（Handoff）

更新日期：2026-11-17；基线：`main`，提交 `4614cffe`（PR #19）。**下次开始新任务时，先读取本文件，再核对仓库最新代码；本文件不是代替源码的规格书。**

## 1. 软件定位

- 仓库：[chenjing2000/swiftcut](https://github.com/chenjing2000/swiftcut)；本地常用路径：`C:\Projects\SwiftCut`。
- SwiftCut 是基于 **LosslessCut v3.70.2** 定制的桌面音视频处理软件，沿用其时间轴、片段标记、音视频流管理、无损剪切、封装转换等能力。
- 桌面应用标识：`SwiftCut` / `com.swiftcut.desktop`；项目文件扩展名继续使用 `.llc`。旧 LosslessCut 用户配置不迁移。
- 技术栈：**Electron + React + TypeScript + electron-vite + FFmpeg/FFprobe**；Node.js **24.x**、仓库固定 Yarn **4.18.0**。主要在 Windows 上开发和实机验收。
- 保留 **GPL-2.0-only** 和上游版权。当前**没有官方 SwiftCut 二进制发行版**，也不应直接启用继承的签名、商店发布或网站部署配置。

## 2. 核心业务功能

菜单 **Output** 按顺序提供三项相互独立的操作：

| 功能 | 主要行为 | 输出位置 |
| --- | --- | --- |
| **Extract Audio** | 原编码音轨复制，或重新编码为 MP3（LAME VBR Q2、128/192/320 kbps）；可选择多音轨、整段或选定片段，以及合并/分别输出 | `<源文件名去扩展名>/Audio/` |
| **Crop Video** | 按画面矩形区域裁剪并重新编码 H.264；支持时间范围、多个片段及合并/分别导出；不是无损裁剪 | `<源文件名去扩展名>/Croploss/` |
| **Export Video** | 在源编码与目标容器兼容的前提下执行无损剪切、流复制/重新封装、智能剪切及片段合并 | `<源文件名去扩展名>/Lossless/` |

输出目录按任务需要延迟创建。已有结果文件不被覆盖，临时文件与最终发布分开处理；取消/失败不得误删既有结果。发布后的清理或通知错误不应把成功保存的结果误报为取消/失败。具体命名、格式约束、UI 生命周期见 [MEDIA_WORKSPACE_EXPORT.md](development/MEDIA_WORKSPACE_EXPORT.md) 和 [Crop Video 限制](development/CROP_VIDEO_LIMITATIONS.md)。

**进程隔离是必须维护的设计边界：** Extract Audio、Crop Video、Export Video 各自管理任务取消。SC-023 已使 Export Video 对其 FFmpeg 子任务传递独立 `AbortSignal`；取消一个 Output 任务不得中断无关的缩略图、波形及其他 FFmpeg 任务。保留旧式全局取消接口供原有未采用独立信号的调用方使用，不要把它用于取消某个单独 Output 任务。

隐私改动：应用网络访问默认关闭；Electron 请求与 FFmpeg/FFprobe 网络协议输入受检查，移除了部分上游在线集成和 GPS 地图功能。详见 [PRIVACY-CHANGES.md](../PRIVACY-CHANGES.md)。这些应用级限制**不能替代防火墙**，也不能把常规测试视为网络抓包验证。

## 3. 重要源码入口

- `src/renderer/src/App.tsx`：主界面、文件/时间轴状态、Export Video 生命周期以及 Output 交互入口。
- `src/renderer/src/hooks/useFfmpegOperations.ts`：传统剪切、智能剪切、合并、额外流导出及信号传播。
- `src/main/ffmpeg.ts`：FFmpeg/FFprobe 路径、网络限制、运行器与取消机制；`src/main/ffmpegCancellation.test.ts`：取消隔离回归测试。
- `src/main/audioExtraction.ts`、`audioExtractionUtils.ts`：独立音频任务与参数构造；`src/renderer/src/components/AudioExtraction/`：音频提取 UI/任务状态。
- `src/main/videoCropExportService.ts`、`videoCropFfmpegArgs.ts`、`videoCropConcat.ts`：Crop Video 主进程任务与编码/合并；`src/renderer/src/components/VideoCrop/`：裁剪 UI。
- `src/common/`、`src/preload/`、`src/main/`、`src/renderer/`：共享类型、进程通信和应用分层。改动跨进程接口时，同时检查类型、调用端和测试。

## 4. 已完成节点与当前状态

- **SC-022**：Output 相关保护与清理，已合并 [PR #17](https://github.com/chenjing2000/swiftcut/pull/17)。
- **SC-023**：Export Video 的 FFmpeg 取消隔离；Windows 普通导出、取消、智能剪切、合并取消、并行任务隔离及其他 Output 功能实机验收通过；CI 通过；已合并 [PR #18](https://github.com/chenjing2000/swiftcut/pull/18)，主线提交 `8f766b9`。
- **文档整理**：清除 7 份过时 MP3/Crop 阶段文档，保留关键设计与测试资料；CI 通过；已合并 [PR #19](https://github.com/chenjing2000/swiftcut/pull/19)，提交 `4614cffe`。
- **当前没有已授权但尚未完成的功能开发任务。** 新会话先检查 GitHub 最新 `main`、开放 PR 和工作区状态，不要假设上述基线仍是最新版本。

## 5. 开发规则与标准流程

1. **第一性原理 + 奥卡姆剃刀**：先判断问题是否必须解决；优先删除无用代码/文档、复用既有能力并作最小改动；不要为了“规范”新增冗余层、依赖或文档。
2. 遵守根目录 [AGENTS.md](../AGENTS.md)、[CONTRIBUTING.md](../CONTRIBUTING.md)、[UPSTREAM.md](../UPSTREAM.md)；保护上游行为、许可证、用户数据与已发布输出。
3. **从最新 `main` 建独立开发分支**；先审查现状和变更范围，再修改代码；提交信息用英文且描述实际变化，面向用户的行为变化按规范加 `Changelog:`。
4. 合并前进行 Code Review、最小化审查、必要自动测试及适用的 Windows 实机验收；提交到 **Draft PR**，仅在明确批准后合并至 `main`，优先保持一个整洁的开发提交。合并后核对 `main`，清理分支。
5. 不提交下载的 FFmpeg 二进制、测试媒体、生成文件、个人配置或秘密；**未经明确授权不发布版本、安装包或网站**。

本地在仓库根目录运行（PowerShell）：

```powershell
node .yarn\releases\yarn-4.18.0.cjs lint
node .yarn\releases\yarn-4.18.0.cjs tsc
node .yarn\releases\yarn-4.18.0.cjs test run
node .yarn\releases\yarn-4.18.0.cjs build
```

需要时执行 `node .yarn\releases\yarn-4.18.0.cjs dev` 实机检查，或查看 [Windows 开发安装指南](development/WINDOWS_DEV_SETUP.md)。GitHub CI 与 Windows 实机验收分别记录；不得以其中之一替代另一项。

## 6. 下次继续开发时

可直接说：**“请读取 `docs/HANDOFF.md`，检查当前 SwiftCut 仓库，然后讨论/实施……。”**

助手应先核查 `main`、开放 PR、[现行 Output 规范](development/MEDIA_WORKSPACE_EXPORT.md) 和相关源码/测试，再根据本次需求设计最小变更；不要把历史交接内容当作最新事实，也不要未经批准直接合并到 `main`。
