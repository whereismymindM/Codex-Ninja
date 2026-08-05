// _reasonix_poll.js —— 单次探测版（无内部循环，毫秒级退出）+ --loop N 循环版（2026-08-03）
// 用法: node _reasonix_poll.js <角色名> <当前N> [--standby] [--loop N]
//   --loop N：一次进程内循环探测 N 次（每次探测 + sleep 间隔），减少外层 bash spawn 开销
//             （待命期 spawn 15次/分 → --loop 60 时 1次/分）；任一次命中即退出；N 次全无事 → exit 3
//   不带 --loop = 单次探测（兼容原行为），循环和休眠由 Agent 外层 bash while 管理
// 退出码: 0=公告牌就位  1=被唤醒  2=收工  3=无事发生  4=用法错误
// stdout 最后一行是状态描述，供 Agent 解析
//

var fs = require("fs");
var path = require("path");

var args = process.argv.slice(2);
if (args.length < 2) {
  console.log("用法: node _reasonix_poll.js <角色名> <当前N> [--standby] [--loop N]");
  process.exit(4);
}

var roleName = args[0];
var lastN = parseInt(args[1], 10) || 0;
var isStandby = args.indexOf("--standby") !== -1;   // N-3 修复：indexOf 匹配，与 --loop 组合顺序无关
// --loop N：进程内循环 N 次；缺省 = 1（单次，兼容）
var loopCount = 1;
var _li = args.indexOf("--loop");
if (_li !== -1) {
  loopCount = parseInt(args[_li + 1], 10);
  if (isNaN(loopCount) || loopCount < 1) {
    console.log("用法: --loop 需要一个 >=1 的数值（循环次数）");
    process.exit(4);
  }
}
var sleepMs = isStandby ? 15000 : 3000;   // 循环内 sleep 间隔（待命 15s / 休眠 3s，匹配现有档位）

var worldDir = path.join(__dirname, "..", "我的世界");   // M3 修复：基于 __dirname 解析（与 _sign/_lock/_deliver 一致），不受 bash CWD 影响
var talkDir = path.join(worldDir, roleName + "_大鱼对讲");

try { fs.mkdirSync(talkDir, { recursive: true }); } catch(e) {}

function log(msg) {
  try {
    var ts = new Date().toISOString().substring(11, 19);
    // 提案5：log 去重——连续相同消息只写一次（待命期收工检测每次 poll 都写同一条，17条/分钟 → 1条）
    // 文件级去重（poll 是单次进程，进程内去重无效；--loop 下同样生效）
    var _logFile = path.join(talkDir, roleName + "_轮询日志.md");
    try {
      var _prev = fs.readFileSync(_logFile, "utf8").trim().split("\n");
      var _last = _prev[_prev.length - 1] || "";
      if (_last.indexOf(msg) !== -1) return; // 与上一条相同 → 跳过
    } catch(_de) {}
    fs.appendFileSync(_logFile, "[" + ts + "] " + msg + "\n", "utf8");
    // 操作日志（2026-08-02 优化：不靠角色自觉，脚本自动写关键动作）
    // 供老渣/大鱼实时排查"角色卡在哪"，与流水账（角色退场前全程总结）互补
    fs.appendFileSync(path.join(talkDir, roleName + "_操作日志.md"), "[" + ts + "] " + msg + "\n", "utf8");
  } catch(e) {}
}

// ── 收工检查（M-16：快/慢路径共用）──
//     读当前轮公告牌，若是收工轮（模式: 收工）→ 返回 2（RETIRED）
//     M-1：readFileSync 包 try——文件在 existsSync 与读取之间被移走/锁定时，未捕获异常会以 exit 1 退出被误判为"被唤醒"；读失败视为无收工信号继续
// 10-1 终极方案：非收工轮结束标记检测（fail-loud）
// 角色在【非收工轮】想结束回合必须先创建 {角色}_结束回合_{N}.md（对讲目录）——
// poll 检测到 = 违规结束回合，报警提示；收工轮正常退场不创建此标记，不会误报
function checkEndMarker() {
  try {
    var endMarker = path.join(talkDir, roleName + "_结束回合_" + String(lastN).padStart(3, "0") + ".md");
    if (fs.existsSync(endMarker)) {
      var curBoard = path.join(worldDir, "公告牌_" + String(lastN).padStart(3, "0") + ".md");
      var isRetireBoard = false;
      try {
        if (fs.existsSync(curBoard)) {
          var bc = fs.readFileSync(curBoard, "utf8");
          isRetireBoard = /模式[：:]\s*收工|(?:^|\n)\s*·\s*收工/.test(bc);
        }
      } catch(_e) {}
      if (!isRetireBoard) {
        log("⚠️ 非收工轮结束标记！回合保持铁律被打破 N=" + lastN);
        console.log("END_MARKER_VIOLATION N=" + lastN + "（非收工轮结束标记——违规结束回合，请勿输出最终回复，继续 poll！）");
      }
    }
  } catch(_e) {}
}

function checkRetire() {
  var curFile = path.join(worldDir, "公告牌_" + String(lastN).padStart(3, "0") + ".md");
  if (fs.existsSync(curFile)) {
    try {
      var bc = fs.readFileSync(curFile, "utf8");
      if (/模式[：:]\s*收工|(?:^|\n)\s*·\s*收工/.test(bc)) { // 第四轮修复：·收工 锚定行首，防任务描述含"· 收工"误判提前退场
        // 5-1 修复（升级计划第 3 条，2026-08-04 第五轮）：当前轮是收工轮，但本角色已写过退场文件（{角色}已退场_{N} 或 .acked）=
        // 该收工轮已处理过——不应再返回 RETIRED（会误导角色跳号空等），返回 null（无事发生）
        // 第八轮图灵审计修正：本豁免仅服务于"同一回合内防 RETIRED 误跳号"（断点续接/唤醒场景），
        // 不构成"退场后继续轮询等追加"的依据——收工轮是轮询循环的出口，退场后回合结束，不再 poll
        // 第五轮实测：图灵/DHH 收工后 poll 收工轮返回 RETIRED 后错误 N+1 跳号，004 晚 7 秒发布 → 空等 10 分钟
        try {
          var exitMarker = path.join(talkDir, roleName + "已退场_" + String(lastN).padStart(3, "0"));
          if (fs.existsSync(exitMarker) || fs.existsSync(exitMarker + ".acked")) {
            return null; // 已处理过该收工轮 → 继续等下一张牌（公告牌_(lastN+1) 检测在前）
          }
        } catch(e) {}
        log("收工轮 N=" + lastN);
        console.log("RETIRED N=" + lastN);
        console.log("【铁律】最终回复=回合结束——未到收工轮(退出码2)前禁止输出最终回复，持续 poll 保持在场！（已到收工轮→创建退场文件→输出项目完成结束回合）");
        return 2;
      }
    } catch(e) {}
  }
  return null;
}

function writeHeartbeat() {
  var HB_INTERVAL_MS = isStandby ? 30_000 : 15_000;
  var hbStateFile = path.join(talkDir, "_hb_state.json");
  var shouldWrite = true;
  try {
    if (fs.existsSync(hbStateFile)) {
      var raw = fs.readFileSync(hbStateFile, "utf8").replace(/^\uFEFF/, "");
      var hbState = JSON.parse(raw);
      // L16 修复：时钟回拨时 lastHb 在未来（Date.now() < lastHb）→ 差值恒 < 间隔 → 永不写心跳 → 被误判 DEAD。
      // 加 lastHb <= Date.now() 守卫：未来时间戳视为过期，立即写心跳。
      if (hbState.lastHb && hbState.lastHb <= Date.now() && Date.now() - hbState.lastHb < HB_INTERVAL_MS) {
        shouldWrite = false;
      }
    }
  } catch(e) {
    // 状态文件损坏或不存在 → 退化为每次都写
  }

  if (shouldWrite) {
    var hbFile = path.join(talkDir, "_heartbeat.txt");
    try {
      fs.writeFileSync(hbFile + ".tmp", String(Date.now()), "utf8");
      fs.renameSync(hbFile + ".tmp", hbFile);
    } catch(e) {}
    // 更新心跳状态文件（原子写入）
    try {
      fs.writeFileSync(hbStateFile + ".tmp", JSON.stringify({lastHb: Date.now()}), "utf8");
      fs.renameSync(hbStateFile + ".tmp", hbStateFile);
    } catch(e) {}
  }
}

// ── 单次探测主体（--loop 重构：命中返回 0/1/2，无事返回 3，由主循环决定退出/继续）──
function probeOnce() {
  // ── 1. 信号文件优先检测（mtime 无关，最高优先级）──
  //     用 statSync 替代 existsSync——复用 stat 结果取 mtime，省一次调用
  //     （L4 兼容注：_round_NNN.signal 是 A 方案逐轮搬运时代遗留；当前全量发布形态不用 signal，
  //      保留此路径仅为兼容旧项目，不影响新形态行为）
  var sigFile = path.join(worldDir, "_round_" + String(lastN + 1).padStart(3, "0") + ".signal");
  var bulletinFile = path.join(worldDir, "公告牌_" + String(lastN + 1).padStart(3, "0") + ".md");
  try {
    var sigStat = fs.statSync(sigFile);
    // 信号文件存在 → 验证公告牌也到位
    if (fs.existsSync(bulletinFile)) {
      lastN++;
      var sigMtime = new Date(sigStat.mtimeMs).toISOString().substring(11, 19);
      log("信号命中 N=" + lastN + " → 公告牌_" + String(lastN).padStart(3, "0") + " 就位（大鱼发布: " + sigMtime + "）");
      console.log("BULLETIN N=" + lastN);
      console.log("【铁律】最终回复=回合结束——未到收工轮(退出码2)前禁止输出最终回复，持续 poll 保持在场！");
      return 0;
    }
  } catch(e) {
    // 信号文件不存在 → 继续后续检查
  }

  // ── 2. mtime 预检 ──
  //     记录 我的世界/ 目录 mtime（取整到毫秒整数），无变化时走快路径跳过全量文件检查
  //     写入与读取两端均为整数：String(Math.round(...)) 写入 → parseInt 读回，保证 === 命中快路径
  var mtimeFile = path.join(talkDir, "_mtime.txt");
  var lastMtime = 0;
  try {
    if (fs.existsSync(mtimeFile)) {
      lastMtime = parseInt(fs.readFileSync(mtimeFile, "utf8").trim()) || 0;
    }
  } catch(e) {}

  var curMtime = 0;
  try { curMtime = Math.round(fs.statSync(worldDir).mtimeMs); }
  catch(e) { console.log("TIMEOUT N=" + lastN); return 3; } // M3 修复：我的世界/ 不可访问时按"无事发生"退出，避免崩溃退出码 1 被误判为 WOKEN
  var wakeFile = path.join(talkDir, "_wakeup.md");

  if (curMtime === lastMtime) {
    // 快路径：目录无变化 → 只做心跳 + 唤醒 + 下一公告牌检查
    // ⚠️ _wakeup.md 写在 {角色}_大鱼对讲/ 子目录，不影响 我的世界/ mtime
    //    必须独立检查，否则休眠角色收不到唤醒信号
    // ⚠️ 全量发布场景（方案E）：公告牌一次放齐后目录 mtime 不再变化，
    //    快路径必须仍检查下一公告牌（单文件 existsSync，开销可忽略），否则角色永远 TIMEOUT
    writeHeartbeat();
    if (fs.existsSync(wakeFile)) {
      try { fs.renameSync(wakeFile, wakeFile.replace(".md", "_acked.md")); } catch(e) {}
      log("被唤醒（快路径）");
      console.log("WOKEN");
      console.log("【铁律】最终回复=回合结束——未到收工轮(退出码2)前禁止输出最终回复，持续 poll 保持在场！");
      return 1;
    }
    checkEndMarker();
    // 快路径公告牌检查——全量发布下目录 mtime 不变，靠这里检测下一轮
    var nextFileFast = path.join(worldDir, "公告牌_" + String(lastN + 1).padStart(3, "0") + ".md");
    if (fs.existsSync(nextFileFast)) {
      lastN++;
      log("公告牌_" + String(lastN).padStart(3, "0") + " 就位（快路径）");
      console.log("BULLETIN N=" + lastN);
      console.log("【铁律】最终回复=回合结束——未到收工轮(退出码2)前禁止输出最终回复，持续 poll 保持在场！");
      return 0;
    }
    // M-16 修复：快路径同样执行收工检查——断点续接/重启场景下，当前轮已是收工轮且目录 mtime 无变化时也能感知退场
    var r1 = checkRetire();
    if (r1 !== null) return r1;
    console.log("TIMEOUT N=" + lastN);
    return 3;
  }

  // 目录有变化 → 更新 mtime 缓存（原子写入）
  try {
    fs.writeFileSync(mtimeFile + ".tmp", String(curMtime), "utf8");
    fs.renameSync(mtimeFile + ".tmp", mtimeFile);
  } catch(e) {}

  // ── 3. 检查下一公告牌 ──
  var nextFile = path.join(worldDir, "公告牌_" + String(lastN + 1).padStart(3, "0") + ".md");
  if (fs.existsSync(nextFile)) {
    lastN++;
    log("公告牌_" + String(lastN).padStart(3, "0") + " 就位");
    console.log("BULLETIN N=" + lastN);
    console.log("【铁律】最终回复=回合结束——未到收工轮(退出码2)前禁止输出最终回复，持续 poll 保持在场！");
    return 0;
  }

  // ── 4. 收工检查 ──（M-16：提取为公共函数，快路径/慢路径共用）
  var r2 = checkRetire();
  if (r2 !== null) return r2;

  // ── 5. 唤醒检查（慢路径）──
  if (fs.existsSync(wakeFile)) {
    try { fs.renameSync(wakeFile, wakeFile.replace(".md", "_acked.md")); } catch(e) {}
    log("被唤醒");
    console.log("WOKEN");
    console.log("【铁律】最终回复=回合结束——未到收工轮(退出码2)前禁止输出最终回复，持续 poll 保持在场！");
    return 1;
  }

  // ── 5.5 结束标记检测（10-1，fail-loud）──
  checkEndMarker();

  // ── 6. 心跳 ──
  writeHeartbeat();

  // 无事发生
  console.log("TIMEOUT N=" + lastN);
  return 3;
}

// ── 主入口：--loop N 循环 / 单次 ──
// sleepSync：Atomics.wait 真休眠（与 _lock/_poll 一致），降级忙等
function sleepSync(ms) {
  try {
    var _sab = new SharedArrayBuffer(4);
    var _v = new Int32Array(_sab);
    Atomics.wait(_v, 0, 0, ms);
  } catch(_es) {
    var _until = Date.now() + ms;
    while (Date.now() < _until) {
      var _rem = _until - Date.now();
      if (_rem > 100) { var _w = Date.now() + 100; while (Date.now() < _w) {} }
    }
  }
}

for (var _i = 0; _i < loopCount; _i++) {
  var _r = probeOnce();
  if (_r !== 3) process.exit(_r);           // 0/1/2 命中 → 整个进程退出（循环不继续）
  if (_i < loopCount - 1) sleepSync(sleepMs); // 无事且还有循环 → 睡一下再探
}
process.exit(3);  // N 次全无事
