// _reasonix_poll.js —— 单次探测版（无内部循环，毫秒级退出）
// 用法: node _reasonix_poll.js <角色名> <当前N>
//   循环和休眠由 Agent 外层 bash while 管理，脚本只做一次性文件扫描
// 退出码: 0=公告牌就位  1=被唤醒  2=收工  3=无事发生
// stdout 最后一行是状态描述，供 Agent 解析

var fs = require("fs");
var path = require("path");

var args = process.argv.slice(2);
if (args.length < 2) {
  console.log("用法: node _reasonix_poll.js <角色名> <当前N>");
  process.exit(4);
}

var roleName = args[0];
var lastN = parseInt(args[1], 10) || 0;

var worldDir = "../我的世界";
var talkDir = path.join(worldDir, roleName + "_大鱼对讲");

try { fs.mkdirSync(talkDir, { recursive: true }); } catch(e) {}

function log(msg) {
  try {
    var ts = new Date().toISOString().substring(11, 19);
    fs.appendFileSync(path.join(talkDir, roleName + "_轮询日志.md"), "[" + ts + "] " + msg + "\n", "utf8");
  } catch(e) {}
}

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

// 无事发生
console.log("TIMEOUT N=" + lastN);
process.exit(3);
