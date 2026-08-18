// start-fish.js —— F 模式一键启动大鱼调度者（唯一常驻进程）
// 用法: node start-fish.js [项目根目录]
// 默认项目根 = 当前目录；也可传参指定（如 一号舱室-软件开发部）
// 前置: 该目录已用 scaffold 生成（world/ fish/ 存在），公告牌已全量发布
// 说明: 角色由大鱼按轮次唤醒（reasonix run --continue/--dir），本脚本只负责启动大鱼

var fs = require("fs");
var path = require("path");
var { spawn } = require("child_process");

var projectDir = path.resolve(process.argv[2] || ".");
var fishDir = path.join(projectDir, "fish");
var worldDir = path.join(projectDir, "world");

// 前置检查
if (!fs.existsSync(fishDir) || !fs.existsSync(path.join(fishDir, "AGENTS.md"))) {
    console.error("ERROR: 未找到 fish/AGENTS.md —— 请先在该目录跑 scaffold（node <skill>/scripts/scaffold.js . roles.json）");
    process.exit(1);
}
if (!fs.existsSync(worldDir)) {
    console.error("ERROR: 未找到 world/ —— scaffold 未运行或目录结构不对");
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

var prompt = "读取 AGENTS.md，你是大鱼调度者。按「调度角色（按需拉起，干完即退）」节开始调度循环：每 60s 跑 node ../monitor.js，读当前轮公告牌解析活跃角色，逐个检查done_N.md，未完成的用 reasonix run --continue/--dir 唤醒（prompt 带『干完即退』），等全员退场后写收工审计报告。禁止输出最终回复，直到收工审计完成。现在开始。";

console.log("========================================");
console.log("  大鱼调度者启动（F 模式）");
console.log("  项目: " + projectDir);
console.log("  reasonix: " + RX);
console.log("========================================");

// M8 修复：崩溃/--max-steps 超限后自动重启（带次数上限），避免 F 模式调度静默停摆
var MAX_RESTARTS = 5;
var restartCount = 0;

function start() {
    // F-1 修复：shell:true 下 Node 对 args 只拼接不转义，含空格的 prompt 会被 cmd 拆成多个位置参数
    // （实测：["第一段","含空格的中文","prompt","内容"] → 被拆成 4 段）→ 手动用双引号包裹 prompt 整体；
    // prompt 内无 ASCII 双引号（用「」『』），包裹后作为单个参数传入
    var promptArg = '"' + prompt.replace(/"/g, '\\"') + '"';
    // F-1 补充（复核残留2）：--dir 的项目根路径同样手动 quote——项目根含空格（如 D:\My Projects\项目A）时不被 cmd 拆分
    var dirArg = '"' + fishDir.replace(/"/g, '\\"') + '"';
    var child = spawn(RX, ["run", "--dir", dirArg, "--model", (process.env.DEFAULT_MODEL || "deepseek-v4-flash"), "--max-steps", (process.env.FISH_MAX_STEPS || "500"), promptArg], {
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
        // 复核修复：正常收工（exit 0，项目完成）不重启——重启会让已完成的项目空转；
        // 仅非 0 退出码（崩溃/--max-steps 超限/模型报错）才自动重启，带上限防无限循环
        if (code === 0) {
            console.log("正常退出（exit 0），不重启。");
            process.exit(0);
        }
        if (restartCount < MAX_RESTARTS) {
            restartCount++;
            console.log("10 秒后自动重启（第 " + restartCount + "/" + MAX_RESTARTS + " 次）...");
            setTimeout(start, 10000);
        } else {
            console.log("超过最大重启次数（" + MAX_RESTARTS + "），退出。请人工检查 reasonix 状态。");
            process.exit(code || 1);
        }
    });
}

// L-14 修复：启动前先探测 reasonix 可用性——shell:true 下 spawn 的 error 事件几乎不触发，
// 不探活的话 reasonix 缺失会走 5 次无意义重启才报"超过最大重启次数"，诊断信息错位
var probe = spawn(RX, ["version"], { shell: true, stdio: "ignore" });
probe.on("error", function(err) {
    console.error("reasonix 不可用: " + err.message);
    console.error("请确认 reasonix 已安装且在 PATH，或设置 REASONIX_CMD 指向 reasonix.cmd 绝对路径");
    process.exit(1);
});
probe.on("exit", function(code) {
    if (code !== 0) {
        console.error("reasonix version 探测失败（退出码=" + code + "）——请确认 reasonix 可用后重试");
        process.exit(1);
    }
    console.log("reasonix 探测通过，启动大鱼调度者...");
    start();
});
