# HAL 9000 桌面宠物 🔴

一个卡通风格的 **HAL 9000**（《2001 太空漫游》里的红色机械眼），会**眨眼、做表情**，
根据 **Claude Code** 的忙碌情况改变神态。

- 你提交任务 → 半眯着往上看（在想）
- Claude 在跑工具/写代码 → 眯眼专注，红光里一道反光绕圈扫描
- Claude 需要你确认/输入 → 瞪大眼 + 挑眉，引起你注意
- 一轮结束 → 眯成开心的月牙 + 冒星星
- 长时间没事 → 眼睛半闭打瞌睡，冒 `z`
- 平时会时不时自动眨眼、目光轻轻飘动

**更多趣味：**

- 💬 **说话气泡**：头顶实时显示 Claude 在干嘛（读取/编辑某文件、运行测试、git 提交、联网搜索…）
- 👀 **眼睛跟随鼠标**：空闲时瞳孔跟着你的鼠标转
- 🎯 **需要你时用力提醒**：`waiting` 超过 6 秒还没理它，会放大闪烁 + 弹一条系统通知
- 🎬 **HAL 语录彩蛋**：报错时冒 “I've picked up a fault in the AE-35 unit.”；退出时冒 “I'm sorry Dave. I'm afraid I can't do that.”

大小可在**设置**里用滑块实时拖拽调整（80–460px），自动保存。

## 原理

Claude Code 的 **hooks** 会在不同事件触发时执行命令。我们让这些命令把当前状态写进
`~/.claude-pet/state.json`，宠物窗口每 150ms 读一次并切换动画。

```
Claude Code ──hook 触发──▶ hooks/hook.js ──写──▶ ~/.claude-pet/state.json ──轮询──▶ 宠物窗口
```

| Hook 事件          | 状态           | HAL 表情                       |
| ------------------ | -------------- | ------------------------------ |
| `UserPromptSubmit` | `thinking`     | 半眯往上看（思考）             |
| `PreToolUse`       | `working`      | 眯眼专注 + 扫描反光            |
| `PostToolUse`      | `working`/`error` | 正常继续；工具报错 → 故障闪烁 |
| `Notification`     | `waiting`      | 瞪大眼 + 挑眉                  |
| `Stop`             | `done`         | 开心月牙 + 星星                |

`PostToolUse` 的 hook 会读取工具执行结果，**检测到报错就切到 `error`**（愤怒皱眉 + 白/青色故障扫描条 + 抖动闪烁）。检测是尽力而为的启发式，原始结果会存到 `~/.claude-pet/last-tool.json` 便于校准。

## 安装

```bash
cd C:\workspace\pets
npm install            # 装 Electron
npm run install-hooks  # 把 hooks 写进 ~/.claude/settings.json（会自动备份）
npm start              # 启动宠物
```

`install-hooks` 是**幂等**的：可重复运行，会先清掉旧的宠物 hook 再写新的，
并把原 `settings.json` 备份成 `settings.json.bak`。
装好后**新开一个 Claude Code 会话**，hooks 才会生效。

## 操作

- **拖动**：直接按住 HAL 拖到任意位置
- **双击 HAL**：把正在运行的 **Claude 桌面客户端**窗口唤到前台（没在运行则启动它）
- **右键 / 托盘图标**：菜单
  - 设置…（调整大小）
  - Claude Code 联动（启用/停用）
  - 点击穿透锁定（鼠标穿过 HAL 点到桌面）
  - 回到右下角 / 退出
- **设置窗口**：滑块实时调大小

> 双击通过 [src/focus-claude.ps1](src/focus-claude.ps1) 用 Win32 `SwitchToThisWindow`
> 唤起 Claude 桌面客户端窗口。若你的 Claude 安装 AppID 不同，改脚本末尾那行即可。

## 不装 hooks 手动测试动作

```bash
node hooks/hook.js thinking
node hooks/hook.js working
node hooks/hook.js waiting
node hooks/hook.js done
node hooks/hook.js idle
```

宠物会立刻切到对应动作。

## 卸载 hooks

```bash
npm run uninstall-hooks
```

## 分发 / 装到其他电脑

在本机打包出一个免安装版：

```bash
npm run pack
```

产出 `dist/HAL 9000 Pet/` 文件夹（含所有运行时），并可压成 `dist/HAL-9000-Pet-win-x64.zip`。

### 拷到另一台电脑（什么都不用装）

1. 把 zip（或文件夹）拷过去，解压到任意位置（如 `D:\HAL 9000 Pet\`）
2. 双击 **`HAL 9000 Pet.exe`** —— **无需 Node、无需 Electron、无需安装**
3. **首次运行会自动关联 Claude Code**（写入 hooks，弹通知“已关联”）
4. 之后**新开一个 Claude Code 会话**，HAL 就会自动出现并跟随状态

> 免安装版没有数字签名，首次运行 Windows SmartScreen 可能提示“未知发布者”，
> 点“更多信息 → 仍要运行”即可。

### 关于 Node 依赖（已消除）

hooks 由 Claude Code 以命令方式调用。**打包版不依赖系统 Node**：安装时会生成
`hal-hook.cmd` / `hal-launch.cmd` 包装脚本，用 App **自带的 Electron 运行时**
（`ELECTRON_RUN_AS_NODE`）来跑 hook 脚本。开发模式（`npm start`）下则直接用系统 `node`。

首次运行的自动关联是**一次性**的（在 `~/.claude-pet/.bootstrapped` 打标记），之后你若
手动「停用联动」，下次启动会尊重你的选择、不再自动装回。也可随时在托盘菜单手动开关。

**跟随 Claude 启动：** 联动里包含一个 `SessionStart` 钩子（`launch.js`）——每次你开启
Claude Code 会话时，它会检查宠物是否在跑，没在跑就自动拉起来。所以**没有开机自启这一说**，
“你一用 Claude，它就出现”。宠物启动时会把自己的 pid 和启动命令记到 `~/.claude-pet/`，
`launch.js` 据此判断是否已运行、以及如何重启它。

**waiting（抽雪茄）何时触发：** 由 Claude Code 的 `Notification` 钩子驱动——当 Claude
需要你授权某个工具、或等你输入超过约 60 秒时触发。

> 想做成正式的 `.exe` 安装包（开始菜单快捷方式、卸载项），可以用 electron-builder，
> 但它需要在**开启了“开发者模式”或管理员权限**的机器上构建（解压签名工具包要创建符号
> 链接权限）。当前用的 `npm run pack` 是免签名、免那套工具链的手工打包方案。

## 文件结构

```
pets/
├─ package.json
├─ src/
│  ├─ main.js          # Electron 主进程：透明置顶窗口 + 托盘
│  ├─ index.html
│  ├─ renderer.js      # 像素宠物绘制 + 状态轮询（核心）
│  └─ state-path.js    # 共享的状态文件路径
├─ hooks/
│  ├─ hook.js          # 被 Claude Code 调用，写状态
│  └─ install-hooks.js # 一键写入/移除 settings.json
├─ claude-settings.snippet.json  # 手动配置用的片段
└─ README.md
```

## 自定义

- 换宠物外形/配色：改 `src/renderer.js` 里的调色板和 `draw()`
- 加新状态：在 `hook.js` 传新状态名，在 `renderer.js` 的 `draw()` 里加分支，
  在 `install-hooks.js` 的 `MAP` 里映射到某个 hook 事件
