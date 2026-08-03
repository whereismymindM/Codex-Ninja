// start-fish.js —— F 模式一键启动大鱼调度者（唯一常驻进程）
// 用法: node start-fish.js [项目根目录]
// 默认项目根 = 当前目录；也可传参指定（如 一号舱室-软件开发部）
// 前置: 该目录已用 scaffold 生成（我的世界/ 火影-大鱼/ 存在），公告牌已全量发布
// 说明: 角色由大鱼按轮次唤醒（reasonix run --continue/--dir），本脚本只负责启动大鱼

var fs = require("fs");
var path = require("path");
var { spawn } = require("child_process");

var projectDir = path.resolve(process.argv[2] || ".");
var fishDir = path.join(projectDir, "火影-大鱼");
var worldDir = path.join(projectDir, "我的世界");

// 前置检查
if (!fs.existsSync(fishDir) || !fs.existsSync(path.join(fishDir, "AGENTS.md"))) {
    console.error("ERROR: 未找到 火影-大鱼/AGENTS.md —— 请先在该目录跑 scaffold（node <skill>/scripts/scaffold.js . roles.json）");
    process.exit(1);
}
if (!fs.existsSync(worldDir)) {
    console.error("ERROR: 未找到 我的世界/ —— scaffold 未运行或目录结构不对");
    process.exit(1);
}

// reasonix 命令路径（兼容 PATH 或 %APPDATA%/npm）
var RX = process.env.REASONIX_CMD || "";
if (!RX) {
    var candidates = [
        "reasonix",
        path.join(process.env.APPDATA || "", "npm", "reasonix.cmd")
    ];
    for (var i = 0; i < candidates.length; i++) {
        try { if (fs.existsSync(candidates[i])) { RX = candidates[i]; break; } } catch(e) {}
    }
    if (!RX) RX = "reasonix"; // 兜底走 PATH
}

var prompt = "读取 AGENTS.md，你是大鱼调度者。按「调度角色（按需拉起，干完即退）」节开始调度循环：每 60s 跑 node ../monitor.js，读当前轮公告牌解析活跃角色，逐个检查完成_N.md，未完成的用 reasonix run --continue/--dir 唤醒（prompt 带『干完即退』），等全员退场后写收工审计报告。禁止输出最终回复，直到收工审计完成。现在开始。";

console.log("========================================");
console.log("  大鱼调度者启动（F 模式）");
console.log("  项目: " + projectDir);
console.log("  reasonix: " + RX);
console.log("========================================");

// M8 修复：崩溃/--max-steps 超限后自动重启（带次数上限），避免 F 模式调度静默停摆
var MAX_RESTARTS = 5;
var restartCount = 0;

function start() {
    var child = spawn(RX, ["run", "--dir", fishDir, "--model", (process.env.DEFAULT_MODEL || "deepseek-v4-flash"), "--max-steps", "500", prompt], {
        cwd: fishDir,
        shell: true,
        stdio: "inherit"
    });

    child.on("error", function(err) {
        console.error("启动失败: " + err.message);
        console.error("请确认 reasonix 可用（`reasonix version`），或设置 REASONIX_CMD 指向 reasonix.cmd 绝对路径");
        process.exit(1);
    });
    child.on("exit", function(code) {
        console.log("大鱼进程退出，退出码=" + code);
        if (restartCount < MAX_RESTARTS) {
            restartCount++;
            console.log("10 秒后自动重启（第 " + restartCount + "/" + MAX_RESTARTS + " 次）...");
            setTimeout(start, 10000);
        } else {
            console.log("超过最大重启次数（" + MAX_RESTARTS + "），退出。请人工检查 reasonix 状态。");
            process.exit(code || 0);
        }
    });
}

start();
