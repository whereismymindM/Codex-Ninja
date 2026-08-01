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

var worldDir = "../我的世界";
var talkDir = path.join(worldDir, roleName + "_大鱼对讲");

try { fs.mkdirSync(talkDir, { recursive: true }); } catch(e) {}

function log(msg) {
  try {
    var ts = new Date().toISOString().substring(11, 19);
    fs.appendFileSync(path.join(talkDir, roleName + "_轮询日志.md"), "[" + ts + "] " + msg + "\n", "utf8");
  } catch(e) {}
}

// ── 1. 信号文件优先检测（mtime 无关，最高优先级）──
//     用 statSync 替代 existsSync——复用 stat 结果取 mtime，省一次调用
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
//     记录 我的世界/ 目录 mtime，无变化时走快路径跳过全量文件检查
var mtimeFile = path.join(talkDir, "_mtime.txt");
var lastMtime = 0;
try {
  if (fs.existsSync(mtimeFile)) {
    lastMtime = parseInt(fs.readFileSync(mtimeFile, "utf8").trim()) || 0;
  }
} catch(e) {}

var curMtime = fs.statSync(worldDir).mtimeMs;
var wakeFile = path.join(talkDir, "_wakeup.md");

if (curMtime === lastMtime) {
  // 快路径：目录无变化 → 只做心跳 + 唤醒检查
  // ⚠️ _wakeup.md 写在 {角色}_大鱼对讲/ 子目录，不影响 我的世界/ mtime
  //    必须独立检查，否则休眠角色收不到唤醒信号
  writeHeartbeat();
  if (fs.existsSync(wakeFile)) {
    try { fs.renameSync(wakeFile, wakeFile.replace(".md", "_acked.md")); } catch(e) {}
    log("被唤醒（快路径）");
    console.log("WOKEN");
    process.exit(1);
  }
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

// ── 4. 收工检查 ──
var curFile = path.join(worldDir, "公告牌_" + String(lastN).padStart(3, "0") + ".md");
if (fs.existsSync(curFile)) {
  var bc = fs.readFileSync(curFile, "utf8");
  if (/模式[：:]\s*收工/.test(bc)) {
    log("收工轮 N=" + lastN);
    console.log("RETIRED N=" + lastN);
    process.exit(2);
  }
}

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
function writeHeartbeat() {
  var HB_INTERVAL_MS = isStandby ? 30_000 : 15_000;
  var hbStateFile = path.join(talkDir, "_hb_state.json");
  var shouldWrite = true;
  try {
    if (fs.existsSync(hbStateFile)) {
      var raw = fs.readFileSync(hbStateFile, "utf8").replace(/^\uFEFF/, "");
      var hbState = JSON.parse(raw);
      if (hbState.lastHb && Date.now() - hbState.lastHb < HB_INTERVAL_MS) {
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
