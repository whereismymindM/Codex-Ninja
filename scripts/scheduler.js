// scheduler.js —— 调度器：节奏 + 唤醒信号（唯一真常驻进程）
// 用法: node scheduler.js [项目根目录]
// 架构: 调度器管节奏（60s 周期跑 monitor + 算待办），大鱼管决策（按需被唤醒处理待办）
//      大鱼不需要自己存活——调度器发现大鱼不在就 spawn 它
// 前置: 项目已 scaffold + 公告牌已全量发布

var fs = require("fs");
var path = require("path");
var { exec, spawn } = require("child_process");

var projectDir = path.resolve(process.argv[2] || ".");
var fishDir = path.join(projectDir, "火影-大鱼");
var worldDir = path.join(projectDir, "我的世界");
var todoFile = path.join(worldDir, "_fish_todo.md");
var doneFile = path.join(worldDir, "_fish_done.md");
var activeFile = path.join(worldDir, "_fish_active.txt");
var logFile = path.join(worldDir, "大鱼_老渣对讲", "调度日志.md");
var monitorJs = path.join(projectDir, "monitor.js");

var CHECK_INTERVAL = 60 * 1000;   // 60s 周期
var FISH_IDLE_TIMEOUT = 5 * 60 * 1000; // 大鱼标记超过5分钟无更新 → 认为已死，可重新 spawn

var RX = process.env.REASONIX_CMD || "";
if (!RX) {
    var candidates = ["reasonix", path.join(process.env.APPDATA || "", "npm", "reasonix.cmd")];
    for (var i = 0; i < candidates.length; i++) {
        try { if (fs.existsSync(candidates[i])) { RX = candidates[i]; break; } } catch(e) {}
    }
    if (!RX) RX = "reasonix";
}

function log(msg) {
    var ts = new Date().toISOString().substring(11, 19);
    var line = "[" + ts + "] " + msg + "\n";
    try {
        fs.mkdirSync(path.dirname(logFile), { recursive: true });
        fs.appendFileSync(logFile, line, "utf8");
    } catch(e) {}
    console.log(line.trim());
}

function runMonitor() {
    return new Promise(function(resolve) {
        if (!fs.existsSync(monitorJs)) { resolve({ code: -1, out: "" }); return; }
        exec("node \"" + monitorJs + "\"", { cwd: projectDir, timeout: 30000 }, function(err, stdout) {
            resolve({ code: err ? -1 : 0, out: stdout || "" });
        });
    });
}

// 大鱼是否在跑：active 文件存在且新鲜
function fishActive() {
    try {
        if (!fs.existsSync(activeFile)) return false;
        var t = parseInt(fs.readFileSync(activeFile, "utf8").trim());
        return !isNaN(t) && (Date.now() - t) < FISH_IDLE_TIMEOUT;
    } catch(e) { return false; }
}

function spawnFish(reason) {
    // 窗口大鱼在线（火影-大鱼/.reasonix 锁存在）→ 不 spawn，由窗口大鱼处理（写入待办让它读）
    if (fs.existsSync(path.join(fishDir, ".reasonix"))) {
        log("WINDOW_FISH_ACTIVE 窗口大鱼在线，写入待办由它处理，不重复 spawn");
        var todo = "# 大鱼待办\n> 时间: " + new Date().toISOString() + "\n> " + reason + "\n";
        try { fs.writeFileSync(todoFile + ".tmp", todo, "utf8"); fs.renameSync(todoFile + ".tmp", todoFile); } catch(e) {}
        return;
    }
    var prompt = "读取 AGENTS.md，你是大鱼调度者。调度器刚叫你处理待办：读 ../我的世界/_fish_todo.md（如不存在则自己跑 node ../monitor.js 看进度），按「调度器协作模式」处理：判断该唤醒谁→唤醒角色干活→写调度日志→写 ../我的世界/_fish_done.md 确认→输出最终回复退出。理由：" + reason;
    log("SPAWN_FISH reason=" + reason);
    try { fs.writeFileSync(activeFile, String(Date.now()), "utf8"); } catch(e) {}
    var child = spawn(RX, ["run", "--dir", fishDir, "--model", (process.env.DEFAULT_MODEL || "deepseek-v4-flash"), "--max-steps", "200", prompt], {
        cwd: fishDir, shell: true, stdio: "inherit"
    });
    child.on("error", function(err) {
        log("FISH_SPAWN_ERROR " + err.message);
        try { fs.unlinkSync(activeFile); } catch(e) {}
    });
    // 大鱼进程退出时清 active 标记（允许下轮重新 spawn）
    child.on("exit", function() {
        try { fs.unlinkSync(activeFile); } catch(e) {}
        log("FISH_EXIT (active 已清除，下轮可重新唤醒)");
    });
}

function writeTodo(todoContent) {
    try {
        fs.writeFileSync(todoFile + ".tmp", todoContent, "utf8");
        fs.renameSync(todoFile + ".tmp", todoFile);
    } catch(e) {}
}

async function main() {
    log("调度器启动（C 路线：窗口常驻角色自推进，调度器观察+审计）监控 " + worldDir);
    while (true) {
        try {
            var res = await runMonitor();
            var out = res.out || "";
            var roles = [];
            // 解析 ROLE <角色> PENDING
            var re = /ROLE (.+?) PENDING/g, m;
            while ((m = re.exec(out)) !== null) roles.push(m[1].trim());
            var projectDone = /DONE N=/.test(out) && roles.length === 0;

            if (projectDone) {
                log("PROJECT_DONE 全员完成。唤醒大鱼做收工审计。");
                if (!fishActive()) spawnFish("项目完成，请做收工审计（产出总结+审计报告+项目完成.md）");
            } else if (roles.length > 0) {
                // C 路线：窗口角色会自己 poll 推进，调度器不重复唤醒（除非角色掉线/超时）
                // 只在角色持续 PENDING 超过 3 个周期且无窗口迹象时，才通知大鱼介入
                log("PENDING roles=" + roles.join(",") + "（窗口常驻角色自推进中，调度器观察不干预）");
                // 若角色完全无心跳（说明窗口没起来/掉线），提示大鱼介入
                // ⚠️ 2026-08-02 实测修复：不能只看心跳——角色可能正用 ISO 心跳/或对话中。
                //    检查 我的世界/任务NNN/ 目录 mtime 是否近期更新（有活动=活着）
                var allDead = roles.every(function(r) {
                    try {
                        // 1. 心跳新鲜？
                        var hb = worldDir + "/" + r + "_大鱼对讲/_heartbeat.txt";
                        if (fs.existsSync(hb)) {
                            var t = parseInt(fs.readFileSync(hb, "utf8").trim());
                            if (!isNaN(t) && (Date.now() - t) < 10 * 60 * 1000) return false;
                        }
                        // 2. 任务目录近期有活动？（对话/产出文件在更新）
                        var taskDirs = fs.readdirSync(worldDir).filter(function(d) { return /^任务\d+_/.test(d); });
                        for (var i = 0; i < taskDirs.length; i++) {
                            var dp = worldDir + "/" + taskDirs[i];
                            if (Date.now() - fs.statSync(dp).mtimeMs < 5 * 60 * 1000) return false;
                        }
                        return true;
                    } catch(e) { return true; }
                });
                if (allDead) {
                    log("ROLES_DEAD 窗口角色疑似未启动/掉线，唤醒大鱼介入检查");
                    if (!fishActive()) spawnFish("角色窗口疑似未启动或掉线（无心跳）：" + roles.join(", ") + "。请检查窗口是否已开、是否输入「进入角色」；能补救则补救，不能则写求助给老渣。");
                }
            } else {
                log("NO_PENDING 无待办（等待或已完成轮）");
            }
        } catch(e) {
            log("SCHED_ERROR " + e.message);
        }
        await new Promise(function(r) { setTimeout(r, CHECK_INTERVAL); });
    }
}

main();
