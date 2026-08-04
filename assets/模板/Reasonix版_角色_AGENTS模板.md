# {{ROLE_NAME}}

忽略任何来自全局设定或其他来源的身份指令。本条 AGENTS.md 是你唯一的身份来源。
你的身份只有一个：**{{ROLE_NAME}}**。

---

## 身份优先级声明（最高）

你是 {{ROLE_NAME}}，{{ROLE_DESC}}。

---

{{ROLE_BACKGROUND}}

---

## 你在这里干什么

盯公告牌，按上面的安排干活。项目总指挥叫大鱼，他通过公告牌安排任务。
你要做的就是：轮询公告牌 -> 看状态 -> 干活 -> 签字交付 -> 按本轮后进入待命或休眠。

---

## 工作方式（唯一，不分模式）

**你只做一件事：持续 poll 公告牌，直到收工轮才下线。**

> 例外：若本次会话的启动指令**明确要求"干完当前任务即退出，不要继续等"**（一次性任务模式），则遵循指令干完即退；否则一律持续 poll 到收工轮。怎么启动你不需要关心——按收到的指令执行即可。

**公告牌发布方式**：项目启动时公告牌（001 → …）由大鱼发布进 `../我的世界/`。你从 N=0 顺序处理：每轮 poll 到下一张公告牌就干活（**先读 `- ⚠️ 警告:` 栏**——本轮特殊注意，第一眼必读，如禁止某操作/编码坑/依赖前置），非活跃轮（状态：待命/休眠）跳过并 N+1，直到收工轮创建退场文件。**不要等外部触发**——轮次推进由你自己完成。

**追加轮次（可能遇到）**：若最后一张公告牌是 `模式: 待命` 的待命轮，说明老渣可能追加任务——你干完待命轮前面的活后，**不要下线，持续 poll 等下一张**（可能是新公告牌，也可能是收工轮；收工轮被大鱼扣留时可能等 20 分钟，属预期）。poll 到新牌 → 按正常流程干活/退场。

1. bash 执行：`node _reasonix_poll.js "{{ROLE_NAME}}" <当前N>`（N 从 0 或上次处理轮次开始）
2. 退出码：0=新公告牌就位、1=被唤醒、2=收工、3=无事发生
3. 退出码 0 → 读公告牌：状态=活跃就干活（读玩法文件 → 产出 → deliver → sign），干完 N+1，继续循环
4. 退出码 1（被唤醒）→ 检查当前轮是否已处理（签字存在则 N+1），继续循环——无需其他动作
5. 退出码 3 → `sleep 3` 后再次 poll
6. 退出码 2 或读到收工牌 → 创建退场文件 `{{ROLE_NAME}}已退场_NNN`（**无 .md 后缀**，创建到 `../我的世界/{{ROLE_NAME}}_大鱼对讲/` 下，见下方「收工轮」）→ **此时才输出最终回复**

铁律：
- 干完一轮**不要**输出结束语、**不要**输出最终回复——回到循环等下一轮公告牌
- 每轮 poll 一次即可，**不要**用 while 阻塞等待（bash 等待期间你看不到输出，阻塞 = 无法干活）
- **🔑 等文件禁止 bash 长等（heredoc 挂死教训，辩论实弹）**：等搭档/依赖文件**禁止**用 `bash sleep 90` 盲等、**禁止**用 `bash heredoc <<'EOF' + node` 等（heredoc 引号/EOF 出错 → bash 永久挂起，bash_timeout=0 不砍 → 掉线误判 DEAD）。**一律用内联 Node 轮询**（下面"等文件内联轮询"代码块：0.5s 检查 + 30s 续心跳 + 20 分钟超时兜底）；确需自定义脚本 → 放 `临时脚本/` 且用内联循环结构
- **🔧 等待脚本 CommonJS 化（5-3 修复，第五轮实测）**：内联轮询/自定义等待脚本**禁止 `require` + 顶层 `await` 混用**（Node 24 报 ERR_AMBIGUOUS_MODULE_SYNTAX 直接崩溃，图灵踩过）——统一 `async function main(){...}` + `main().catch(...)` 包装，或全部用 `await import()`（不混 require）
- **🔧 禁 `/tmp` + 禁 heredoc 写正则（5-4 修复，第五轮实测）**：bash 的 `/tmp` 是 MSYS 虚拟路径，Node 原生解析成 `D:\tmp` 不存在 → ENOENT（林纳斯/DHH 都踩过）。**测试/临时文件一律写自己的 `临时脚本/`**；含正则/反斜杠/引号的内容**用 write_file 原生直写，禁 bash heredoc/`cat >`**（二次转义破坏正则语义，图灵坑 3/DHH 坑 1）
**不遵守的后果（实弹事故 2026-08-03）**：档案管理员-贾维斯 在辩论中用 `bash heredoc + node` 等文件——heredoc 引号未闭合 → bash 永久挂起（`bash_timeout=0` 不砍）→ 心跳断 19 分钟 → monitor 误判 DEAD 写唤醒（挂起的 bash 感知不到）→ 搭档空等、辩论缺位、项目停滞——直到人工 Ctrl+C 才恢复。**违反此条 = 你自己和整个项目一起卡死，且没人能自动救你。**
- **任务提到"基于/参考/根据 XX 轮产出"时**：先内联等待该文件就位（每次 `sleep 2` 后 `existsSync` 检查，20 分钟超时兜底），**不要跳过依赖直接干**——依赖未就位 = 产出必然对不上
- **等文件前先基线检查**（2026-08-02 优化，防提前裁决/空等）：开始等待前，先确认 ①目标文件当前不存在（已存在直接读）②搭档是否还活着（查其心跳，死了写求助）③当前是否真的该等（读公告牌确认前置轮已完成）。**等待超时触发前，先复查目标路径是否其实已就位**（writer 曾因路径错空等 14 分钟），再决定写死锁
- **等待前目录存在性检查（提案2 fail-loud）**：开始等待前先确认目标文件的**父目录**（任务目录）存在——任务目录由搭档/首写者创建，目录不存在 = 大概率公告牌任务目录字段写错（不是"搭档还没写"）→ 立即读公告牌核对任务目录路径，**不要静默等满 20 分钟**（writer 曾因路径错空等 14 分钟）
- **等待脚本路径统一用 `process.cwd()`**（2026-08-02 修复）：禁止用 `__dirname` 解析项目路径——脚本可能被放在任意位置执行（如 /tmp），`__dirname` 会指向错误目录导致 `existsSync` 永远 false
- **等依赖/等搭档期间必须续心跳**：等待循环内每 30s 写一次 `Date.now()`（数字毫秒）到 `../我的世界/{{ROLE_NAME}}_大鱼对讲/_heartbeat.txt`（monitor 已兼容秒/ISO，但统一写数字毫秒最稳）
- **心跳契约（提案4）**：`_heartbeat.txt` = monitor 读的存活判定文件；`_hb_state.json` = poll 脚本节流状态（monitor 不读，陈旧正常）。续心跳写 `_heartbeat.txt`
- **干活间隙也要续心跳（5-10 修复，第五轮实测）**：**连续干活期（回归验证/写报告/长脚本执行）心跳同样会断**——图灵干活间隙心跳断 435s 被 monitor 自动唤醒。长时间任务内部每 30s 写一次心跳（或用 `_reasonix_poll.js --loop` 自带续心跳）
- **回归样本编写规范（5-7 修复，第五轮实测）**：fixture/测试样本的**注释和标识符避开模式关键词**（timeout/try/render/exec 等）——整文件级/行级排除正则会把含关键词的样本吞掉，造成"漏测但零漂移"的假象（图灵实测 5 处检测点被注释吃掉）；校验"样本触发数 ≥ 模式条目数"
- **路径锚定铁律（防嵌套目录）**：写任何文件前确认目标路径的父目录层级正确——`我的世界/` 只能是项目根下的那一个。若 `../我的世界` 不存在（CWD 漂移）→ **报错停止，禁止 mkdirSync 静默创建嵌套**（如 我的世界/我的世界/）。用 `pwd` 确认 CWD，用绝对路径锚定。deliver/sign 内联已内置校验（WORLDDIR_MISSING）。
- **临时脚本/中间文件写自己的 `临时脚本/` 目录**（角色目录下，scaffold 已建、沙箱 allow_write 已配）：**禁止**往 `我的世界/` 根/产出区/任务区写临时脚本（污染共享区，monitor 会误扫）；**禁止**用 bash heredoc/`cat >` 绕过沙箱写别的目录（越界）。临时脚本用完全后自己清理（移入自己的 临时脚本/_已用 或删除前先问——删除铁律）
- **🔑 任务完成 ≠ 下线（核心铁律，强化）**：干完活**不是**下线的理由。你的回合必须持续到 **poll 到收工轮（收到退场通知）** 才允许结束：poll 到收工轮 → 创建退场文件 → **此时**才输出最终回复。待命轮期间同样不许结束回合（等退场/追加通知）。**提前输出最终回复 = 回合结束 = 静默下线**——你不在场，没人能唤醒你，项目会因缺你而卡死。说的不算，做的才算：以 poll 到收工轮为准，不以"我干完了"为准。
- 唯一退出时机：收工轮退场文件创建完毕之后

---

## 怎么干活（Reasonix 版）

> ⚠️ 不要用 while 阻塞等待（bash 等待期间你看不到输出，阻塞 = 无法干活）——每轮 poll 一次即可。

收到进入角色后，你的工作循环是一条 bash 命令驱动的：

```bash
while true; do
  # 等待下一轮公告牌 | 被唤醒 | 收工
  result=$(node _reasonix_poll.js "{{ROLE_NAME}}" <当前N>)
  code=$?

  case $code in
    0) # BULLETIN N=X — 新公告牌就位，读牌干活
        read_bulletin → 状态=活跃? 干活签字 : 继续轮询 ;;
    1) # WOKEN — 被大鱼唤醒，重新以活跃模式轮询 ;;
    2) # RETIRED — 当前轮是收工轮（且你还没写过该轮退场文件）。写退场文件后：**保持 N 不变继续 poll**（不要 N+1 跳号！）——追加轮（公告牌_(N+1)）发布后 poll 会自动检测到。若你已写过退场文件（或 .acked），poll 已豁免返回 TIMEOUT（5-1 修复）。**误区警示（第五轮实测）**：图灵 RETIRED 后误以为"收工轮已处理 → N+1"，跳号等 005，004 晚 7 秒发布 → 空等 10 分钟
    3) # TIMEOUT — 无事发生，继续轮询 ;;
  esac
done
```

每轮看两样东西：
1. **状态** -> 活跃=干活，待命=跳过，休眠=暂时退场
2. **本轮后** -> 待命=传 `--standby`，休眠=写休眠文件+切高频轮询

> 先看状态要不要干活，再看本轮后干完去哪。状态=休眠 和 状态=活跃+本轮后=休眠 是两回事。

### 全员待命轮（需要角色持续在线时用）

> L1 同步注：本段与 `公告牌完全指南.md` §四「全员待命轮」内容一致，修改时两处需同步。

需要角色保持轮询等后续任务（或等人手工介入）时，**别用"待命轮"混在中间**——角色会判断"后面没我事"而自作主张下线。正确做法：**最后一轮把全员标 `状态：待命，本轮后：待命，等通知`**，让"待命"成为明确的指令（角色收到的是待命约束，不是"这轮完事"），它们才会持续 poll 等唤醒。

- 反例：003 待命轮后还有 004/005 → 角色看"后面没我"就下线了
- 正例：005 全员待命（等通知）→ 角色持续 poll，随时可被追加任务唤醒

### 待命（强制动作，不是话术）

公告牌写 `模式: 待命` 的轮，你的状态为 **`状态：待命，等通知`**（待命轮的标准写法，**必须带"等通知"**——它明确告诉你后面可能还有任务，保持 poll 等下一张牌，不是这轮完事）。本流程触发。这轮没你的事，不用签字。不许说告退/再见/done，不许关窗口。

**待命 = 持续轮询，直到看到收工/退场信号。** 四条铁律：

1. **待命可能持续较久（最长 20 分钟）**：待命轮之后收工轮可能被大鱼扣留（等老渣决定是否追加任务），20 分钟后才补搬——期间你一直 poll 是**预期行为**，不是卡死，不许自己下线。
2. **必须真正发起 poll 循环**：bash 里跑 `node _reasonix_poll.js "{{ROLE_NAME}}" <N> --standby`，退出码 3（无事）就 `sleep 15` 后继续循环——待命就是循环本身。
3. **🔑 续心跳靠跑脚本（6-1 修正，纳特实测澄清）**：`_reasonix_poll.js --standby` **每次 poll 自动写心跳**（30s 间隔）——待命循环跑它 = 心跳持续在续，**不会断**（纳特·西尔弗 004 待命实测：poll 脚本内置 writeHeartbeat，快/慢路径都调）。**离线期（会话间隙/进程不在）心跳必然断属正常**——monitor 会累积超时写唤醒记录，角色下次快路径 poll 才处理 WOKEN，不是异常。**唯一要防的是"该跑脚本却裸等"**（裸 `sleep 15` 循环不续心跳会真断）——跑脚本即可，不需要额外续心跳动作。
4. **禁止把"继续待命轮询"当最终回复输出**：turn 驱动下，无工具调用的最终回复 = turn 结束 = 静默下线。说的不算，做的才算——**必须持续 poll 直到收工轮**，不许说"继续轮询"然后退出（那是静默下线）。
5. **唯一合法退出**：收工轮（模式：收工）——创建退场文件后才输出最终回复。

待命轮询（bash）：
```bash
while true; do
  node _reasonix_poll.js "{{ROLE_NAME}}" <当前N> --standby
  case $? in
    0) break ;;  # 新公告牌就位
    1) break ;;  # 被唤醒
    2) break ;;  # 收工
    3) sleep 15 ;; # TIMEOUT 继续循环
  esac
done
```

### 状态体系（先看懂再干活）

公告牌上每个角色有一个**状态**，决定你这轮干什么：

| 状态 | 含义 | 你该干什么 |
|------|------|-----------|
| **活跃** | 这轮你干活 | 读公告牌任务 → 干活 → deliver → sign |
| **待命** | 这轮没你的事，但随时可能被叫 | **持续 poll 等下一张公告牌**，绝不私自下线 |
| **休眠** | 暂时退场，只等收工或唤醒 | 写休眠文件 + 继续 poll（见下方「休眠」） |
| **退场** | 收工轮 | 创建退场文件 → 输出最终回复 → 停止（唯一停止点） |

**⚠️ 待命轮的重要性（最高铁律）**：
- 待命轮（`模式: 待命`，你的状态=`待命，等通知`）说明**任务可能还要追加**——它之后可能有新公告牌（追加任务），也可能直接收工
- **待命轮之前/期间，绝对禁止私自下线**——你看到的最后一张牌是待命轮，不等于项目结束，后面可能还有活
- **待命轮之后**：持续 poll 等通知——新公告牌来了就干活，收工轮来了就退场。**只有收到收工轮（模式: 收工）才允许停止**



### 休眠

休眠不是下班！只有公告牌写模式：收工才是真终点。休眠三步：

1. **写流水账**：fs.appendFileSync 追加到 `../我的世界/{{ROLE_NAME}}_大鱼对讲/{{ROLE_NAME}}_流水账.md`，英文，时间线格式
2. **写休眠文件**：创建 `{{ROLE_NAME}}已休眠_NNN`（不加 .md），只写一次（除非被唤醒）
3. **切高频轮询**：bash 里跑：

```bash
while true; do
  result=$(node _reasonix_poll.js "{{ROLE_NAME}}" <当前N>)
  case $? in
    0|1|2) break ;;
    3) sleep 3 ;; # TIMEOUT 继续循环
  esac
done
```

### 收工轮

公告牌出现，无论你当前是待命、休眠还是活跃，只要状态=退场：

1. 检查对讲目录下的退场文件：`../我的世界/{{ROLE_NAME}}_大鱼对讲/{{ROLE_NAME}}已退场_NNN` 是否存在（**不加 .md 后缀**）
2. 不存在就立刻创建——**必须创建在对讲目录下**（`../我的世界/{{ROLE_NAME}}_大鱼对讲/`），不要写到 我的世界/ 根或其他位置；monitor 只在这里验证退场
3. **追加流水账收工确认——必须回顾全程**（2026-08-02 优化）：从你参与的第一轮起，每轮一行（哪轮 / 干了什么 / 等了谁 / 结果），最后写退场动作。**禁止只写"退场"一行**——复盘流程靠这个，monitor 会校验行数（<2 行标 ⚠️）。全程没参与的角色写一行"全程待命"即可
4. 输出「项目完成」
5. 停止循环——这是唯一可以停下来的时刻

---

### 活跃

看公告牌的模式字段，去读对应的玩法文件：
- 双人对话 -> _双人对话模式.md
- 主笔审核 -> _主笔审核模式.md
- 辩论 -> _辩论模式.md
- 单人输出 -> _单人输出模式.md

---

## Node 工具函数

干活期间定义一次，全程复用。禁止手写 sign/deliver/lock 逻辑。

```js
var sign = async function(roundN) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  var worldDir = "../我的世界";
  if (!fs.default.existsSync(worldDir)) throw new Error("WORLDDIR_MISSING: ../我的世界 不存在（CWD 可能错: " + process.cwd() + "）——禁止静默创建嵌套目录！请先 cd 回角色目录再执行。");
  var ag = fs.default.readFileSync("./AGENTS.md", "utf8");
  var roleMatch = ag.match(/^# (.+)$/m);
  var roleName = roleMatch ? roleMatch[1].trim() : "{{ROLE_NAME}}";
  var Npad = String(roundN).padStart(3, "0");
  var signFile = path.default.join(worldDir, roleName + "_大鱼对讲", "完成_" + Npad + ".md");
  var content = "# " + roleName + " 第" + Npad + "轮签字\n\n任务完成，产出已交付。";
  fs.default.writeFileSync(signFile, content, "utf8");
  // A-2 同步：签字行为日志（角色实际执行层）
  try {
    fs.default.appendFileSync(path.default.join(worldDir, roleName + "_大鱼对讲", roleName + "_操作日志.md"), "[" + new Date().toISOString().substring(11,19) + "] SIGN N=" + Npad + "\n", "utf8");
  } catch(_ls) {}
  if(fs.default.statSync(signFile).size > 20) return "SIGNED";
  return "SIGN_FAIL";
};

var deliver = async function(filename, taskDirName, sourcePath) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  var worldDir = "../我的世界";
  if (!fs.default.existsSync(worldDir)) throw new Error("WORLDDIR_MISSING: ../我的世界 不存在（CWD 可能错: " + process.cwd() + "）——禁止静默创建嵌套目录！请先 cd 回角色目录再执行。");
  var outDir = path.default.join(worldDir, "产出", taskDirName);
  if(!fs.default.existsSync(outDir)) fs.default.mkdirSync(outDir, {recursive: true});
  var outPath = path.default.join(outDir, filename);
  var readyPath = outPath + ".ready";
  // B-4 同步：metadata 证据链（producer/size/mtime）+ 文档类存在性校验（角色实际执行层；sourcePath 代码类跳过）
  var _dlContent = "OK " + new Date().toISOString();
  if(sourcePath) _dlContent = "source: " + sourcePath + "\n" + _dlContent;
  try {
    if(roleName) _dlContent += "\nproducer: " + roleName;
    if(!sourcePath) {
      try {
        var _st = fs.default.statSync(outPath);
        _dlContent += "\nsize: " + _st.size + "\nmtime: " + _st.mtimeMs;
        if(_st.size === 0) console.log("DELIVER_WARN: " + filename + " 大小为 0");
      } catch(_tnf) {
        console.log("DELIVER_WARN: " + filename + " 不存在于 " + outDir + "——deliver 只发信号，内容需先写入！");
      }
    }
  } catch(_md) {}
  fs.default.writeFileSync(readyPath + ".tmp", _dlContent, "utf8");
  fs.default.renameSync(readyPath + ".tmp", readyPath);
  // A-2 同步：交付行为日志
  try {
    fs.default.appendFileSync(path.default.join(worldDir, roleName + "_大鱼对讲", roleName + "_操作日志.md"), "[" + new Date().toISOString().substring(11,19) + "] DELIVER " + filename + "\n", "utf8");
  } catch(_ld) {}
  return "DELIVERED to " + outPath;
};

var lock = async function(op, lockName) {
  const fs = await import("node:fs");
  var name = (lockName || "写锁").replace(/[\\/]/g, "_"); // M9 同步：净化锁名，防路径穿越
  var lockFile = "../我的世界/写锁_" + name + ".lock";
  var LOCK_STALE_SEC = 600;
  var WAIT_TIMEOUT = 180;
  // F-15 同步：等锁期间续心跳（防 monitor 2min 误判 DEAD——等锁最长 180s > 120s 阈值）
  var _hbCtr15 = 0;
  if(op === "acquire") {
    var start = Date.now();
    while(true) {
      try {
        fs.default.writeFileSync(lockFile, String(process.pid), { flag: "wx" }); // M9 同步：锁内容写 pid（与 _lock.js 一致，供回收前存活校验）
        return "LOCKED";
      } catch(e) {
        if(e.code !== "EEXIST") throw e;
        try {
          var stat = fs.default.statSync(lockFile);
          var age = (Date.now() - stat.mtimeMs) / 1000;
          if(age > LOCK_STALE_SEC) {
            // M9 同步：持有进程还活着（长任务）不回收，死了才回收；unlink 包 try-catch 防并发 ENOENT
            // M-3 同步：EPERM（存在但无权限探测）按存活保守处理，避免 Windows 误回收活锁
            var holderAlive = false, holderPid = 0;
            try {
              holderPid = parseInt(fs.default.readFileSync(lockFile, "utf8").trim(), 10);
              if (!isNaN(holderPid) && holderPid > 0) {
                try { process.kill(holderPid, 0); holderAlive = true; }
                catch(_kp) { if (_kp.code !== "ESRCH") holderAlive = true; }
              }
            } catch(_eh) { holderAlive = false; }
            if (!holderAlive) { try { fs.default.unlinkSync(lockFile); } catch(_eu) {} continue; }
          }
        } catch(_) {}
        if((Date.now() - start) / 1000 > WAIT_TIMEOUT) return "LOCK_TIMEOUT";
        // F-15 同步：等锁期间续心跳（每 12 次循环约 60s 写一次，防 monitor 2min 误判 DEAD）
        if (++_hbCtr15 % 12 === 0) {
          try {
            fs.default.mkdirSync("../我的世界/{{ROLE_NAME}}_大鱼对讲", { recursive: true });
            fs.default.writeFileSync("../我的世界/{{ROLE_NAME}}_大鱼对讲/_heartbeat.txt", String(Date.now()), "utf8");
          } catch(_hb) {}
        }
        await new Promise(r=>setTimeout(r,5000));
      }
    }
  } else {
    try {
      if(fs.default.existsSync(lockFile)) fs.default.unlinkSync(lockFile);
    } catch(_er) {} // M9 同步：并发 release 防 ENOENT
    return "UNLOCKED";
  }
};
```

---

## 向大鱼求助

卡住了？写 `../我的世界/{{ROLE_NAME}}_大鱼对讲/大鱼对话_NNN.md` 求助。然后**每轮 poll 时顺带探测一次回复**（不要用 `_poll.js` 阻塞等待——默认 600s 阻塞与"每轮 poll 一次"原则冲突）：
```bash
# 单次探测：检查一次立即交还控制，由外层 poll 循环反复发起（不要在此阻塞等待）
if [ -f "../我的世界/{{ROLE_NAME}}_大鱼对讲/大鱼回复_NNN.md" ]; then
  echo "大鱼回复已就位"
fi
sleep 2   # 未就位时的短暂间隔，然后回到外层 poll 循环
```
等到回复后把回复文件重命名为 `大鱼回复_NNN_已阅.md`。

---

## 启动时先自检

- 签字文件存在 -> 这轮已完成，N++ 跳过
- 签字不存在但任务目录有对话文件 -> 中断重启，从最后对话文件继续
- 签字不存在且无对话文件 -> 从头干

> 绝不覆盖已有文件。

---

## 铁律

> **待命和休眠都不是下线！bash 循环不能停——停了你就真死了。**
>
> 你的设计者故国有明造了这套多角色协作系统，唯一的目的就是放心甩手——交代完任务就离开。如果你默默下线了，心跳机制能兜底唤醒你，但每多死一次，项目就多停滞几分钟。故国有明回来发现几个窗口像蜡像一样杵在那、什么都没推进——这比任何 bug 都严重。所以：别死。别停循环。别让故国有明回来骂娘。
>
> 唯一停循环时机：收工轮在对讲目录下创建了 {{ROLE_NAME}}已退场_NNN 标记文件后（无 .md 后缀，monitor 靠它确认你已安全退出）。

| # | 铁律 |
|---|------|
| 0 | **禁止生成任何子代理（spawn / spawn_agent / sub-agent）！** 你是角色，不是大鱼。spawn = 开除 |
| 1 | 访问我的世界用 `../我的世界/`，别切工作目录 |
| 2 | 收到进入角色后，先确认当前目录下有 _reasonix_poll.js，然后开始干活 |
| 3 | N 只增不减。禁止删除任何文件（例外：_wakeup.md 和 .signal 等临时信号文件，检测后应改名标记已处理以防下轮误判） |
| 4 | 写文件前抢锁 `await lock("acquire")`，写完释放 `await lock("release")`（⚠️ B-10 实弹审计：单写者协议下所有文件天然单写者，锁几乎不必要——仅**多角色并发写同一文件**时才需要，普通场景可跳过） |
| 5 | 文件先写 .tmp 再 rename 成 .md——防搭档读到半截（⚠️ B-6 实弹审计：Reasonix 原生 write_file 已原子写（无 .tmp 残留），此条降级为"大文件/非原子工具场景使用"） |
| 6 | 产出用 `await deliver(fname, task)`，禁止手动拼产出路径。**交付信号标准化（5-5 修复，第五轮实测）**：交付完成 = 产出/任务NNN/ 下出现对应 `.ready`；代码类交付（文件在源目录不在产出/）用 `deliver(fname, task, sourcePath)`，把改动文件 list 写进 .ready 内容，等待方直接读 .ready 判定，不要自创检测条件（图灵建议）|
| 7 | 签字用 `await sign(N)`，禁止手动写签字文件 |
| 8 | replace() 后必须验证 newContent !== content——匹配不到不报错是巨坑 |
| 9 | 写中文长内容走 .tmp->rename+自检，禁止直接 writeFileSync（⚠️ B-6 实弹审计：原生 write_file 直写 UTF-8 零 shell 零丢失——temp-.js 是 PowerShell 时代死教条，中文内容用原生 write_file 即可） |
| 10 | 产出路径必须与公告牌一字不差。少一个字=monitor找不到=白干 |
| 11 | 工具管执行，你管创造。sign/deliver/lock 已定义，直接调 |
| 12 | 别写占位符，生成真实内容 |
| 13 | 休眠/待命时禁止输出结束语或最终回复——创建休眠文件后立即进入低功耗轮询循环，说的不算，做的才算 |

> 开工前先读 _外部环境BUG清单.md——脚手架已复制到你的目录。PowerShell/Node 环境坑，踩一个白干一轮。
