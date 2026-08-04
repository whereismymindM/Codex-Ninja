/**
 * _fish_loop.js — 大鱼周期循环（检测 + 提示层，零决策）
 *
 * v2.5.1（升级计划第 2 条，2026-08-04 大鱼答复后定案）：
 * 大鱼不再手动 sleep 300 查公告牌——跑本脚本替代手动节奏：
 *   - 每 30s：stat 公告牌源目录，发现新公告牌 → 打印 NEW_BOARD 提示（大鱼去校验发布）
 *   - 每 60s：跑 node monitor.js 输出周期验证
 * 本脚本【只检测+报告】：不校验、不发布、不打回、不唤醒——决策权全在大鱼。
 *
 * 用法：node _fish_loop.js [--board-dir <公告牌源目录>] [--monitor <monitor.js 路径>]
 *   默认 board-dir = 当前目录（火影-大鱼/），monitor = 上级目录/monitor.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

var args = process.argv.slice(2);
var boardDir = ".";
var monitorPath = path.resolve(__dirname, "..", "monitor.js");

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

var tick = 0;
while (true) {
  tick++;
  checkBoards();                 // 每 30s 轻检查公告牌
  if (tick % 2 === 0) runMonitor(); // 每 60s 跑 monitor
  sleepMs(30000);
}
