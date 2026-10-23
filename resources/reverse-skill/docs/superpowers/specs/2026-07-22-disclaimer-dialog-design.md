# Wujin v1.30.1 免责声明弹窗设计

## 目标

在 Windows Rust/Tauri `1.30.1` 客户端中增加一个低干扰的“免责声明”入口。用户主动点击后，在软件内部弹出中英双语免责声明；该功能只用于展示信息，不改变启动、授权、配置或安装流程。

## 固定入口与交互

- 左侧栏“帮助”分类新增小入口“免责声明”，排列在“运行日志”之后。
- 入口始终可用，不受 AI 客户端选择、CDK 状态、付费配置、免费 Skill 安装、更新检查或联网状态影响。
- 点击入口只打开软件内部弹窗，不跳转网页，不打开新页面，不调用 Rust/Tauri IPC。
- 软件启动时不自动弹出。
- 不要求用户勾选“我已阅读”或点击“同意”，不记录同意状态，也不阻止用户继续使用软件。
- 弹窗关闭后仍停留在打开前的页面，页面状态、表单内容、配置进度和结果保持不变。

## 弹窗结构

- 独立组件：`launcher-rs/ui/src/components/DisclaimerDialog.tsx`。
- 弹窗标题固定为“免责声明 / Disclaimer”。
- 正文区域可垂直滚动，适配当前固定 `1120 × 720` 窗口，不让弹窗超出可视区域。
- 底部只有一个主操作“我知道了”，右上角提供带 `aria-label="关闭免责声明"` 的关闭按钮。
- 点击“我知道了”、右上角关闭按钮或按 `Escape` 均关闭弹窗。
- 点击遮罩不关闭，避免用户在阅读时误触丢失位置。
- 打开后焦点进入弹窗；焦点保持在弹窗内；关闭后焦点返回侧边栏“免责声明”入口。
- 弹窗使用 `role="dialog"`、`aria-modal="true"`、`aria-labelledby` 和 `aria-describedby`。
- 正文保持正常文本选择，方便用户复制；背景页面在弹窗打开时不可交互。
- 遵循现有 focus-visible 和 reduced-motion 规则，不增加持续动画。

## 固定展示内容

标题与正文必须逐字保留以下中英文内容；界面使用标题、段落和分隔留白排版，不显示由等号组成的 ASCII 边框：

```text
免责声明 / Disclaimer

本文件夹内的所有内容（包括但不限于代码、脚本、文档、工具）仅供安全学习与研究使用。

使用者必须遵守所在国家/地区的法律法规，在合法授权范围内进行安全测试与研究。严禁将本内容用于任何非法用途，包括但不限于未授权的入侵、攻击、窃取数据等行为。

使用即表示您同意：一切后果由使用者自行承担，作者不承担任何责任。

All content in this directory is for security learning and research purposes only.

Users must comply with local laws and regulations. Unauthorized use is strictly prohibited.

By using this content, you agree that all consequences are borne by the user, and the author assumes no responsibility.
```

## 状态边界

- 弹窗打开状态只保存在 React 当前会话内，字段为 `disclaimerOpen: boolean`。
- 不写入 `%LOCALAPPDATA%`、注册表、Cookie、localStorage、配置文件或日志。
- 不新增 Tauri command、event、capability、外链或网络请求。
- 不读取或修改 `activated`、`authorizationText`、`busy`、`results`、`freeSkillsBusy`、`freeSkillResults` 或更新状态。
- 免责声明入口与付费 CDK、免费 Skill、软件更新三条流程完全解耦。

## 代码边界

- `Sidebar.tsx` 只负责渲染入口并调用 `onOpenDisclaimer`，不保存弹窗状态。
- `main.tsx` 保存 `disclaimerOpen`，挂载 `DisclaimerDialog`，并在打开/关闭时保持当前 `Page` 不变。
- `DisclaimerDialog.tsx` 只负责内容、可访问性、焦点和关闭事件。
- `disclaimer.css` 只负责遮罩、尺寸、滚动和中英文正文排版；不修改现有页面和购买卡片样式。

## 测试与验收

- 侧边栏“帮助”分类存在且只存在一个“免责声明”入口，位置在“运行日志”之后。
- 无客户端、未激活、CDK 过期、付费配置运行中、免费 Skill 安装运行中和离线状态下入口均不被禁用。
- 点击入口打开弹窗，标题和正文六个段落与固定文本逐字一致。
- 弹窗不包含购买、激活、同意复选框、倒计时或外链。
- “我知道了”、右上角关闭和 `Escape` 可以关闭；点击遮罩不会关闭。
- 打开后焦点进入弹窗，Tab/Shift+Tab 不逃出弹窗，关闭后焦点返回入口。
- 正文溢出时可以滚动，`1120 × 720` 窗口中标题和关闭操作始终可见。
- 打开和关闭弹窗前后，当前页面、CDK、已选客户端、付费/免费 busy、进度和结果对象保持不变。
- TypeScript typecheck、Node UI 回归和 Vite production build 全部通过。

## 不在本功能范围

- 不实现首次启动强制提示。
- 不实现用户同意记录、版本化同意或遥测。
- 不在免责声明中加入隐私政策、用户协议、许可证清单或第三方 Skill 归属信息。
- 不修改 Rust 后端、CDK 协议、免费 Skill 安装器、Cloudflare 更新清单或 macOS 实现。
