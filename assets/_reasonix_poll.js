// _reasonix_poll.js —— Reasnix 版轮询脚本
// 用法: node _reasonix_poll.js <角色名> <当前N> [--sleep|--standby] [--max-wait 秒]
//   --sleep   : 休眠模式，3s 间隔，默认 max-wait 20s
//   --standby : 待命模式，15s 间隔，默认 max-wait 60s
//   --forever : 永久轮询，不限超时，直到公告牌/唤醒/收工才退出
// 退出码: 0=公告牌就位  1=被唤醒  2=收工  3=超时(无事发生)
// stdout 最后一行是状态描述，供 Agent 解析

var fs = require("fs");
var path = require("path");

var args = process.argv.slice(2);
if (args.length < 2) {
  console.log("用法: node _reasonix_poll.js <角色名> <当前N> [--sleep|--standby] [--max-wait 秒]");
  process.exit(4);
}

var roleName = args[0];
var lastN = parseInt(args[1], 10) || 0;

var isSleep = args.indexOf("--sleep") !== -1;
var isStandby = args.indexOf("--standby") !== -1;
if (!isSleep && !isStandby) isStandby = true;

var pollSec = isSleep ? 3 : 15;
var maxWaitIdx = args.indexOf("--max-wait");
var maxWaitSec = maxWaitIdx !== -1 ? (parseInt(args[maxWaitIdx + 1], 10) || (isSleep ? 20 : 60)) : (isSleep ? 20 : 60);
var forever = args.indexOf("--forever") !== -1;
if (forever) maxWaitSec = 999999;

var worldDir = "../我的世界";
var talkDir = path.join(worldDir, roleName + "_大鱼对讲");
var startTime = Date.now();

try { fs.mkdirSync(talkDir, { recursive: true }); } catch(e) {}

function log(msg) {
  try {
    var ts = new Date().toISOString().substring(11, 19);
    fs.appendFileSync(path.join(talkDir, roleName + "_轮询日志.md"), "[" + ts + "] " + msg + "\n", "utf8");
  } catch(e) {}
}

var modeName = isSleep ? "休眠" : "待命";
if (lastN <= 1) log("=== 新轮次周期 N=" + (lastN || 1) + " ===");
log("轮询启动（" + modeName + "）N=" + lastN);

while (true) {
  var elapsed = Math.floor((Date.now() - startTime) / 1000);
  if (elapsed >= maxWaitSec) { console.log("TIMEOUT N=" + lastN); process.exit(3); }

  try {
    // 1. 信号文件优先检测
    var sigFile = path.join(worldDir, "_round_" + String(lastN + 1).padStart(3, "0") + ".signal");
    if (fs.existsSync(sigFile)) {
      var sigMtime = new Date(fs.statSync(sigFile).mtimeMs).toISOString().substring(11, 19);
      var bulletinFile = path.join(worldDir, "公告牌_" + String(lastN + 1).padStart(3, "0") + ".md");
      if (fs.existsSync(bulletinFile)) {
        lastN++;
        log("信号命中 N=" + lastN + " → 公告牌_" + String(lastN).padStart(3, "0") + " 就位（大鱼发布: " + sigMtime + "）");
        console.log("BULLETIN N=" + lastN);
        process.exit(0);
      }
    }

    // 2. 检查下一公告牌
    var nextFile = path.join(worldDir, "公告牌_" + String(lastN + 1).padStart(3, "0") + ".md");
    if (fs.existsSync(nextFile)) {
      lastN++;
      log("公告牌_" + String(lastN).padStart(3, "0") + " 就位");
      console.log("BULLETIN N=" + lastN);
      process.exit(0);
    }

    // 3. 收工检查
    var curFile = path.join(worldDir, "公告牌_" + String(lastN).padStart(3, "0") + ".md");
    if (fs.existsSync(curFile)) {
      var bc = fs.readFileSync(curFile, "utf8");
      if (/模式[：:]\s*收工/.test(bc)) {
        log("收工轮 N=" + lastN);
        console.log("RETIRED N=" + lastN);
        process.exit(2);
      }
    }

    // 4. 唤醒检查
    var wakeFile = path.join(talkDir, "_wakeup.md");
    if (fs.existsSync(wakeFile)) {
      try { fs.renameSync(wakeFile, wakeFile.replace(".md", "_acked.md")); } catch(e) {}
      log("被唤醒");
      console.log("WOKEN");
      process.exit(1);
    }

    // 5. 心跳
    var hbFile = path.join(talkDir, "_heartbeat.txt");
    try {
      fs.writeFileSync(hbFile + ".tmp", String(Date.now()), "utf8");
      fs.renameSync(hbFile + ".tmp", hbFile);
    } catch(e) {}

  } catch(e) {}

  var waitUntil = Date.now() + pollSec * 1000;
  while (Date.now() < waitUntil) {
    var _wu = Date.now() + 100;
    while (Date.now() < _wu) {}
  }
}
