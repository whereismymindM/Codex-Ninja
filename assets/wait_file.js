/**
 * wait_file.js — 标准等文件脚本（7-5 沉淀，第七轮乔布斯体验报告建议）
 *
 * 替代每次复制 40+ 行内联 Node 轮询样板。保留内联循环结构 + 续心跳 + 超时兜底，
 * 与"等文件禁止 bash 长等"铁律一致（本脚本本身是非阻塞内联轮询）。
 *
 * 用法：
 *   node wait_file.js <目标路径> [目标路径2] [--hb <心跳文件>] [--timeout <分钟>] [--parent-check] [--any] [--watch-hb <对方心跳文件>] [--watch-hb-dead <分钟>]
 *   --any：任一目标就位即返回（默认=全部就位才返回）；辩论等"立论或终结谁先来"场景用
 *   单文件：  node wait_file.js ../我的世界/产出/任务003_改进方案/方案.md --hb ../我的世界/角色_大鱼对讲/_heartbeat.txt
 *   双文件：  node wait_file.js 路径A 路径B（两个都就位才算完成）
 *   --parent-check：等待前检查父目录存在（不存在 = 任务目录路径可能写错，立即报错，不静默等满超时）
 *   --timeout 默认 20 分钟（与模板兜底一致）
 *   --watch-hb <对方心跳文件>：等待中监控对方心跳（12-6 搭档失联检测）——对方心跳超过阈值未更新 → PARTNER_DEAD + exit 4（防盲等，双人对话答方等问方用）
 *   --watch-hb-dead <分钟>：失联阈值，默认 15 分钟（心跳 stale 且对方目录无新文件才算失联）
 *
 * 退出码：0 = 目标就位；2 = 超时（目标未就位）；3 = 父目录不存在（--parent-check）；4 = 对方失联（--watch-hb 触发）
 * 心跳：每 30s 写一次 Date.now()（数字毫秒）到 --hb 指定文件（不传则从 __dirname 自动推导角色对讲目录续心跳，12-6 修复）
 *
 * 9-1 修复（2026-08-05 第九轮）：路径自动锚定，与 CWD 无关——
 *   本脚本位于 {角色目录}/临时脚本/wait_file.js，用 __dirname 推导角色目录/项目根：
 *     角色目录 = __dirname/.. ；项目根 = __dirname/../..
 *   参数以 "../" 开头（相对角色目录写法）→ path.resolve(__dirname, "..", 参数) 自动转绝对路径；
 *   绝对路径参数原样透传。无论角色 CWD 在哪（角色目录 / cd 进临时脚本 / 别处）路径都正确。
 *
 * CommonJS 同步实现（5-3 修复：禁 require+顶层 await 混用；同步 fs 最稳，无崩溃面）
 */
var fs = require("fs");
var path = require("path");

// ---- 参数解析 ----
var args = process.argv.slice(2);
var targets = [];
var hbFile = null;
var watchHbFile = null;
var watchHbDeadMin = 15;   // 12-8：失联阈值默认 15 分钟（原 2 分钟太短——长思考/写长文件时心跳会停，2 分钟误判正常干活中的搭档）
var timeoutMin = 20;
var parentCheck = false;
var anyMode = false;   // 9-4：--any = 任一目标就位即返回（辩论等"立论或终结谁先来"场景）
var ackMode = false;   // 13-1：--ack = 目标 .signal 就位后自动 rename 后缀替换为 _acked（机制化，防角色漏改名/追加式改名）

for (var i = 0; i < args.length; i++) {
  var a = args[i];
  if (a === "--help" || a === "-h") {
    console.log("用法: node wait_file.js <目标路径> [目标路径2] [--hb <心跳文件>] [--timeout 分钟] [--parent-check] [--any] [--ack]");
    console.log("  --any: 任一目标就位即返回（默认=全部就位）");
    console.log("  --ack: 目标 .signal 就位后自动 rename 后缀替换为 _acked（xxx.md.signal → xxx.md.signal_acked，原 .signal 消失；防漏改名/追加式改名，13-1）");
    console.log("  --parent-check: 等待前检查父目录存在（缺失=任务目录路径可能写错）");
    console.log("  --hb: 每 30s 写心跳到指定文件（不传则自动推导角色对讲目录续心跳，12-6）");
    console.log("  --watch-hb: 监控对方心跳（搭档失联检测，超阈值 exit 4）");
    console.log("  --watch-hb-dead: 失联阈值分钟数（默认 15）");
    console.log("  --timeout: 默认 20 分钟");
    console.log("  退出码: 0=就位 2=超时 3=父目录缺失 4=对方失联");
    process.exit(0);
  }
  if (a === "--hb") { hbFile = args[++i]; }
  else if (a === "--watch-hb") { watchHbFile = args[++i]; }
  else if (a === "--watch-hb-dead") { watchHbDeadMin = parseInt(args[++i], 10) || 15; }
  else if (a === "--timeout") { timeoutMin = parseInt(args[++i], 10) || 20; }
  else if (a === "--parent-check") { parentCheck = true; }
  else if (a === "--any") { anyMode = true; }
  else if (a === "--ack") { ackMode = true; }
  else { targets.push(a); }
}

if (targets.length === 0) {
  console.error("用法: node wait_file.js <目标路径> [目标路径2] [--hb <心跳>] [--timeout 分钟] [--parent-check]");
  process.exit(2);
}

// ---- 9-1 路径锚定：相对角色目录（../开头）→ 绝对路径；与 CWD 无关 ----
var roleDir = path.resolve(__dirname, "..");   // 角色目录 = 临时脚本/..
function anchor(p) {
  if (!p) return p;
  // Windows 盘符绝对路径（D:\...）原样透传
  if (/^[a-zA-Z]:[\/]/.test(p)) return p;
  // 其余（../我的世界/X、我的世界/X、相对路径）统一锚定到角色目录
  return path.resolve(roleDir, p);
}
targets = targets.map(anchor);
if (hbFile) hbFile = anchor(hbFile);
if (watchHbFile) watchHbFile = anchor(watchHbFile);

// 12-6 修复：无 --hb 时从 __dirname 自动推导角色对讲目录续心跳（角色目录 = 临时脚本/..，对讲目录 = 项目根/我的世界/{角色名}_大鱼对讲）
//   防止等待中不传 --hb 导致心跳断 → monitor 误判 DEAD（H1：答方等待命令示例曾缺 --hb）
if (!hbFile) {
  try {
    var _roleName = path.basename(roleDir);
    var _autoHb = path.resolve(roleDir, "..", "我的世界", _roleName + "_大鱼对讲", "_heartbeat.txt");
    fs.mkdirSync(path.dirname(_autoHb), { recursive: true });
    hbFile = _autoHb;
  } catch(_e) {}
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

// ---- 13-2 写方缺信号告警（2026-08-08 实测暴露，评审轮正方 T1/T2 连续漏发）----
// 隐患 #17：角色写完 .md 后忘了写同名 .signal，搭档 wait_file 空等。
// 机制化：等待前扫描任务目录，若存在「.md 无同名 .signal / _acked」的产出（最近 5 分钟内写入），
// 立即告警提示写方补发——靠脚本不靠自觉。
var _missingSignal = false;
try {
  var _waitDirs = targets.map(function(t) { return path.dirname(t); });
  var _cut13 = Date.now() - 5 * 60 * 1000;
  _waitDirs.forEach(function(d) {
    var entries;
    try { entries = fs.readdirSync(d); } catch(_e) { return; }
    entries.forEach(function(f) {
      if (!/\.md$/.test(f)) return;
      var base = f.replace(/\.md$/, "");
      var hasSignal = entries.some(function(e) { return e === base + ".signal" || e === base + ".signal_acked" || e === base + ".signal_已处理" || e === base + ".signal_acked.md"; });
      if (hasSignal) return;
      try {
        var full = path.join(d, f);
        if (fs.statSync(full).mtimeMs > _cut13) {
          console.log("WARN_MISSING_SIGNAL: " + f + " 是最近 5 分钟内的新产出但缺 .signal——写方可能漏发（隐患 #17）！搭档 wait_file 会空等。写方请补：echo 时间戳 > 同名.signal");
          _missingSignal = true;
        }
      } catch(_e) {}
    });
  });
} catch(_e) {}


// ---- 主循环 ----
var startTs = Date.now();
var deadline = startTs + timeoutMin * 60 * 1000;
var lastHbTs = 0;

function allReady() {
  return anyMode
    ? targets.some(function(t) { try { return fs.existsSync(t); } catch(_e) { return false; } })
    : targets.every(function(t) { try { return fs.existsSync(t); } catch(_e) { return false; } });
}

// 12-28 纳特 002 自检问题12：--any 命中时打印全部目标误导（实测答方误以为'结束信号与新问同时就位'）——改为标注实际触发目标
function readySummary() {
  if (!anyMode) return targets.join(", ");
  var hit = targets.filter(function(t) { try { return fs.existsSync(t); } catch(_e) { return false; } });
  return "实际触发: " + (hit.length > 0 ? hit.join(", ") : "?");
}

// 13-1 修复（信号_acked 协议机制化）：--ack 模式——目标 .signal 就位后自动 rename 后缀替换
//   xxx.md.signal → xxx.md.signal_acked（原 .signal 消失）。手动改名常漏/常追加错（.signal.signal_acked），脚本代改零手工。
//   非 .signal 目标忽略（不误改普通文件）；默认（无 --ack）行为完全不变。
function ackSignals() {
  if (!ackMode) return;
  targets.forEach(function(t) {
    if (/\.signal$/i.test(t)) {
      try {
        if (fs.existsSync(t)) {
          var target = t.replace(/\.signal$/i, ".signal_acked");
          fs.renameSync(t, target);
          console.log("ACK: " + path.basename(t) + " -> " + path.basename(target));
        }
      } catch(_e) {}
    }
  });
}

// 先检查是否已就位（防"旧文件秒返"——调用方需自行确认目标当前不存在才该等）
if (allReady()) {
  ackSignals(); // 13-1：就位即 ack（残留旧信号一并清理防秒返）
  console.log("WAIT_DONE: 目标已就位（" + readySummary() + "）");
  process.exit(0);
}

while (Date.now() < deadline) {
  // 续心跳（每 30s）——12-6：hbFile 已自动推导，无需显式传 --hb
  if (hbFile && Date.now() - lastHbTs >= 30000) {
    try { fs.writeFileSync(hbFile, String(Date.now()), "utf8"); } catch(_e) {}
    lastHbTs = Date.now();
  }
  // 12-6 搭档失联检测（--watch-hb）：对方心跳超过阈值未更新 → PARTNER_DEAD + exit 4
  if (watchHbFile) {
    try {
      var _pRaw = fs.readFileSync(watchHbFile, "utf8");
      var _pTs = parseInt(String(_pRaw || "").trim(), 10);
      if (_pTs && Date.now() - _pTs > watchHbDeadMin * 60 * 1000) {
        // M7 宽容：心跳 stale 但对方最近 watchHbDeadMin 分钟内有新文件 = 在干活/长思考，不算失联（对齐 monitor A-1 判据）
        var _pDir = path.dirname(watchHbFile);
        var _working = false;
        try {
          var _cut = Date.now() - watchHbDeadMin * 60 * 1000;
          _working = fs.readdirSync(_pDir).some(function(f) {
            try { return fs.statSync(path.join(_pDir, f)).mtimeMs > _cut; } catch(_e) { return false; }
          });
        } catch(_ph2) {}
        if (!_working) {
          console.error("PARTNER_DEAD: 对方心跳 " + Math.round((Date.now() - _pTs) / 1000) + "s 未更新（阈值 " + watchHbDeadMin + " 分钟）且无新文件——对方失联，结束信号/下一问不会再来。立即写求助给大鱼，不要盲等超时（12-6）");
          process.exit(4);
        }
      }
    } catch(_ph) {}
  }
  // 11-2 修复（大鱼第十一轮审计）：唤醒盲区——等待中不跑 poll 循环，收不到 _wakeup.md，只能等超时（第十二轮前纳特/乔布斯/图灵互等 20 分钟，真正解卡是超时兜底不是唤醒信号）
  // 循环内检测对讲目录的 _wakeup.md：存在 → 改名 _acked（ack）并打印提示（提示角色可能被要求改变等待目标/先手）
  try {
    var _wakeFile = hbFile ? hbFile.replace(/_heartbeat\.txt$/, "_wakeup.md") : null;
    if (_wakeFile && fs.existsSync(_wakeFile)) {
      try { fs.renameSync(_wakeFile, _wakeFile.replace(/\.md$/, "_acked.md")); } catch(_re) {}
      console.log("WAKEUP_DETECTED: 收到唤醒信号（已 ack）——退出等待，按提示调整后重新 wait_file（11-3：检测到唤醒即退出）");
      process.exit(0);
    }
  } catch(_we) {}
  if (allReady()) {
    ackSignals(); // 13-1：命中即 ack
    console.log("WAIT_DONE: 目标已就位（" + readySummary() + "），等待耗时 " + Math.round((Date.now() - startTs) / 1000) + "s");
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
  ackSignals(); // 13-1：超时复查命中同样 ack
  console.log("WAIT_DONE: 超时复查发现目标已就位（" + readySummary() + "）");
  process.exit(0);
}
console.error("WAIT_TIMEOUT: 等待 " + timeoutMin + " 分钟超时，目标未就位（" + targets.join(", ") + "）。先复查目标路径是否其实已就位，再决定写死锁。");
process.exit(2);
