// _reasonix_poll.js —— 单次探测版（无内部循环，毫秒级退出）
// 用法: node _reasonix_poll.js <角色名> <当前N> [--standby]
//   循环和休眠由 Agent 外层 bash while 管理，脚本只做一次性文件扫描
// 退出码: 0=公告牌就位  1=被唤醒  2=收工  3=无事发生
// stdout 最后一行是状态描述，供 Agent 解析
//

var fs = require("fs");
var path = require("path");

var args = process.argv.slice(2);
if (args.length < 2) {
  console.log("用法: node _reasonix_poll.js <角色名> <当前N> [--standby]");
  process.exit(4);
}

var roleName = args[0];
var lastN = parseInt(args[1], 10) || 0;
var isStandby = args[2] === "--standby";

var worldDir = path.join(__dirname, "..", "我的世界");   // M3 修复：基于 __dirname 解析（与 _sign/_lock/_deliver 一致），不受 bash CWD 影响
var talkDir = path.join(worldDir, roleName + "_大鱼对讲");

try { fs.mkdirSync(talkDir, { recursive: true }); } catch(e) {}

function log(msg) {
  try {
    var ts = new Date().toISOString().substring(11, 19);
    // 提案5：log 去重——连续相同消息只写一次（待命期收工检测每次 poll 都写同一条，17条/分钟 → 1条）
    // 文件级去重（poll 是单次进程，进程内去重无效）
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
    process.exit(0);
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
catch(e) { console.log("TIMEOUT N=" + lastN); process.exit(3); } // M3 修复：我的世界/ 不可访问时按"无事发生"退出，避免崩溃退出码 1 被误判为 WOKEN
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
    process.exit(1);
  }
  // 快路径公告牌检查——全量发布下目录 mtime 不变，靠这里检测下一轮
  var nextFileFast = path.join(worldDir, "公告牌_" + String(lastN + 1).padStart(3, "0") + ".md");
  if (fs.existsSync(nextFileFast)) {
    lastN++;
    log("公告牌_" + String(lastN).padStart(3, "0") + " 就位（快路径）");
    console.log("BULLETIN N=" + lastN);
    process.exit(0);
  }
  // M-16 修复：快路径同样执行收工检查——断点续接/重启场景下，当前轮已是收工轮且目录 mtime 无变化时也能感知退场
  checkRetire();
  console.log("TIMEOUT N=" + lastN);
  process.exit(3);
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
  process.exit(0);
}

// ── 4. 收工检查 ──（M-16：提取为公共函数，快路径/慢路径共用）
checkRetire();

// ── 5. 唤醒检查（慢路径）──
if (fs.existsSync(wakeFile)) {
  try { fs.renameSync(wakeFile, wakeFile.replace(".md", "_acked.md")); } catch(e) {}
  log("被唤醒");
  console.log("WOKEN");
  process.exit(1);
}

// ── 6. 心跳 ──
writeHeartbeat();

// 无事发生
console.log("TIMEOUT N=" + lastN);
process.exit(3);

// ── 心跳批量写入 ──
//     用 _hb_state.json 记录上次写入时间，避免每次调用都写磁盘
//     休眠默认 15s 间隔（2min 超时下 8x 安全边际）
//     --standby 模式 30s 间隔（2min 超时下 4x 安全边际）

// ── 收工检查（M-16：快/慢路径共用）──
//     读当前轮公告牌，若是收工轮（模式: 收工）→ 退出码 2（RETIRED）
//     M-1：readFileSync 包 try——文件在 existsSync 与读取之间被移走/锁定时，未捕获异常会以 exit 1 退出被误判为"被唤醒"；读失败视为无收工信号继续
function checkRetire() {
  var curFile = path.join(worldDir, "公告牌_" + String(lastN).padStart(3, "0") + ".md");
  if (fs.existsSync(curFile)) {
    try {
      var bc = fs.readFileSync(curFile, "utf8");
      if (/模式[：:]\s*收工|(?:^|\n)\s*·\s*收工/.test(bc)) { // 第四轮修复：·收工 锚定行首，防任务描述含"· 收工"误判提前退场
        log("收工轮 N=" + lastN);
        console.log("RETIRED N=" + lastN);
        process.exit(2);
      }
    } catch(e) {}
  }
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
