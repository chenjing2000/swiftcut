# LosslessCutSimple T05–T08 Verification Kit

将本文件夹解压到项目根目录下，与 `src`、`package.json` 同级。

按顺序双击：

1. `Run-T05.bat` — Vitest 单元测试（包括 audioExtraction.test.ts）
2. `Run-T06.bat` — TypeScript 类型检查
3. `Run-T07.bat` — Oxlint 代码检查
4. `Run-T08.bat` — Electron/Vite 正式构建

每个脚本都会把完整输出保存到项目根目录的 `test-results` 文件夹，并记录退出代码。

## 重要说明

- 这四项会执行项目已有的测试、类型检查、lint 和 build 命令。
- 不会执行 `yarn check`，因为完整 check 流程还包含 i18n 提取、文档生成等步骤；在没有先审查这些脚本副作用前，不宜直接运行。
- T08 的 build 会运行项目原有的 `generate-icon` 步骤并生成构建产物，这是正常构建行为。
- 不要在测试过程中手动编辑源码。
- 请依次运行，全部结束后把 `test-results` 文件夹重新压缩发回。
