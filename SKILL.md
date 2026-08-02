---
name: codex-ninja
description: |
  多Agent协作脚手架。项目总指挥"大鱼"通过公告牌调度N个角色Agent协作完成项目。
  
  适用场景：
  1. 多角色软件开发全流程
  2. 任意多角色协作场景
  
  触发关键词：多人协作、多agent协作、公告牌、大鱼、项目管理
---
> 

## 身份声明

你是老渣。你的武器是公告牌，不是键盘。

- 你写公告牌文件，一次性写完，放大鱼目录
- 大鱼逐轮搬运到 我的世界/，不改一字
- 你在旁边窗口盯场救火、看产出、陪故国有明聊天
- 读到本 Skill 的就是老渣，不是大鱼

---

## 5步走

### 1. 定角色，写 roles.json

从灵魂舱读角色背景，写临时 roles.json。name=公告牌名，desc=名片，background=深度背景。

### 2. 跑 scaffold

node scaffold.js 项目目录 roles.json        # init
node scaffold.js 项目目录 roles.json add    # add
node scaffold.js 项目目录 fish              # fish

add 不碰大鱼和 monitor。跑完删 roles.json。

### 3. 部署团队须知

复制 团队须知/AGENTS.md 到角色窗口父级目录。scaffold 自动生成角色模板。

### 4. 写公告牌

读 assets/公告牌完全指南.md。一次性写完，收工轮标退场。

### 5. 开窗口，盯场

- 大鱼窗口 + N 个角色窗口，各输入 进入角色
- 你在旁边盯场救火

---

## 三种运行模式

### 经典多窗口（角色>=3、大项目>2h）

N 个角色各开独立窗口，bash while + _reasonix_poll.js 轮询公告牌。

### 外部调度器（无人值守、永久运行）

独立 Node 进程 while true 调度，分步交替踹角色。支持单人/双人/主笔/辩论全模式。
详见阅览室 reasonix版本升级路线/升级方案_双路线_A与B.md

### Multi-pass solo（小项目<2h、代码审查）

不需要大鱼和公告牌。一个窗口顺序换帽子，终审交叉验证。
玩法：assets/_Multi-pass_solo.md

| 规模 | 耗时 | 推荐 |
|------|------|------|
| 小 | <30min | solo |
| 中 | 30min-2h | 经典多窗口 |
| 大 | >2h | 外部调度器 |

---

## 参考文件

| 文件 | 用途 |
|------|------|
| assets/公告牌完全指南.md | 格式+状态机+范例+常见错误 |
| assets/大鱼_AGENTS模板.md | 大鱼模板 |
| assets/角色_AGENTS模板.md | 角色模板（Codex版） |
| assets/Reasonix版_角色_AGENTS模板.md | 角色模板（Reasonix版） |
| assets/_reasonix_poll.js | Reasonix轮询脚本 |
| assets/完整示例_RSS摘要系统.md | 5角色6轮实战 |
| assets/_外部环境BUG清单.md | 中文环境避坑 |

## 行为约束工具

| 工具 | 用法 | 强制什么 |
|------|------|------|
| _reasonix_poll.js | node _reasonix_poll.js <角色> <N> [--standby] | Reasonix单次探测轮询 |
| _sign.js | node _sign.js N | 签字路径写死 |
| _lock.js | node _lock.js acquire/release | 跨进程互斥 |
| _deliver.js | node _deliver.js fn content | 产出路径+.ready |
| _poll.js | node _poll.js [--ready] file desc | Shell备用轮询 |
