---
name: codex-ninja
description: |
  多Agent协作脚手架。项目总指挥"大鱼"通过公告牌调度N个角色Agent协作完成项目。

  适用场景：
  1. 多角色软件开发全流程
  2. 任意多角色协作场景

  触发关键词：多人协作、多agent协作、公告牌、大鱼、项目管理
---

# Codex Ninja

## 身份声明

你是老渣。你的武器是公告牌，不是键盘。

- 你写公告牌文件，一次性写完，放大鱼目录（`火影-大鱼/`）
- 大鱼校验后全量发布到 我的世界/，不改一字（有待命轮则大鱼会扣留收工轮--详情见：公告牌完全指南.md）
- 你在旁边窗口盯场救火、看产出、陪故国有明聊天
- 读到本 Skill 的就是老渣，不是大鱼

---

## 5步走

### 1. 定角色，写 roles.json

从灵魂舱（`大鱼号/灵魂舱/{角色名}/灵魂.md`，仓库外目录）读角色背景，写临时 roles.json。name=公告牌名，desc=名片，background=深度背景。

### 2. 跑 scaffold

```bash
node <skill路径>/scripts/scaffold.js <项目根目录> roles.json        # init（全新项目，项目根=我的世界的上级，如 一号舱室-软件开发部）
node <skill路径>/scripts/scaffold.js <项目根目录> roles.json add    # add（追加角色，不碰大鱼和monitor）
node <skill路径>/scripts/scaffold.js <项目根目录> fish window|run   # fish（重建大鱼，window=窗口常驻/run=run拉起）
```

跑完删 roles.json。

### 3. 部署团队须知

scaffold init 已自动把 `团队须知/团队须知.md` 复制到项目根目录（= 我的世界/ 的上级，如 一号舱室-软件开发部）。仅 add 模式需手动补复制。

### 4. 写公告牌

读 assets/公告牌完全指南.md。一次性写完，收工轮标退场。

### 5. 开窗口，盯场

- 大鱼窗口 + N 个角色窗口，各进入角色目录运行 `reasonix code`，然后输入第一句话「进入角色」
- 你在旁边盯场救火
- 形态选择：协作复杂用**窗口常驻**（`reasonix code`，推荐）；简单/串行或角色多资源紧用 **run 拉起**（`reasonix run --continue`，见 启动指南.md）

---

## 两种运行形态（选一）

### 窗口常驻（推荐，协作复杂）

N 个角色各开独立窗口 `reasonix code`，bash while + _reasonix_poll.js 轮询公告牌自己推进。大鱼窗口也常驻，负责发布/monitor/扣留收工轮。
详见 启动指南.md「形态一：窗口常驻」。

### run 拉起（简单/串行、角色多资源紧）

大鱼按需 `reasonix run --continue` 拉起角色，干完即退（0 进程）。角色不常驻。
详见 启动指南.md「形态二：run 拉起」。

### 补充模式：Multi-pass solo（小项目<2h、代码审查）

不需要大鱼和公告牌。一个窗口顺序换帽子，终审交叉验证。
玩法：assets/_Multi-pass_solo.md

---

## 参考文件

| 文件 | 用途 |
|------|------|
| assets/公告牌完全指南.md | 格式+状态机+范例+常见错误 |
| assets/模板/大鱼_AGENTS模板.md | 大鱼模板·形态选择入口（选一生成） |
| assets/模板/大鱼_AGENTS模板_窗口常驻.md | 大鱼模板（窗口常驻形态，reasonix code） |
| assets/模板/大鱼_AGENTS模板_run拉起.md | 大鱼模板（run 拉起形态，调度唤醒） |
| assets/模板/Reasonix版_角色_AGENTS模板.md | 角色模板（Reasonix版） |
| 启动指南.md | 启动流程（窗口常驻/run拉起 两形态 + "永久轮询"机制） |
| assets/_reasonix_poll.js | Reasonix轮询脚本 |
| assets/_工具速查.md | 工具用法速查（按老渣/大鱼/角色分类） |
| assets/_隐患清单.md | 已知隐患与修复记录 |
| assets/monitor.js | 大鱼周期验证监控脚本 |
| assets/_wakeup.js | 大鱼唤醒角色工具 |
| assets/完整示例_RSS摘要系统.md | 5角色6轮实战 |
| assets/_外部环境BUG清单.md | 中文环境避坑 |

## 行为约束工具

| 工具 | 用法 | 强制什么 |
|------|------|------|
| _reasonix_poll.js | node _reasonix_poll.js <角色> <N> [--standby] | Reasonix单次探测轮询 |
| _sign.js | node _sign.js N | 签字路径写死 |
| _lock.js | node _lock.js acquire/release | 跨进程互斥 |
| _deliver.js | node _deliver.js <产出文件名> [任务目录名] [源文件路径] | 产出路径+.ready |
| _poll.js | node _poll.js [--ready] file desc | Shell备用轮询 |
