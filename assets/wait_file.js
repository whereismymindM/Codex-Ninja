/**
 * wait_file.js — 标准等文件脚本（7-5 沉淀，第七轮乔布斯体验报告建议）
 *
 * 替代每次复制 40+ 行内联 Node 轮询样板。保留内联循环结构 + 续心跳 + 超时兜底，
 * 与"等文件禁止 bash 长等"铁律一致（本脚本本身是非阻塞内联轮询）。
 *
 * 用法：
 *   node wait_file.js <目标路径> [目标路径2] [--hb <心跳文件>] [--timeout <分钟>] [--parent-check]
 *   单文件：  node wait_file.js ../我的世界/产出/任务003_改进方案/方案.md --hb ../我的世界/角色_大鱼对讲/_heartbeat.txt
 *   双文件：  node wait_file.js 路径A 路径B（两个都就位才算完成）
 *   --parent-check：等待前检查父目录存在（不存在 = 任务目录路径可能写错，立即报错，不静默等满超时）
 *   --timeout 默认 20 分钟（与模板兜底一致）
 *
 * 退出码：0 = 目标就位；2 = 超时（目标未就位）；3 = 父目录不存在（--parent-check）
 * 心跳：每 30s 写一次 Date.now()（数字毫秒）到 --hb 指定文件（不传则不写）
 *
 * CommonJS 同步实现（5-3 修复：禁 require+顶层 await 混用；同步 fs 最稳，无崩溃面）
 */
var fs = require("fs");
var path = require("path");

// ---- 参数解析 ----
var args = process.argv.slice(2);
var targets = [];
var hbFile = null;
var timeoutMin = 20;
var parentCheck = false;

for (var i = 0; i < args.length; i++) {
  var a = args[i];
  if (a === "--hb") { hbFile = args[++i]; }
  else if (a === "--timeout") { timeoutMin = parseInt(args[++i], 10) || 20; }
  else if (a === "--parent-check") { parentCheck = true; }
  else { targets.push(a); }
}

if (targets.length === 0) {
  console.error("用法: node wait_file.js <目标路径> [目标路径2] [--hb <心跳>] [--timeout 分钟] [--parent-check]");
  process.exit(2);
}

// ---- 父目录检查（提案2 fail-loud）----
if (parentCheck) {
  var parentOk = targets.every(function(t) {
    try { return fs.existsSync(path.dirname(t)); } catch(_e) { return false; }
  });
  if (!parentOk) {
    console.error("WAIT_PARENT_MISSING: 目标父目录不存在——大概率公告牌任务目录字段写错（不是搭档还没写）。请读公告牌核对任务目录路径，不要静默等满超时。");
    process.exit(3);
  }
}

// ---- 主循环 ----
var startTs = Date.now();
var deadline = startTs + timeoutMin * 60 * 1000;
var lastHbTs = 0;

function allReady() {
  return targets.every(function(t) { try { return fs.existsSync(t); } catch(_e) { return false; } });
}

// 先检查是否已就位（防"旧文件秒返"——调用方需自行确认目标当前不存在才该等）
if (allReady()) {
  console.log("WAIT_DONE: 目标已就位（" + targets.join(", ") + "）");
  process.exit(0);
}

while (Date.now() < deadline) {
  // 续心跳（每 30s）
  if (hbFile && Date.now() - lastHbTs >= 30000) {
    try { fs.writeFileSync(hbFile, String(Date.now()), "utf8"); } catch(_e) {}
    lastHbTs = Date.now();
  }
  if (allReady()) {
    console.log("WAIT_DONE: 目标已就位（" + targets.join(", ") + "），等待耗时 " + Math.round((Date.now() - startTs) / 1000) + "s");
    process.exit(0);
  }
  // 0.5s 间隔（Atomics.wait 真休眠，降级忙等）
  try {
    var _sab = new SharedArrayBuffer(4);
    var _v = new Int32Array(_sab);
    Atomics.wait(_v, 0, 0, 500);
  } catch(_es) {
    var _until = Date.now() + 500;
    while (Date.now() < _until) {}
  }
}

// 超时兜底：先复查目标是否其实已就位（writer 曾因路径错空等 14 分钟）
if (allReady()) {
  console.log("WAIT_DONE: 超时复查发现目标已就位（" + targets.join(", ") + "）");
  process.exit(0);
}
console.error("WAIT_TIMEOUT: 等待 " + timeoutMin + " 分钟超时，目标未就位（" + targets.join(", ") + "）。先复查目标路径是否其实已就位，再决定写死锁。");
process.exit(2);
