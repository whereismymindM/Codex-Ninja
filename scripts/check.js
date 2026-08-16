// check.js —— 收工核对工具 v1.0（2026-08-16，compose.js v1.1 方案落地版）
// 用途: 收工后全链路校验——自动化老渣待办 #2（核对产出/签字/退场），一个工具覆盖
//       生成 → 发布 → 交付 → 收口 全生命周期（只读，不发牌、不写任何文件）
// 用法: node check.js <项目根目录>
//       例: node check.js "一号舱室-软件开发部"（项目根 = 含 我的世界/ 与 火影-大鱼/ 的目录）
// 校验点（5 项）:
//   1. 发布一致性   火影-大鱼/ 公告牌是否全部发布到 我的世界/（清单 + 内容逐字节对比）
//   2. 逐轮产出    每轮活跃角色的 .ready 是否就位（对应 monitor 的 WAIT 判据，格式A/B + producer 归属）
//   3. 逐轮签字    每轮活跃角色 完成_NNN.md 是否齐全（size>20 才算，monitor 同判据）
//   4. 退场核对    收工轮全员 {角色名}已退场_NNN 是否就位（含 .acked 兼容；休眠文件按 monitor 判据算合法终局）
//   5. 收口证据链  monitor DONE 推断（收工轮全员退场齐）+ 收工两件套（产出总结.md / 项目完成.md）是否落盘
// ⚠️ 同源声明（改判据必须双改）:
//   ②③④ 判据与 assets/monitor.js 同源——公告牌解析 monitor.js:369-382、产出校验 :516-611、
//   签字 :504-506、退场 :422-425、.ready producer 归属 :595-611。monitor 改判据时本文件必须同步，
//   反之亦然（doc-consistency 有校验器盯两者一致性）。
// ⚠️ 范围边界:
//   - 心跳实查不在此工具内（心跳是瞬时信号，收工后无意义；终局证据 = 退场文件）
//   - 顺序合规（双人抢答/辩论跳步/审核打回）查 scripts/时序校验.sh（mtime 判定）
//   - 公告牌格式硬标准（产出前缀/角色枚举等）查 scripts/compose.js 编译期校验
// 退出码: 0=全部合规 1=发现异常 2=参数错误（与 时序校验.sh / doc-consistency.js 对齐）
// 零依赖（Node 原生），ES5 风格，与 codex-ninja 一致

var fs = require("fs");
var path = require("path");

// ── 判据常量（与 monitor.js 同源）──
var BOARD_RE = /公告牌_(\d{3})\.md$/;
var ACTIVE_RE = /- (.+?)[（(].*状态[:：]\s*活跃/g;
var ALL_ROLE_RE = /- (.+?)[（(].*状态[:：]\s*(?:退场|休眠)/g;
var OUTPUT_RE = /(?:^|\n)- 产出[:：]\s*我的世界\/([^\r\n]+)/g;
var OWNER_RE = /\n- 产出负责人[:：]\s*(.+)/;
var MODE_RE = /模式[：:]\s*(.+)/;
var BLACKLIST = ["模式", "任务", "产出", "产出负责人", "任务目录", "辩论轮数"]; // monitor.js:378 同款字段黑名单

// ── 工具函数 ──
function stripBom(s) { return s.replace(/^\uFEFF/, ""); }

function pad3(n) { return String(n).padStart(3, "0"); }

// 解析单张公告牌 → { n, mode, activeRoles, allRoles, outputs: [{dir, files|null, ownerEach}], hasOutput }
function parseBoard(content) {
  var board = stripBom(content);
  var headerPart = board.split(/\n- 任务[:：]/)[0];
  var modeM = board.match(MODE_RE);
  var mode = modeM ? modeM[1].trim() : "?";
  var activeRoles = [], allRoles = [];
  var m;
  ACTIVE_RE.lastIndex = 0;
  while ((m = ACTIVE_RE.exec(headerPart)) !== null) {
    var rn = m[1].replace(/^组[A-Z]\s*[:：]\s*/, "");
    if (/[\\/]|\.\./.test(rn)) continue; // monitor.js:374 同款净化（拒绝含分隔符/.. 的角色名）
    activeRoles.push(rn);
  }
  ALL_ROLE_RE.lastIndex = 0;
  while ((m = ALL_ROLE_RE.exec(headerPart)) !== null) {
    var arn = m[1].replace(/^组[A-Z]\s*[:：]\s*/, "");
    if (BLACKLIST.indexOf(arn) !== -1 || arn.indexOf(":") !== -1 || arn.indexOf("：") !== -1) continue; // monitor.js:378 同款黑名单
    if (/[\\/]|\.\./.test(arn)) continue;
    allRoles.push(arn);
  }
  var outputs = [];
  var om;
  OUTPUT_RE.lastIndex = 0;
  while ((om = OUTPUT_RE.exec(board)) !== null) {
    var fullPath = om[1];
    var lastSlash = fullPath.lastIndexOf("/");
    var dir, files = null;
    if (lastSlash !== -1 && !fullPath.endsWith("/")) { // monitor.js:524 格式A/B 判定（尾斜杠）
      dir = fullPath.substring(0, lastSlash);
      files = fullPath.substring(lastSlash + 1).split(/\s*,\s*/);
    } else {
      dir = fullPath.replace(/\/$/, "");
    }
    outputs.push({ dir: dir, files: files, full: fullPath });
  }
  var ownerM = board.match(OWNER_RE);
  var ownerEach = ownerM && ownerM[1].trim() === "各自";
  return { mode: mode, activeRoles: activeRoles, allRoles: allRoles, outputs: outputs, ownerEach: ownerEach, hasOutput: outputs.length > 0 };
}

// 读项目根的公告牌序列（我的世界/ 为权威——角色 poll 的是它；源目录对比见 checkPublish）
function loadBoards(root) {
  var worldDir = path.join(root, "我的世界");
  var boards = [];
  try {
    var entries = fs.readdirSync(worldDir).filter(function(f) { return BOARD_RE.test(f); });
    entries.sort();
    entries.forEach(function(f) {
      var n = parseInt(BOARD_RE.exec(f)[1], 10);
      boards.push({ n: n, file: f, content: fs.readFileSync(path.join(worldDir, f), "utf8") });
    });
  } catch (e) {
    return { error: "读取 我的世界/ 失败: " + e.message };
  }
  return { boards: boards };
}

// ── 校验 1: 发布一致性 ──
function checkPublish(root) {
  var issues = [];
  var srcDir = path.join(root, "火影-大鱼");
  var dstDir = path.join(root, "我的世界");
  var srcFiles = [], dstFiles = [];
  try { srcFiles = fs.readdirSync(srcDir).filter(function(f) { return BOARD_RE.test(f); }).sort(); } catch (e) { return { ok: false, issues: ["火影-大鱼/ 不存在或不可读: " + e.message] }; }
  try { dstFiles = fs.readdirSync(dstDir).filter(function(f) { return BOARD_RE.test(f); }).sort(); } catch (e) { return { ok: false, issues: ["我的世界/ 不存在或不可读: " + e.message] }; }
  // 清单一致性
  if (srcFiles.length !== dstFiles.length) {
    issues.push("公告牌数量不一致: 源目录 " + srcFiles.length + " 张 vs 我的世界 " + dstFiles.length + " 张（可能未全量发布或追加中）");
  }
  // 内容一致性（大鱼"不改一字"全量发布 → 逐字节对比，容忍 BOM 差异）
  srcFiles.forEach(function(f) {
    if (dstFiles.indexOf(f) === -1) { issues.push("未发布: " + f + "（源目录有，我的世界缺）"); return; }
    var s = stripBom(fs.readFileSync(path.join(srcDir, f), "utf8"));
    var d = stripBom(fs.readFileSync(path.join(dstDir, f), "utf8"));
    if (s !== d) issues.push("内容不一致: " + f + "（源目录与我的世界版本不同——违反'不改一字'铁律）");
  });
  dstFiles.forEach(function(f) {
    if (srcFiles.indexOf(f) === -1) issues.push("孤儿公告牌: " + f + "（我的世界有，源目录已无——可能是历史残留）");
  });
  return { ok: issues.length === 0, issues: issues, count: srcFiles.length };
}

// ── 校验 2: 逐轮产出核对（monitor.js:516-611 同源）──
function checkOutputs(root, boards) {
  var worldDir = path.join(root, "我的世界");
  var issues = [];
  var detail = [];
  boards.forEach(function(b) {
    var pb = parseBoard(b.content);
    if (pb.mode === "收工" || pb.mode === "待命") return; // 无产出轮
    if (!pb.hasOutput) { issues.push("第" + pad3(b.n) + "轮（" + pb.mode + "）无产出行——任务轮漏写产出 = monitor 死等（格式硬标准）"); return; }
    // 试用轮特殊：角色行状态=待命等通知（标准模板试用轮写法），产出由角色在真人反馈后汇总交付——不报"无活跃角色"
    if (pb.activeRoles.length === 0 && pb.mode !== "试用") { issues.push("第" + pad3(b.n) + "轮无活跃角色但有产出行——公告牌角色行状态可能写错"); return; }
    if (pb.activeRoles.length === 0 && pb.mode === "试用") { pb.activeRoles = pb.allRoles; } // 试用轮按全员校验产出（等反馈后角色交付）
    pb.outputs.forEach(function(o) {
      var outDirPath = path.join(worldDir, o.dir);
      var ready = false;
      var reason = "";
      if (/\.\./.test(o.dir)) { issues.push("第" + pad3(b.n) + "轮 产出路径含 ..（拒绝）: " + o.full); return; }
      if (o.files && o.files.length > 0) {
        // 格式A: 逐文件查 .ready
        var missing = [];
        o.files.forEach(function(fn) {
          if (!fs.existsSync(path.join(outDirPath, fn.trim() + ".ready"))) missing.push(fn.trim());
        });
        ready = missing.length === 0;
        if (!ready) reason = "缺 .ready: " + missing.join(", ");
        else detail.push("第" + pad3(b.n) + "轮 ✅ " + o.dir + "（格式A " + o.files.length + " 个 .ready 就位）");
      } else {
        // 格式B: 扫目录 .ready（含 producer 归属校验，monitor.js:595-611 同源）
        var readyFiles = [];
        try { readyFiles = fs.existsSync(outDirPath) ? fs.readdirSync(outDirPath).filter(function(f) { return f.endsWith(".ready"); }) : []; } catch (_rd) {}
        if (pb.ownerEach) {
          var producers = {}, unknownReady = 0;
          readyFiles.forEach(function(rf) {
            try {
              var rc = fs.readFileSync(path.join(outDirPath, rf), "utf8");
              var pm = rc.match(/^producer:\s*(.+)$/m);
              if (pm && pm[1]) { producers[pm[1].trim()] = true; return; }
            } catch (_rd2) {}
            unknownReady++;
          });
          var missingOwner = pb.activeRoles.filter(function(ar) { return !producers[ar]; });
          ready = missingOwner.length === 0 || unknownReady >= missingOwner.length; // 未知归属可顶缺（兼容历史 .ready）
          if (!ready) reason = "各自场景 producer 未覆盖: 缺 " + (missingOwner.join(",") || "?") + "（疑似一人重复交付凑数）";
          else detail.push("第" + pad3(b.n) + "轮 ✅ " + o.dir + "（各自 " + readyFiles.length + " 个 .ready，producer 归属全覆盖）");
        } else {
          ready = readyFiles.length > 0;
          if (!ready) reason = "目录无 .ready";
          else detail.push("第" + pad3(b.n) + "轮 ✅ " + o.dir + "（格式B " + readyFiles.length + " 个 .ready）");
        }
      }
      if (!ready) issues.push("第" + pad3(b.n) + "轮 ❌ 产出未就位: " + o.dir + "（" + reason + "）");
    });
  });
  return { ok: issues.length === 0, issues: issues, detail: detail };
}

// ── 校验 3: 逐轮签字核对（monitor.js:504-506 同源）──
function checkSigns(root, boards) {
  var worldDir = path.join(root, "我的世界");
  var issues = [];
  var detail = [];
  boards.forEach(function(b) {
    var pb = parseBoard(b.content);
    if (pb.mode === "收工" || pb.mode === "待命") return; // 无签字轮
    if (pb.activeRoles.length === 0) return;
    pb.activeRoles.forEach(function(role) {
      var signFile = path.join(worldDir, role + "_大鱼对讲", "完成_" + pad3(b.n) + ".md");
      var ok = fs.existsSync(signFile) && fs.statSync(signFile).size > 20; // P2-7 同款: 空文件不算签字
      if (ok) detail.push("第" + pad3(b.n) + "轮 ✅ " + role + " 完成_" + pad3(b.n) + ".md 在");
      else issues.push("第" + pad3(b.n) + "轮 ❌ " + role + " 缺签字（完成_" + pad3(b.n) + ".md 不存在或为空）");
    });
  });
  return { ok: issues.length === 0, issues: issues, detail: detail };
}

// ── 校验 4: 退场核对（monitor.js:422-425, 479 同源）──
function checkRetire(root, boards) {
  var worldDir = path.join(root, "我的世界");
  var issues = [];
  var detail = [];
  boards.forEach(function(b) {
    var pb = parseBoard(b.content);
    if (pb.mode !== "收工") return;
    if (pb.allRoles.length === 0) { issues.push("第" + pad3(b.n) + "轮（收工）无角色行——收工轮必须列出全部参与人员"); return; }
    var okCount = 0;
    pb.allRoles.forEach(function(role) {
      var retireFile = path.join(worldDir, role + "_大鱼对讲", role + "已退场_" + pad3(b.n));
      var sleepFile = path.join(worldDir, role + "_大鱼对讲", role + "已休眠_" + pad3(b.n));
      // monitor.js:424 兼容 .acked 归档形态
      if (fs.existsSync(retireFile) || fs.existsSync(retireFile + ".acked") ||
          fs.existsSync(sleepFile) || fs.existsSync(sleepFile + ".acked")) okCount++;
      else issues.push("第" + pad3(b.n) + "轮 ❌ " + role + " 未退场（缺 " + role + "已退场_" + pad3(b.n) + "）");
    });
    detail.push("第" + pad3(b.n) + "轮 ✅ 收工轮退场 " + okCount + "/" + pb.allRoles.length + "（" + (okCount === pb.allRoles.length ? "全员退场" : "有缺") + "）");
  });
  return { ok: issues.length === 0, issues: issues, detail: detail, total: detail.length };
}

// ── 校验 5: 收口证据链 ──
function checkClose(root, boards) {
  var issues = [];
  var detail = [];
  var talkDir = path.join(root, "我的世界", "大鱼_老渣对讲");
  // monitor DONE 推断: 收工轮存在且全员退场文件齐（对应 monitor.js:934 DONE 判据的终局侧）
  var retireOk = true, hasRetireRound = false;
  boards.forEach(function(b) {
    var pb = parseBoard(b.content);
    if (pb.mode !== "收工") return;
    hasRetireRound = true;
    pb.allRoles.forEach(function(role) {
      var rf = path.join(root, "我的世界", role + "_大鱼对讲", role + "已退场_" + pad3(b.n));
      if (!(fs.existsSync(rf) || fs.existsSync(rf + ".acked"))) retireOk = false;
    });
  });
  if (!hasRetireRound) { issues.push("未找到收工轮公告牌——批次未走完收工流程"); return { ok: false, issues: issues, detail: detail }; }
  if (retireOk) detail.push("✅ monitor DONE 推断成立（收工轮全员退场文件齐）");
  else issues.push("monitor DONE 推断不成立（收工轮仍有角色未退场——检查是否被 hbForce 强制退场）");
  // 收工两件套
  var sumFile = path.join(talkDir, "产出总结.md");
  var doneFile = path.join(talkDir, "项目完成.md");
  if (fs.existsSync(sumFile)) detail.push("✅ 产出总结.md 在（" + fs.statSync(sumFile).size + " B）");
  else issues.push("❌ 缺 产出总结.md（收工两件套之一）");
  if (fs.existsSync(doneFile)) detail.push("✅ 项目完成.md 在（" + fs.statSync(doneFile).size + " B）");
  else issues.push("❌ 缺 项目完成.md（收工两件套之一，通知老渣的落盘）");
  return { ok: issues.length === 0, issues: issues, detail: detail };
}

// ── 主流程 ──
function main() {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("用法: node check.js <项目根目录>（项目根 = 含 我的世界/ 与 火影-大鱼/ 的目录）");
    console.error("例:   node check.js \"一号舱室-软件开发部\"");
    process.exit(2);
  }
  var root = path.resolve(args[0]);
  if (!fs.existsSync(path.join(root, "我的世界"))) {
    console.error("ERROR: '" + root + "' 下没有 我的世界/ 目录——参数应是项目根（我的世界/ 的上级），如 一号舱室-软件开发部");
    process.exit(2);
  }

  var loaded = loadBoards(root);
  if (loaded.error) { console.error("ERROR: " + loaded.error); process.exit(2); }
  var boards = loaded.boards;
  var n = boards.length;

  console.log("=== check.js 收工核对报告 ===");
  console.log("项目根: " + root);
  console.log("公告牌: " + n + " 张（" + (boards.length ? "001~" + pad3(boards[boards.length - 1].n) : "无") + "）\n");

  var allIssues = [];
  var sections = [];

  // 1 发布一致性
  var p = checkPublish(root);
  sections.push({ title: "[1/5] 发布一致性（火影-大鱼 → 我的世界）", ok: p.ok, issues: p.issues, info: "源目录 " + p.count + " 张" + (p.ok ? "，全部发布且内容一致" : "") });
  allIssues = allIssues.concat(p.issues);

  // 2 产出
  var o = checkOutputs(root, boards);
  sections.push({ title: "[2/5] 逐轮产出核对（.ready 就位）", ok: o.ok, issues: o.issues, detail: o.detail });
  allIssues = allIssues.concat(o.issues);

  // 3 签字
  var s = checkSigns(root, boards);
  sections.push({ title: "[3/5] 逐轮签字核对（完成_NNN.md）", ok: s.ok, issues: s.issues, detail: s.detail });
  allIssues = allIssues.concat(s.issues);

  // 4 退场
  var r = checkRetire(root, boards);
  sections.push({ title: "[4/5] 退场核对（收工轮全员退场文件）", ok: r.ok, issues: r.issues, detail: r.detail });
  allIssues = allIssues.concat(r.issues);

  // 5 收口
  var c = checkClose(root, boards);
  sections.push({ title: "[5/5] 收口证据链（DONE + 两件套）", ok: c.ok, issues: c.issues, detail: c.detail });
  allIssues = allIssues.concat(c.issues);

  sections.forEach(function(sec) {
    console.log(sec.title + "  " + (sec.ok ? "✅" : "❌"));
    (sec.detail || []).forEach(function(d) { console.log("  " + d); });
    sec.issues.forEach(function(i) { console.log("  " + i); });
    if (!sec.detail && sec.info) console.log("  " + sec.info);
    console.log("");
  });

  if (allIssues.length === 0) {
    console.log("结论: ✅ 全部合规（0 异常）——收工核对通过，可归档");
    process.exit(0);
  } else {
    console.log("结论: ❌ 发现 " + allIssues.length + " 处异常——按上面对照产出总结.md 的逐轮矩阵核对");
    process.exit(1);
  }
}

main();
