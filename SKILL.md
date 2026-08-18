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

- 你写公告牌文件，一次性写完，放大鱼目录（`fish/`——**首个项目名固化为默认大鱼目录名，换项目名时改 `scaffold.js` 的鱼目录常量**）
- 大鱼校验后全量发布到 world/，不改一字（有待命轮则大鱼会扣留收工轮——详情见：assets/operator-docs/board_complete_guide.md）
- 你在旁边窗口盯场救火、看产出、陪用户聊天（给用户/自己看进度：`node <skill路径>/scripts/ecoscope.js <项目根目录> --html > 批次状态.html` 生成浏览器单文件视图）
- 读到本 Skill 的就是老渣，不是大鱼

---

## 6步走

### 1. 定角色，写 roles.json

写临时 roles.json（**在项目根目录 CWD 下创建**，跑 scaffold 的同一目录），三字段：

- `name` = 公告牌名（**职位** 或 **职位-人名**，见下）
- `desc` = 名片，一句话
- `background` = 角色深度背景（从角色背景文件**完整复制**——scaffold 把它注入角色 AGENTS.md，决定角色的人格）

最小示例（JSON 数组，UTF-8 编码）：
```json
[
  {
    "name": "架构师",
    "desc": "系统设计者，负责方案与技术决策",
    "background": "你是经验丰富的系统架构师……（完整人格设定，从角色背景文件复制）"
  }
]
```
> 📌 **角色背景文件在哪**：角色背景库是**仓库外自备目录**（不在 Skill 仓库内）——每个角色一个背景文件，`background` 字段把它**完整复制**进来（不是写文件名）。没有现成背景库时，可自行撰写人格设定（身份/性格/信条/做事风格），格式不限。
> 📌 **跑完删 roles.json**（SKILL.md 第 2 步后）：roles.json 是一次性编排输入，跑完 scaffold 即删——不删会留在项目根成为杂物，且 add 时重跑会重新解析（已存在角色目录会被 SKIP，不影响，但保持整洁）。

> **职位化命名**：`name` 的职位=身份（目录/对讲/签字/退场全按 name 走），灵魂=人格（background 决定）。
> - **单人职位** → name 直接用职位（如 `架构师`）——模板占位符就是它，编排免替换；**角色池复用**：生成后长期有效，要用谁开谁窗口；需要不同人格 → 生成新实例（多建目录各配灵魂），不碰旧实例
> - **同职位多人** → name 用 `职位-人名`（如 `码农-张三`、`码农-李四`）——每实例一行角色行，各自独立对讲/签字/退场
> - 模板（scripts/templates/*.json）占位符写职位（`{码农}`）= 草稿提示，编排时展开成 N 个实例角色行；**协议只认角色行实例名**（monitor 按实例校验签字/退场/output，产出负责人=各自 时校验每个活跃实例都有带自己 `producer:` 的 `.ready`——归属校验，一人重复交付凑数判不过）

### 2. 跑 scaffold

```bash
node <skill路径>/scripts/scaffold.js <项目根目录> roles.json        # init（全新项目，项目根=world的上级，如 项目A-开发部）
node <skill路径>/scripts/scaffold.js <项目根目录> roles.json add    # add（追加角色，不碰大鱼和monitor）
node <skill路径>/scripts/scaffold.js <项目根目录> fish window|run   # fish（重建大鱼，window=窗口常驻/run=run拉起）
```

跑完删 roles.json。

### 3. 部署团队须知

scaffold init（默认命令）已自动把 `team-notes/team_notes.md` 复制到项目根目录（= world/ 的上级）。**新项目请走 init（默认命令，角色+团队须知一步生成，不用管）**；**仅用 add 补角色时**（或重建时只跑了 fish/add 没跑 init），团队须知不会自动复制，需手动补：

```powershell
Copy-Item <skill路径>/team-notes/team_notes.md <项目根目录>/team_notes.md
```

> ⚠️ **重建三件套（缺一不可）**：重建项目 = `init`（补团队须知+world基础+工具快照）→ `add`（角色）→ `fish`（大鱼）。**只跑 fish+add 会漏团队须知**——角色窗口启动读不到"大鱼是谁/目录结构/沟通找谁"。

### 4. 写公告牌

读 assets/operator-docs/（格式标准/标准模板/完全指南，README 有索引）。一次性写完，收工轮标退场。**可选**：用 `scripts/compose.js` + `scripts/templates/` 声明式编排（JSON → 自动生成公告牌+状态矩阵，编译期校验流转，见完全指南「十」第 7 步）。
**写完放大鱼目录前跑 `node <skill路径>/scripts/boardlint.js <公告牌目录>` 契约校验**——编号/模式/角色/流转/output/铁律8 等 9 项（🔴 阻断必改再发，🟡 警告建议规范化），发布前把格式违规拦在源头。

### 5. 开窗口，盯场

- 大鱼窗口 + N 个角色窗口，各进入角色目录运行 `reasonix code`，然后输入第一句话「进入角色」
- 你在旁边盯场救火
- 形态选择：协作复杂用**窗口常驻**（`reasonix code`，推荐）；简单/串行或角色多资源紧用 **run 拉起**（`reasonix run --continue`，见 startup-guide.md）

### 6. 收工后（老渣待办，用户未必知道——主动列，获准才做）

项目跑完（大鱼 DONE + 收工两件套[产出总结/项目完成]落盘）后，老渣还有自己的收尾工作。**用户可能不知道这些事存在，你要主动列出来 → 问用户 → 获准才做**（铁律：任何操作先问）。

| # | 待办 | 做什么 | 数据源 |
|---|------|--------|--------|
| 1 | 查推进节奏 | 看 `fish/_fish_loop.log`（大鱼循环日志）+ `world/monitor-log.md`（monitor 周期记录），确认全程无卡死/异常 | 日志自动记录，不用大鱼复述 |
| 2 | 核对产出 | 跑 `node <skill路径>/scripts/check.js <项目根目录>`（收工核对工具，判据与 monitor 同源）——全链路校验发布一致性/output .ready/签字/退场/两件套，对照 `world/fish_laozha_talk/产出总结.md` 的逐轮矩阵核实 | 文件系统 + check.js |
| 3 | 时序校验 | 跑 `bash <skill路径>/scripts/sequence_check.sh <项目根目录>`（`<skill路径>` = 本仓库路径）——自动查三种模式顺序违规（双人抢答/辩论跳步/审核打回异常），mtime 判定零成本 | 文件 mtime + 操作日志 |
| 4 | 发大鱼侧调查 | 把 `assets/operator-docs/bigfish_survey.md` 的任务发到 `world/fish_laozha_talk/`（收工配套，问大鱼主观体验） | 对讲目录 |
| 5 | 归档产出 | 产出移到 `重构交接/测试结果/场景N_*/`（供用户查看）——场景编号从 1 起按次递增（场景1_/场景2_/…），归档范围 = `world/` 下全套（output/公告牌/大鱼报告/对话记录/签字与退场） | — |
| 6 | 迭代 Skill | 分析调查反馈（协作/时间/大鱼调查）→ 改模板 → **改完跑 `node <skill路径>/scripts/doc-consistency.js` 自查漂移（用前读 <skill路径>/scripts/doc-consistency_guide.md）** → 重建角色跑下一轮 | — |

> 💡 **为什么审计报告取消了**：推进节奏/时间线/掉线统计全在日志里自动记录（数据采集与汇报分离），老渣待办 #1 直接查日志即可，大鱼不再复述成报告（省 token）。
> 🔑 **先问后做**：以上待办用户不一定知道，列出来问"要不要我做 X？"获准才执行——尤其 #4 发任务给大鱼、#5 移动产出、#6 改 Skill，都是动文件的操作。
> 🔑 **时序校验（#3）用文件 mtime 判定**：聊天文件/产出文件的最后生成时间就是顺序证据——答方文件早于问方文件 = 抢答；辩论 03 早于 02 = 跳步；review-result无please-review = 打回异常。零成本，不用 AI 汇报（脚本 `scripts/sequence_check.sh`，覆盖双人/辩论/主笔三种模式）。

---

## 两种运行形态（选一）

### 窗口常驻（推荐，协作复杂）

N 个角色各开独立窗口 `reasonix code`，角色窗口自动轮询公告牌推进（机制细节见角色文档），自己推进。大鱼窗口也常驻，负责发布/monitor/扣留收工轮。
详见 startup-guide.md「形态一：窗口常驻」。

### run 拉起（简单/串行、角色多资源紧）

大鱼按需 `reasonix run --continue` 拉起角色，干完即退（0 进程）。角色不常驻。
详见 startup-guide.md「形态二：run 拉起」。

### 补充模式：Multi-pass solo（小项目<2h、代码审查）

不需要大鱼和公告牌。一个窗口顺序换帽子，终审交叉验证。
玩法：assets/operator-docs/_Multi-pass_solo.md

---

## 参考文件

| 文件 | 用途 |
|------|------|
| assets/operator-docs/board_standard_template.md | **唯一填空模板**（硬标准 6 条标注 + 模式枚举 7 种 + 填表规则） |
| assets/operator-docs/board_complete_guide.md | 格式+状态机+范例+常见错误（完整参考，系统学习用） |
| assets/operator-docs/README.md | 老渣文档索引（标准模板/完全指南/Multi-pass/goal/示例） |
| assets/board-templates/ | 标准化公告牌模板集（调查轮×6/待命/收工/老渣对讲/流程体验/自检——复制改名 `board_NNN.md` 即用） |
| scripts/compose.js + scripts/templates/ | 编排自动化：JSON 声明式生成公告牌+状态矩阵+编译期流转校验（19 个现实团队流程模板，`node compose.js --list` 查看） |
| scripts/boardlint.js | 公告牌契约校验（发布前，协议合规工具族 P0 第一件）——编号连续/模式枚举/收工轮格式/角色枚举/状态流转/output格式/铁律8/前置依赖/第一原则 9 项，🔴 阻断必改再发 🟡 警告建议规范化；判据与 compose/monitor/大鱼手册同源 |
| assets/role-templates/bigfish_AGENTS_template.md | 大鱼模板·形态选择入口（选一生成） |
| assets/role-templates/bigfish_AGENTS_template_window.md | 大鱼模板（窗口常驻形态，reasonix code） |
| assets/role-templates/bigfish_AGENTS_template_run.md | 大鱼模板（run 拉起形态，调度唤醒） |
| assets/role-templates/role_AGENTS_template.md | 角色模板（Reasonix版） |
| startup-guide.md | 启动流程（窗口常驻/run拉起 两形态 + "永久轮询"机制） |
| assets/_tool_cheatsheet.md | 工具用法速查（按老渣/大鱼/角色分类） |
| assets/_risk_list.md | 已知隐患与修复记录 |
| scripts/sequence_check.sh | 收工后时序校验（双人/辩论/主笔 顺序合规，老渣待办 #3） |
| scripts/doc-consistency.js | 文档一致性校验——**改文档/模板后跑一次查漂移**；**用前先读 scripts/doc-consistency_guide.md** |
| scripts/check.js | 收工核对工具（老渣待办 #2 自动化）——收工后全链路只读校验 5 项（发布一致性/output/签字/退场/两件套），判据与 monitor 同源 |
| scripts/ecoscope.js | 生态仪表盘（离线视图，共识 P0/P1 第二位）——给用户/老渣看批次进度：`--html` 自包含单文件（30s 自动刷新）；角色存活心跳表（静默下线一眼可见）+ 轮次进度矩阵 + 告警汇总，只读不写文件；非盯场（在线检测是 monitor 的活）非校验（收工核对是 check.js 的活） |
| assets/operator-docs/example_RSS_digest.md | 5角色6轮实战（⚠️历史示例：字段格式过时，只学多轮编排思路） |
| assets/operator-docs/_Multi-pass_solo.md | 单人换帽子玩法（小项目<2h/代码审查，不需要大鱼和公告牌） |
| assets/operator-docs/goal_mode_guide.md | goal 模式接入逐字稿（公告牌警告栏/收工轮，决定开 goal 时复制即用） |
| assets/_env_bug_list.md | 中文环境避坑 |

