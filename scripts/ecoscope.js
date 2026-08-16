// ecoscope.js —— 生态仪表盘（EcoScope）v1.0（2026-08-16）
// 用途: 一页盯场视图——读 我的世界/（公告牌/对讲/产出），输出角色存活（心跳 mtime）+
//       轮次进度 + 签字/产出完成矩阵。针对整套机制最大风险"角色静默下线"（铁律 12）：
//       monitor 事后发现（60s 周期）→ 本工具让老渣随时一眼看到谁还活着、谁心跳断了。
//       共识来源: 阅览室/评审记录_20260816_生态工具清单/生态工具清单_共识.md（P0/P1 第二位，
//       EcoScope + status-board + HeartbeatBoard 三合一，只读文件系统 + 时间戳比对，无状态）
// 用法: node ecoscope.js <项目根目录>
//       例: node ecoscope.js "一号舱室-软件开发部"（项目根 = 含 我的世界/ 与 火影-大鱼/ 的目录）
// 输出: 一页 markdown（stdout）——概览 / 角色存活表 / 轮次进度矩阵 / 告警汇总
// 只读工具: 不写任何文件（与 monitor 不同，它是视图不是验证者；判据全读）
// ⚠️ 同源声明（改判据必须多改）:
//   心跳解析与 assets/monitor.js:21-29 同源（毫秒/秒/ISO 三态）；心跳阈值与 monitor.js:432 同源
//   （_运行形态.mode = run → 10 分钟，否则 2 分钟）；公告牌解析与 scripts/check.js / scripts/boardlint.js
//   同源（三者又与 monitor.js:369-611 同源）。任何一处改判据，各处必须同步。
// 退出码: 0=正常输出 2=参数错误（看板是视图不是校验——角色异常在输出里标 ⚠️，不用退出码表达）
// 零依赖（Node 原生），ES5 风格，与 codex-ninja 一致

var fs = require("fs");
var path = require("path");

// ── 判据常量（与 monitor.js 同源）──
var ACTIVE_RE = /- (.+?)[（(].*状态[:：]\s*活跃/g;
var ALL_ROLE_RE = /- (.+?)[（(].*状态[:：]\s*(?:退场|休眠)/g;
var MODE_RE = /模式[：:]\s*(.+)/;
var OUTPUT_RE = /(?:^|\n)- 产出[:：]\s*我的世界\/([^\r\n]+)/g;
var BLACKLIST = ["模式", "任务", "产出", "产出负责人", "任务目录", "辩论轮数"];
var BOARD_RE = /公告牌_(\d{3})\.md$/;

// ── 工具函数 ──
function stripBom(s) { return s.replace(/^\uFEFF/, ""); }
function pad3(n) { return String(n).padStart(3, "0"); }

// 心跳时间戳解析（monitor.js:21-29 同源）
function parseHeartbeat(raw) {
  var s = String(raw || "").trim();
  if (!s) return NaN;
  var n = parseInt(s, 10);
  if (!isNaN(n) && n >= 1000000000000) return n;
  if (!isNaN(n) && n >= 1000000000 && n < 1000000000000) return n * 1000;
  var iso = Date.parse(s);
  return isNaN(iso) ? NaN : iso;
}

// 解析单张公告牌 → { n, mode, activeRoles, roleStates: {角色: 状态}, outputs: [{dir, files|null}] }
function parseBoard(n, content) {
  var board = stripBom(content);
  var headerPart = board.split(/\n- 任务[:：]/)[0];
  var modeM = board.match(MODE_RE);
  var mode = modeM ? modeM[1].trim() : "?";
  var activeRoles = [], allRoles = [], roleStates = {};
  var m;
  ACTIVE_RE.lastIndex = 0;
  while ((m = ACTIVE_RE.exec(headerPart)) !== null) {
    var rn = m[1].replace(/^组[A-Z]\s*[:：]\s*/, "");
    if (/[\\/]|\.\./.test(rn)) continue;
    activeRoles.push(rn); roleStates[rn] = "活跃";
  }
  ALL_ROLE_RE.lastIndex = 0;
  while ((m = ALL_ROLE_RE.exec(headerPart)) !== null) {
    var arn = m[1].replace(/^组[A-Z]\s*[:：]\s*/, "");
    if (BLACKLIST.indexOf(arn) !== -1 || arn.indexOf(":") !== -1 || arn.indexOf("：") !== -1) continue;
    if (/[\\/]|\.\./.test(arn)) continue;
    allRoles.push(arn);
    roleStates[arn] = /状态[:：]\s*退场/.test(m[0]) ? "退场" : "休眠";
  }
  // 待命角色（状态：待命）——补全 roleStates
  var standbyRe = /- (.+?)[（(].*状态[:：]\s*待命/g;
  var sm;
  standbyRe.lastIndex = 0;
  while ((sm = standbyRe.exec(headerPart)) !== null) {
    var sn = sm[1].replace(/^组[A-Z]\s*[:：]\s*/, "");
    if (/[\\/]|\.\./.test(sn)) continue;
    roleStates[sn] = "待命";
  }
  var outputs = [];
  var om;
  OUTPUT_RE.lastIndex = 0;
  while ((om = OUTPUT_RE.exec(board)) !== null) {
    var fullPath = om[1];
    var lastSlash = fullPath.lastIndexOf("/");
    var dir, files = null;
    if (lastSlash !== -1 && !fullPath.endsWith("/")) {
      dir = fullPath.substring(0, lastSlash);
      files = fullPath.substring(lastSlash + 1).split(/\s*,\s*/);
    } else {
      dir = fullPath.replace(/\/$/, "");
    }
    outputs.push({ dir: dir, files: files });
  }
  var ownerM = board.match(/\n- 产出负责人[:：]\s*(.+)/);
  var ownerEach = ownerM && ownerM[1].trim() === "各自";
  return { n: n, mode: mode, activeRoles: activeRoles, allRoles: allRoles, roleStates: roleStates, outputs: outputs, ownerEach: ownerEach };
}

// ── 主流程 ──
function main() {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("用法: node ecoscope.js <项目根目录>（项目根 = 含 我的世界/ 与 火影-大鱼/ 的目录）");
    process.exit(2);
  }
  var root = path.resolve(args[0]);
  if (!fs.existsSync(path.join(root, "我的世界"))) {
    console.error("ERROR: '" + root + "' 下没有 我的世界/ 目录——参数应是项目根（我的世界/ 的上级）");
    process.exit(2);
  }
  var worldDir = path.join(root, "我的世界");
  var fishDir = path.join(root, "火影-大鱼");

  // 心跳阈值（monitor.js:432 同源: run 形态干完即退心跳停是正常态，10 分钟才判）
  var hbTimeout = 2 * 60 * 1000;
  try {
    if (fs.existsSync(path.join(fishDir, "_运行形态.mode")) &&
        fs.readFileSync(path.join(fishDir, "_运行形态.mode"), "utf8").trim() === "run") hbTimeout = 10 * 60 * 1000;
  } catch (e) {}

  // 公告牌列表（我的世界/ 为权威——角色 poll 的是它）
  var boards = [];
  try {
    var entries = fs.readdirSync(worldDir).filter(function(f) { return BOARD_RE.test(f); });
    entries.sort();
    entries.forEach(function(f) {
      var n = parseInt(BOARD_RE.exec(f)[1], 10);
      boards.push(parseBoard(n, fs.readFileSync(path.join(worldDir, f), "utf8")));
    });
  } catch (e) { console.error("ERROR: 读取 我的世界/ 失败: " + e.message); process.exit(2); }

  // 当前轮 N（.monitor_state.json）
  var curN = boards.length ? boards[boards.length - 1].n : 0;
  try {
    var st = JSON.parse(fs.readFileSync(path.join(worldDir, ".monitor_state.json"), "utf8"));
    if (st.N && st.N >= 1) curN = st.N;
  } catch (e) {}
  var curBoard = null;
  for (var i = 0; i < boards.length; i++) if (boards[i].n === curN) curBoard = boards[i];

  // 角色集合（当前轮为准，缺则全局并集）
  var roles = [];
  var seen = {};
  (curBoard ? [curBoard] : boards).forEach(function(b) {
    b.roleStates && Object.keys(b.roleStates).forEach(function(r) {
      if (!seen[r]) { seen[r] = true; roles.push(r); }
    });
  });

  var now = Date.now();
  var alerts = [];

  console.log("=== EcoScope 生态仪表盘 ===");
  console.log("项目根: " + root);
  console.log("心跳阈值: " + (hbTimeout / 60000) + " 分钟（" + (hbTimeout === 10 * 60000 ? "run 拉起形态" : "窗口常驻形态") + "）");
  console.log("公告牌: " + boards.length + " 张 | monitor 当前轮 N=" + curN + (curBoard ? "（模式: " + curBoard.mode + "）" : "") + " | " + new Date().toISOString().substring(11, 19) + "\n");

  // ── 角色存活表 ──
  console.log("### 角色存活表（心跳 + 当前轮状态）");
  console.log("| 角色 | 当前轮状态 | 心跳 | 心跳新鲜度 | 判定 |");
  console.log("|------|-----------|------|-----------|------|");
  roles.forEach(function(role) {
    var st = curBoard && curBoard.roleStates ? (curBoard.roleStates[role] || "—") : "—";
    var hbFile = path.join(worldDir, role + "_大鱼对讲", "_heartbeat.txt");
    var hbT = NaN, hbStr = "—", fresh = "—", verdict = "—";
    try {
      if (fs.existsSync(hbFile)) {
        hbT = parseHeartbeat(fs.readFileSync(hbFile, "utf8"));
        if (!isNaN(hbT)) {
          hbStr = new Date(hbT).toISOString().substring(11, 19);
          var age = Math.round((now - hbT) / 1000);
          fresh = (age < 60 ? age + "s" : Math.round(age / 60) + "m");
          if (st === "退场") {
            verdict = "✅ 已退场（心跳停正常）";
          } else if (now - hbT > hbTimeout) {
            verdict = "⚠️ 心跳超时（> " + (hbTimeout / 60000) + "min）——静默下线候选";
            alerts.push("⚠️ 角色 '" + role + "' 心跳超时（" + fresh + "）——当前状态 '" + st + "'，若实际在干活是长任务未续心跳，若真掉线需唤醒");
          } else {
            verdict = "✅ 心跳新鲜";
          }
        }
      } else {
        if (st === "退场") verdict = "✅ 已退场（无心跳文件正常）";
        else verdict = "— 无心跳文件（未启动 / 干完即退 run 形态）";
      }
    } catch (e) { verdict = "— 心跳读取失败"; }
    console.log("| " + role + " | " + st + " | " + hbStr + " | " + fresh + " | " + verdict + " |");
  });
  console.log("");

  // ── 轮次进度矩阵 ──
  console.log("### 轮次进度矩阵（签字 + 产出）");
  console.log("| 轮 | 模式 | 活跃角色 | 签字(完成_NNN) | 产出(.ready) |");
  console.log("|----|------|----------|---------------|--------------|");
  boards.forEach(function(b) {
    var signStr = [], prodStr = [];
    var active = b.activeRoles.length > 0 ? b.activeRoles : (b.allRoles || []);
    active.forEach(function(role) {
      var signFile = path.join(worldDir, role + "_大鱼对讲", "完成_" + pad3(b.n) + ".md");
      var has = fs.existsSync(signFile) && fs.statSync(signFile).size > 20;
      signStr.push(role + (has ? " ✓" : " ✗"));
    });
    b.outputs.forEach(function(o) {
      var ok = false;
      if (o.files && o.files.length > 0) {
        ok = o.files.every(function(fn) { return fs.existsSync(path.join(worldDir, o.dir, fn.trim() + ".ready")); });
      } else {
        try {
          var readyFiles = fs.existsSync(path.join(worldDir, o.dir)) ? fs.readdirSync(path.join(worldDir, o.dir)).filter(function(f) { return f.endsWith(".ready"); }) : [];
          if (b.ownerEach) {
            // 各自场景 producer 归属校验（monitor.js:595-611 同源）——每个活跃角色需有带自己 producer 的 .ready
            var producers = {}, unknownReady = 0;
            readyFiles.forEach(function(rf) {
              try {
                var rc = fs.readFileSync(path.join(worldDir, o.dir, rf), "utf8");
                var pm = rc.match(/^producer:\s*(.+)$/m);
                if (pm && pm[1]) { producers[pm[1].trim()] = true; return; }
              } catch (e2) {}
              unknownReady++;
            });
            var missingOwner = b.activeRoles.filter(function(ar) { return !producers[ar]; });
            ok = missingOwner.length === 0 || unknownReady >= missingOwner.length; // 未知归属可顶缺（兼容历史）
            if (!ok) alerts.push("⚠️ 第" + pad3(b.n) + "轮 产出各自场景 producer 未覆盖: 缺 " + (missingOwner.join(",") || "?") + "（.ready 无对应 producer，疑似未交付或一人重复交付）");
          } else {
            ok = readyFiles.length > 0;
          }
        } catch (e2) { ok = false; }
      }
      prodStr.push(o.dir.replace(/^产出\//, "") + (ok ? " ✓" : " ✗"));
      if (!ok) alerts.push("⚠️ 第" + pad3(b.n) + "轮 产出未就位: " + o.dir);
    });
    if (b.mode === "收工" || b.mode === "待命") { signStr = ["—"]; prodStr = ["—"]; }
    if (b.mode === "待命" && b.outputs.length === 0) prodStr = ["—"];
    // 任务轮活跃角色签字缺失告警
    if (b.mode !== "收工" && b.mode !== "待命") {
      active.forEach(function(role) {
        var signFile = path.join(worldDir, role + "_大鱼对讲", "完成_" + pad3(b.n) + ".md");
        if (!(fs.existsSync(signFile) && fs.statSync(signFile).size > 20)) alerts.push("⚠️ 第" + pad3(b.n) + "轮 " + role + " 缺签字（完成_" + pad3(b.n) + ".md）");
      });
    }
    console.log("| " + pad3(b.n) + " | " + b.mode + " | " + (b.mode === "收工" ? "全员退场" : b.mode === "待命" ? "全员待命" : (active.join("、") || "—")) + " | " + signStr.join("、") + " | " + prodStr.join("、") + " |");
  });
  console.log("");

  // ── 告警汇总 ──
  console.log("### 告警汇总");
  if (alerts.length === 0) {
    console.log("无告警——全员心跳新鲜、签字/产出齐全（当前轮未完成属正常推进）");
  } else {
    alerts.forEach(function(a) { console.log(a); });
  }
  console.log("");
  console.log("> 视图提示: 心跳阈值 " + (hbTimeout / 60000) + "min 与 monitor 同源；run 形态干完即退心跳停是正常态（不是掉线）");
  process.exit(0);
}

main();
