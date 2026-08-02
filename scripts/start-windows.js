// start-windows.js —— C 路线一键开窗：为所有角色 + 大鱼打开 reasonix code 窗口
// 用法: node start-windows.js [项目根目录] [--fish-only]
// 依赖: Windows Terminal (wt) + reasonix 在 PATH 或 %APPDATA%/npm
// 行为: 为每个角色目录 + 火影-大鱼 开一个 wt 标签页（reasonix code --dir），
//       用户在每个窗口输入「进入角色」后角色进入窗口常驻模式
// 说明: 脚本只负责开窗；「进入角色」需人工输入（C 路线已接受此成本），
//       或另用 reasonix run 自动初始化（见启动指南）

var fs = require("fs");
var path = require("path");
var { exec } = require("child_process");

var projectDir = path.resolve(process.argv[2] || ".");
var fishOnly = process.argv.indexOf("--fish-only") !== -1;

// 找到 reasonix 命令
var RX = process.env.REASONIX_CMD || "";
if (!RX) {
    var candidates = ["reasonix", path.join(process.env.APPDATA || "", "npm", "reasonix.cmd")];
    for (var i = 0; i < candidates.length; i++) {
        try { if (fs.existsSync(candidates[i])) { RX = candidates[i]; break; } } catch(e) {}
    }
    if (!RX) RX = "reasonix";
}

var SKIP = ["我的世界", "火影-大鱼", "档案馆", "产出", "_回收站"];
if (fishOnly) SKIP = ["我的世界", "档案馆", "产出", "_回收站"]; // --fish-only: 只开大鱼

var dirs = [];
if (!fs.existsSync(projectDir)) { console.error("ERROR: 项目根不存在: " + projectDir); process.exit(1); }

if (fishOnly) {
    dirs.push(path.join(projectDir, "火影-大鱼"));
} else {
    dirs.push(path.join(projectDir, "火影-大鱼")); // 大鱼窗口
    fs.readdirSync(projectDir).forEach(function(d) {
        if (SKIP.indexOf(d) !== -1) return;
        var full = path.join(projectDir, d);
        if (!fs.statSync(full).isDirectory()) return;
        if (!fs.existsSync(path.join(full, "AGENTS.md"))) return; // 只开有 AGENTS.md 的角色目录
        // 幂等：该目录已有 .reasonix 锁（code 已在跑）→ 跳过，避免重复开窗
        if (fs.existsSync(path.join(full, ".reasonix"))) { console.log("SKIP " + d + " (已在运行)"); return; }
        dirs.push(full);
    });
}

if (dirs.length === 0) { console.error("ERROR: 没有可开的角色窗口（未跑 scaffold？）"); process.exit(1); }

console.log("========================================");
console.log("  C 路线一键开窗");
console.log("  项目: " + projectDir);
console.log("  窗口数: " + dirs.length + "（角色 + 大鱼）");
console.log("  每个窗口启动后输入「进入角色」");
console.log("========================================");

dirs.forEach(function(d) {
    var title = path.basename(d);
    var cmd = 'wt --title "' + title + '" powershell -NoExit -Command "cd \'' + d + '\'; & \'' + RX + '\' code --dir \'' + d + '\'"';
    console.log("开窗: " + title + " → " + d);
    exec(cmd, function(err) {
        if (err) console.error("  失败: " + title + " " + err.message);
    });
});

console.log("DONE: " + dirs.length + " 个窗口已发起。每个窗口输入「进入角色」即可。");
