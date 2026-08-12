# codex-ninja e2e 自检

> codex-ninja 仓库内的端到端测试（独立子目录 e2e/，不混入 assets/scripts）。每次修复后跑一遍，确认核心链路没被改坏。
> 本目录已纳入 codex-ninja 仓库 git 管理，与 Skill 同版本演进。

## 用法

```bash
bash run_e2e.sh                      # 单角色链路（默认测上级 codex-ninja/）
bash run_e2e_multi.sh                # 多角色协作链路（3 角色 × 4 轮）
bash run_e2e_sys.sh                  # 系统机制链路（心跳/锁/唤醒/死锁/断点/待命/扣留/追加）
bash run_e2e.sh <skill路径>          # 指定 skill 路径（含空格请加引号）
```

## 覆盖链路

### run_e2e.sh（单角色，8 步 14 断言）

| 步骤 | 验证点 |
|------|--------|
| 1. scaffold init | 角色+大鱼 reasonix.toml（H10）、monitor.js、**玩法文件/_sign.js 占位符替换为 0**（H-1） |
| 2. 公告牌发布 | 001 单人输出 + 002 收工全量复制 |
| 3. 角色 poll 慢路径 | `BULLETIN N=1` exit 0 |
| 4. 干活 | `_deliver.js` → `.ready`、`_sign.js` → `完成_001.md` |
| 5. monitor 推进 | 001 完成 → 002 收工轮，未退场 → `RETIRE 测试甲 MISS` + `WAIT N=2`（正确不误判） |
| 6. 收工轮 poll | exit 0/2（收工轮感知）+ 创建退场文件 |
| 7. monitor 终局 | `DONE N=2` |
| 8. 待命轮 | `STANDBY N=3` + `WAIT N=3`（H2 修复：不误报收工） |

### run_e2e_multi.sh（多角色，3 角色 × 4 轮 19 断言）

| 轮 | 模式 | 验证点 |
|----|------|--------|
| 001 | 双人对话 | 问/答信号文件协议（`.signal` → 内容配对）、问方交付+双签字、monitor 推进 |
| 002 | 主笔审核 | **打回→通过全流程**：F-2 归档（旧 `.md`+`.signal` 改名 `_signal_acked` 非删除）、主笔重发、审核侧同步归档、有效 signal 仅剩当前轮 1 个 |
| 003 | 辩论 | 立论→找茬→自由辩论→双总结→**裁判 deliver（.ready）**→三方签字（F-4 协议） |
| 004 | 收工 | 全员退场 → `DONE N=4` |

### run_e2e_sys.sh（系统机制，1 角色 + 模拟搭档 19 断言）

| 机制 | 验证点 |
|------|--------|
| 心跳 | `_reasonix_poll` 写 `_heartbeat.txt` + `_hb_state.json`，monitor 存活角色不报 DEAD |
| 锁 | `_lock.js` acquire/release/再 acquire |
| 唤醒 | `_wakeup.js` → poll 检测 `WOKEN` → 文件删除（unlink，8-1 修复；wait_file 等待中检测则改名 `_wakeup_acked.md`） |
| 死锁 | `_deadlock.md` → monitor 输出 `DEADLOCK partner=xx` → 搭档 `_wakeup.md`（需公告牌含搭档字段——临时换双人公告牌测） |
| 断点续接 | 签字已存在 → 重启自检 N++ → poll 直接到下一张牌 |
| 待命轮全路径 | 无产出行待命轮 → `WAIT N+1`（不误报 STANDBY）；有产出行 → `STANDBY`（见 run_e2e.sh） |
| 扣留-补搬 | 收工轮扣留不发 → 补搬 → 角色 poll 感知 → 退场 → `DONE` |
| 追加任务链 | 待命轮 → 追加任务.md → 追加轮发布 → 干活 → 新收工轮 → `DONE N=6` |

## 设计要点

- **完全隔离**：在 `mktemp -d` 临时目录跑，`trap` 自动清理——不碰任何真实项目（含一号舱室生产环境）
- **断言式**：每步检查实际输出含期望子串，失败打印期望/实际并退出非 0
- **中文角色名**：内置「测试甲/测试乙/测试丙」，顺带验证中文路径/命名
- **模拟器而非模型**：多角色测试用文件操作模拟各角色按协议干活（信号文件/deliver/sign），验证的是**系统协议链路**，不是模型行为——这是 e2e 该测的
- **退出码**：全部通过 exit 0；任一失败 exit 1（可直接接 CI/定时）

## 已知边界

- 依赖 `node` 在 PATH（reasonix 环境自带）
- `mktemp` 需 git-bash/类 Unix 环境（Windows 下用 Git Bash 跑）
- 双人对话只测了"挖空自然结束"路径；辩论未测"提前终结"（`辩论_终结.md`）路径——可后续扩展

## 维护规则（Skill 升级时 e2e 要不要改）

**e2e 是 Skill 行为的模拟**——升级是否要改 e2e，取决于行为契约变没变：

| Skill 升级类型 | e2e 要改吗 | 说明 |
|---|---|---|
| 改脚本内部实现（poll/monitor/deliver/sign 逻辑，行为不变）| ❌ 不用改 | 跑一遍确认无回归即可（例：第五轮 RETIRED/.acked 修复，e2e 未动 52 断言全绿）|
| 改玩法模式流程（双人/主笔/辩论的交互方式）| ✅ 要改 | 脚本模拟了这些流程，断言跟着流程变 |
| 新增玩法模式 | ✅ 要加 | 脚本加一轮模拟 + 断言 |
| 改公告牌格式/字段 | ⚠️ 可能要改 | 脚本里构造的样例公告牌要同步 |
| 纯文档改动 | ❌ 不用 | |

**判断标准一句话**：升级动了"系统怎么判定/模式怎么交互/公告牌长什么样"→ 同步 e2e；只是内部实现换写法 → 只跑不改。

**流程**：改 Skill → 跑三脚本（14+19+19）→ 全绿再提交。
