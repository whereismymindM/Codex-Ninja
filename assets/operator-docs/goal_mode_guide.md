# goal 模式认知（老渣必读 · 单一事实源）

> 用途：老渣写公告牌、理解 goal 模式项目行为时的认知手册。
> 来源：历次一号舱室实测 + 老渣×架构师对讲定稿。
> **所有 goal 相关模板措辞以本文件为设计依据**；模板内联措辞改动前先读本文件。

---

## 一、goal 模式是什么（一句话）

reasonix 的 `/goal` 模式 = **平台保活**：回合不因模型输出最终回复而结束（continueGoal 自动续跑），收口由**文件信号**决定，不靠模型自觉。

**改造关系**：codex-ninja 给 reasonix 加的 `.reasonix-done` 文件判据，让收口成为**平台保证**（非语义判据，换模型不怕）。

## 二、双轨模型（核心认知）

**收口 = 双轨配合，缺一不可：**

| 轨 | 谁 | 作用 | 类比 |
|---|---|---|---|
| **信号** `.reasonix-done` | 改造代码（平台判据） | 存在 → 强制触发 complete 流程 | **扳机** |
| **complete 标注** + evidence | 模型（协议确认） | 补 evidence + 标 [goal:complete] → 流程走完 | **关门螺丝** |

**实测证据（002/005/006 三样本）**：
- 005 无信号 → 平台不收口、回合续回（纯文字不致死 = 保活实证）
- 002/006 有信号 → 宿主报 "Goal signaled complete but issues remain: missing objective_evidence, verification" → 补 evidence + 标 complete → 收口

**关键**："issues remain" 是缺 **evidence**，不是缺信号；信号触发 complete 在前，模型补 evidence 在后。

## 三、三层配合（收口完整流程）

```
① 信号触发（改造代码）：.reasonix-done 存在 → 强制 complete + 消费删除
② evidence 补全（模型）：宿主报 issues remain → 补 evidence 块
③ complete 标注（模型）：收工轮收口流程补标 [goal:complete]
```

**三层都到位 = 真正收口**。①是平台保证，②③是协议要求（模板已写进收工轮任务）。

## 四、收工轮完整顺序（公告牌任务栏定稿）

```
① 写流水账（回顾全程 ≥2 行）
② 创建退场文件（对讲目录，无 .md 后缀，touch + ls 确认）
③ touch .reasonix-done（角色目录 CWD，touch + ls -la 确认）——必须先于④
④ 输出「项目完成」
⑤ 【条件分支】宿主反馈：
   ├─ 报 "Goal signaled complete but issues remain" → 补 evidence + 标 [goal:complete] → 收口
   └─ 直接收口 → 无需补标
⑥ 信号被平台消费删除 = 预期（瞬态信号，不是交付物）
```

**顺序铁律**：③必须先于④（先输出后 touch = 被当普通纯文字续回，收口失败——005 实测）。

## 五、警告栏措辞（分轮次，模板内联逐字稿）

> goal 模式轮次必写：**①干活轮/待命轮禁止在回复末尾标注 [goal:complete] / [goal:blocked]（标注 = 假完成 = 事故）
> ②收工轮例外：执行完「流水账+退场文件+touch .reasonix-done+输出项目完成」后，若宿主报 issues remain（缺 evidence）→ 补 evidence 块并标注 [goal:complete] 配合收口——此标注仅限收工轮收口流程，干活轮/待命轮仍禁止**
> **③干完活不要标完成标记，正常 deliver + sign 后继续 poll 公告牌等下一轮 ④收工流程由收工轮任务栏指示（届时放 .reasonix-done 信号文件）⑤标注 = 事故，拖慢团队进度，后果严重者踢出团队**

**设计要点**（改措辞前必读）：
- 禁令与豁免**同句对照**（角色不会只见一半）
- 豁免触发条件锁死 = "宿主报 issues remain"（不是角色想标就标）
- "仅限收工轮收口流程"8 个字锁边界

## 六、evidence 合格标准（模型补 evidence 时）

- **objective_evidence**：kind=file，paths 用**相对路径**（`我的世界/output/taskNNN/文件名.md`），summary 写**文件系统事实**（产出+.ready 在位/签字在位/退场文件在位），accepted=true
- **verification**：kind=verification，command 填**实际跑过的命令**，summary 写**命令输出结果**，accepted=true
- 不合格：无文件/命令证据、"我干了XX"、绝对路径、推断性 summary（事实与推断分离）

## 七、常见问题（实测踩坑）

| 现象 | 原因 | 处理 |
|---|---|---|
| 角色提前 touch 信号（非收工轮） | 认知滞后/恢复现场 | 无害（决策点才检查，不中断当前回合）；但收工轮才应 touch |
| 信号出现又消失 | 平台消费删除（预期） | 不是丢文件——瞬态信号 |
| 收工轮后角色补标 complete | 双轨配合（协议要求） | 收工轮豁免，正常 |
| 老渣参与轮次的收工轮 | 老渣不是 monitor 管角色 | 收工轮别列老渣退场，或老渣提前建退场文件 |
| 角色乱标 complete 于干活轮 | 违反警告栏 | 事故，按警告栏④处理 |

## 八、关联资源

- 改造说明（方案/工具/维护）：`工具舱/reasonix-改造/改造说明.md`（**开发者内部资源，仓库外路径**）
- 实测归档：`档案馆/14_reasonix文件判据改造/`（设计文档/组团评审/实测结论/双轨模型；**开发者内部资源**）
- 记忆：goal模式接入方式 / goal模式实测全通过 / goal模式双轨模型
