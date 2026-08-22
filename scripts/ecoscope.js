// ecoscope.js —— 生态仪表盘（EcoScope）v1.1（2026-08-16）
// 用途: 离线批次状态视图——读 world/（公告牌/对讲/output），输出角色存活（心跳 mtime）+
//       轮次进度 + 签字/output完成矩阵。定位: **给用户/老渣离线看批次进度**（不是盯场——
//       在线检测是 monitor 的活；不是收工校验——那是 check.js 的活）。
//       共识来源: 阅览室/评审记录_20260816_生态工具清单/生态工具清单_共识.md（P0/P1 第二位，
//       EcoScope + status-board + HeartbeatBoard 三合一，只读文件系统 + 时间戳比对，无状态）
// 形态（v1.1 定位修正: 评审指出 CLI 形态增量薄，monitor/check 已覆盖；唯一真空白=离线一页给用户看）:
//   node ecoscope.js <项目根目录>               # CLI 文本视图（备查/调试）
//   node ecoscope.js <项目根目录> --html > 批次状态.html   # HTML 单文件视图（浏览器打开，
//       每 30s 自动刷新——用户离线看进度；自包含无外部依赖，双击即用）
// 输出: 概览 / 角色存活表 / 轮次进度矩阵 / 告警汇总（两种渲染共用同一份采集数据）
// 只读工具: 不写任何文件（--html 输出走 shell 重定向，脚本本身零写入）
// ⚠️ 同源声明（改判据必须多改）:
//   心跳解析与 assets/monitor.js:21-29 同源（毫秒/秒/ISO 三态）；心跳阈值与 monitor.js:432 同源
//   （_run_shape.mode = run → 10 分钟，否则 2 分钟）；公告牌解析与 scripts/check.js / scripts/boardlint.js
//   同源（三者又与 monitor.js:369-611 同源）。任何一处改判据，各处必须同步。
// 退出码: 0=正常输出 2=参数错误（视图非校验——异常在输出里标 ⚠️，不用退出码表达）
// 零依赖（Node 原生），ES5 风格，与 codex-ninja 一致

var fs = require("fs");
var path = require("path");

// ── 判据常量（与 monitor.js 同源）──
var ACTIVE_RE = /- (.+?)[（(].*状态[:：]\s*活跃/g;
var ALL_ROLE_RE = /- (.+?)[（(].*状态[:：]\s*(?:退场|休眠)/g;
var MODE_RE = /模式[：:]\s*(.+)/;
var OUTPUT_RE = /(?:^|\n)- 产出[:：]\s*world\/([^\r\n]+)/g;
var BLACKLIST = ["模式", "任务", "产出", "产出负责人", "任务目录", "辩论轮数"];
var BOARD_RE = /board_(\d{3})\.md$/;

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

// 解析单张公告牌 → { n, mode, activeRoles, roleStates: {角色: 状态}, outputs: [{dir, files|null}], ownerEach }
function parseBoard(n, content) {
  var board = stripBom(content);
  var headerPart = board.split(/\n- 任务[:：]/)[0];
  var modeM = board.match(MODE_RE);
  var mode = modeM ? modeM[1].trim() : "?";
  var activeRoles = [], allRoles = [], standbyRoles = [], roleStates = {};
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
  var standbyRe = /- (.+?)[（(].*状态[:：]\s*待命/g; // 2026-08-17 review P2-2：试用轮全员校验用（角色行=待命等通知，对齐 check.js #16 STANDBY_RE）
  var sm;
  standbyRe.lastIndex = 0;
  while ((sm = standbyRe.exec(headerPart)) !== null) {
    var sn = sm[1].replace(/^组[A-Z]\s*[:：]\s*/, "");
    if (BLACKLIST.indexOf(sn) !== -1 || sn.indexOf(":") !== -1 || sn.indexOf("：") !== -1) continue; // check.js 同款黑名单
    if (/[\\/]|\.\./.test(sn)) continue;
    standbyRoles.push(sn);
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
  return { n: n, mode: mode, activeRoles: activeRoles, allRoles: allRoles, standbyRoles: standbyRoles, roleStates: roleStates, outputs: outputs, ownerEach: ownerEach };
}

// ── 数据采集层（唯一事实源，双渲染共用）──
function collectData(root) {
  var worldDir = path.join(root, "world");
  var fishDir = path.join(root, "fish");

  // 心跳阈值（monitor.js:432 同源）
  var hbTimeout = 2 * 60 * 1000;
  try {
    if (fs.existsSync(path.join(fishDir, "_run_shape.mode")) &&
        fs.readFileSync(path.join(fishDir, "_run_shape.mode"), "utf8").trim() === "run") hbTimeout = 10 * 60 * 1000;
  } catch (e) {}

  // 公告牌列表
  var boards = [];
  try {
    var entries = fs.readdirSync(worldDir).filter(function(f) { return BOARD_RE.test(f); });
    entries.sort();
    entries.forEach(function(f) {
      var n = parseInt(BOARD_RE.exec(f)[1], 10);
      boards.push(parseBoard(n, fs.readFileSync(path.join(worldDir, f), "utf8")));
    });
  } catch (e) { return { error: "读取 world/ 失败: " + e.message }; }

  // 当前轮 N（状态文件优先，但仅当该轮有公告牌；项目完成态 st.N 指向无牌轮 → 回退到有牌的最后一张，角色表按收工轮显示）
  var curN = boards.length ? boards[boards.length - 1].n : 0;
  try {
    var st = JSON.parse(fs.readFileSync(path.join(worldDir, ".monitor_state.json"), "utf8"));
    // 2026-08-22 修复: monitor 等待中只写 waitSinceN（=当前等待轮次），N 仅在 DONE 时写（=下一轮）——读错字段导致 curN 回退到最后一张公告牌（收工轮），整页角色误判"退场"
    var wantN = (st.waitSinceN && st.waitSinceN >= 1) ? st.waitSinceN : (st.N && st.N >= 1 ? st.N : 0);
    if (wantN >= 1 && boards.some(function(b) { return b.n === wantN; })) curN = wantN;
  } catch (e) {}
  var curBoard = null;
  for (var i = 0; i < boards.length; i++) if (boards[i].n === curN) curBoard = boards[i];

  // 角色集合
  var roles = [];
  var seen = {};
  (curBoard ? [curBoard] : boards).forEach(function(b) {
    b.roleStates && Object.keys(b.roleStates).forEach(function(r) {
      if (!seen[r]) { seen[r] = true; roles.push(r); }
    });
  });

  var now = Date.now();
  var alerts = [];

  // 角色存活表
  var roleRows = roles.map(function(role) {
    var st = curBoard && curBoard.roleStates ? (curBoard.roleStates[role] || "—") : "—";
    var hbFile = path.join(worldDir, role + "_talk", "_heartbeat.txt");
    var hbT = NaN, hbStr = "—", fresh = "—", verdict = "—", level = "ok";
    try {
      if (fs.existsSync(hbFile)) {
        hbT = parseHeartbeat(fs.readFileSync(hbFile, "utf8"));
        if (!isNaN(hbT)) {
          hbStr = new Date(hbT).toISOString().substring(11, 19);
          var age = Math.round((now - hbT) / 1000);
          fresh = (age < 60 ? age + "s" : Math.round(age / 60) + "m");
          if (st === "退场") {
            verdict = "已退场（心跳停正常）";
          } else if (now - hbT > hbTimeout) {
            verdict = "心跳超时（> " + (hbTimeout / 60000) + "min）——静默下线候选";
            level = "bad";
            alerts.push("角色 '" + role + "' 心跳超时（" + fresh + "）——当前状态 '" + st + "'，若实际在干活是长任务未续心跳，若真掉线需唤醒");
          } else {
            verdict = "心跳新鲜";
          }
        }
      } else {
        if (st === "退场") verdict = "已退场（无心跳文件正常）";
        else { verdict = "无心跳文件（未启动 / 干完即退 run 形态）"; level = "warn"; }
      }
    } catch (e) { verdict = "心跳读取失败"; level = "warn"; }
    return { role: role, st: st, hbStr: hbStr, fresh: fresh, verdict: verdict, level: level };
  });

  // 轮次进度矩阵
  var boardRows = boards.map(function(b) {
    var signStr = [], prodStr = [];
    var isTaskRound = b.mode !== "收工" && b.mode !== "待命"; // 收工/待命轮无签字无产出
    var active = b.activeRoles.length > 0 ? b.activeRoles : ((b.mode === "试用" ? (b.allRoles || []).concat(b.standbyRoles || []) : (b.allRoles || []))); // 2026-08-17 review P2-2：试用轮按全员校验（角色行=待命，对齐 check.js #16）
    if (isTaskRound) {
      active.forEach(function(role) {
        var signFile = path.join(worldDir, role + "_talk", "done_" + pad3(b.n) + ".md");
        var has = fs.existsSync(signFile) && fs.statSync(signFile).size > 20;
        signStr.push({ role: role, ok: has });
        if (!has && b.n !== curN) alerts.push("第" + pad3(b.n) + "轮 " + role + " 缺签字（done_" + pad3(b.n) + ".md）"); // 当前轮未完成=正常推进不告警（monitor WAIT 同口径）
      });
      b.outputs.forEach(function(o) {
        var ok = false;
        if (o.files && o.files.length > 0) {
          ok = o.files.every(function(fn) { return fs.existsSync(path.join(worldDir, o.dir, fn.trim() + ".ready")); });
          // 2026-08-17 P2-18：格式A + 产出负责人:各自 补 producer 归属校验（对齐格式B 分支）——一人重复交付凑数判不过
          if (ok && b.ownerEach) {
            var producersA = {}, unknownA = 0;
            o.files.forEach(function(fn) {
              try {
                var rcA = fs.readFileSync(path.join(worldDir, o.dir, fn.trim() + ".ready"), "utf8");
                var pmA = rcA.match(/^producer:\s*(.+)$/m);
                if (pmA && pmA[1]) { producersA[pmA[1].trim()] = true; return; }
              } catch (e3) {}
              unknownA++;
            });
            var missA = b.activeRoles.filter(function(arA) { return !producersA[arA]; });
            ok = missA.length === 0 || unknownA >= missA.length;
            if (!ok && b.n !== curN) alerts.push("第" + pad3(b.n) + "轮 格式A 各自场景 producer 未覆盖: 缺 " + (missA.join(",") || "?"));
          }
        } else {
          try {
            var readyFiles = fs.existsSync(path.join(worldDir, o.dir)) ? fs.readdirSync(path.join(worldDir, o.dir)).filter(function(f) { return f.endsWith(".ready"); }) : [];
            if (b.ownerEach) {
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
              ok = missingOwner.length === 0 || unknownReady >= missingOwner.length;
              if (!ok && b.n !== curN) alerts.push("第" + pad3(b.n) + "轮 产出各自场景 producer 未覆盖: 缺 " + (missingOwner.join(",") || "?") + "（.ready 无对应 producer，疑似未交付或一人重复交付）");
            } else {
              ok = readyFiles.length > 0;
            }
          } catch (e2) { ok = false; }
        }
        prodStr.push({ name: o.dir.replace(/^产出\//, ""), ok: ok });
        if (!ok && b.n !== curN) alerts.push("第" + pad3(b.n) + "轮 产出未就位: " + o.dir); // 当前轮未完成=正常推进不告警
      });
    }
    var activeStr = b.mode === "收工" ? "全员退场" : b.mode === "待命" ? "全员待命" : (active.join("、") || "—");
    return { n: b.n, mode: b.mode, activeStr: activeStr, sign: signStr, prod: prodStr };
  });

  return {
    root: root,
    hbTimeoutMin: hbTimeout / 60000,
    hbMode: hbTimeout === 10 * 60000 ? "run 拉起形态" : "窗口常驻形态",
    boards: boards.length,
    curN: curN,
    curMode: curBoard ? curBoard.mode : "—",
    ts: new Date().toISOString().substring(11, 19),
    roleRows: roleRows,
    boardRows: boardRows,
    alerts: alerts
  };
}

// ── 渲染层 1: CLI 文本 ──
function renderText(d) {
  var out = [];
  out.push("=== EcoScope 生态仪表盘 ===");
  out.push("项目根: " + d.root);
  out.push("心跳阈值: " + d.hbTimeoutMin + " 分钟（" + d.hbMode + "）");
  out.push("公告牌: " + d.boards + " 张 | monitor 当前轮 N=" + d.curN + "（模式: " + d.curMode + "） | " + d.ts + "\n");

  out.push("### 角色存活表（心跳 + 当前轮状态）");
  out.push("| 角色 | 当前轮状态 | 心跳 | 心跳新鲜度 | 判定 |");
  out.push("|------|-----------|------|-----------|------|");
  d.roleRows.forEach(function(r) {
    var mark = r.level === "bad" ? "⚠️ " : r.level === "warn" ? "— " : "✅ ";
    out.push("| " + r.role + " | " + r.st + " | " + r.hbStr + " | " + r.fresh + " | " + mark + r.verdict + " |");
  });
  out.push("");

  out.push("### 轮次进度矩阵（签字 + 产出）");
  out.push("| 轮 | 模式 | 活跃角色 | 签字(done_NNN) | 产出(.ready) |");
  out.push("|----|------|----------|---------------|--------------|");
  d.boardRows.forEach(function(b) {
    var signStr = b.sign.length ? b.sign.map(function(s) { return s.role + (s.ok ? " ✓" : " ✗"); }).join("、") : "—";
    var prodStr = b.prod.length ? b.prod.map(function(p) { return p.name + (p.ok ? " ✓" : " ✗"); }).join("、") : "—";
    out.push("| " + pad3(b.n) + " | " + b.mode + " | " + b.activeStr + " | " + signStr + " | " + prodStr + " |");
  });
  out.push("");

  out.push("### 告警汇总");
  if (d.alerts.length === 0) out.push("无告警——全员心跳新鲜、签字/output齐全（当前轮未完成属正常推进）");
  else d.alerts.forEach(function(a) { out.push("⚠️ " + a); });
  out.push("");
  out.push("> 视图提示: 心跳阈值 " + d.hbTimeoutMin + "min 与 monitor 同源；run 形态干完即退心跳停是正常态（不是掉线）；--html 输出浏览器单文件视图");
  return out.join("\n") + "\n";
}

// ── 渲染层 2: HTML 单文件（自包含，30s 自动刷新）──
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderHtml(d) {
  var roleRows = d.roleRows.map(function(r) {
    var cls = r.level === "bad" ? ' class="bad"' : r.level === "warn" ? ' class="warn"' : "";
    var mark = r.level === "bad" ? "⚠️" : r.level === "warn" ? "—" : "✅";
    return "<tr" + cls + "><td>" + esc(r.role) + "</td><td>" + esc(r.st) + "</td><td>" + esc(r.hbStr) + "</td><td>" + esc(r.fresh) + "</td><td>" + mark + " " + esc(r.verdict) + "</td></tr>";
  }).join("\n");

  var boardRows = d.boardRows.map(function(b) {
    var signStr = b.sign.length ? b.sign.map(function(s) {
      return "<span class='" + (s.ok ? "ok" : "bad") + "'>" + esc(s.role) + (s.ok ? " ✓" : " ✗") + "</span>";
    }).join("、") : "—";
    var prodStr = b.prod.length ? b.prod.map(function(p) {
      return "<span class='" + (p.ok ? "ok" : "bad") + "'>" + esc(p.name) + (p.ok ? " ✓" : " ✗") + "</span>";
    }).join("、") : "—";
    return "<tr><td>" + pad3(b.n) + "</td><td>" + esc(b.mode) + "</td><td>" + esc(b.activeStr) + "</td><td>" + signStr + "</td><td>" + prodStr + "</td></tr>";
  }).join("\n");

  var alertHtml = d.alerts.length === 0
    ? '<div class="no-alert">无告警 —— 全员心跳新鲜、签字/output齐全（当前轮未完成属正常推进）</div>'
    : d.alerts.map(function(a) { return '<div class="alert-item">⚠️ ' + esc(a) + "</div>"; }).join("\n");

  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n'
    + '<meta http-equiv="refresh" content="30">\n'
    + '<title>EcoScope 批次状态 · N=' + d.curN + '</title>\n'
    + '<style>\n'
    + 'body{font-family:"Microsoft YaHei",sans-serif;margin:24px;background:#f5f6fa;color:#2d3436}\n'
    + 'h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;border-left:4px solid #0984e3;padding-left:8px}\n'
    + '.meta{color:#636e72;font-size:13px;margin-bottom:16px}\n'
    + 'table{border-collapse:collapse;width:100%;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)}\n'
    + 'th{background:#0984e3;color:#fff;padding:8px 12px;text-align:left;font-size:13px}\n'
    + 'td{padding:8px 12px;border-bottom:1px solid #eee;font-size:13px}\n'
    + 'tr:hover td{background:#f8f9fa}\n'
    + '.ok{color:#00b894;font-weight:bold}.bad{color:#d63031;font-weight:bold}.warn{color:#e17055}\n'
    + 'tr.bad td{background:#ffeaea}tr.warn td{background:#fff3e0}\n'
    + '.alert-item{background:#ffeaea;border-left:4px solid #d63031;padding:8px 12px;margin:6px 0;font-size:13px;border-radius:0 4px 4px 0}\n'
    + '.no-alert{background:#e8f8f5;border-left:4px solid #00b894;padding:8px 12px;font-size:13px;border-radius:0 4px 4px 0}\n'
    + '.foot{color:#b2bec3;font-size:12px;margin-top:24px}\n'
    + '.refresh{float:right;font-size:12px;color:#0984e3;background:none;border:1px solid #0984e3;border-radius:4px;padding:2px 8px;cursor:pointer}\n'
    + '</style>\n</head>\n<body>\n'
    + '<h1>EcoScope 生态仪表盘 <button class="refresh" onclick="location.reload()">手动刷新</button></h1>\n'
    + '<div class="meta">项目根: ' + esc(d.root) + ' &nbsp;|&nbsp; 心跳阈值: ' + d.hbTimeoutMin + ' 分钟（' + esc(d.hbMode) + '） &nbsp;|&nbsp; 公告牌: ' + d.boards
    + ' 张 &nbsp;|&nbsp; 当前轮 N=' + d.curN + '（模式: ' + esc(d.curMode) + '） &nbsp;|&nbsp; 生成: ' + d.ts
    + ' &nbsp;|&nbsp; 每 30s 自动刷新</div>\n'
    + '<h2>角色存活表</h2>\n'
    + '<table><tr><th>角色</th><th>当前轮状态</th><th>心跳</th><th>心跳新鲜度</th><th>判定</th></tr>\n' + roleRows + '\n</table>\n'
    + '<h2>轮次进度矩阵</h2>\n'
    + '<table><tr><th>轮</th><th>模式</th><th>活跃角色</th><th>签字(done_NNN)</th><th>产出(.ready)</th></tr>\n' + boardRows + '\n</table>\n'
    + '<h2>告警汇总</h2>\n' + alertHtml + '\n'
    + '<div class="foot">EcoScope v1.1 · 离线视图（非盯场——在线检测是 monitor 的活；非校验——收工核对是 check.js 的活）· 数据源 world/ · 每 30s 自动刷新，可双击打开本地文件</div>\n'
    + '</body>\n</html>\n';
}

// ── 主流程 ──
function main() {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("用法: node ecoscope.js <项目根目录> [--html]");
    console.error("       CLI:      node ecoscope.js <项目根目录>            （文本视图，备查/调试）");
    console.error("       HTML:     node ecoscope.js <项目根目录> --html > 批次状态.html   （浏览器单文件视图，30s 自动刷新）");
    process.exit(2);
  }
  var root = path.resolve(args[0]);
  var isHtml = args.indexOf("--html") !== -1;
  if (!fs.existsSync(path.join(root, "world"))) {
    console.error("ERROR: '" + root + "' 下没有 world/ 目录——参数应是项目根（world/ 的上级）");
    process.exit(2);
  }
  var d = collectData(root);
  if (d.error) { console.error("ERROR: " + d.error); process.exit(2); }
  process.stdout.write(isHtml ? renderHtml(d) : renderText(d));
  process.exit(0);
}

main();
