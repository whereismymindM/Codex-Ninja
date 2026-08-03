// _lock.js — 原子文件锁（wx标志，真正的原子操作）
// 用法: node _lock.js acquire [lockName] [等待超时秒数]
//       node _lock.js release [lockName]
// lockName默认"写锁"。统一命名 = "写锁_" + lockName + ".lock"（如 写锁_任务001.lock），与模板内联 lock() 一致，混用互斥有效
//
// lockName统一在argv[3]，release也能拿到

var fs = require("fs");
var path = require("path");

var action = process.argv[2];
// lockName: 可选锁名，用于不同任务/目录的锁隔离
// acquire 和 release 共用 argv[3] 作为 lockName
var lockName = (process.argv[3] || "写锁").replace(/[\\/]/g, "_"); // L13 修复：净化锁名，防路径穿越
// waitTimeout: acquire 时自己等锁的最大时长（秒），用 argv[4]，默认180秒
var waitTimeout = parseInt(process.argv[4], 10) || 180;
var LOCK_STALE_SEC = 600;
// 锁命名统一 = "写锁_" + lockName + ".lock"（如 写锁_任务001.lock），与模板内联 lock() 一致，混用互斥有效。角色优先用模板内联版。
var lockFile = path.resolve(__dirname, "..", "我的世界", "写锁_" + lockName + ".lock");

if (action === "release") {
    // L13 修复：existsSync+unlink 非原子，并发 release 时包 try-catch 防 ENOENT 崩溃
    try {
        if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
            console.log("LOCK_RELEASED");
        } else {
            console.log("LOCK_NOT_FOUND");
        }
    } catch(_er) {
        console.log("LOCK_RELEASED (并发释放)");
    }
    process.exit(0);
}

if (action !== "acquire") {
    console.log("用法: node _lock.js acquire [lockName] [等待超时秒数]");
    console.log("      node _lock.js release [lockName]");
    process.exit(1);
}

// acquire: 原子抢锁（wx = 不存在才创建）
var start = Date.now();
while (true) {
    try {
        fs.writeFileSync(lockFile, process.pid.toString(), { flag: "wx" });
        console.log("LOCK_ACQUIRED " + lockFile);
        process.exit(0);
    } catch (e) {
        if (e.code === "EEXIST") {
            // 锁被占用——用固定的 LOCK_STALE_SEC 判断是否过期
            // 不再跟 waitTimeout 共用，避免短超时误吞锁
            var stat = fs.statSync(lockFile);
            var age = (Date.now() - stat.mtimeMs) / 1000;
            if (age > LOCK_STALE_SEC) {
                // M9 修复：先校验持有进程是否还活着——活着（长任务）不回收，死了才回收；unlink 包 try-catch 防并发 ENOENT
                var holderAlive = false, holderPid = 0;
                try {
                    holderPid = parseInt(fs.readFileSync(lockFile, "utf8").trim(), 10);
                    if (!isNaN(holderPid) && holderPid > 0) { process.kill(holderPid, 0); holderAlive = true; }
                } catch(_eh) { holderAlive = false; }
                if (holderAlive) {
                    console.log("LOCK_STALE 但持有进程存活 (pid=" + holderPid + ")，视为长任务继续等待");
                } else {
                    console.log("LOCK_STALE (age=" + Math.floor(age) + "s, 持有进程已死), 强制回收");
                    try { fs.unlinkSync(lockFile); } catch(_eu) {}
                    continue;
                }
            }
            // 未过期，等5秒后重试，用自己的 waitTimeout 判断是否放弃
            var elapsed = (Date.now() - start) / 1000;
            if (elapsed > waitTimeout) { console.log("LOCK_TIMEOUT (等了 " + Math.floor(elapsed) + "s)"); process.exit(1); }
            console.log("LOCK_WAIT (已等" + Math.floor(elapsed) + "s / " + waitTimeout + "s)");
            // M9 修复：忙等 → Atomics.wait 真休眠（与 _poll.js safeSleep 一致），降级 100ms 切片兜底
            try {
                var _sab = new SharedArrayBuffer(4);
                var _view = new Int32Array(_sab);
                Atomics.wait(_view, 0, 0, 5000);
            } catch(_es) {
                var waitUntil = Date.now() + 5000;
                while (Date.now() < waitUntil) {
                    var _remaining = waitUntil - Date.now();
                    if (_remaining > 100) { var _w2 = Date.now() + 100; while (Date.now() < _w2) {} }
                }
            }
        } else {
            console.log("LOCK_ERROR: " + e.message);
            process.exit(1);
        }
    }
}
