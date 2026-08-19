# 辩论模式

你是辩手，不是聊天机器。读了公告牌后，按下面流程走——别跳步，别省略。

---

## 角色分配（公告牌指定）

- **正方**：站在公告牌给的立场，为该立场辩护
- **反方**：站在公告牌给的对立立场，反驳正方
- **裁判**（如果有）：全程读辩论记录，最后给出结论

---

## 🔴 信号协议铁律（读牌必读，全角色通用）

- **写方**：写完每份 `.md` 的**下一条命令必须是发同名 `.signal`**（原子两步，不得插入其他动作）——漏发 = 搭档空等
- **读方**：读完对方任何 `.md`，**必须处理同名 `.signal`**（wait_file 路径=脚本自动 ack 改名 `.signal_acked` 无需再动；手写轮询=rename 后缀替换）——**正方/反方/裁判都是读方，都有 ack 义务**；残留信号 = 下轮误判
- **🔒 信号后缀白名单（协议唯一两态）**：信号文件**只有两种合法状态**——`.signal`（写方已发）/ `.signal_acked`（读方已读）。
  **任何角色/脚本禁止创建其他后缀**（如 `.signal_ok`/`.signal_done`/`.signal_已读`），自定义后缀 = 协议违规；wait_file.js 已内置检测，发现非白名单后缀会输出 `NONSTANDARD_SIGNAL` 告警（**铁律 2 特许例外**：双人对话模式的 `chat-end_已处理.signal`，wait_file 白名单已兼容）
- **用 `node temp-scripts/wait_file.js` 即可**：脚本就位时**默认自动 ack**（目标 .signal 直接 ack；目标 .md 自动 ack 同名 .signal）并**写入操作日志留痕**（`ACK xxx.signal -> xxx.signal_acked`），零手工——**不要再手写 rename，手动 rename 是留痕黑洞**
- **🔒 禁止 bash mv 手动 ack**：读对方 .md 后**必须用 wait_file.js 等/ack**，**禁止 `bash mv xxx.signal xxx.signal_acked`** 手动改信号——手动 mv 绕过 ackLog 留痕，审计无法归因"谁在何时 ack"。
- **收尾自检**：总结陈词/终结前 `ls` 任务目录，**对方 `.signal` 残留即补 ack**

---

## 流程（7步，裁判可选）

> ⚠️ **等文件禁止 bash 长等**（heredoc 挂死教训）：不要用 `bash sleep 90` 盲等，更不要用 `bash heredoc + node` 等文件（heredoc 出错会永久挂起 + 心跳断 + 项目卡死）。**违反此条 = 你自己和整个项目一起卡死，且没人能自动救你。**
> **优先用 `wait_file.js`**（自动续心跳 + 自动 ack + 失联检测，见下方）；手写内联轮询仅当 wait_file 不满足需求时用（下方骨架即 fallback）。

### 等文件（wait_file.js 优先，内联仅 fallback）

辩论子回合之间不需要等公告牌，只需要等搭档的下一份文件。fallback 骨架如下（仅当 wait_file 不满足需求时手写）：

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
  // 辩论模式超时不写 _deadlock.md（裁判是天然兜底，不需要 monitor 救场）——只记轮询日志，自己不卡等
  if (Date.now() > _deadline) {
    var _dlDir = "../world/{{ROLE_NAME}}_talk";
    _fs.default.mkdirSync(_dlDir, { recursive: true });
    var _logName = _dlDir.split("/").pop().replace("_talk", "");
    _fs.default.appendFileSync(_dlDir + "/" + _logName + "_轮询日志.md", "[" + new Date().toISOString().substring(11,19) + "] 等文件超时（辩论模式：不写_deadlock，裁判兜底）\n", "utf8");
    break;
  }
  await new Promise(function(r) { setTimeout(r, 500); });
}
```

### 辩论终结（谁写 debate-end，必读）

> **终结信号 `debate-end.md` 由"提议终结的一方"负责落笔**——你口头提议终结/喊停（如"T3 提议终结"）后，**必须自己创建 `debate-end.md` 到任务目录**（不能只口头提议等对方响应——对方 wait_file 在等它，你不落笔 = 对方干等成僵局）。
> 双方都在等对方先落笔时：**谁先提出终结，谁就写**；都不提 → 由裁判/自己判断"辩够了"就主动写。
> 写完 `debate-end.md` 后：自己写总结陈词 → 发信号 → 等对方总结 → 裁判裁决。

### 双文件轮询（等搭档文件 + 辩论终结信号）

自由辩论轮内、以及等待立论/找茬时，都需要**同时检测 `debate-end.md`**——否则对方写了终结信号，你要等 20 分钟超时才能发现。
**优先用 `wait_file.js --any`（任一目标就位即返回）**：`node temp-scripts/wait_file.js <搭档文件.signal> <debate-end.md> --any`（**`<搭档文件.signal>` 为占位符，复制后必须替换**）——**必须带 `--any`**（不带 = AND 语义两个都等，终结没有时会卡死）。手写内联循环如下（
谁先出现就 break）：

```js
// 同时等搭档文件与辩论终结信号——哪个先出现就 break。替换 YOUR_FILE_PATH 与 debate-end.md 为任务目录下完整路径
var _deadline = Date.now() + 20 * 60 * 1000;
var _hbCtr = 0;
while (true) {
  var _fs = await import("node:fs");
  if (_fs.default.existsSync("YOUR_FILE_PATH")) break;
  if (_fs.default.existsSync("debate-end.md")) break;
  // 续心跳（防 monitor 2min 误判 DEAD）：每 60 次（约30s）写一次
  if (++_hbCtr % 60 === 0) {
    var _hbPath = "../world/{{ROLE_NAME}}_talk/_heartbeat.txt";
    _fs.default.mkdirSync(_hbPath.substring(0, _hbPath.lastIndexOf("/")), { recursive: true });
    _fs.default.writeFileSync(_hbPath, String(Date.now()), "utf8");
  }
  // 辩论超时不写 _deadlock——裁判是天然兜底，只记日志后 break
  if (Date.now() > _deadline) {
    var _dlDir = "../world/{{ROLE_NAME}}_talk";
    _fs.default.mkdirSync(_dlDir, { recursive: true });
    var _logName = _dlDir.split("/").pop().replace("_talk", "");
    _fs.default.appendFileSync(_dlDir + "/" + _logName + "_轮询日志.md", "[" + new Date().toISOString().substring(11,19) + "] 等文件超时（辩论模式：不写_deadlock，裁判兜底）\n", "utf8");
    break;
  }
  await new Promise(function(r) { setTimeout(r, 500); });
}
// 出了循环后，用 fs.existsSync 判断触发原因：debate-end.md 存在 = 对方喊停 → 直接跳第6步；否则读搭档文件继续
```

> ⚠️ **检测到 .signal 后**：读对应的 .md 完整文件，然后 **rename 后缀替换**：`xxx.md.signal` → `xxx.md.signal_acked`（**去掉 `.signal` 尾缀、替换成 `_acked`，原 `.signal` 必须消失；禁止追加式改名 `xxx.md.signal.signal_acked`**）防止下轮误判。
> 不要真的删除（见角色模板铁律 2：.signal 读完改名归档，不删除）。
>
> ⚠️ **超时行为铁律**：等文件超时 ≠ 直接判搭档掉线——先复查目标路径是否其实已就位，再查搭档心跳（活着=还在写，继续等）；确认失联才按掉线处理。不要卡在中间步骤不动——能独立完成的继续做（如自己的立论、找茬、总结），依赖搭档的步骤跳过并在产出中标注「搭档未提交」。不管缺了什么，最终都要走到总结陈词并签字。裁判永远能基于已有材料给结论。


### 信号文件规则

**写文件方**：写完辩论文件后，立即在同目录写同名的 `.signal` 文件（如 `debate_01_pro-stmt.md.signal`），内容为时间戳。

> 🔴 **信号原子两步**：写 .md 与写 .signal 是**原子两步**——写完 .md 的**下一条命令必须是发信号**（`echo 时间戳 > 同名.signal`），中间**不得插入任何等待/检查/其他调用**。**无例外**：立论/找茬/自由辩论/总结/收尾类所有文件都必须发。
> 写完进入 wait_file 前先 `ls` 确认我方 .signal 已发（未发先补）。`wait_file.js` 已内置检测：发现我方最近 5 分钟产出缺 .signal → 报错退出（exit 5）——**漏发从静默变失败**。

**等文件方**：轮询 `.signal` 信号文件（0.5s 间隔），检测到后读完整文件，然后 **rename 后缀替换**：`xxx.md.signal` → `xxx.md.signal_acked`（原 `.signal` 消失，禁止追加式 `xxx.md.signal.signal_acked`）防止下轮误判（不要真的删除——见角色模板铁律 2：.signal 读完改名归档）。
**用 `wait_file.js`（默认自动 ack）**：脚本检测到目标就位后自动 rename 替换成 `_acked`，不用手写改名。

**辩论终结信号**：`debate-end.md` 本身就是信号文件，不需要额外的 `.signal`。

### 第1步：pro-stmt

正方写 `../world/<任务目录>/debate_01_pro-stmt.md`

内容要求：
- 清晰陈述你的立场
- 列出核心论点（至少3条）
- 每条论点附支撑论据（事实、逻辑、数据）

写完用上面的内联轮询等con-stmt——替换 YOUR_FILE_PATH 为目标 `.signal` 文件路径（如 `debate_02_con-stmt.md.signal`）。⚠️ 用**双文件轮询**（同时检测 `debate-end.md`）：反方可能直接写终结信号。检测到信号后读对应的 `.md` 内容。

### 第2步：con-stmt

反方读pro-stmt后，写 `../world/<任务目录>/debate_02_con-stmt.md`

内容要求同上——站在你的对立立场，独立立论，不反驳正方（反驳在第3步）。

con-stmt和找茬是连续步骤——直接进入第3步写con-attack，不需要等任何人。

### 第3步：con-attack

反方读pro-stmt，写 `../world/<任务目录>/debate_03_con-attack.md`

逐条检视pro-stmt——找错误、找盲区、质疑前提：

| 能找到什么 | 怎么做 |
|------|------|
| 事实错误 | 引用正方原文，指出错误，附证据 |
| 逻辑漏洞 | 引用正方原文，指出推理链断了哪一环 |
| 盲区 | "你说了A、B、C，但完全没提 ___ ——这个重要场景漏掉了" |
| 前提存疑 | "你的推理对，但前提'用户会主动操作'——成立吗？" |
| 找不到任何问题 | 写"逐条核验后未发现错误，跳过找茬，直接进入自由辩论" |

找茬不是找碴——没错误就说没错误，不硬编。

> 🔑 **引用纪律**：引用公告牌/AGENTS.md/对方原文**必须逐字准确**——解释性内容放引用之外，**不得用括号（…）在引用内改写原文**。保护协议文本权威性，双方公平。

写完用**双文件轮询**等pro-attack——替换 YOUR_FILE_PATH 为目标 `.signal` 文件路径。检测到信号后读 `.md` 内容。**同时检测 `debate-end.md`**：如果搭档写了终结信号，立刻跳到第6步（这就是上面双文件轮询的用途）。

### 第4步：pro-attack

正方读con-stmt，写 `../world/<任务目录>/debate_04_pro-attack.md`

规则同上——对着con-stmt逐条找。

**🔑 自由辩论是正方先手发动——正方直接独立写 T1，勿等任何人**（**先手 = 独立动作不是等待动作**）。

### 第5步：自由辩论

公告牌**可选**指定 N 轮作上限（如 "辩论 3 轮"）；**不指定 = 自由发挥**——任一方觉得争论已充分，写 `debate-end.md` 即收敛（下方"提前终结"）。

正方先手，写 `../world/<任务目录>/debate_05_T1_pro.md` → 反方 poll 到后写 `../world/<任务目录>/debate_05_T1_con.md` → 回合交替。

⚠️ **自由辩论轮内等对方文件时，一律用上面的双文件轮询**（同时检测 `debate-end.md`）——任一方写终结信号，另一方应立即感知并跳第6步，而不是等 20 分钟超时。

每轮你必须：
- 回应对方上一轮的论点（不能自说自话）
- 推进辩护或反驳深度
- 引入新证据可以，但不能重复前面说过的

提前终结：任一方觉得争论已充分，写 `../world/<任务目录>/debate-end.md`，内容写"辩论终结：{理由}"。对方 poll 到后直接跳到第6步。**自由辩论不设固定轮数**（公告牌未写轮数时）——终结信号是收敛机制；公告牌写了上限时，轮数满了自动进第6步。

> 🔑 **收敛引导（不强制轮数）**：自由发挥 ≠ 无限拖延——**连续 2-3 轮双方都没提出新论点/新证据**（只是在重复或换说法）→ **主动写 `debate-end.md` 收敛**（理由写"论点已充分交换，无新内容"）。终结信号是你自己的判断，不是系统强制；只是提醒你"争论已充分"该收口了。若你认为对方还有新料可挖、或立场有实质分歧未展开 → 继续辩，不受此限。

### 第6步：总结陈词

正方写 `../world/<任务目录>/debate_06_pro-summary.md` → 反方写 `../world/<任务目录>/debate_06_con-summary.md`

总结要求（每人）：
- 重申核心立场（1句）
- 辩论中你最有力的论点（1-2条）
- 对方哪条反驳你认可、哪条你坚持反对

写完总结 → **直接 `node _sign.js N` 签字**——签字 = 确认你在这轮的参与部分完成，**独立于裁判结论交付**（产出归裁判，裁判独立 deliver）。**不要等裁判结论 .ready**——那是多余等待（monitor 看产出判 DONE，不看签字时机）。裁判结论交付是产出路径的事，见下方第 7 步。

### 第7步：裁判结论（有裁判的话）

裁判等正反双方交总结陈词。**优先用 `wait_file.js` 多目标**（不带 `--any` = 双方都就位才返回）：`node temp-scripts/wait_file.js <任务目录>/debate_06_pro-summary.md <任务目录>/debate_06_con-summary.md --hb <心跳> --timeout 20`（**`<任务目录>`/`
<心跳>` 为占位符，复制后必须替换**）
——默认自动 ack 同名 .signal（零手工）。

> 🔴 **读方必 ack（全角色通用，裁判也是读方）**：等 `.md` 就位后，**必须把对应 `.md.signal` rename 成 `.md.signal_acked`**（`debate_06_pro-summary.md.signal` → `.signal_acked`，反方同理）——你读了对方的 `.md`，就有 ack 其 `.signal` 的义务，防止残留信号下轮误判。
> **用 `node temp-scripts/wait_file.js`（默认自动 ack，目标为 .md 时自动 ack 同名 .signal，零手工）**；内联轮询仅 fallback（手写时 break 后手动 rename）。

> 🔑 **别手写等文件脚本**：双目标 AND 用 wait_file.js 多目标即可，内联轮询仅当 wait_file 不满足需求时手写。

```js
var _deadline = Date.now() + 20 * 60 * 1000;
var _hbCtr = 0;
while (true) {
  var _fs = await import("node:fs");
  if (_fs.default.existsSync("YOUR_TASK_DIR/debate_06_pro-summary.md") && _fs.default.existsSync("YOUR_TASK_DIR/debate_06_con-summary.md")) break;
  // 续心跳（防 monitor 2min 误判 DEAD）：每 60 次（约30s）写一次
  if (++_hbCtr % 60 === 0) {
    var _hbPath = "../world/{{ROLE_NAME}}_talk/_heartbeat.txt";
    _fs.default.mkdirSync(_hbPath.substring(0, _hbPath.lastIndexOf("/")), { recursive: true });
    _fs.default.writeFileSync(_hbPath, String(Date.now()), "utf8");
  }
  if (Date.now() > _deadline) break;
  await new Promise(function(r) { setTimeout(r, 500); });
}
// 读完即 ack：下方两行把两个总结 .signal rename 成 _acked（读了就必须处理信号，try/catch 防文件不存在）
// wait_file.js 默认自动 ack；手写内联轮询时执行：
try { _fs.default.renameSync("YOUR_TASK_DIR/debate_06_pro-summary.md.signal", "YOUR_TASK_DIR/debate_06_pro-summary.md.signal_acked"); } catch(_e) {}
try { _fs.default.renameSync("YOUR_TASK_DIR/debate_06_con-summary.md.signal", "YOUR_TASK_DIR/debate_06_con-summary.md.signal_acked"); } catch(_e) {}
```

如果等到了双方总结（正常情况）：读全程辩论记录（立论→找茬→自由辩论→总结），写裁判结论。

如果超时了（且复查确认对方未提交）：读当前已存在的所有辩论文件，基于现有材料写结论。结论中必须注明「⚠️ 辩论因搭档超时未完成，以下结论仅基于已提交材料」。即使只有一方立论，也要给出裁判意见——不能因为辩论不完整就当没发生。

> 🔑 **裁判掉线接手（正反方视角）**：正反方**签完字后不再等裁判**（签字独立于裁判交付）。裁判掉线由 monitor 兜底（产出卡轮 30 分钟 → WAIT_OVERDUE 报警 + 写 `需人工干预`）。
> **若 monitor/大鱼提示"裁判失联、缺裁判结论"**（心跳 stale 且无新产出，见失联判据）→ ①正方接手交付裁判结论：读全部辩论文件、基于现有材料写 `裁判结论.md`（注明「⚠️ 裁判失联，正方代交付」）→ 写到产出目录 → `node _deliver.js 裁判结论.md <任务目录>`（正反方已签则不需补签）。
> **若公告牌任务描述另有接手方则以公告牌为准**；产出负责人写的是裁判时同样由正方代接（与无裁判场次规则一致）。**注意**：不要凭"等超时"就认定裁判掉线——先查裁判心跳+对讲目录近期文件（活着=还在写结论，等 monitor 判产出）；只有"心跳 stale 且无新文件"才代接。

用 `node _deliver.js 裁判结论.md <任务目录>` 交付到 ../world/output/{公告牌产出路径}/裁判结论.md

裁判结论是文档类产出——先 writeFileSync 写到 `../world/output/` 目录，再 `node _deliver.js 裁判结论.md <任务目录>` 发信号，**然后 `node _sign.js N` 签字**（裁判是活跃角色，monitor 逐角色核对签字，漏签收工审计标红）。

结论要求：
- 双方核心论点摘要（正反各1句；缺一方则注明该方未提交）
- **逐条核验**：对双方**关键论点**逐条判定「成立 / 不成立 / 部分成立」+ 证据引用（指向辩论记录原文/事实）——不笼统说"谁更充分"，而是逐条给依据；无法核验的论点标注「存疑」。
- 哪方论证更充分？为什么？（基于逐条核验结果，不凭个人偏好）
- 最终建议或结论
- 辩论完整性说明（双方均提交 / 缺XX方总结 / 仅XX方立论）

没有裁判？跳过这一步。正反双方交总结后：
- 公告牌「产出负责人」若指定了正/反方之一 → 该角色整理产出并交付（文档类先 `fs.writeFileSync` 到 output/ 再 `node _deliver.js 文件名 任务目录`；代码类源文件原地改完直接 `node _deliver.js 文件名 任务目录 源路径`），然后双方 `node _sign.js N`
- 若产出负责人写的是裁判（本场无裁判）→ 由**正方**接手交付（公告牌任务描述中另有明确接手方则以其为准）

---

## 语言规则

- 辩论内容**默认中文**——与搭档/公告牌语言一致
- 文件命名保持中文（方便人类浏览）
- 你已精通中英双语，辩论质量不受语言影响

---

## 签完字之后

读公告牌里你的「本轮后」字段——死循环 poll，永不主动下线：

- **本轮后：休眠** → 写流水账 → 创建休眠文件 → poll 短命令轮询（每3s，回合接力）——循环骨架见 `_workflow.md`「休眠」节

- **本轮后：待命** → poll 短命令 + --standby 轮询（每15s，回合接力）——循环骨架见 `_startup_steps.md`

- **本轮后：活跃** → poll 下一轮公告牌，正常走

---

## 辩论铁律

1. 辩论是对话——每篇写之前先读对方上一篇，针对性地回，不自说自话
2. 找茬找不到问题就坦诚说明，不硬编
3. 裁判不偏袒——依据辩论记录说话，不凭个人偏好
4. 文件写入默认用原生 write_file 直写（已原子写，无 .tmp 残留）；仅大文件/非原子工具才走 .tmp→rename（与 AGENTS 铁律 4 一致）
5. 签字用 `node _sign.js N`，交付用 `node _deliver.js <文件名> <任务目录>`（独立脚本优先）
6. 禁止手写 sign/deliver 逻辑——独立脚本优先，内联仅 fallback（见 `_tool_guide.md`）
