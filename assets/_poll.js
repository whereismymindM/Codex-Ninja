// _poll.js — 通用轮询小工具
// 用法: node _poll.js <目标文件路径> <描述>
//       node _poll.js --signal <目标文件路径> <描述>
//         → 同时监控目标文件和同目录下的"对话结束.signal"，谁先到报谁
//       node _poll.js --max-wait 600 <目标文件路径> <描述>
//         → 最多等600秒（10分钟），超时 exit(2)，让调用方知道不是正常等到
//       node _poll.js --low-power --wakeup <对讲目录> <目标文件> <描述>
//         → 低功耗模式：每3秒轮询一次（短超时防卡死），同时检查_wakeup.md唤醒信号

var fs = require("fs");
var path = require("path");

var args = process.argv.slice(2);

// --max-wait N：最多等N秒后超时退出（P0-1修复）
var maxWaitIdx = args.indexOf("--max-wait");
var maxWaitSec = 0;
if (maxWaitIdx !== -1) {
    // L16 修复：--max-wait 缺数值时报错退出——避免 parseInt(undefined)=NaN→0 且 splice 误删后续参数导致 targetFile 丢失
    if (args[maxWaitIdx + 1] === undefined || isNaN(parseInt(args[maxWaitIdx + 1], 10))) {
        console.log("用法: --max-wait 需要一个数值参数（秒），如 --max-wait 600");
        process.exit(1);
    }
    maxWaitSec = parseInt(args[maxWaitIdx + 1], 10) || 0;
    args.splice(maxWaitIdx, 2);
}

// --signal：同时监控对话结束信号（答方专用）
var signalIdx = args.indexOf("--signal");
var signalMode = signalIdx !== -1;
if (signalMode) args.splice(signalIdx, 1);

// --ready：监控搭档的 .ready 就绪信号文件（搭档用_deliver.js交付后自动生成）
var readyIdx = args.indexOf("--ready");
var readyMode = readyIdx !== -1;
if (readyMode) args.splice(readyIdx, 1);

// --low-power：低功耗模式（休眠后不关窗，每3秒轮询+检_wakeup.md）
var lpIdx = args.indexOf("--low-power");
var lowPowerMode = lpIdx !== -1;
if (lowPowerMode) args.splice(lpIdx, 1);

// --wakeup <对讲目录>：低功耗模式下检查 _wakeup.md 的目录
var wakeupDir = null;
var wuIdx = args.indexOf("--wakeup");
if (wuIdx !== -1) {
    wakeupDir = args[wuIdx + 1];
    args.splice(wuIdx, 2);
}


// --phase <ms>：初始相位偏移，多角色错开轮询
var phaseMs = 0;
var phIdx = args.indexOf("--phase");
if (phIdx !== -1) {
    phaseMs = parseInt(args[phIdx + 1], 10) || 0;
    args.splice(phIdx, 2);
}
var targetFile = args[0];
var desc = args[1] || targetFile;

if (!targetFile) {
    console.log("用法: node _poll.js [--max-wait N] [--signal] [--ready] [--low-power --wakeup <dir>] <文件路径> <描述>");
    process.exit(1);
}

var signalFile = signalMode ? path.join(path.dirname(targetFile), "对话结束.signal") : null;
var readyFile = readyMode ? targetFile + ".ready" : null;

// 低功耗模式：wakeup信号文件路径
var wakeFile = (lowPowerMode && wakeupDir) ? path.join(wakeupDir, "_wakeup.md") : null;

// 如果没指定 --max-wait，默认最多等 600 秒（10分钟），低功耗模式默认8秒（短超时防卡死）
if (maxWaitSec <= 0) maxWaitSec = lowPowerMode ? 8 : 600; // 低功耗8s（短超时），正常模式600s

var startTime = Date.now();

var elapsed = 0;
// 渐进式间隔：首轮快速响应，逐步放缓
// 低功耗模式：硬编码固定间隔
var intervals = [3, 5, 8, 12, 20, 30]; // 首轮3s，逐步放缓
var intervalIdx = 0;

// 安全sleep：Atomics.wait（Node.js原生，跨平台），降级为忙等
function safeSleep(seconds) {
    try {
        var sab = new SharedArrayBuffer(4);
        var view = new Int32Array(sab);
        Atomics.wait(view, 0, 0, seconds * 1000);
    } catch (e) {
        var end = Date.now() + seconds * 1000;
        while (Date.now() < end) {
            var remaining = end - Date.now();
            if (remaining > 100) {
                var waitUntil = Date.now() + 100;
                while (Date.now() < waitUntil) { }
            }
        }
    }
}
if (lowPowerMode) console.log("高频轮询启动——每3秒检查一次公告牌和唤醒信号（最多等" + maxWaitSec + "秒超时，提速）");

// P2: 随机初始抖动（0-1.5秒）——多角色同时休眠时错开轮询相位，避免文件系统请求尖峰
if (lowPowerMode) {
    var jitterMs = Math.floor(Math.random() * 1500);
    safeSleep(jitterMs / 1000);
}


// 应用相位偏移（--phase参数传入）
if (phaseMs > 0) {
    safeSleep(phaseMs / 1000);
}
while (true) {
    elapsed = Math.floor((Date.now() - startTime) / 1000);

    // 超时检查（P0-1修复）
    if (elapsed >= maxWaitSec) {
        console.log(desc + " 超时！等了 " + elapsed + " 秒（上限 " + maxWaitSec + " 秒）");
        process.exit(2); // exit code 2 = 超时，让调用方区分「等到了」和「超时」
    }

    // 低功耗模式：优先检查 _wakeup.md 唤醒信号
    if (lowPowerMode && wakeFile && fs.existsSync(wakeFile)) {
        var wakeContent = "";
        try { wakeContent = fs.readFileSync(wakeFile, "utf8").substring(0, 200); } catch(e) {}
        console.log("被大鱼唤醒了！等了 " + elapsed + " 秒");
        console.log("唤醒原因: " + wakeContent.replace(/\n/g, " | "));
        // 删除唤醒文件，确认收到
        try { fs.renameSync(wakeFile, wakeFile.replace(".md", "_acked.md")); } catch(e) {}
        process.exit(3); // exit code 3 = 被唤醒
    }

    
    // M4 修复：targetFile 检查每次循环直接 existsSync（开销可忽略），不依赖目录 mtime 门控——
    // 覆盖写已存在文件不更新目录 mtime，旧的门控会让"等文件更新"的调用方永远等不到
    if (fs.existsSync(targetFile)) {
        console.log(desc + " 出现了！等了 " + elapsed + " 秒");
        var flushEnd = Date.now() + 200;
        while (Date.now() < flushEnd) {}
        process.exit(0);
    }
    if (signalMode && fs.existsSync(signalFile)) {
        console.log("对话结束.signal 出现了（问方已喊停）！等了 " + elapsed + " 秒");
        var flushEnd = Date.now() + 200;
        while (Date.now() < flushEnd) {}
        process.exit(0);
    }
    if (readyMode && fs.existsSync(readyFile)) {
        console.log(desc + " 的就绪信号 .ready 出现了！等了 " + elapsed + " 秒");
        var flushEnd2 = Date.now() + 200;
        while (Date.now() < flushEnd2) {}
        process.exit(0);
    }

    var waitSec = lowPowerMode ? 3 : intervals[Math.min(intervalIdx, intervals.length - 1)]; // 低功耗固定3s，正常模式渐进提速
    if (!lowPowerMode || elapsed % 120 === 0) {
        console.log("等 " + desc + " 中...（已等 " + elapsed + "s / " + maxWaitSec + "s，下次 " + waitSec + "s 后检查）");
    }
    safeSleep(waitSec);
    intervalIdx++;
}
