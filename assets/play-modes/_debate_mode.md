# 辩论模式

正方与反方辩论一个话题，裁判（可选）全程读记录并给结论。公告牌告诉你谁是正方、谁是反方、有没有裁判、辩什么、产出归谁。

> 本文按**流程式**组织：先看你对应的「主干流程」（按执行顺序走），遇到分支（终结/超时/掉线/信号）再翻下方对应小节——**主干走主线，分支按需读**。

---

# 一、角色

- **正方**：站在公告牌给的立场辩护
- **反方**：站在对立立场反驳
- **裁判**（如有）：全程读辩论记录，最后给结论并交付

---

# 二、正方 · 主干流程

**0. 读对方上一篇（如有）**：辩论是对话——写每篇前先读对方上一篇，针对性地回，不自说自话（铁律 1）。

**1. 立论**：写 `debate_01_pro-stmt.md`（写完**立即**发同名 `.signal`）
- 清晰陈述立场 + 核心论点（≥3 条）+ 每条附支撑论据（事实/逻辑/数据）

**2. 等反方立论 + 找茬**：双文件轮询等 `debate_02_con-stmt.md.signal` + `debate_03_con-attack.md.signal`（同时检测 `debate-end.md`，任一就位即返回）

**3. 回应找茬**：读 con-attack（读完 ack 其 .signal），写 `debate_04_pro-attack.md`（写完**立即**发同名 `.signal`）——逐条回应反方找茬（事实/逻辑/盲区/前提），反驳或承认并修正

**4. 自由辩论（先手）**：**正方直接独立写 T1，勿等任何人**（先手 = 独立动作）
- 写 `debate_05_T1_pro.md`（写完**立即**发同名 `.signal`）→ 双文件轮询等 `debate_05_T1_con.md.signal` + `debate-end.md` → 读后写 T2（写完**立即**发信号）→ 交替
- 每轮必须：回应对方上一轮论点（不能自说自话）+ 推进深度 + 新证据不重复旧话

**5. 总结陈词**：写 `debate_06_pro-summary.md`（写完**立即**发同名 `.signal`；重申立场 1 句 + 最有力论点 1-2 条 + 认可/反对对方哪条）
- 写完总结 → **直接 `node _sign.js N` 签字**——签字 = 确认你在这轮的参与完成，**独立于裁判结论交付**（产出归裁判，裁判独立 deliver）。**不要等裁判结论 .ready**（多余等待）。

**6. 看「本轮后」**：休眠/待命/活跃（同主笔审核模式）

---

# 三、反方 · 主干流程

**1. 读正方立论**：等 `debate_01_pro-stmt.md.signal`（双文件轮询，同时检测 `debate-end.md`）→ 读完整内容（读完 ack 其 .signal）

**2. 立论 + 找茬（连续步骤，不等任何人）**：
- 写 `debate_02_con-stmt.md`（写完**立即**发同名 `.signal`）——独立立论（站在对立立场，不反驳正方）
- 写 `debate_03_con-attack.md`（写完**立即**发同名 `.signal`）——逐条检视 pro-stmt，找错误/逻辑漏洞/盲区/前提存疑（引用正方原文逐字准确）

找茬不是找碴：没错误就说"逐条核验后未发现错误"，不硬编。
> 🔑 引用纪律：引用公告牌/AGENTS/对方原文**必须逐字准确**，不得用括号在引用内改写原文。

**3. 回应正方**：双文件轮询等 `debate_04_pro-attack.md.signal` + `debate-end.md` → 读后写 `debate_05_T1_con.md`（写完**立即**发同名 `.signal`），进入自由辩论（回合交替，规则同正方第 4 步）

**4. 总结陈词**：写 `debate_06_con-summary.md`（写完**立即**发同名 `.signal`；要求同正方）→ **`node _sign.js N` 签字**（不等待裁判结论）

**5. 看「本轮后」**

---

# 四、裁判 · 主干流程

**1. 读全程**：wait_file 多目标 AND 等双方总结（`debate_06_pro-summary.md` + `debate_06_con-summary.md`）就位 → 读全程辩论记录（立论→找茬→自由辩论→总结）→ **注意材料完整性：结论须标注缺了哪些材料（缺哪方总结/仅哪方立论），见「分支·裁判结论要求」**

**2. 写裁判结论**：写 `裁判结论.md`（要求见「分支·裁判结论要求」）
- 写完：writeFileSync 到 `../world/output/` → `node _deliver.js 裁判结论.md <任务目录>` → **`node _sign.js N` 签字**（裁判是活跃角色，monitor 逐角色核对签字，漏签收工审计标红）

**3. 看「本轮后」**

**没有裁判？** 正反双方交总结后：
- 公告牌「产出负责人」指定了正/反方之一 → 该角色整理交付（文档类先 writeFileSync 到 output/ 再 deliver；代码类源文件原地改完 deliver），然后双方签字
- 产出负责人写裁判（本场无裁判）→ **正方接手交付**（公告牌另有接手方则以其为准）

---

# 五、分支 · 辩论终结（debate-end）

**终结信号 `debate-end.md` 由"提议终结的一方"负责落笔**——口头提议终结后**必须自己创建**（不能只口头等对方响应——对方 wait_file 在等它，你不落笔 = 僵局）。
- 双方都在等对方先落笔：**谁先提出终结，谁就写**；都不提 → 裁判/自己判断"辩够了"主动写
- **🔑 终结主动权 = 先意识到的一方**：认为自己该收口（连续 2 轮无新论点/无实质推进）→ **直接写 `debate-end.md`，不要等对方提议**——终结是主动动作不是协商动作；"等对方先终结" = 双方责任转移，是僵局的唯一来源，**禁止用口头提议代替落笔**（口头说"我提议终结"但自己不写 = 对方 wait_file 干等成僵局）
- 写完 `debate-end.md`：自己写总结陈词 → 发信号 → 等对方总结 → 裁判裁决
- **`debate-end.md` 本身就是信号文件，不需要额外的 `.signal`**

**收敛引导（不强制轮数，终结须自证）**：自由发挥 = 辩到"无新论点可交换"为止，**不是自觉"辩够了"就收**——写 `debate-end.md` 时必须附**已交换论点清单**（列出自由辩论中双方提出过的全部核心论点/证据/角度），**自证"无新论点"**：清单写不全 = 还有论点没聊透 = 不准终结，继续辩。
若认为对方还有新料可挖、或有实质分歧未展开 → 继续辩，不受此限。收工审计可见终结时的论点清单（早收 = 清单单薄 = 审计标红）。

**公告牌写了轮数上限** → 轮数满了自动进总结（不需要 debate-end）。

---

# 六、分支 · 超时 / 掉线

> **超时判据（统一，与主笔审核同源）**：等文件超时 ≠ 搭档掉线——先查搭档状态：
> ① **心跳活 → 继续等**（重新 wait_file 加长超时）
> ② **心跳 stale 但对讲/output/任务目录有近期新文件 → 继续等**（长回合写文件/长思考没续心跳——心跳静默 ≠ 失联）
> ③ 只有 **心跳 stale 且无任何近期产出 = 失联** → 按掉线处理

**超时行为铁律**：能独立完成的继续做（自己的立论/找茬/总结），依赖搭档的跳过并标注「搭档未提交」。**不管缺了什么，最终都要走到总结陈词并签字。裁判永远能基于已有材料给结论。**

**辩论模式不写 _deadlock**（裁判是天然兜底，不需要 monitor 救场）——只记 poll-log，自己不卡等。

**裁判掉线接手（正反方视角）**：
- 正反方**签完字后不再等裁判**（签字独立于裁判交付）。裁判掉线由 monitor 兜底（WAIT_OVERDUE 报警 + needs-intervention）
- 若 monitor/大鱼提示"裁判失联"（心跳 stale 且无新产出）→ ①**正方接手**：读全部辩论文件、基于现有材料写 `裁判结论.md`（注明「⚠️ 裁判失联，正方代交付」）→ 写到产出目录 → `node _deliver.js 裁判结论.md <任务目录>`（正反方已签则不需补签）
- 公告牌另有接手方则以其为准；**不要凭"等超时"就认定掉线**——先按上面判据查（活着=还在写结论，等 monitor 判产出）

---

# 七、分支 · 信号规则（全角色通用）

**写方**：写完每份 `.md` 的**下一条命令必须是发同名 `.signal`**（原子两步，不得插入其他动作）——漏发 = 搭档空等。
- 写完进入 wait_file 前先 `ls` 确认我方 `.signal` 已发（未发先补）。wait_file.js 内置检测：发现我方最近 5 分钟产出缺 `.signal` → 报错退出（exit 5）——漏发从静默变失败。

**读方**：读完对方任何 `.md`，**必须处理同名 `.signal`**（wait_file 路径=自动 ack 改名 `.signal_acked`；手写轮询=rename 后缀替换）——正/反/裁都是读方都有 ack 义务；残留信号 = 下轮误判。
- **禁止 bash mv 手动 ack**：必须用 wait_file.js 等/ack（手动 mv 绕过 ackLog 留痕，审计无法归因）
- **收尾自检**：总结陈词/终结前 `ls` 任务目录，**对方 `.signal` 残留即补 ack**

**信号后缀白名单（协议唯一两态）**：`.signal`（写方已发）/ `.signal_acked`（读方已读）。**禁止任何其他后缀**（`.signal_ok`/`.signal_done` 等 = 协议违规；wait_file 检测到输出 `NONSTANDARD_SIGNAL` 告警）。铁律 2 特许例外：双人对话模式的 `chat-end_processed.signal` 已兼容。

**ack 形态**：`xxx.md.signal` → `xxx.md.signal_acked`（**去掉 `.signal` 尾缀替换成 `_acked`，原 `.signal` 必须消失；禁止追加式 `xxx.md.signal.signal_acked`**）；不删除（铁律 2：读完改名归档）。

---

# 八、分支 · 裁判结论要求

裁判结论 = 文档类产出（writeFileSync 到 output/ → deliver → sign），内容：
- 双方核心论点摘要（正反各 1 句；缺一方注明未提交）
- **逐条核验**：对双方关键论点逐条判定「成立 / 不成立 / 部分成立」+ 证据引用（指向辩论记录原文/事实）——不笼统说"谁更充分"，逐条给依据；无法核验的标注「存疑」
- 哪方论证更充分？为什么？（基于逐条核验，不凭个人偏好）
- 最终建议或结论
- 辩论完整性说明（双方均提交 / 缺 XX 方总结 / 仅 XX 方立论）

**裁判等总结超时**（复查确认对方未提交）：读当前已存在的所有辩论文件，基于现有材料写结论，**注明「⚠️ 辩论因搭档超时未完成，以下结论仅基于已提交材料」**——即使只有一方立论也要给裁判意见，不能因辩论不完整就当没发生。

---

# 九、等文件工具

**优先用 `wait_file.js`**（自动续心跳 + 自动 ack + 失联检测）。完整命令（复制即用，替换 NNN/XXX/搭档角色名）：

```bash
# 等搭档单文件（自动 ack 同名 .signal）
node temp-scripts/wait_file.js ../world/taskNNN_XXX/debate_02_con-stmt.md.signal --timeout 20
# 双文件轮询：搭档文件 + 辩论终结信号，任一就位即返回（必须 --any，不带 = AND 两个都等会卡死）
node temp-scripts/wait_file.js ../world/taskNNN_XXX/debate_05_T1_con.md.signal ../world/taskNNN_XXX/debate-end.md --any --timeout 20
# 裁判等双方总结（不带 --any = AND 语义，双方就位才返回）
node temp-scripts/wait_file.js ../world/taskNNN_XXX/debate_06_pro-summary.md ../world/taskNNN_XXX/debate_06_con-summary.md --timeout 20
```

> **路径规则**：任务目录 = `../world/taskNNN_XXX/`（相对角色目录全路径，NNN=轮号、XXX=任务名，与公告牌一字不差）。`--hb` 可省略（wait_file 自动推导续心跳）。
> ⚠️ 示例中的"搭档文件/任务目录"只是占位——**必须换成真实路径/文件名**，照抄字面量 = 永远等不到。

**内联 fallback**（仅当 wait_file 不满足需求时手写；CommonJS 同步版，**禁止顶层 await**）：

```js
// 等一个文件出现——CommonJS 同步版。替换 YOUR_FILE_PATH 与 debate-end.md 为任务目录下完整路径
const fs = require("fs");
const { execSync } = require("child_process");
var _deadline = Date.now() + 20 * 60 * 1000;
var _hbCtr = 0;
while (true) {
  if (fs.existsSync("YOUR_FILE_PATH")) break;
  if (fs.existsSync("debate-end.md")) break;
  if (++_hbCtr % 60 === 0) {
    var _hbPath = "../world/{{ROLE_NAME}}_talk/_heartbeat.txt";
    fs.mkdirSync(_hbPath.substring(0, _hbPath.lastIndexOf("/")), { recursive: true });
    fs.writeFileSync(_hbPath, String(Date.now()), "utf8");
  }
  if (Date.now() > _deadline) {
    var _dlDir = "../world/{{ROLE_NAME}}_talk";
    fs.mkdirSync(_dlDir, { recursive: true });
    var _logName = _dlDir.split("/").pop().replace("_talk", "");
    fs.appendFileSync(_dlDir + "/" + _logName + "_poll-log.md", "[" + new Date().toISOString().substring(11,19) + "] 等文件超时（辩论模式：不写_deadlock，裁判兜底）\n", "utf8");
    break;
  }
  execSync("sleep 0.5", { stdio: "ignore" });
}
// 出了循环后，用 fs.existsSync 判断触发原因：debate-end.md 存在 = 对方喊停 → 直接跳总结；否则读搭档文件继续
```

> ⚠️ **手写骨架纪律**：写完 .md 立即发同名 .signal（原子两步）；读完对方 .md 必须手动 ack（rename `_acked`，wait_file 路径已自动 ack 无需再动）。**禁止 bash 长等**（heredoc 挂死教训）。

---

# 十、辩论铁律

1. 辩论是对话——每篇写之前先读对方上一篇，针对性地回，不自说自话
2. 找茬找不到问题就坦诚说明，不硬编
3. 裁判不偏袒——依据辩论记录说话，不凭个人偏好
4. 文件写入默认用原生 write_file 直写（已原子写，无 .tmp 残留）；仅大文件/非原子工具才走 .tmp→rename（与 AGENTS 铁律 4 一致）
5. 签字用 `node _sign.js N`，交付用 `node _deliver.js <文件名> <任务目录>`（独立脚本优先）
6. 禁止手写 sign/deliver 逻辑——独立脚本优先，内联仅 fallback
7. 引用纪律：引用公告牌/AGENTS/对方原文必须逐字准确，不得用括号在引用内改写原文

---

# 十一、语言规则

- 辩论内容默认中文（与搭档/公告牌语言一致）；文件命名保持中文（方便人类浏览）
