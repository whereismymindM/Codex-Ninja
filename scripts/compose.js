// compose.js —— 公告牌编排器 v1.0（2026-08-10）
// 把"老渣手画状态矩阵 + 手填公告牌"变成"声明式 JSON + 自动生成 + 编译期校验"
// 用法: node compose.js <编排.json> [输出目录]   |   node compose.js --list 看模板
// 模板: scripts/templates/ 下有 15 个现实团队流程模板（软件开发全流程/四阶段流程/故障复盘/技术选型决策/知识挖掘/代码审查/质量审计/交叉评审/共识达成/公众号文章/轻量开发流程/迭代复盘/技术债盘点/多人圆桌讨论/竞标评审）
//       ——复制模板 → 替换 {角色X} 占位符 → 喂 compose.js 生成（谁先谁后已按现实流程排好）
// 输出: 公告牌_001.md ~ 公告牌_NNN.md + 状态矩阵 + 校验报告（流转冲突/格式违规 → 报错不生成）
// 零依赖（Node 原生），与 codex-ninja 风格一致
//
// 配置格式（JSON）：
// {
//   "项目": "项目名",
//   "角色": ["架构师-张三", "技术VP-李四", "AI研究员-王五"],
//   "轮次": [
//     { "模式": "单人输出|辩论|主笔审核|双人对话|试用|待命|收工",
//       "角色": { "架构师-张三": "正方", "技术VP-李四": "反方", "AI研究员-王五": "裁判" },  // 模式角色字段（辩论等）
//       "任务": "任务描述",
//       "产出负责人": "AI研究员-王五",   // 单人/主笔/辩论/双人/试用必填；待命/收工不填
//       "产出": "我的世界/产出/任务001_XX/文件名.md",
//       "任务目录": "我的世界/任务001_XX/",
//       "警告": "可选，本轮临时约束",
//       "本轮后": { "架构师-张三": "休眠" }   // 可选，默认活跃→待命
//     }
//   ]
// }
//
// 自动做的事：
//   1. 编号/文件名（公告牌_NNN.md 三位补零）
//   2. 状态矩阵推导 + 流转编译期校验（本轮后 ≠ 下轮状态 → 报错）
//   3. 角色行按模式生成（辩论→正方/反方/裁判+搭档；双人→问方/答方；主笔→主笔/审核）
//   4. 收工轮自动（全员退场 + 5 步任务栏）
//   5. 格式硬标准（第一原则行/产出前缀/角色枚举/收工字段省略）

var fs = require("fs");
var path = require("path");

var MODES = ["单人输出", "辩论", "主笔审核", "双人对话", "试用", "待命", "收工"];
var STATES = ["活跃", "待命", "休眠", "退场"];
var ROLE_FIELDS = { 辩论: ["正方", "反方", "裁判"], 双人对话: ["问方", "答方"], 主笔审核: ["主笔", "审核"] };

// ── 参数 ──
var args = process.argv.slice(2);
// --list：列出可用模板
if (args.indexOf("--list") !== -1) {
  var tplDir = path.join(__dirname, "templates");
  try {
    var tpls = fs.readdirSync(tplDir).filter(function(f) { return f.endsWith(".json"); });
    console.log("可用流程模板（scripts/templates/）:\n");
    tpls.forEach(function(f) {
      try {
        var t = JSON.parse(fs.readFileSync(path.join(tplDir, f), "utf8"));
        console.log("  📋 " + f.replace(".json", ""));
        console.log("     现实流程: " + (t._现实流程 || "-"));
        console.log("     需要角色: " + (t._角色需求 || []).join(", "));
      } catch (e) { console.log("  ⚠️ " + f + "（解析失败）"); }
    });
    console.log("\n用法: 复制模板 → 替换 {角色X} 占位符 → node compose.js <改好的.json> [输出目录]");
  } catch (e) { console.error("无 templates/ 目录: " + e.message); }
  process.exit(0);
}
if (args.length < 1) {
  console.error("用法: node compose.js <编排.json> [输出目录]   |   node compose.js --list 看模板");
  process.exit(2);
}
var cfgFile = args[0];
var outDir = args[1] || ".";
try { fs.mkdirSync(outDir, { recursive: true }); } catch (_m) {}

// ── 读配置 ──
var cfg;
try { cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8").replace(/^\uFEFF/, "")); }
catch (e) { console.error("ERROR: 读取/解析配置失败: " + e.message); process.exit(2); }
var errors = [];

// ── 职位化增强（2026-08-11，架构师评审建议）：_角色需求 ×N 防漏展开校验 ──
//   模板 _角色需求 可写 "{职位}×{N}"（如 "码农×2"）= 该职位需要 N 个实例；
//   与 cfg.角色 实际实例数比对（=== 职位 或 职位- 开头），不足则警告（不阻塞生成——漏展开由 monitor WAIT 兜底发现，提示提前一轮）
try {
  if (cfg._角色需求 && Array.isArray(cfg._角色需求)) {
    cfg._角色需求.forEach(function(req) {
      var m = String(req).match(/^(.+?)×(\d+)$/);
      if (!m) return;
      var pos = m[1].trim(), need = parseInt(m[2], 10);
      var have = (cfg.角色 || []).filter(function(r) {
        return r === pos || r.indexOf(pos + "-") === 0;
      }).length;
      if (have < need) console.log("WARN ×N: 职位 '" + pos + "' 需 " + need + " 个实例，角色数组实际 " + have + " 个——请展开实例（如 \"" + pos + "-张三\", \"" + pos + "-李四\"），否则 monitor 按实例数校验 .ready 会漏检");
    });
  }
} catch(_xn) {}

// ── 校验 ──
if (!cfg.角色 || !Array.isArray(cfg.角色) || cfg.角色.length === 0) errors.push("角色 必须是非空数组");
if (!cfg.轮次 || !Array.isArray(cfg.轮次) || cfg.轮次.length === 0) errors.push("轮次 必须是非空数组");
var roleSet = (cfg.角色 || []).map(String);
// 2026-08-12 修复：角色名净化（与 scaffold 同规则）——防路径分隔符/.. 与 monitor 路径拼接联动（monitor 用角色名拼退场/心跳路径）
(cfg.角色 || []).forEach(function(_rn) {
    var _rs = String(_rn);
    if (/[\\/]|\.\.|^\.+$/.test(_rs)) errors.push("角色名不能包含路径分隔符（/ \\）、'..' 或纯点号: " + _rs);
});
cfg.轮次 && cfg.轮次.forEach(function(r, ri) {
  var n = ri + 1;
  if (!r.模式) errors.push("第" + n + "轮缺 模式");
  else if (MODES.indexOf(r.模式) === -1) errors.push("第" + n + "轮 模式 非法（" + r.模式 + "），允许: " + MODES.join("/"));
  if (r.角色) Object.keys(r.角色).forEach(function(role) { if (roleSet.indexOf(role) === -1) errors.push("第" + n + "轮 角色 '" + role + "' 不在角色名单"); });
  // 产出字段：任务轮必填，收工/待命不填（试用轮有试用报告产出，同样必填——2026-08-11 修复：原漏了试用轮，漏产出行编译期不报错 → monitor 活跃轮 WAIT 卡死）
  var needOutput = r.模式 === "单人输出" || r.模式 === "辩论" || r.模式 === "主笔审核" || r.模式 === "双人对话" || r.模式 === "试用";
  if (needOutput) {
    if (!r.产出负责人) errors.push("第" + n + "轮 缺 产出负责人（" + r.模式 + "轮必填）");
    if (!r.产出) errors.push("第" + n + "轮 缺 产出");
    if (!r.任务目录) errors.push("第" + n + "轮 缺 任务目录");
  }
  if (r.产出 && (r.产出.indexOf("我的世界/产出/") !== 0 || r.产出.indexOf("\\") !== -1 || r.产出.indexOf("..") !== -1)) errors.push("第" + n + "轮 产出 必须以 '我的世界/产出/' 开头且不含 \\ 或 ..（防路径逃逸）");
  if (r.任务目录 && (r.任务目录.indexOf("我的世界/") !== 0 || r.任务目录.indexOf("\\") !== -1 || r.任务目录.indexOf("..") !== -1)) errors.push("第" + n + "轮 任务目录 必须以 '我的世界/' 开头且不含 \\ 或 ..（防路径逃逸）"); // 2026-08-12 修复：任务目录字段补前缀/逃逸校验（原无校验）
  if (r.产出 && r.产出.indexOf("{}") !== -1) errors.push("第" + n + "轮 产出 含占位符 {}");
  if (r.产出 && !/\.md$/.test(r.产出) && !/\/$/.test(r.产出)) errors.push("第" + n + "轮 产出 应为 .md 文件名或以 / 结尾目录（格式 A/B）");
  if ((r.模式 === "收工" || r.模式 === "待命") && (r.产出负责人 || r.产出 || r.任务目录)) errors.push("第" + n + "轮（" + r.模式 + "）不该有 产出负责人/产出/任务目录");
  // 收工轮必须最后
  if (r.模式 === "收工" && ri !== cfg.轮次.length - 1) errors.push("收工轮必须是最后一轮（第" + n + "轮）");
  // 待命轮应在收工前
  if (r.模式 === "待命" && cfg.轮次[ri + 1] && cfg.轮次[ri + 1].模式 !== "收工") errors.push("第" + n + "轮 待命轮之后必须是收工轮");
});
if (errors.length > 0) {
  console.error("❌ 编排配置校验失败（" + errors.length + " 处）:");
  errors.forEach(function(e) { console.error("  - " + e); });
  process.exit(1);
}

// ── 状态流转推导（编译期校验）──
// state[role] = 当前状态；prevAfter[role] = 上一轮"本轮后"
var state = {};
var prevAfterMap = null;
cfg.角色.forEach(function(r) { state[r] = "待命"; });
var matrix = []; // [{轮, 每角色: {状态, 本轮后}}]

cfg.轮次.forEach(function(r, ri) {
  var n = ri + 1;
  var round = { 轮: n, 模式: r.模式, roles: {} };
  var roleStates = r.角色状态 || {};
  var after = r.本轮后 || {};

  if (r.模式 === "收工") {
    cfg.角色.forEach(function(role) {
      round.roles[role] = { 状态: "退场", 本轮后: "—" };
      if (state[role] === "退场") errors.push("第" + n + "轮: 角色 '" + role + "' 上轮已退场（状态序列非法）");
      state[role] = "退场";
    });
  } else if (r.模式 === "待命") {
    cfg.角色.forEach(function(role) {
      round.roles[role] = { 状态: "待命", 本轮后: "待命" };
      state[role] = "待命";
    });
  } else {
    // 任务轮：提及角色默认活跃，未提及用上轮本轮后（2026-08-11 修复：原用上轮当前状态——上轮活跃的未提及角色会永远显示活跃，
    //   四阶段模板暴露：拆缝后架构师/产品经理在后续轮误显"状态：活跃"，角色会误以为自己这轮要干活）
    var activeRoles = r.角色 ? Object.keys(r.角色) : (roleStates ? Object.keys(roleStates) : []);
    cfg.角色.forEach(function(role) {
      var prevAfter = prevAfterMap && prevAfterMap[role];
      var st = roleStates[role]
        || (activeRoles.indexOf(role) !== -1 ? "活跃"
           : (prevAfter === "待命" || prevAfter === "休眠" ? prevAfter : state[role]));
      if (STATES.indexOf(st) === -1) errors.push("第" + n + "轮 角色 '" + role + "' 状态非法: " + st);
      // 流转校验：只有 休眠/退场 → 活跃 才是真冲突（休眠=确定没你需唤醒，退场=已走）
      // 待命 → 活跃 是正常（待命=随时接棒，现实团队随时被叫）——v1.1 修正（模板测试暴露第一版太严）
      if (prevAfter && (prevAfter === "休眠" || prevAfter === "退场") && st === "活跃" && state[role] !== "退场") {
        errors.push("第" + n + "轮: 角色 '" + role + "' 流转冲突——上轮本轮后=" + prevAfter + " 但本轮状态=活跃（休眠/退场需唤醒或不可能）");
      }
      var aft = after[role] || (st === "活跃" ? "待命" : "—");
      if (aft !== "—" && STATES.indexOf(aft) === -1) errors.push("第" + n + "轮 角色 '" + role + "' 本轮后非法: " + aft);
      round.roles[role] = { 状态: st, 本轮后: aft };
      state[role] = st;
    });
  }
  matrix.push(round);
  // prevAfterMap 记录本轮后（供下轮校验）
  var pm = {};
  cfg.角色.forEach(function(role) { pm[role] = round.roles[role].本轮后; });
  prevAfterMap = pm;
});

if (errors.length > 0) {
  console.error("❌ 状态流转校验失败（" + errors.length + " 处）:");
  errors.forEach(function(e) { console.error("  - " + e); });
  process.exit(1);
}

// ── 生成公告牌 ──
var FIRST_LINE = "🔒 第一原则：最后一个动作必须是工具调用，不能纯文字下线；poll 到收工轮才合法退场";
var RETIRE_TASK = "全员退场。①收工前确认你的职责已尽：盘点本项目/前几轮公告牌分配给你的任务是否已交付——未尽则先补交/求助/说明，不得直接退场 ②创建退场文件（对讲目录，无 .md 后缀，monitor 靠它确认你已安全退出）③写流水账（独立文件 {角色名}_流水账.md，回顾全程每轮一行）④【终局轮】写 {角色名}_角色记忆.md 到对讲目录（传承给下一任的自己）⑤输出「项目完成」结束回合。";

function roleLine(role, round, r) {
  var info = round.roles[role];
  var mode = r.模式;
  var extra = "";
  if (r.角色 && r.角色[role] && mode !== "单人输出") {
    var field = r.角色[role];
    // 找搭档：同轮其他角色
    var partner = Object.keys(r.角色).filter(function(k) { return k !== role; }).join("/") || "";
    extra = "（角色：" + field + (partner ? "，搭档：" + partner : "") + "，状态：" + info.状态 + "，本轮后：" + info.本轮后 + "）";
  } else if (mode === "待命") {
    extra = "（状态：待命，等通知）";
  } else if (mode === "收工") {
    extra = "（状态：退场）";
  } else {
    extra = "（状态：" + info.状态 + (info.本轮后 !== "—" ? "，本轮后：" + info.本轮后 : "") + "）";
  }
  return "- " + role + extra;
}

var files = [];
cfg.轮次.forEach(function(r, ri) {
  var n = ri + 1;
  var round = matrix[ri];
  var lines = [];
  lines.push("# 公告牌 第" + String(n).padStart(3, "0") + "轮");
  lines.push(FIRST_LINE);
  if (r.模式 !== "收工" && r.模式 !== "待命") lines.push("- 产出类型: " + (r.产出类型 || "文档"));
  lines.push("- 模式: " + r.模式);
  cfg.角色.forEach(function(role) { lines.push(roleLine(role, round, r)); });
  if (r.警告) lines.push("- ⚠️ 警告: " + r.警告);
  if (r.模式 === "收工") {
    lines.push("- 任务: " + RETIRE_TASK);
  } else if (r.模式 === "待命") {
    lines.push("- 任务: 全员待命。持续 poll 等下一张公告牌——可能追加任务（发新公告牌），也可能不再追加（大鱼到时补发收工轮）。**待命轮期间绝对禁止私自下线**（第一原则）。");
  } else {
    lines.push("- 任务: " + r.任务);
    lines.push("- 产出负责人: " + r.产出负责人);
    lines.push("- 产出: " + r.产出);
    lines.push("- 任务目录: " + r.任务目录);
  }
  var content = lines.join("\n") + "\n";
  var fname = "公告牌_" + String(n).padStart(3, "0") + ".md";
  fs.writeFileSync(path.join(outDir, fname), content, "utf8");
  files.push(fname);
});

// ── 打印状态矩阵 + 汇总 ──
console.log("✅ 公告牌生成完成（" + files.length + " 张 → " + path.resolve(outDir) + "）:");
files.forEach(function(f) { console.log("  " + f); });
console.log("\n=== 状态矩阵（核对流转）===");
console.log("| 角色 | " + matrix.map(function(m) { return m.轮; }).join(" | ") + " |");
console.log("|------|" + matrix.map(function() { return "------|"; }).join(""));
cfg.角色.forEach(function(role) {
  var cells = matrix.map(function(m) {
    var info = m.roles[role];
    return info.状态 + (info.本轮后 !== "—" ? "→" + info.本轮后 : "");
  });
  console.log("| " + role + " | " + cells.join(" | ") + " |");
});
console.log("\n📌 流转校验：通过（本轮后 与 下轮状态 已编译期对齐）");
