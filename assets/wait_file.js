/**
 * wait_file.js — 标准等文件脚本（7-5 沉淀，第七轮乔布斯体验报告建议）
 *
 * 替代每次复制 40+ 行内联 Node 轮询样板。保留内联循环结构 + 续心跳 + 超时兜底，
 * 与"等文件禁止 bash 长等"铁律一致（本脚本本身是非阻塞内联轮询）。
 *
 * 用法：
 *   node wait_file.js <目标路径> [目标路径2] [--hb <心跳文件>] [--timeout <分钟>] [--parent-check] [--any] [--watch-hb <对方心跳文件>] [--watch-hb-dead <分钟>]
 *   --any：任一目标就位即返回（默认=全部就位才返回）；辩论等"立论或终结谁先来"场景用
 *   单文件：  node wait_file.js ../world/output/task003_改进方案/方案.md --hb ../world/角色_talk/_heartbeat.txt
 *   双文件：  node wait_file.js 路径A 路径B（两个都就位才算完成）
 *   多审核方：node wait_file.js review-result_架构师-林纳斯.md.signal review-result_前端开发-尤雨溪.md.signal review-result_质量审计-图灵.md.signal
 *             （不带 --any = 全部就位才返回 = "等齐三方结果"语义，2026-08-10 DHH 复盘——别手写等文件脚本）
 *   --parent-check：等待前检查父目录存在（不存在 = 任务目录路径可能写错，立即报错，不静默等满超时）
 *   --timeout 默认 20 分钟（与模板兜底一致）
 *   --watch-hb <对方心跳文件>：等待中监控对方心跳（12-6 搭档失联检测）——对方心跳超过阈值未更新 → PARTNER_DEAD + exit 4（防盲等，双人对话答方等问方用）
 *   --watch-hb-dead <分钟>：失联阈值，默认 15 分钟（心跳 stale 且对方目录无新文件才算失联）
 *   --no-ack：禁用自动 ack（默认开启——2026-08-10 改：等 .signal/.md 就位自动 ack 同名 .signal 并留痕，无需带参数；手动 rename 是留痕黑洞）
 *
 * 退出码：0 = 目标就位；2 = 超时（目标未就位）；3 = 父目录不存在（--parent-check）；4 = 对方失联（--watch-hb 触发）；5 = 写方漏发信号（目标 .md 新产出但缺 .signal）
 * 心跳：每 30s 写一次 Date.now()（数字毫秒）到 --hb 指定文件（不传则从 __dirname 自动推导角色对讲目录续心跳，12-6 修复）
 *
 * 9-1 修复（2026-08-05 第九轮）：路径自动锚定，与 CWD 无关——
 *   本脚本位于 {角色目录}/temp-scripts/wait_file.js，用 __dirname 推导角色目录/项目根：
 *     角色目录 = __dirname/.. ；项目根 = __dirname/../..
 *   参数以 "../" 开头（相对角色目录写法）→ path.resolve(__dirname, "..", 参数) 自动转绝对路径；
 *   绝对路径参数原样透传。无论角色 CWD 在哪（角色目录 / cd 进temp-scripts / 别处）路径都正确。
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
var ackMode = true;   // 13-1/2026-08-10：自动 ack 默认开启（等 .signal/.md 就位自动 rename 为 _acked + action-log留痕）——角色漏带 --ack 导致手动 rename 跳过留痕（林纳斯 003 实测）；--no-ack 显式关闭

for (var i = 0; i < args.length; i++) {
  var a = args[i];
  if (a === "--help" || a === "-h") {
    console.log("用法: node wait_file.js <目标路径> [目标路径2] [--hb <心跳文件>] [--timeout 分钟] [--parent-check] [--any] [--ack]");
    console.log("  --any: 任一目标就位即返回（默认=全部就位）");
    console.log("  自动 ack 默认开启：目标 .signal 就位自动 rename 为 _acked；目标 .md 就位自动 ack 同名 .signal（含action-log留痕）——无需带参数；--no-ack 显式关闭");
    console.log("  --parent-check: 等待前检查父目录存在（缺失=任务目录路径可能写错）");
    console.log("  --hb: 每 30s 写心跳到指定文件（不传则自动推导角色对讲目录续心跳，12-6）");
    console.log("  --watch-hb: 监控对方心跳（搭档失联检测，超阈值 exit 4）");
    console.log("  --watch-hb-dead: 失联阈值分钟数（默认 15）");
    console.log("  --timeout: 默认 20 分钟");
    console.log("  退出码: 0=就位 2=超时 3=父目录缺失 4=对方失联 5=写方漏发信号");
    process.exit(0);
  }
  if (a === "--hb") { hbFile = args[++i]; }
  else if (a === "--watch-hb") { watchHbFile = args[++i]; }
  else if (a === "--watch-hb-dead") { watchHbDeadMin = parseInt(args[++i], 10) || 15; }
  else if (a === "--timeout") { timeoutMin = parseInt(args[++i], 10) || 20; }
  else if (a === "--parent-check") { parentCheck = true; }
  else if (a === "--any") { anyMode = true; }
  else if (a === "--ack") { ackMode = true; }
  else if (a === "--no-ack") { ackMode = false; }
  else { targets.push(a); }
}

if (targets.length === 0) {
  console.error("用法: node wait_file.js <目标路径> [目标路径2] [--hb <心跳>] [--timeout 分钟] [--parent-check]");
  process.exit(2);
}

// ---- 9-1 路径锚定：相对角色目录（../开头）→ 绝对路径；与 CWD 无关 ----
var roleDir = path.resolve(__dirname, "..");   // 角色目录 = temp-scripts/..
function anchor(p) {
  if (!p) return p;
  // Windows 盘符绝对路径（D:\...）原样透传
  if (/^[a-zA-Z]:[\/]/.test(p)) return p;
  // 其余（../world/X、world/X、相对路径）统一锚定到角色目录
  return path.resolve(roleDir, p);
}
targets = targets.map(anchor);
if (hbFile) hbFile = anchor(hbFile);
if (watchHbFile) watchHbFile = anchor(watchHbFile);

// 12-6 修复：无 --hb 时从 __dirname 自动推导角色对讲目录续心跳（角色目录 = temp-scripts/..，对讲目录 = 项目根/world/{角色名}_talk）
//   防止等待中不传 --hb 导致心跳断 → monitor 误判 DEAD（H1：答方等待命令示例曾缺 --hb）
if (!hbFile) {
  try {
    var _roleName = path.basename(roleDir);
    var _autoHb = path.resolve(roleDir, "..", "world", _roleName + "_talk", "_heartbeat.txt");
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

// ---- 13-2 写方缺信号告警（2026-08-08 实测暴露，评审轮正方 T1/T2/06 三处漏发）----
// 隐患 #17：角色写完 .md 后忘了写同名 .signal，搭档 wait_file 空等。
// 机制化：等待前扫描任务目录，若存在「.md 无同名 .signal / _acked」的产出（最近 5 分钟内写入），
// 立即报错退出（exit 5）——把"漏发"从静默吞掉变成立即失败（马斯克 v2 建议：工具链根治）。
// 13-7 修复（泰勒 006 质询实测）：扫描范围收窄——原扫整个任务目录所有 .md（5 分钟内），
// 搭档正在写的 .md/别人的产出会被误伤（泰勒两场景：signal 被 ack 后扫描误判 + 主笔正在写please-review时误伤）。
// 修正：只检查"与等待目标同名"的 .md（等 review-result_角色X.md.signal → 只查 review-result_角色X.md 是否有信号），
// 其他 review-result_别人.md 等无关文件不检查——精确同名，杜绝误伤。
var _missingSignal = false;
var _suspectedMissing = null; // 2026-08-22：疑似漏发清单（短等复查用），非立即判死
try {
  var _waitDirs = targets.map(function(t) { return path.dirname(t); });
  var _cut13 = Date.now() - 5 * 60 * 1000;
  // 等待目标同名 .md 集合：等 xxx.md.signal → 检查 xxx.md；等 xxx.signal → 检查 xxx 与 xxx.md（兼容两种命名）
  function _targetMds(t) {
    var base = path.basename(t);
    var names = [];
    if (/\.signal(_acked|_processed)?$/i.test(base)) {
      var main = base.replace(/\.signal(_acked|_processed)?$/i, "");
      if (/\.md$/.test(main)) names.push(main);
      else { names.push(main); names.push(main + ".md"); }
    } else if (/\.md$/.test(base)) {
      names.push(base);
    }
    return names;
  }
  var _targetMdsList = [];
  targets.forEach(function(t) { _targetMdsList = _targetMdsList.concat(_targetMds(t)); });
  _waitDirs.forEach(function(d) {
    var entries;
    try { entries = fs.readdirSync(d); } catch(_e) { return; }
    entries.forEach(function(f) {
      if (!/\.md$/.test(f)) return;
      // 13-7：只检查"等待目标同名"的 .md——无关文件（搭档写的/别人的产出）不检查
      var inScope = _targetMdsList.indexOf(f) !== -1;
      if (!inScope) return;
      // 13-4 修复（稻盛和夫 001 实测）：归档文件（_第N次.md / _processed.md / _processed_N.md）
      // 是旧文件改名留痕，不是写方新产出——跳过错报 MISSING_SIGNAL_ABORT。
      if (/_第\d+次\.md$/.test(f) || /_processed(?:\d+)?\.md$/.test(f)) return;
      // 2026-08-21 修复（辩论场景实测）：debate-end.md 是"终结检测目标"，协议故意不带 .signal
      //   （见 _debate_mode.md「辩论终结」）——不报缺信号，否则 wait_file --any 等它时每次误报。
      if (f === "debate-end.md") return;
      var base = f.replace(/\.md$/, "");
      // 13-3 修复（稻盛和夫 001 实测）：协议信号命名是 xxx.md.signal（带 .md），
      // 原检测只查 base+".signal"（去掉 .md）→ 把已发信号的产出误报 MISSING_SIGNAL_ABORT。
      // 兼容两种命名：xxx.signal（无 .md）与 xxx.md.signal（协议标准）。
      var hasSignal = entries.some(function(e) {
        return e === base + ".signal" || e === base + ".signal_acked" || e === base + ".signal_processed" || e === base + ".signal_acked.md"
            || e === f + ".signal" || e === f + ".signal_acked" || e === f + ".signal_processed" || e === f + ".signal_acked.md";
      });
      if (hasSignal) return;
      try {
        var full = path.join(d, f);
        if (fs.statSync(full).mtimeMs > _cut13) {
          // 2026-08-22 修复（审核 AGENTS 指出的边缘情况）：写方写完 .md 后被中断（停顿>5s）才发 .signal →
          //   立即 exit 5 会误报"漏发"。改为先记录"疑似漏发"，短等合拢窗口（10s）复查：.signal 到了 = 两步窗口合拢（正常继续等）；
          //   一直不来 = 真漏发（保留原检测意图，exit 5）。
          if (!_suspectedMissing) _suspectedMissing = [];
          _suspectedMissing.push({ dir: d, file: f, base: base, full: full });
        }
      } catch(_e) {}
    });
  });
} catch(_e) {}
// 2026-08-22：疑似漏发短等复查（最多 10s，0.5s 轮询）——.signal 合拢则清除，真漏发才 exit 5
if (_suspectedMissing && _suspectedMissing.length > 0) {
  var _msDeadline = Date.now() + 10 * 1000;
  var _stillMissing;
  do {
    _stillMissing = [];
    _suspectedMissing.forEach(function(sm) {
      var hasSig = false;
      try {
        var entries = fs.readdirSync(sm.dir);
        hasSig = entries.some(function(e) {
          return e === sm.base + ".signal" || e === sm.base + ".signal_acked" || e === sm.base + ".signal_processed" || e === sm.base + ".signal_acked.md"
              || e === sm.file + ".signal" || e === sm.file + ".signal_acked" || e === sm.file + ".signal_processed" || e === sm.file + ".signal_acked.md";
        });
      } catch(_e) {}
      if (!hasSig) _stillMissing.push(sm);
    });
    if (_stillMissing.length > 0 && Date.now() < _msDeadline) {
      require("child_process").execSync("sleep 0.5", { stdio: "ignore" });
    }
  } while (_stillMissing.length > 0 && Date.now() < _msDeadline);
  _suspectedMissing = _stillMissing;
}
if (_suspectedMissing && _suspectedMissing.length > 0) {
  _suspectedMissing.forEach(function(sm) {
    console.error("MISSING_SIGNAL_ABORT: " + sm.file + " 是最近 5 分钟内的新产出但缺 .signal（等待 10s 未补发）——写方漏发（隐患 #17）！立即补发再等待：echo 时间戳 > 同名.signal（写 .md 与发信号是原子两步，不得分开）");
  });
  process.exit(5);
}

// ---- 2026-08-09 信号后缀白名单检测（马斯克质询建议②）----
// 协议只认两种信号状态：.signal（写方已发）/ .signal_acked（读方已读）。
// 扫描目标任务目录中最近的 .signal* 文件，发现非白名单后缀（如 .signal_ok/.signal_done）→ 告警，
// 不阻塞等待（防误伤历史遗留），把"角色自创后缀"从静默变可见。
try {
  var _cutNS = Date.now() - 5 * 60 * 1000;
  _waitDirs.forEach(function(d) {
    var entriesNS;
    try { entriesNS = fs.readdirSync(d); } catch(_e) { return; }
    entriesNS.forEach(function(f) {
      if (!/\.signal/.test(f)) return;
      // 白名单：.signal / .signal_acked / .signal_processed（兼容历史协议）——其他后缀 = 违规
      if (/\.signal(_acked|_processed)?$/.test(f)) return;
      try {
        if (fs.statSync(path.join(d, f)).mtimeMs > _cutNS) {
          console.error("NONSTANDARD_SIGNAL: " + f + " 是非协议信号后缀——协议只认 .signal（写方已发）与 .signal_acked（读方已读），禁止自定义后缀（如 .signal_ok）！请勿手工创建，若已存在请移入 _acked 或删除。");
        }
      } catch(_e) {}
    });
    // ---- 2026-08-10 手动 rename 检测（马斯克 3 处 bash mv 留痕黑洞实证）----
    // .signal_acked 存在但角色action-log近 5 分钟无对应 "ACK" 行 = 可能手动 rename 绕过 ackLog（bash mv），
    // 审计无法归因"谁在何时 ack"。检测到 → 告警（不阻塞，把静默手动 rename 变可见）。
    // 2026-08-13 收窄（对齐 13-7，机制审查 MANUAL_ACK 跨角色误报）：只检查"等待目标同名"的 .signal_acked——
    // 搭档 wait_file ack 的无关信号（快节奏对话/打回同目录交换）不在检查范围，杜绝跨角色误报；手动 rename 必落在等待目标上，检测不失效。
    var _targetAckedList = [];
    targets.forEach(function(t) {
      var _tb = path.basename(t).replace(/\.signal(_acked|_processed)?$/i, "");
      if (_targetAckedList.indexOf(_tb) === -1) _targetAckedList.push(_tb);
    });
    entriesNS.forEach(function(f) {
      if (!/\.signal_acked$/.test(f)) return;
      if (_targetAckedList.indexOf(f.replace(/\.signal_acked$/, "")) === -1) return; // 2026-08-13：非等待目标同名不检查
      try {
        if (fs.statSync(path.join(d, f)).mtimeMs > _cutNS) {
          var _mBase = f.replace(/\.signal_acked$/, "");
          var _log = path.resolve(roleDir, "..", "world", path.basename(roleDir) + "_talk", path.basename(roleDir) + "_action-log.md");
          var _hasAck = false;
          try {
            if (fs.existsSync(_log)) {
              var _logContent = fs.readFileSync(_log, "utf8");
              _hasAck = _logContent.indexOf("ACK " + _mBase + ".signal") !== -1;
            }
          } catch(_e) {}
          if (!_hasAck) {
            console.error("MANUAL_ACK_DETECTED: " + f + " 是 .signal_acked 但action-log无对应 ACK 记录——疑似手动 rename（bash mv）绕过 ackLog！必须用 wait_file.js 等/ack（自动 ack + 留痕），手动 rename 是留痕黑洞（2026-08-10 马斯克实证）。");
          }
        }
      } catch(_e) {}
    });
  });
} catch(_eNS) {}


// ---- 主循环 ----
var startTs = Date.now();
var deadline = startTs + timeoutMin * 60 * 1000;
var lastHbTs = 0;

function allReady() {
  // 2026-08-13（机制审查 #24）：.md 目标就位判定加非空校验（size>0）——写方先建空占位再填充会秒返误判完成；
  //   .signal 目标保持"存在即就位"（信号文件可能为空，内容在对应 .md 里），不改
  function _ready(t) {
    try {
      if (!fs.existsSync(t)) return false;
      if (/\.md$/i.test(t)) {
        return fs.statSync(t).size > 0;
      }
      return true;
    } catch(_e) { return false; }
  }
  return anyMode
    ? targets.some(_ready)
    : targets.every(_ready);
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
// 2026-08-09 增补（信号质询 007 根因）：目标为 .md 文件时就位后，自动 ack 同名 .signal——
//   辩论裁判等总结 .md 本体（第 7 步示例），不处理信号 → con-summary .signal 残留；
//   等 .md 就位 = 读到内容 = 读方义务，脚本代 ack 零手工（马斯克/图灵共同建议：工具原子行为）。
//   兼容两种命名：xxx.md.signal（协议标准）与 xxx.signal（旧/其他玩法）。
function ackSignals() {
  if (!ackMode) return;
  targets.forEach(function(t) {
    if (/\.signal$/i.test(t)) {
      try {
        if (fs.existsSync(t)) {
          var target = t.replace(/\.signal$/i, ".signal_acked");
          fs.renameSync(t, target);
          console.log("ACK: " + path.basename(t) + " -> " + path.basename(target));
          ackLog(t, target); // 2026-08-09 留痕（马斯克质询建议③）
        }
      } catch(_e) {}
    } else if (/\.md$/i.test(t)) {
      // 2026-08-09：目标 .md 就位 → ack 同名 .signal（.md.signal 与 .signal 两种命名都查）
      try {
        if (fs.existsSync(t)) {
          var base = t.replace(/\.md$/i, "");
          var sigCandidates = [t + ".signal", base + ".signal"];
          sigCandidates.forEach(function(sig) {
            if (fs.existsSync(sig)) {
              var acked = sig.replace(/\.signal$/i, ".signal_acked");
              fs.renameSync(sig, acked);
              console.log("ACK: " + path.basename(sig) + " -> " + path.basename(acked));
              ackLog(sig, acked);
            }
          });
        }
      } catch(_e) {}
    }
  });
}

// 2026-08-09：ACK 动作留痕——追加一行到角色action-log（world/{角色}_talk/{角色}_action-log.md）
//   解决"文件出现"与"角色动作"的归因歧义（本次 .signal_ok 质询因缺留痕导致归因困难，马斯克建议③）
function ackLog(src, dst) {
  try {
    var _role = path.basename(roleDir);
    var _log = path.resolve(roleDir, "..", "world", _role + "_talk", _role + "_action-log.md");
    fs.mkdirSync(path.dirname(_log), { recursive: true });
    var _ts = new Date().toISOString().substring(11, 19);
    fs.appendFileSync(_log, "[" + _ts + "] ACK " + path.basename(src) + " -> " + path.basename(dst) + "\n", "utf8");
  } catch(_e) {}
}

// 先检查是否已就位（防"旧文件秒返"——调用方需自行确认目标当前不存在才该等）
if (allReady()) {
  // 2026-08-21 修复（Writer 005 实锤）：等 .md 目标时，写方两步窗口（.md 先落、.signal 后落）导致
  //    .signal 还没出现就 ack → ack 扑空 → 信号残留。.md 就位后短等 .signal 合拢（最多 5 秒轮询）。
  //    若 .signal 一直不来（如 debate-end.md 故意不带信号）→ 短等结束照常返回（不 ack、不卡死）。
  if (ackMode && !anyMode && targets.some(function(t) { return /\.md$/i.test(t); })) {
    var _mdWaitDeadline = Date.now() + 5000;
    var _needSignal = targets.some(function(t) {
      if (!/\.md$/i.test(t)) return false;
      try {
        if (!fs.existsSync(t)) return false;
        var base = t.replace(/\.md$/i, "");
        return ![t + ".signal", base + ".signal"].some(function(s) { return fs.existsSync(s); });
      } catch(_e) { return false; }
    });
    while (_needSignal && Date.now() < _mdWaitDeadline) {
      var _stillMissing = false;
      targets.forEach(function(t) {
        if (!/\.md$/i.test(t)) return;
        try {
          if (!fs.existsSync(t)) return;
          var base = t.replace(/\.md$/i, "");
          var hasSig = [t + ".signal", base + ".signal"].some(function(s) { return fs.existsSync(s); });
          if (!hasSig) _stillMissing = true;
        } catch(_e) {}
      });
      if (!_stillMissing) break;
      require("child_process").execSync("sleep 0.5", { stdio: "ignore" });
    }
  }
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
  // 2026-08-22：长等待期间顺带探测大鱼回复（fish-reply_* 未读）——
  //   否则角色长等待（等搭档/等依赖）时求助回复到了也看不到（earthling 求助实测：reply 落盘无人读）
  //   探测到 → REPLY_DETECTED + exit 6，角色先读回复再决定：决策型按回复行动 / 报备型重新 wait_file 继续等
  if (hbFile) {
    try {
      var _myTalk = path.dirname(hbFile);
      var _replies = fs.readdirSync(_myTalk).filter(function(_rf) {
        return _rf.indexOf("fish-reply") === 0 && _rf.indexOf("_read") === -1;
      });
      if (_replies.length > 0) {
        console.log("REPLY_DETECTED: " + _replies[0] + "（大鱼回复已到，先读再决定继续等/改道）");
        process.exit(6);
      }
    } catch(_re2) {}
  }
  // 12-6 搭档失联检测（--watch-hb）：对方心跳超过阈值未更新 → PARTNER_DEAD + exit 4
  if (watchHbFile) {
    try {
      var _pRaw = fs.readFileSync(watchHbFile, "utf8");
      var _pTs = parseInt(String(_pRaw || "").trim(), 10);
      if (_pTs && Date.now() - _pTs > watchHbDeadMin * 60 * 1000) {
        // M7 宽容 + 2026-08-16 扩展（隐患#19 实弹：马斯克写 001 盘点被误判失联）：
        // 心跳 stale 但对方最近 watchHbDeadMin 分钟内有新文件 = 在干活/长思考，不算失联（对齐 monitor A-1 + 主区判据）。
        // 扫描范围 = 对讲目录 + 产出目录 + 任务*目录——干活期角色只在output/task写文件、对讲静默，
        // 只查对讲目录会误判干活中的搭档（本批次架构师按失联分支收尾的根因）。
        var _pDir = path.dirname(watchHbFile);          // 对方 对讲目录
        var _worldDir = path.resolve(_pDir, "..");      // world/
        var _partnerName = path.basename(_pDir).replace("_talk", ""); // 2026-08-17 P2-17：共享区归属限定用（对方角色名）
        var _scanDirs = [_pDir];
        try {
          if (fs.existsSync(_worldDir + "/output")) _scanDirs.push(_worldDir + "/output");
          fs.readdirSync(_worldDir).forEach(function(_d2) {
            if (/^task\d+/.test(_d2) && fs.existsSync(_worldDir + "/" + _d2)) _scanDirs.push(_worldDir + "/" + _d2);
          });
        } catch(_psd) {}
        var _working = false;
        var _isMonitorFile = function(_f) {
          return _f.indexOf("_wakeup") === 0 || _f.indexOf("fish-reply") === 0 || _f.indexOf("needs-intervention") === 0 ||
            _f === "_heartbeat.txt" || _f === "_hb_state.json" || _f === "_mtime.txt"; // 心跳文件内容 stale 但文件 mtime 最近写入——不算活动证据（monitor 同款防自指）
        };
        try {
          var _cut = Date.now() - watchHbDeadMin * 60 * 1000;
          for (var _sd = 0; _sd < _scanDirs.length && !_working; _sd++) {
            (function scanRecent(dir, isTalkDir) {
              var entries;
              try { entries = fs.readdirSync(dir); } catch(_e) { return; }
              for (var _si = 0; _si < entries.length && !_working; _si++) {
                var _full = dir + "/" + entries[_si];
                try {
                  var _st = fs.statSync(_full);
                  if (_st.isDirectory()) { if (entries[_si] !== "_回收站") scanRecent(_full, isTalkDir); }
                  else if (_st.mtimeMs > _cut) {
                    if (isTalkDir) {
                      if (_isMonitorFile(entries[_si])) continue;
                      _working = true; return;
                    }
                    // 2026-08-17 P2-17：共享区归属限定（对齐 monitor 主区判据）——只认 文件名含对方角色名 或 .ready producer 归属对方；
                    // 否则 3 人+ 场景搭档真死、第三人干活 → 误判搭档活着，exit 4 永不触发（盲等 20 分钟）
                    if (entries[_si].indexOf(_partnerName) !== -1) { _working = true; return; }
                    if (/\.ready$/.test(entries[_si])) {
                      try {
                        var _pc2 = fs.readFileSync(_full, "utf8");
                        var _pcm2 = _pc2.match(/^producer:\s*(.+)$/m); // 2026-08-17 review P2-1：改精确匹配（对齐 monitor 格式B 同源）——原子串正则会把"producer: 甲乙"误命中角色"甲"
                        if (_pcm2 && _pcm2[1] && _pcm2[1].trim() === _partnerName) { _working = true; return; }
                      } catch(_pc2e) {}
                    }
                  }
                } catch(_e2) {}
              }
            })(_scanDirs[_sd], _sd === 0);
          }
        } catch(_ph2) {}
        if (!_working) {
          console.error("PARTNER_DEAD: 对方心跳 " + Math.round((Date.now() - _pTs) / 1000) + "s 未更新（阈值 " + watchHbDeadMin + " 分钟）且output/task/对讲均无新文件——对方失联，结束信号/下一问不会再来。立即写求助给大鱼，不要盲等超时（12-6）");
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
