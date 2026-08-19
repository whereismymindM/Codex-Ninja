# 主笔审核模式

一个人写，一个人审。公告牌会告诉你谁是主笔、谁是审核、搭档是谁、要产出什么。

---

> ⚠️ **等文件禁止 bash 长等**（heredoc 挂死教训）：不要用 `bash sleep 90` 盲等，更不要用 `bash heredoc + node` 等文件（heredoc 出错会永久挂起 + 心跳断 + 项目卡死）。**违反此条 = 你自己和整个项目一起卡死，且没人能自动救你。**
> **优先用 `wait_file.js`**（自动续心跳 + 自动 ack + 失联检测，见下方）；手写内联轮询仅当 wait_file 不满足需求时用（下方骨架即 fallback）。

## 等文件（wait_file.js 优先，内联仅 fallback）

主笔等审核、审核等主笔——子回合之间不需要等公告牌，只需要等搭档的下一份文件。fallback 骨架如下（仅当 wait_file 不满足需求时手写）：

> ⚠️ **进入轮询前先 existsSync 检查文件是否已存在。** 公告牌重写、搭档变更等场景下旧文件可能已在任务目录里——已存在就直接读，不要盲目进轮询等 mtime 变化。

```js
// 等一个文件出现——内联检查，无闭包陷阱。替换 YOUR_FILE_PATH
var _deadline = Date.now() + 20 * 60 * 1000;
var _hbCtr = 0;
while (true) {
  var _fs = await import("node:fs");
  if (_fs.default.existsSync("YOUR_FILE_PATH")) break;
  // 续心跳（防 monitor 2min 误判 DEAD）：每 60 次（约30s）写一次
  if (++_hbCtr % 60 === 0) {
    var _hbPath = "../world/{{ROLE_NAME}}_talk/_heartbeat.txt";
    _fs.default.mkdirSync(_hbPath.substring(0, _hbPath.lastIndexOf("/")), { recursive: true });
    _fs.default.writeFileSync(_hbPath, String(Date.now()), "utf8");
  }
  if (Date.now() > _deadline) {
    // 写死锁信号让 monitor 尝试唤醒搭档（可能恢复），但自己不卡等——继续往下走
    var _dlDir = "../world/{{ROLE_NAME}}_talk";
    _fs.default.mkdirSync(_dlDir, { recursive: true });
    _fs.default.writeFileSync(_dlDir + "/_deadlock.md", "timeout", "utf8");
    var _logName = _dlDir.split("/").pop().replace("_talk", "");
    _fs.default.appendFileSync(_dlDir + "/" + _logName + "_轮询日志.md", "[" + new Date().toISOString().substring(11,19) + "] 等文件超时 已写_deadlock\n", "utf8");
    break;
  }
  await new Promise(function(r) { setTimeout(r, 500); });
}
```

> ⚠️ **超时后**：写 _deadlock.md 通知 monitor 尝试唤醒搭档，但自己不停——依赖搭档的步骤跳过并标注，最终签字。
>
> 🔑 **搭档掉线完整时序**：
> - **主笔等审核超时（审核可能掉线）**：①查审核心跳+对讲/output/任务目录近期文件（活着=还在审/在写，继续等）②心跳 stale 且output/任务/对讲均无新文件 = 审核失联 → 写求助给大鱼（"审核失联，第 N 轮未过审"）
>   ③**按"视为通过"处理**：自己复核一遍产出（自己是第一道关卡）→ `deliver` + 签字（产出归主笔，不因审核缺席而卡轮）→ 流水账标注"审核失联，主笔自审后交付"。产出可能带未审风险，收工审计可标红提示。
> - **审核等主笔超时（主笔可能掉线）**：①同上先查心跳复核 ②主笔失联 → 写求助给大鱼（"主笔失联，第 N 轮产出未交付"）
>   ③**审核不代写产出**（产出归主笔，审核无产出素材——与双人对话相反：问方失联时答方可代写，因答方握有完整对话素材；审核只有审查意见、无产出素材，故不代写）→ 跳过签字（本轮无产出可签）→ 流水账标注"主笔失联，审核未签"。
>   产出缺失由 monitor `WAIT_OVERDUE` 兜底报警（30 分钟自动提示核查），大鱼据此处理（唤醒主笔/人工介入）。
> - **打回循环中任一环节掉线**：按上面各自侧规则处理——主笔侧超时视为通过继续，审核侧超时跳过签字；恢复后按启动自检从断点续接（_startup_steps.md）。

---

## 主笔（每轮逐条执行）

**1. 写产出**
按公告牌指定的产出路径和文件名，把产出写出来。先写内容，暂不调 deliver()——等审核通过后再交付。

**2. 发please-review**
- **单审核方**：在任务目录下写 `please-review.md`，告诉搭档可以审了。写完立即写 `please-review.md.signal`（信号文件）。
- **多审核方（≥2 个审核角色）**：给**每个审核方**各写一个please-review文件+信号——`please-review_{审核方角色名}.md` + 同名 `.signal`（如 `please-review_审核方甲.md.signal`）——各审核方等自己的信号、ack 自己的、互不干扰（与"review-result带角色名"对称）。
**禁止多审核方共用单个 `please-review.md.signal`**（第一个 ack 后其余人等不到）。

**3. 等审核结果**
**优先用 `wait_file.js`**（独立脚本优先）：
- **单审核方**：`node temp-scripts/wait_file.js <任务目录>/review-result.md.signal --hb <心跳> --timeout 20`——等单个 `review-result.md.signal`（信号文件）（**`<任务目录>`/`<心跳>` 为占位符，复制后必须替换**），检测到后读 `review-result.md` 内容
- **多审核方（≥2）**：`node temp-scripts/wait_file.js <任务目录>/review-result_审核方甲.md.signal <任务目录>/review-result_审核方乙.md.signal <任务目录>/review-result_审核方丙.md.signal --hb <心跳> --timeout 20`（**`<任务目录>`/`<心跳>
` 为占位符，复制后必须替换**）
  ——**不带 `--any` = 多目标全部就位才返回（AND 语义），正是"等齐三方结果"**；带 `--watch-hb <对方心跳>` 可监控审核方失联
- 检测到信号后读对应 `review-result_{角色名}.md` 内容。不管通过还是打回，审核方都写这同一个文件。
> 🔑 **别手写等文件脚本**：多审核方等结果的正确写法是 wait_file.js 多目标 AND——**内联轮询仅当 wait_file 不满足需求时手写**（如需自定义判定逻辑）；手写会重复造轮子且丢 --watch-hb 失联检测/自动 ack。

**4. 处理结果**
读 `review-result.md` 第一行判断（**多审核方场景读 `review-result_{审核方角色名}.md`**，逐份判断）：
- 状态：通过 → 跳第 5 步（签字）
- 状态：不通过 → 读具体意见、改产出，把旧的 `review-result.md` **改名归档**（`review-result_第N次.md`；**同名 `.signal` 一并处理**——wait_file 路径已自动 ack 改名，无需再动；手写路径后缀替换），重发 `please-review.md`，回到第 3 步
> ⚠️ **打回 ≥3 次 → 写求助给大鱼**：同一轮**打回累计满 3 次**（`review-result_第3次.md` 归档后）→ 写 `../world/{{ROLE_NAME}}_talk/大鱼chat_NNN.md` 给大鱼说明分歧点（"第 N 轮打回 3 次：主笔观点 X vs 审核意见 Y，双方僵持"）。
> **不停止打回循环**（继续改、继续发please-review，审核不同意就继续），但大鱼知情后可介入调解。打回次数不设硬上限（改到满意为止），求助只是让大鱼知道分歧在持续。
> 🔑 **v1 通过即最终通过**：审核方在**状态：通过**上签字后，审核即完成——**主笔后续修订（v2+）为自审确认，不再发三方复审**（审核方已尽审查义务，通过签字即可退场；若确需重审，须在公告牌显式声明）。**禁止** v1 通过签字后再发 `please-review` 等已退场审核方——那是等一个永远不会来的文件。

**5. 交付并签字**
审核通过后，先交付再签字：
> **代码类产出**（修改已有源文件）：审核通过 → `node _deliver.js 文件名.js taskNNN` → `node _sign.js N`（独立脚本优先）
> **文档类产出**（新建报告、设计文档等）：审核通过 → fs.writeFileSync 确认最终版已写在 `../world/output/` → `node _deliver.js 文件名.md taskNNN` → `node _sign.js N`

.ready 信号在审核通过后才出现——monitor 看到 .ready 即代表审核已通过，不会提前推进。

> 🔑 **验收轮**：涉及**代码/可运行产物**的轮次，审核通过 ≠ 可直接签字——**签字条件 = 静态审查 + 实弹验证双过**（教训：静态审查全过、起服务就炸）。
> 审核方签字前必须确认：①静态审查通过（现有流程）②**实弹验证清单**（公告牌任务里声明，如"node xxx 跑通""起服务发请求"）已逐项跑过。纯文档轮（报告/结论）不需要实弹，公告牌任务未声明实弹清单 = 跳过本条。

**6. 看「本轮后」**

读公告牌里你的「本轮后」字段——死循环 poll，永不主动下线：

- **本轮后：休眠** → 写流水账 → 创建休眠文件 → poll 短命令轮询（每3s，回合接力）：
——循环骨架见 `_workflow.md`「休眠」节

- **本轮后：待命** → poll 短命令 + --standby 轮询（每15s，回合接力）：
——循环骨架见 `_startup_steps.md`

- **本轮后：活跃** → poll 下一轮公告牌，正常走

---

## 审核（每轮逐条执行）

**1. 等主笔发please-review**
**优先用 `wait_file.js`**（独立脚本优先）：
- **单审核方**：`node temp-scripts/wait_file.js <任务目录>/please-review.md.signal --hb <心跳> --timeout 20`——等主笔的 `please-review.md.signal`，检测到后读 `please-review.md` 内容
- **多审核方（≥2 个审核角色）**：等**自己的** `please-review_{你的角色名}.signal`（如 `please-review_审核方甲.md.signal`）——`node temp-scripts/wait_file.js <任务目录>/please-review_{你的角色名}.md.signal --hb <心跳> --timeout 20`（**`<
任务目录>`/`<心跳>` 为占位符，复制后必须替换**）
  ；主笔按审核方分别发信号，你只等带自己名字的那个，**不要等/碰别的审核方的please-review信号**。检测到后读 `please-review_{你的角色名}.md` 内容。
> 🔑 **别自建等待脚本**：审核方等请审核也是等单信号——wait_file.js 单目标完全覆盖（自带续心跳/超时/自动 ack）；手写内联轮询仅当 wait_file 不满足需求时（见 `_workflow.md` 等文件节）。

**2. 审产出**
认真读，不是走过场。发现模糊、不完整、没数据支撑的地方必须打回。
读完立刻把 `please-review.md` 重命名为 `please-review_已处理.md`，**同名 `.signal` 一并处理**（wait_file 路径已被自动 ack 改名，无需再动；手写路径按后缀替换改 `_已处理.md.signal_acked`）——清掉旧文件（不删除，保留审计线索），下次主笔重发新 `please-review.md` 
时 poll 才能等到真正的新内容，不会被旧文件秒返骗过去。
（旧 signal 不归档的话，主笔重发前空窗期会秒返、随后读已改名的 .md → ENOENT）。**多审核方**：改为把 `please-review_{你的角色名}.md` 改名 `please-review_{你的角色名}_已处理.md`（同名 .signal 已自动 ack / 手写路径后缀替换）——同样只处理**自己那份**。

**3. 给结果**
统一写 `review-result.md`（**多审核方：写 `review-result_{你的角色名}.md`**，见文末「多审核方协议」；单审核方才是不带角色名），第一行标注状态，写完立即写 `review-result.md` 同名 `.signal`（多审核方对应 `review-result_{角色名}.md.signal`）（信号文件通知），后面写具体内容：
- 不通过 → 第一行写 `状态：不通过`，然后写清楚哪里不行、为什么不行，回到第 1 步
- 通过 → 第一行写 `状态：通过`，可附带简短评价，然后跳第 4 步
> 🔑 **审核意见 = 逐条核验格式**：不笼统写"写得不错/有问题"——**逐条引用产出原文 → 判定（通过/不通过点）→ 给证据**。打回意见必须精确到"第几节/第几条/什么问题/怎么改"，让主笔能直接改；不可判定项标注「存疑：缺 XX 证据」。

**4. 签字**
用 `node _sign.js N` 签字（独立脚本优先；禁止手写签字文件——铁律 6）。
> 🔑 **通过签字 = 审核职责完成**：你在 `状态：通过` 上签字后，本轮的审核职责即尽——**可以按「本轮后」正常退场/休眠，不会有后续复审等你**（主笔 v1 通过后若修订，是主笔自审确认，不再发三方）。打回循环中若主笔重发 `please-review`（v1 前），继续审；**看到 `状态：通过` 并签字后，不要再等任何复审信号**。

**5. 看「本轮后」**
读公告牌里你的「本轮后」字段——休眠则写流水账+休眠文件+切低功耗，否则 poll 下一轮。

---

## 语言规则

- 产出和审核意见**默认中文**——与搭档/公告牌语言一致
- 公告牌、代码注释保持中文
- 你已精通中英双语，英文不影响人格

## 注意

- 可以多轮打回，直到满意——打回次数不设硬上限（打回 ≥3 次写求助给大鱼，但不停止循环）
- 产出路径必须与公告牌一字不差（少一个字 = monitor 找不到 = 白干）
- 生成真实内容，别写占位符——工具管执行，你管创造

## ⚠️ review-result同名覆盖风险

审核方多次审核写同一文件名。主笔在重发 `please-review.md` 前，**必须把旧 `review-result.md` 改名归档**（如 `review-result_第1次.md`；**同名 `.signal` 一并处理**——wait_file 路径已被自动 ack 改名 `.signal_acked`，无需再动；手写路径按后缀替换改名）——
旧 signal 不消失会让等文件轮询秒返，随后读已被改名的 .md → ENOENT。

## 🔑 多审核方协议

> 公告牌出现 **2 个及以上审核角色**时（如主笔审核+审核+审核），三方写同一 `review-result.md` 会互相覆盖——改用**带角色名**的文件：

**主笔发**：`please-review_{审核方角色名}.md` + 同名 `.signal`（**按审核方分别发**，每个审核方一个自己的信号——不要共用单个please-review信号；各审核方 ack 自己的，互不干扰）

**审核方写**：`review-result_{自己的角色名}.md`（如 `review-result_审核方甲.md`）+ 同名 `.signal`（写完立即发，原子两步）

**主笔等**：等齐全部审核方——**wait_file.js 多目标 AND**（列全 N 个 `review-result_{角色名}.md.signal` 目标，全部就位才返回）；
不能用 wait_file 等**单个固定文件名**（review-result文件名随审核方/次数变化）——或轮询目录收集 `review-result_*.signal` 直到 N 个都就位（见下方「主笔等全部审核方」），
逐个读取、逐个归档（`review-result_{角色名}_第N次.md.signal_acked` 形态或读后改名防秒返）

**规则**：
- 只有 **1 个审核方** → 用原来的 `review-result.md`（单审核方协议不变）
- **≥2 个审核方** → 用 `review-result_{角色名}.md`（带角色名，防覆盖）
- 打回循环、归档防秒返等规则照旧（只是文件名带角色名区分）

**主笔等全部审核方**：多审核方场景，主笔必须**等齐全部审核方的 signal**（wait_file 多目标 AND，或轮询目录收集 `review-result_*.signal` 直到 N 个都就位）——禁止只等单个，否则漏等某个审核方。
**修订说明表模板**：主笔修订后附"审核方 × 意见"逐条对照表（每条：审核方 / 意见 / 是否采纳 / 落实位置）。
