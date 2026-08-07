/**
 * _fish_loop.js — 大鱼周期循环（检测 + 提示层，零决策）
 *
 * v2.5.1（升级计划第 2 条，2026-08-04 大鱼答复后定案）：
 * 大鱼不再手动 sleep 300 查公告牌——跑本脚本替代手动节奏：
 *   - 每 30s：stat 公告牌源目录，发现新公告牌 → 打印 NEW_BOARD 提示（大鱼去校验发布）
 *   - 每 60s：跑 node monitor.js 输出周期验证
 * 本脚本【只检测+报告】：不校验、不发布、不打回、不唤醒——决策权全在大鱼。
 *
 * 用法：node _fish_loop.js [--board-dir <公告牌源目录>] [--monitor <monitor.js 路径>] [--once]
 *   默认 board-dir = 当前目录（火影-大鱼/），monitor = 上级目录/monitor.js
 *   --once（12-25）：单轮检测汇总后退出（公告牌 + monitor 各跑一次）——大鱼每轮轮询一条命令替代手动 sleep+tail+ls
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

var args = process.argv.slice(2);
var boardDir = ".";
var monitorPath = path.resolve(__dirname, "..", "monitor.js");
var onceMode = args.indexOf("--once") !== -1; // 12-25 大鱼工具复盘最卡①：单轮汇总模式（拉日志+monitor 一条命令）

function argVal(flag, def) {
  var i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}
boardDir = argVal("--board-dir", boardDir);
monitorPath = argVal("--monitor", monitorPath);
boardDir = path.resolve(boardDir);
monitorPath = path.resolve(monitorPath);

// 已处理过的公告牌（mtime 跟踪：发现新牌 = 文件名不在集合，或 mtime 变化）
var knownBoards = {};
// 已处理过的对讲目录文件（老渣任务/回执，mtime 跟踪）
var knownTasks = {};

function sleepMs(ms) {
  try {
    var sab = new SharedArrayBuffer(4);
    var view = new Int32Array(sab);
    Atomics.wait(view, 0, 0, ms);
  } catch (e) {
    var end = Date.now() + ms;
    while (Date.now() < end) { var left = end - Date.now(); if (left > 100) { var w = Date.now() + 100; while (Date.now() < w) {} } }
  }
}

function checkBoards() {
  var found = [];
  try {
    var files = fs.readdirSync(boardDir).filter(function(f) {
      return /^公告牌_\d+\.md$/.test(f);
    }).sort();
    files.forEach(function(f) {
      var full = path.join(boardDir, f);
      var mtime = fs.statSync(full).mtimeMs;
      var prev = knownBoards[f];
      if (prev === undefined) {
        knownBoards[f] = mtime;
        found.push(f + " (新)");
      } else if (prev !== mtime) {
        knownBoards[f] = mtime;
        found.push(f + " (更新)");
      }
    });
  } catch (e) {
    console.log("[" + ts() + "] 公告牌目录读取失败: " + e.message);
    return;
  }
  if (found.length > 0) {
    console.log("[" + ts() + "] NEW_BOARD: " + found.join(", ") + " ← " + boardDir);
    console.log("    → 去校验并发布（校验 5 项 / 打回 / 扣留判断——决策归你）");
  }
}

// 对讲目录监控：检测 我的世界/大鱼_老渣对讲/ 的新文件（老渣发的任务/回执）
// 背景：大鱼 AI 只在回合内查对讲目录；回合间隙老渣放的任务可能悬空。
// 本函数让脚本也检测对讲目录——即使大鱼 AI 不在场，老渣放的任务也会被提示，不遗漏。
// 排除：收工三件套（产出总结/审计报告/项目完成，大鱼自己写的，不算任务）
function checkTalkDir() {
  var found = [];
  var talkDir = path.resolve(__dirname, "..", "我的世界", "大鱼_老渣对讲");
  try {
    if (!fs.existsSync(talkDir)) return;
    var files = fs.readdirSync(talkDir).sort();
    files.forEach(function(f) {
      // 排除大鱼自产报告（收工三件套）——那些是大鱼自己写的，不算"新任务"
      if (f === "产出总结.md" || f === "审计报告_外部观测.md" || f === "项目完成.md") return;
      var full = path.join(talkDir, f);
      var mtime;
      try { mtime = fs.statSync(full).mtimeMs; } catch (_se) { return; }
      var prev = knownTasks[f];
      if (prev === undefined) {
        knownTasks[f] = mtime;
        found.push(f + " (新)");
      } else if (prev !== mtime) {
        knownTasks[f] = mtime;
        found.push(f + " (更新)");
      }
    });
  } catch (e) {
    console.log("[" + ts() + "] 对讲目录读取失败: " + e.message);
    return;
  }
  if (found.length > 0) {
    console.log("[" + ts() + "] NEW_TASK: " + found.join(", ") + " ← 我的世界/大鱼_老渣对讲/");
    console.log("    → 去读任务并处理（老渣发的任务走交付闭环：读→干→deliver→sign→汇报）");
  }
}

function runMonitor() {
  try {
    var out = execSync('node "' + monitorPath + '"', { encoding: "utf8", timeout: 60000, cwd: path.dirname(monitorPath) || boardDir }).trim();
    var line = out.split("\n").pop().trim();
    console.log("[" + ts() + "] MONITOR: " + line);
  } catch (e) {
    var err = (e.stdout || "").toString().trim() || e.message;
    console.log("[" + ts() + "] MONITOR_ERR: " + err.split("\n").pop());
  }
}

function ts() {
  return new Date().toISOString().substring(11, 19);
}

console.log("_fish_loop 启动（升级计划第2条）：公告牌检测 30s / monitor 60s");
console.log("  公告牌源目录: " + boardDir);
console.log("  monitor: " + monitorPath);
console.log("  [纯检测+提示，发布/校验/打回/唤醒决策归大鱼]\n");

// 初始化：记录当前已有公告牌（不当作"新"）
try {
  fs.readdirSync(boardDir).forEach(function(f) {
    if (/^公告牌_\d+\.md$/.test(f)) {
      knownBoards[f] = fs.statSync(path.join(boardDir, f)).mtimeMs;
    }
  });
} catch (e) {}
// 初始化：记录对讲目录已有文件（不当作"新任务"）
try {
  var _talkInitDir = path.resolve(__dirname, "..", "我的世界", "大鱼_老渣对讲");
  if (fs.existsSync(_talkInitDir)) {
    fs.readdirSync(_talkInitDir).forEach(function(f) {
      if (f === "产出总结.md" || f === "审计报告_外部观测.md" || f === "项目完成.md") return;
      knownTasks[f] = fs.statSync(path.join(_talkInitDir, f)).mtimeMs;
    });
  }
} catch (e) {}

var tick = 0;
if (onceMode) {
  // 12-25 大鱼工具复盘最卡①：--once 单轮汇总——跑一轮检测后退出（大鱼每轮轮询从"sleep 55 + tail + ls"三条命令变一条）
  // 13-y 大鱼自检 4-7/P2-1：后台 _fish_loop 在跑时 --once 再跑 monitor → 两实例并发写监控日志.md（每秒多行不可读）
  //   → --once 检测 _fish_loop.log 新鲜度（60s 内更新 = 后台在跑）→ 跳过 monitor 段，只报公告牌 + 提示
  var _loopLog = path.join(boardDir, "_fish_loop.log");
  var _bgFresh = false;
  try {
    if (fs.existsSync(_loopLog) && Date.now() - fs.statSync(_loopLog).mtimeMs < 60000) _bgFresh = true;
  } catch(_lf) {}
  console.log("[" + ts() + "] ONCE 模式：单轮检测汇总（公告牌" + (_bgFresh ? " + monitor 跳过：后台 _fish_loop 在跑" : " + monitor") + "）");
  checkBoards();
  checkTalkDir(); // 13-y 补充：对讲目录也检测（老渣任务/回执）
  if (!_bgFresh) runMonitor();
  else console.log("[" + ts() + "] 后台 _fish_loop.log 60s 内有更新（后台监控在跑），monitor 段跳过避免并发写监控日志（13-y 大鱼自检 P2-1）");
  process.exit(0);
}
while (true) {
  tick++;
  checkBoards();                 // 每 30s 轻检查公告牌
  checkTalkDir();                // 每 30s 检查对讲目录（老渣任务/回执）
  if (tick % 2 === 0) runMonitor(); // 每 60s 跑 monitor
  sleepMs(30000);
}
