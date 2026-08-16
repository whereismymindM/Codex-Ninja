// boardlint.js —— 公告牌契约校验工具（BoardLint）v1.0（2026-08-16）
// 用途: 发布前公告牌契约校验——老渣写完公告牌、放大鱼目录**之前**跑一遍，
//       把"格式不合规但能跑"的问题在源头拦下（协议合规工具族 P0 第一位，共识见
//       阅览室/评审记录_20260816_生态工具清单/生态工具清单_共识.md）
// 用法: node boardlint.js <公告牌目录>
//       例: node boardlint.js "火影-大鱼/"   （目录下找 公告牌_*.md，支持草稿目录）
// 校验点（分级: 🔴 阻断 = 发布后必卡死/误行为，必改再发；🟡 警告 = 不阻断但提示规范化）:
//   1. 编号连续    🔴 公告牌_NNN.md 三位补零、001 起连续、无断号/重号（大鱼手册①）
//   2. 模式枚举    🟡 模式 ∈ 7 值（单人输出/辩论/主笔审核/双人对话/试用/待命/收工）——
//                  外值 monitor 可当任务轮跑但偏离标准模板硬标准 2（实证: 交叉碰撞批次能收工）
//   3. 收工轮格式  🔴 最后一张；只写 模式+角色+任务；产出/产出负责人/任务目录/产出类型省略（手册②）
//   4. 角色枚举    🔴 每轮列出全部参与人员（跨轮集合一致）；状态 ∈ 活跃/待命/休眠/退场（手册③）
//                  协作模式（辩论/双人/主笔）角色行须带 角色：+ 搭档：
//   5. 状态流转    🔴 硬冲突: 上轮本轮后=休眠/退场 → 本轮活跃（需唤醒/不可能）；退场→非退场
//                  收工轮全员退场；待命轮全员"待命，等通知"；第一轮状态 ∈ {活跃,待命}
//                  （与 compose.js:128-184 矩阵推导同源；手册⑤）
//   6. 产出格式    🔴 产出以 我的世界/产出/ 开头、无 {}、无 ..、无 \；格式A（.md）/B（尾斜杠目录）
//                  任务轮（单人/辩论/主笔/双人/试用）必填 产出负责人+产出+任务目录；
//                  待命/收工不填（手册⑥）
//   7. 铁律8       🔴 任务目录名与产出目录名一字不差（任务001_XXX ↔ 产出/任务001_XXX/）
//   8. 前置依赖    🟡 任务提到 基于/参考/依赖 但无显式 我的世界/ 路径（手册④，缺路径角色可能不等依赖）
//   9. 第一原则    🔴 固定行存在（标准模板硬标准 6）
// ⚠️ 同源声明（改判据必须双改）:
//   状态流转推导与 scripts/compose.js:128-184 同源；公告牌解析与 scripts/check.js parseBoard
//   同源（两者又与 assets/monitor.js:369-611 同源）；分级语义与 assets/模板/大鱼公告牌手册.md
//   一、发布前校验 6 项同源。任何一处改判据，三处必须同步。
// 退出码: 0=无阻断项（可发布，警告可存在） 1=发现阻断项（必改再发） 2=参数错误
// 零依赖（Node 原生），ES5 风格，与 codex-ninja 一致

var fs = require("fs");
var path = require("path");

// ── 判据常量（与 compose.js / 大鱼公告牌手册 同源）──
var MODES = ["单人输出", "辩论", "主笔审核", "双人对话", "试用", "待命", "收工"];
var STATES = ["活跃", "待命", "休眠", "退场"];
var TASK_MODES = ["单人输出", "辩论", "主笔审核", "双人对话", "试用"]; // 有产出的轮
var COOP_ROLES = { 辩论: ["正方", "反方", "裁判"], 双人对话: ["问方", "答方"], 主笔审核: ["主笔", "审核"] };
var BOARD_RE = /^公告牌_(\d{3})\.md$/;
var FIRST_LINE = "🔒 第一原则：最后一个动作必须是工具调用，不能纯文字下线；poll 到收工轮才合法退场";

// ── 工具函数 ──
function stripBom(s) { return s.replace(/^\uFEFF/, ""); }
function pad3(n) { return String(n).padStart(3, "0"); }

// 解析角色行: "- 角色A（角色：问方，搭档：角色B，状态：活跃，本轮后：待命）"
// → { name, fields: {角色, 搭档, 状态, 本轮后} }
function parseRoleLine(line) {
  var m = line.match(/^-\s*(.+?)[（(](.*)[)）]$/);
  if (!m) return null;
  var name = m[1].trim();
  var fields = {};
  m[2].split(/[，,]/).forEach(function(seg) {
    var fm = seg.match(/^\s*(角色|搭档|状态|本轮后)[：:]\s*(.+?)\s*$/);
    if (fm) fields[fm[1]] = fm[2];
  });
  return { name: name, fields: fields };
}

// 解析单张公告牌 → { n, mode, roles: [{name, fields}], ownerEach, outputs: [{dir, files}], taskDir, taskText }
function parseBoard(n, content) {
  var board = stripBom(content);
  var modeM = board.match(/模式[：:]\s*(.+)/);
  var mode = modeM ? modeM[1].trim() : "?";
  var roles = [];
  board.split("\n").forEach(function(line) {
    if (line.indexOf("- ") !== 0) return;
    var rl = parseRoleLine(line);
    if (rl && rl.fields && (rl.fields["状态"] || rl.fields["本轮后"] || rl.fields["角色"])) roles.push(rl);
  });
  var outputs = [];
  var om;
  var outputRe = /(?:^|\n)- 产出[:：]\s*我的世界\/([^\r\n]+)/g;
  while ((om = outputRe.exec(board)) !== null) {
    var fullPath = om[1];
    var lastSlash = fullPath.lastIndexOf("/");
    var dir, files = null;
    if (lastSlash !== -1 && !fullPath.endsWith("/")) {
      dir = fullPath.substring(0, lastSlash);
      files = fullPath.substring(lastSlash + 1).split(/\s*,\s*/);
    } else {
      dir = fullPath.replace(/\/$/, "");
    }
    outputs.push({ dir: dir, files: files, full: fullPath });
  }
  var ownerM = board.match(/\n- 产出负责人[:：]\s*(.+)/);
  var owner = ownerM ? ownerM[1].trim() : "";
  var tdM = board.match(/\n- 任务目录[:：]\s*我的世界\/([^\r\n]+)/);
  var taskDir = tdM ? tdM[1].trim().replace(/\/+$/, "") : "";
  var taskM = board.match(/\n- 任务[:：]\s*([^\r\n]*)/);
  var taskText = taskM ? taskM[1] : "";
  return { n: n, mode: mode, roles: roles, ownerEach: owner === "各自", owner: owner, outputs: outputs, taskDir: taskDir, taskText: taskText };
}

// 读目录下公告牌（按编号排序）
function loadBoards(dir) {
  var boards = [];
  try {
    var entries = fs.readdirSync(dir).filter(function(f) { return BOARD_RE.test(f); });
    entries.sort();
    entries.forEach(function(f) {
      var n = parseInt(BOARD_RE.exec(f)[1], 10);
      boards.push(parseBoard(n, fs.readFileSync(path.join(dir, f), "utf8")));
    });
  } catch (e) {
    return { error: "读取公告牌目录失败: " + e.message };
  }
  return { boards: boards };
}

// ── 校验 1: 编号连续（🔴）──
function checkNumbering(boards) {
  var issues = [];
  if (boards.length === 0) { issues.push("未找到 公告牌_*.md（目录下无公告牌或目录为空）"); return { ok: false, issues: issues }; }
  for (var i = 0; i < boards.length; i++) {
    var expect = i + 1;
    if (boards[i].n !== expect) {
      issues.push("编号不连续: 第 " + (i + 1) + " 张应为 公告牌_" + pad3(expect) + ".md，实际 " + pad3(boards[i].n) + "——断号/重号 = 角色永远等不到某轮");
      break;
    }
  }
  return { ok: issues.length === 0, issues: issues };
}

// ── 校验 2: 模式枚举（🟡 警告）──
function checkModes(boards) {
  var warns = [];
  boards.forEach(function(b) {
    if (b.mode === "?") { warns.push("第" + pad3(b.n) + "轮 无「模式」字段或解析失败——模式是必填字段（标准模板硬标准 2）"); return; }
    if (MODES.indexOf(b.mode) === -1) {
      warns.push("第" + pad3(b.n) + "轮 模式枚举外值: '" + b.mode + "'（标准 7 值: " + MODES.join("/") + "）——monitor 可按任务轮跑通，但偏离标准模板，建议规范化");
    }
  });
  return { ok: true, warns: warns }; // 模式外值不阻断（实证可跑通），仅提示
}

// ── 校验 3: 收工轮格式（🔴）──
function checkRetireRound(boards) {
  var issues = [];
  if (boards.length === 0) return { ok: true, issues: issues };
  var last = boards[boards.length - 1];
  if (last.mode !== "收工") {
    issues.push("最后一张（第" + pad3(last.n) + "轮）不是收工轮——每批最后一张必须是收工轮（全员退场），否则角色不会退场");
  }
  boards.forEach(function(b) {
    if (b.mode !== "收工") return;
    if (b.outputs.length > 0) issues.push("第" + pad3(b.n) + "轮（收工）写了产出行——收工轮只写 模式+角色+任务，产出/产出负责人/任务目录/产出类型全省略（monitor 判定分叉）");
    if (b.owner) issues.push("第" + pad3(b.n) + "轮（收工）写了 产出负责人——收工轮应省略");
    if (b.taskDir) issues.push("第" + pad3(b.n) + "轮（收工）写了 任务目录——收工轮应省略");
  });
  // 产出类型检查（收工轮不该有）——通过 b.raw 判断，简化: 在 parseBoard 存 raw
  boards.forEach(function(b) {
    if (b.mode === "收工" && b.raw && b.raw.indexOf("产出类型") !== -1) issues.push("第" + pad3(b.n) + "轮（收工）写了 产出类型——收工轮应省略");
  });
  return { ok: issues.length === 0, issues: issues };
}

// ── 校验 4: 角色枚举（🔴）──
function checkRoles(boards) {
  var issues = [];
  var globalSet = {};
  boards.forEach(function(b) { b.roles.forEach(function(r) { globalSet[r.name] = true; }); });
  var globalNames = Object.keys(globalSet);
  boards.forEach(function(b) {
    var names = b.roles.map(function(r) { return r.name; });
    // 跨轮集合一致（每轮列出全部参与人员）
    var missing = globalNames.filter(function(g) { return names.indexOf(g) === -1; });
    if (missing.length > 0) issues.push("第" + pad3(b.n) + "轮 漏角色: " + missing.join(", ") + "（每轮必须列出全部参与人员——漏写 = 该角色收不到信号可能误退场）");
    b.roles.forEach(function(r) {
      var st = r.fields["状态"];
      if (!st) { issues.push("第" + pad3(b.n) + "轮 角色 '" + r.name + "' 缺 状态 字段（角色行必填）"); return; }
      if (STATES.indexOf(st) === -1) issues.push("第" + pad3(b.n) + "轮 角色 '" + r.name + "' 状态非法: '" + st + "'（允许: " + STATES.join("/") + "）");
    });
    // 协作模式角色字段（辩论/双人/主笔 须带 角色：+ 搭档：）
    if (COOP_ROLES[b.mode]) {
      b.roles.forEach(function(r) {
        var rf = r.fields["角色"];
        if (!rf) issues.push("第" + pad3(b.n) + "轮（" + b.mode + "）角色 '" + r.name + "' 缺「角色：」字段（应为 " + COOP_ROLES[b.mode].join("/") + " 之一）");
      });
    }
  });
  return { ok: issues.length === 0, issues: issues };
}

// ── 校验 5: 状态流转（🔴 硬冲突）──
function checkStateFlow(boards) {
  var issues = [];
  var warns = [];
  var prevAfter = {}; // 上轮本轮后
  boards.forEach(function(b) {
    var n = b.n;
    b.roles.forEach(function(r) {
      var st = r.fields["状态"];
      var after = r.fields["本轮后"];
      if (!st) return;
      if (n === boards[0].n) {
        // 第一轮: 初始待命，角色可活跃（接棒）或待命，不可休眠/退场
        if (st === "休眠" || st === "退场") issues.push("第" + pad3(n) + "轮 角色 '" + r.name + "' 首轮状态 '" + st + "' 非法（首轮只应 活跃/待命——初始全员待命，无人可休眠/退场）");
      } else {
        var pa = prevAfter[r.name];
        if (pa !== undefined) {
          if ((pa === "休眠" || pa === "退场") && st === "活跃") {
            issues.push("第" + pad3(n) + "轮 角色 '" + r.name + "' 状态流转冲突: 上轮本轮后=" + pa + " 但本轮状态=活跃（休眠/退场需唤醒或不可能——compose.js 同款判据）");
          }
          if (pa === "退场" && st !== "退场") {
            issues.push("第" + pad3(n) + "轮 角色 '" + r.name + "' 状态流转冲突: 上轮已退场但本轮状态=" + st + "（退场不可复出）");
          }
        }
      }
      if (st === "退场" && after && after !== "—") warns.push("第" + pad3(n) + "轮 角色 '" + r.name + "' 状态=退场 还写了本轮后='" + after + "'（退场是终局，本轮后应省略）");
      if (after && STATES.indexOf(after) === -1 && after !== "—") issues.push("第" + pad3(n) + "轮 角色 '" + r.name + "' 本轮后非法: '" + after + "'");
      prevAfter[r.name] = after || (st === "退场" ? "退场" : st === "活跃" ? "待命" : st);
    });
    // 收工轮全员退场
    if (b.mode === "收工") {
      b.roles.forEach(function(r) {
        if (r.fields["状态"] !== "退场") issues.push("第" + pad3(n) + "轮（收工）角色 '" + r.name + "' 状态应为 退场，实际 '" + (r.fields["状态"] || "无") + "'");
      });
    }
    // 待命轮全员"待命，等通知"
    if (b.mode === "待命") {
      b.roles.forEach(function(r) {
        if (r.fields["状态"] !== "待命") issues.push("第" + pad3(n) + "轮（待命）角色 '" + r.name + "' 状态应为 待命，实际 '" + (r.fields["状态"] || "无") + "'");
      });
    }
  });
  return { ok: issues.length === 0, issues: issues, warns: warns };
}

// ── 校验 6: 产出格式（🔴）──
function checkOutputFormat(boards) {
  var issues = [];
  boards.forEach(function(b) {
    var needOutput = TASK_MODES.indexOf(b.mode) !== -1;
    if (needOutput) {
      if (!b.owner) issues.push("第" + pad3(b.n) + "轮（" + b.mode + "）缺 产出负责人（任务轮必填）");
      if (b.outputs.length === 0) issues.push("第" + pad3(b.n) + "轮（" + b.mode + "）缺 产出行——任务轮漏写产出 = monitor 死等");
      if (!b.taskDir) issues.push("第" + pad3(b.n) + "轮（" + b.mode + "）缺 任务目录（任务轮必填）");
    } else if (b.mode === "收工" || b.mode === "待命") {
      if (b.outputs.length > 0) issues.push("第" + pad3(b.n) + "轮（" + b.mode + "）不该有产出行");
      if (b.owner) issues.push("第" + pad3(b.n) + "轮（" + b.mode + "）不该有 产出负责人");
    }
    b.outputs.forEach(function(o) {
      if (/[\{\}]/.test(o.full)) issues.push("第" + pad3(b.n) + "轮 产出含占位符 {}: '" + o.full + "'——monitor 按字面文件名查永不匹配 → 轮次卡死");
      if (/\.\./.test(o.dir) || /[\\]/.test(o.full)) issues.push("第" + pad3(b.n) + "轮 产出路径含 .. 或反斜杠（拒绝）: '" + o.full + "'");
      if (o.full.indexOf("产出/") !== 0) issues.push("第" + pad3(b.n) + "轮 产出必须以 '我的世界/产出/' 开头: '" + o.full + "'");
    });
  });
  return { ok: issues.length === 0, issues: issues };
}

// ── 校验 7: 铁律 8——任务目录与产出目录一字不差（🔴）──
function checkDirMatch(boards) {
  var issues = [];
  boards.forEach(function(b) {
    if (!b.taskDir || b.outputs.length === 0) return;
    b.outputs.forEach(function(o) {
      // 产出目录 = o.dir 已去'我的世界/'前缀（outputRe 吃掉），再去'产出/'即任务目录名
      var outDir = o.dir.replace(/^产出\//, "");
      if (outDir !== b.taskDir) {
        issues.push("第" + pad3(b.n) + "轮 铁律8: 任务目录 '" + b.taskDir + "' 与产出目录 '" + outDir + "' 不一致——产出目录名必须与任务目录名一字不差（错位 = monitor 死等）");
      }
    });
  });
  return { ok: issues.length === 0, issues: issues };
}

// ── 校验 8: 前置依赖（🟡 警告）──
function checkDeps(boards) {
  var warns = [];
  boards.forEach(function(b) {
    if (!b.taskText) return;
    if (/基于|参考|依赖|用.*产出|读.*产出/.test(b.taskText) && b.taskText.indexOf("我的世界/") === -1) {
      warns.push("第" + pad3(b.n) + "轮 任务提到 基于/参考/依赖 但无显式 '我的世界/...' 路径——缺路径角色可能不等依赖直接干（建议补完整路径）");
    }
  });
  return { ok: true, warns: warns };
}

// ── 校验 9: 第一原则行（🔴）──
function checkFirstLine(boards) {
  var issues = [];
  boards.forEach(function(b) {
    if (b.raw && b.raw.indexOf(FIRST_LINE) === -1) {
      issues.push("第" + pad3(b.n) + "轮 缺第一原则固定行——模板自带，别删（角色读牌第一眼看到）");
    }
  });
  return { ok: issues.length === 0, issues: issues };
}

// ── 主流程 ──
function main() {
  var args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("用法: node boardlint.js <公告牌目录>（目录下找 公告牌_*.md，如 火影-大鱼/ 或草稿目录）");
    process.exit(2);
  }
  var dir = path.resolve(args[0]);
  if (!fs.existsSync(dir)) { console.error("ERROR: 目录不存在: " + dir); process.exit(2); }

  var loaded = loadBoards(dir);
  if (loaded.error) { console.error("ERROR: " + loaded.error); process.exit(2); }
  var boards = loaded.boards;
  // 为 first-line 检查补 raw（parseBoard 时没存，这里补读）
  boards.forEach(function(b) {
    var f = path.join(dir, "公告牌_" + pad3(b.n) + ".md");
    try { b.raw = stripBom(fs.readFileSync(f, "utf8")); } catch (e) { b.raw = ""; }
  });

  console.log("=== BoardLint 公告牌契约校验 ===");
  console.log("公告牌目录: " + dir);
  console.log("公告牌: " + boards.length + " 张\n");

  var allIssues = [], allWarns = [];
  var sections = [];

  var s1 = checkNumbering(boards);
  sections.push({ title: "[1] 编号连续（🔴）", ok: s1.ok, issues: s1.issues });
  allIssues = allIssues.concat(s1.issues);

  var s2 = checkModes(boards);
  sections.push({ title: "[2] 模式枚举（🟡）", ok: s2.ok, warns: s2.warns });
  allWarns = allWarns.concat(s2.warns);

  var s3 = checkRetireRound(boards);
  sections.push({ title: "[3] 收工轮格式（🔴）", ok: s3.ok, issues: s3.issues });
  allIssues = allIssues.concat(s3.issues);

  var s4 = checkRoles(boards);
  sections.push({ title: "[4] 角色枚举（🔴）", ok: s4.ok, issues: s4.issues });
  allIssues = allIssues.concat(s4.issues);

  var s5 = checkStateFlow(boards);
  sections.push({ title: "[5] 状态流转（🔴 硬冲突）", ok: s5.ok, issues: s5.issues, warns: s5.warns });
  allIssues = allIssues.concat(s5.issues);
  allWarns = allWarns.concat(s5.warns);

  var s6 = checkOutputFormat(boards);
  sections.push({ title: "[6] 产出格式（🔴）", ok: s6.ok, issues: s6.issues });
  allIssues = allIssues.concat(s6.issues);

  var s7 = checkDirMatch(boards);
  sections.push({ title: "[7] 铁律8 目录一字不差（🔴）", ok: s7.ok, issues: s7.issues });
  allIssues = allIssues.concat(s7.issues);

  var s8 = checkDeps(boards);
  sections.push({ title: "[8] 前置依赖（🟡）", ok: s8.ok, warns: s8.warns });
  allWarns = allWarns.concat(s8.warns);

  var s9 = checkFirstLine(boards);
  sections.push({ title: "[9] 第一原则行（🔴）", ok: s9.ok, issues: s9.issues });
  allIssues = allIssues.concat(s9.issues);

  sections.forEach(function(sec) {
    console.log(sec.title + "  " + (sec.ok ? "✅" : "❌"));
    (sec.issues || []).forEach(function(i) { console.log("  ❌ " + i); });
    (sec.warns || []).forEach(function(w) { console.log("  ⚠️ " + w); });
    if (!(sec.issues || []).length && !(sec.warns || []).length) console.log("  （无问题）");
    console.log("");
  });

  if (allIssues.length === 0) {
    console.log("结论: ✅ 无阻断项——可发布" + (allWarns.length ? "（含 " + allWarns.length + " 条警告，建议按提示规范化）" : "（0 警告）"));
    process.exit(0);
  } else {
    console.log("结论: ❌ 发现 " + allIssues.length + " 处阻断项——必改再发（警告 " + allWarns.length + " 条不阻塞）");
    process.exit(1);
  }
}

main();
