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

> **跨平台**：同时支持 **Windows** 和 **macOS**。所有系统相关逻辑集中在
> [src/platform.js](src/platform.js)，其余代码保持平台无关。两个系统的**硬差异**见
> [下方“平台差异”](#平台差异win--mac)。

## 安装

```bash
cd path/to/hal-9000-pet   # Windows 例：C:\workspace\pets ；mac 例：~/workspace/hal-9000-pet
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
- **右键 HAL / 小图标**：菜单（Windows 在**右下角托盘**，macOS 在**右上角菜单栏**，点一下就弹出）
  - 设置…（调整大小）
  - Claude Code 联动（启用/停用）
  - 点击穿透锁定（鼠标穿过 HAL 点到桌面）
  - 回到右下角 / 退出
- **设置窗口**：滑块实时调大小。窗口会贴着小图标出现——**Windows 在右下角，macOS 在右上角**。

> 双击唤起 Claude 桌面客户端：Windows 用 [src/focus-claude.ps1](src/focus-claude.ps1)
> 的 Win32 `SwitchToThisWindow`；macOS 用 `osascript`（`tell application "Claude" to activate`），
> 未运行时回退到 `open -a Claude`。两条路径都在 [src/platform.js](src/platform.js) 里。
> 若你的 Claude 安装名不同（Windows 的 AppID / macOS 的应用名），改 platform.js 对应处即可。

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

`npm run pack` 会**按你当前所在系统**自动打包对应的免安装版；也可显式指定：

```bash
npm run pack       # 自动识别：mac 出 .app，Windows 出 .exe
npm run pack:win   # 只出 Windows 版：dist/win-unpacked/HAL 9000 Pet.exe
npm run pack:mac   # 只出 macOS 版：  dist/mac/HAL 9000 Pet.app（+ HAL-9000-Pet-mac.zip）
```

> ⚠️ **交叉打包受限**：mac 版的 `.app` 只能在 **macOS** 上打（要用 mac 的 Electron 运行时和
> `codesign`）；Windows 版的 `.exe` 在 mac/Windows 上都能打（纯文件拷贝）。所以要发布**两个
> 平台**都能装的版本，需要各自在一台 mac 和一台 Windows 上分别 `npm run pack:mac` /
> `pack:win`，把两个产物一起分发。用户按自己的系统选对应的那个。

### 拷到另一台电脑（什么都不用装）

**Windows：**

1. 把 zip（或文件夹）拷过去，解压到任意位置（如 `D:\HAL 9000 Pet\`）
2. 双击 **`HAL 9000 Pet.exe`** —— **无需 Node、无需 Electron、无需安装**
3. **首次运行会自动关联 Claude Code**（写入 hooks，弹通知“已关联”）
4. 之后**新开一个 Claude Code 会话**，HAL 就会自动出现并跟随状态

> 免安装版没有数字签名，首次运行 Windows SmartScreen 可能提示“未知发布者”，
> 点“更多信息 → 仍要运行”即可。

**macOS：**

1. 把 `HAL-9000-Pet-mac.zip` 拷过去，解压得到 **`HAL 9000 Pet.app`**，拖进 `/Applications`
2. 首次双击若被 Gatekeeper 拦（“无法验证开发者”），用下面任一方式放行：
   - **右键 → 打开**，在弹窗里再点“打开”；或
   - 终端执行 `xattr -dr com.apple.quarantine "/Applications/HAL 9000 Pet.app"`
3. 打包时已做**临时签名（ad-hoc）**，本机运行一般不会报“已损坏”
4. 之后同 Windows：首次运行自动关联，**新开 Claude 会话**它就出现

> macOS 版是纯**菜单栏应用**（无 Dock 图标）：小图标在**屏幕右上角菜单栏**，点它弹菜单。

### 关于 Node 依赖（已消除）

hooks 由 Claude Code 以命令方式调用。**打包版不依赖系统 Node**：安装时会按平台生成包装脚本
——Windows 的 `hal-hook.cmd` / `hal-launch.cmd`，macOS 的 `hal-hook.sh` / `hal-launch.sh`
——都用 App **自带的 Electron 运行时**（`ELECTRON_RUN_AS_NODE`）来跑 hook 脚本。开发模式
（`npm start`）下则直接用系统 `node`。

首次运行的自动关联是**一次性**的（在 `~/.claude-pet/.bootstrapped` 打标记），之后你若
手动「停用联动」，下次启动会尊重你的选择、不再自动装回。也可随时在托盘菜单手动开关。

**跟随 Claude 启动：** 联动里包含一个 `SessionStart` 钩子（`launch.js`）——每次你开启
Claude Code 会话时，它会检查宠物是否在跑，没在跑就自动拉起来。所以**没有开机自启这一说**，
“你一用 Claude，它就出现”。宠物启动时会把自己的 pid 和启动命令记到 `~/.claude-pet/`，
`launch.js` 据此判断是否已运行、以及如何重启它。

**waiting（抽雪茄）何时触发：** 由 Claude Code 的 `Notification` 钩子驱动——当 Claude
需要你授权某个工具、或等你输入超过约 60 秒时触发。

> 想做成正式安装包（Windows 的 `.exe` 安装器 + 开始菜单快捷方式；macOS 的 `.dmg`），可以用
> electron-builder——`package.json` 里已配好 `win` / `mac` 两个 target。Windows 上它需要
> **开发者模式或管理员权限**（解压签名工具包要创建符号链接）；mac 上直接可用（未签名 `.dmg`
> 拷到别的 mac 仍会触发 Gatekeeper，处理同上）。当前默认用的 `npm run pack` 是免签名、免那套
> 工具链的手工打包方案。

## 平台差异（Win ↔ Mac）

所有系统相关分支都在 [src/platform.js](src/platform.js)，`process.platform` 决定走哪条路：

| 能力 | Windows | macOS |
| --- | --- | --- |
| 小图标位置 | 右下角**系统托盘** | 右上角**菜单栏**（`Tray` 原生就在这里） |
| 唤起 Claude（双击） | PowerShell + Win32 `SwitchToThisWindow` | `osascript activate` → 回退 `open -a Claude` |
| 检测 Claude 是否在跑 | `Get-Process claude` | `pgrep -x Claude` |
| hook 包装脚本 | `.cmd` 批处理 | `.sh` + `chmod +x` |
| 隐藏应用图标 | `skipTaskbar`（不占任务栏） | `app.dock.hide()` + `accessory` 策略 + `LSUIElement` |
| 悬浮层级 | `alwaysOnTop('screen-saver')` | 额外 `setVisibleOnAllWorkspaces`（跨全屏/多桌面） |
| 最小尺寸 | 80px | **110px**（macOS 把过小的透明窗口渲染成白底方块，属系统合成 bug，只能靠尺寸下限规避） |
| 设置窗口位置 | 右下角（贴托盘） | 右上角（贴菜单栏图标） |
| 打包产物 | `HAL 9000 Pet.exe` | `HAL 9000 Pet.app`（改 Info.plist 隐藏 Dock + ad-hoc 签名） |

## 文件结构

```
hal-9000-pet/
├─ package.json
├─ src/
│  ├─ main.js          # Electron 主进程：透明置顶窗口 + 托盘/菜单栏
│  ├─ platform.js      # ★ 所有 Win/Mac 平台差异集中在这里
│  ├─ index.html
│  ├─ renderer.js      # 像素宠物绘制 + 状态轮询（核心）
│  ├─ hooks-install.js # 写入/移除 settings.json 的实现（跨平台包装脚本）
│  ├─ focus-claude.ps1 # Windows：唤起 Claude 桌面窗口
│  └─ state-path.js    # 共享的状态文件路径
├─ hooks/
│  ├─ hook.js          # 被 Claude Code 调用，写状态
│  ├─ launch.js        # SessionStart：没在跑就拉起宠物
│  └─ install-hooks.js # CLI 入口，一键写入/移除
├─ scripts/
│  ├─ pack.js          # `npm run pack` 分发器：按系统选下面的脚本
│  ├─ pack.sh          # 打 Windows 免安装版
│  └─ pack-mac.sh      # 打 macOS .app
├─ claude-settings.snippet.json  # 手动配置用的片段
└─ README.md
```

## 自定义

- 换宠物外形/配色：改 `src/renderer.js` 里的调色板和 `draw()`
- 加新状态：在 `hook.js` 传新状态名，在 `renderer.js` 的 `draw()` 里加分支，
  在 `install-hooks.js` 的 `MAP` 里映射到某个 hook 事件
