// _lock.js — 原子文件锁（wx标志，真正的原子操作）
// 用法: node _lock.js acquire [lockName] [等待超时秒数]
//       node _lock.js release [lockName]
// lockName默认"写锁"，传"任务001"则操作 写锁_任务001.lock
//
// v1.5: lockName统一在argv[3]，release也能拿到

var fs = require("fs");
var path = require("path");

var action = process.argv[2];
// lockName: 可选锁名，用于不同任务/目录的锁隔离
// acquire 和 release 共用 argv[3] 作为 lockName
var lockName = process.argv[3] || "写锁";
// waitTimeout: acquire 时自己等锁的最大时长（秒），用 argv[4]，默认180秒
var waitTimeout = parseInt(process.argv[4], 10) || 180;
var LOCK_STALE_SEC = 600;
var lockFile = path.resolve(__dirname, "..", "我的世界", lockName + ".lock");

if (action === "release") {
    if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log("LOCK_RELEASED");
    } else {
        console.log("LOCK_NOT_FOUND");
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
                // 锁超过10分钟没更新，判定为过期锁（持有进程可能崩溃）
                console.log("LOCK_STALE (age=" + Math.floor(age) + "s > " + LOCK_STALE_SEC + "s), 强制回收");
                fs.unlinkSync(lockFile);
                continue;
            }
            // 未过期，等5秒后重试，用自己的 waitTimeout 判断是否放弃
            var elapsed = (Date.now() - start) / 1000;
            if (elapsed > waitTimeout) { console.log("LOCK_TIMEOUT (等了 " + Math.floor(elapsed) + "s)"); process.exit(1); }
            console.log("LOCK_WAIT (已等" + Math.floor(elapsed) + "s / " + waitTimeout + "s)");
            // 用 Node.js 内置等待（不依赖 PowerShell）
            var waitUntil = Date.now() + 5000;
            while (Date.now() < waitUntil) { /* 忙等5秒 */ }
        } else {
            console.error("LOCK_ERROR: " + e.message);
            process.exit(1);
        }
    }
}