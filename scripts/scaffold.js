// scaffold.js —— 多Agent协作项目脚手架
// 用法：
//   node scaffold.js <项目目录> fish                       → 只重建大鱼+monitor
//   node scaffold.js <项目目录> <roles.json>               → init（默认，全新项目）
//   node scaffold.js <项目目录> <roles.json> add           → add（追加角色）
var fs = require("fs");
var path = require("path");

var projectDir = process.argv[2];

// 防呆：projectDir 不能以 "我的世界" 结尾——角色会被生成到我的世界里面而不是同级
// 正确：projectDir 是 我的世界/ 的上级目录（如 一号舱室-软件开发部）
if (projectDir.replace(/\\/g, "/").replace(/\/$/, "").endsWith("/我的世界")) {
    console.error("ERROR: projectDir 不能是我的世界目录！角色会生成到我的世界里面。");
    console.error("请用我的世界的上级目录（如 一号舱室-软件开发部）作为 projectDir。");
    process.exit(1);
}

var assetDir = path.resolve(__dirname, "..", "assets");

// 解析运行模式：第二个参数是 "fish" 则直接走鱼模式，否则第三个参数是 roles.json
var isFishMode = process.argv[3] === "fish";
var mode, rolesFile, isAddMode;
if (isFishMode) {
    mode = "fish";
    rolesFile = null;
    isAddMode = false;
    console.log("MODE: fish");
} else {
    rolesFile = process.argv[3];
    mode = (process.argv[4] || "init").toLowerCase();
    isAddMode = mode === "add";
    if (mode !== "init" && mode !== "add") {
        console.error("ERROR: 模式必须是 init 或 add，当前: " + mode);
        process.exit(1);
    }
    console.log("MODE: " + mode);
}

// 读角色配置（P0-5: 异常处理）——鱼模式跳过
if (!isFishMode) {
if (!fs.existsSync(rolesFile)) { console.error("ERROR: roles.json 不存在"); process.exit(1); }
var rolesRaw;
try { rolesRaw = fs.readFileSync(rolesFile, "utf8").replace(/^\uFEFF/, ""); }
catch (e) { console.error("ERROR: 无法读取 roles.json: " + e.message); process.exit(1); }
var roles;
try { roles = JSON.parse(rolesRaw); }
catch (e) { console.error("ERROR: JSON 格式错误: " + e.message); process.exit(1); }
if (!Array.isArray(roles) || roles.length === 0) { console.error("ERROR: roles.json 必须是非空数组"); process.exit(1); }

} // !isFishMode

// 读模板
var roleTpl = fs.readFileSync(assetDir + "/Reasonix版_角色_AGENTS模板.md", "utf8").replace(/^\uFEFF/, "");
var fishTpl = fs.readFileSync(assetDir + "/大鱼_AGENTS模板.md", "utf8").replace(/^\uFEFF/, "");

// 鱼模式：只重建大鱼AGENTS.md（纯模板，不注入灵魂——大鱼不需要人格）和monitor.js
if (isFishMode) {
    console.log("MODE: fish —— 重建大鱼+monitor（纯模板，无灵魂）");

    // 大鱼 AGENTS.md —— 纯模板，替换路径变量
    var fishDir = projectDir + "/火影-大鱼";
    fs.mkdirSync(fishDir, { recursive: true });
    var fishContent = fishTpl;
    fs.writeFileSync(fishDir + "/AGENTS.md", fishContent, "utf8");
    console.log("OK: 火影-大鱼/AGENTS.md (" + fs.statSync(fishDir + "/AGENTS.md").size + " bytes)");

    // 大鱼→老渣对讲目录，收工时写审计报告用
    fs.mkdirSync(projectDir + "/我的世界/大鱼_老渣对讲", { recursive: true });
    console.log("OK: 我的世界/大鱼_老渣对讲/");

    // monitor.js
    var monitorPath = projectDir + "/monitor.js";
    fs.copyFileSync(assetDir + "/monitor.js", monitorPath);
    console.log("OK: monitor.js (" + fs.statSync(monitorPath).size + " bytes)");

    // _wakeup.js —— 大鱼唤醒低功耗角色的工具
    var wakeupPath = fishDir + "/_wakeup.js";
    fs.copyFileSync(assetDir + "/_wakeup.js", wakeupPath);
    console.log("OK: _wakeup.js (" + fs.statSync(wakeupPath).size + " bytes)");

    // _外部环境BUG清单.md —— 大鱼模板引用 ./_外部环境BUG清单.md，必须复制到位
    var bugListPath = fishDir + "/_外部环境BUG清单.md";
    fs.copyFileSync(assetDir + "/_外部环境BUG清单.md", bugListPath);
    console.log("OK: _外部环境BUG清单.md (" + fs.statSync(bugListPath).size + " bytes)");

    console.log("DONE: " + projectDir);
    process.exit(0);
}

// 创建基础目录（add 模式跳过——这些目录已存在）
if (!isAddMode) {
    fs.mkdirSync(projectDir + "/我的世界", { recursive: true });
    // 部署团队须知到项目根目录（projectDir，角色窗口的父级），所有角色窗口共享
    var teamNotice = path.resolve(assetDir, "..", "团队须知/AGENTS.md");
    // 团队须知放到项目根目录，跟我的世界/同级；角色在 projectDir/角色名/ 下，父级即 projectDir
    fs.copyFileSync(teamNotice, projectDir + "/AGENTS.md");
    console.log("OK: 团队须知/AGENTS.md → " + projectDir);

    fs.mkdirSync(projectDir + "/我的世界/产出", { recursive: true });
    fs.mkdirSync(projectDir + "/我的世界/大鱼_老渣对讲", { recursive: true });
} else {
    console.log("SKIP: 我的世界/ (add 模式不重建)");
}

// 处理每个角色
roles.forEach(function(r) {
    var rd = projectDir + "/" + r.name;
    fs.mkdirSync(rd, { recursive: true });

    // 替换模板变量
    var content = roleTpl
        .replace(/\{\{ROLE_NAME\}\}/g, r.name)
        .replace(/\{\{ROLE_DESC\}\}/g, r.desc);

    // 注入背景
    var bg = r.background;
    if (bg && bg.trim().length > 0) {
        // 去掉用户可能重复写的标题
        bg = bg.replace(/^## 🎭 角色深度背景\s*\n*/g, "").trim();
        content = content.replace(/\{\{ROLE_BACKGROUND\}\}/g,
            "## 🎭 角色深度背景\n\n" + bg.trim());
    } else {
        content = content.replace(/\{\{ROLE_BACKGROUND\}\}/g,
            "## 🎭 角色深度背景\n\n> ⚠️ 未设定深度背景。请基于上方角色描述自由发挥，保持角色一致性。");
    }

    fs.writeFileSync(rd + "/AGENTS.md", content, "utf8");

    // 角色目录 reasonix.toml：turn 内循环模式前置配置（bash_timeout=0，回合内可无限等待轮询）
    var rxCfgPath = rd + "/reasonix.toml";
    if (!fs.existsSync(rxCfgPath)) {
        fs.writeFileSync(rxCfgPath, "[tools]\nbash_timeout_seconds = 0   # turn 内循环：关闭 bash 前台上限，回合内可持续轮询直到收工\n", "utf8");
        console.log("OK: " + r.name + "/reasonix.toml (bash_timeout=0)");
    }

    // 大鱼对讲目录
    fs.mkdirSync(projectDir + "/我的世界/" + r.name + "_大鱼对讲", { recursive: true });

    // 复制协作模式文件
    ["_双人对话模式.md", "_主笔审核模式.md", "_单人输出模式.md", "_辩论模式.md"].forEach(function(mf) {
        fs.copyFileSync(assetDir + "/" + mf, rd + "/" + mf);
    });

    // 复制工具文件
    fs.copyFileSync(assetDir + "/_poll.js", rd + "/_poll.js");
    fs.copyFileSync(assetDir + "/_reasonix_poll.js", rd + "/_reasonix_poll.js");
    var sc = fs.readFileSync(assetDir + "/_sign.js", "utf8"); sc = sc.replace(/\{\{ROLE_NAME\}\}/g, r.name); fs.writeFileSync(rd + "/_sign.js", sc, "utf8");
    fs.copyFileSync(assetDir + "/_lock.js", rd + "/_lock.js");
    fs.copyFileSync(assetDir + "/_deliver.js", rd + "/_deliver.js"); // v1.3: 行为约束工具脚本
    fs.copyFileSync(assetDir + "/_外部环境BUG清单.md", rd + "/_外部环境BUG清单.md");
    // _wakeup.js 也放角色目录——虽然不是角色用，但方便测试和参考
    fs.copyFileSync(assetDir + "/_wakeup.js", rd + "/_wakeup.js");

    console.log("OK: " + r.name + (bg ? " (含深度背景 " + bg.length + " 字符)" : ""));
});

// 大鱼 AGENTS.md —— add 模式跳过（追加角色不需要重建大鱼）
if (!isAddMode) {
// 大鱼 AGENTS.md —— 写到火影-大鱼/目录下，不是项目根目录！
// 检查是否已存在，不覆盖已有文件（角色不动项目动）
var fishDir = projectDir + "/火影-大鱼";
fs.mkdirSync(fishDir, { recursive: true });
var fishAgentsPath = fishDir + "/AGENTS.md";
if (!fs.existsSync(fishAgentsPath)) {
    fs.writeFileSync(fishAgentsPath, fishTpl, "utf8");
    console.log("OK: 火影-大鱼/AGENTS.md (new)");
} else {
    console.log("SKIP: 火影-大鱼/AGENTS.md (already exists)");
}

// 复制监控脚本 —— 已存在则不覆盖
var monitorPath = projectDir + "/monitor.js";
if (!fs.existsSync(monitorPath)) {
    fs.copyFileSync(assetDir + "/monitor.js", monitorPath);
    console.log("OK: monitor.js (new)");
} else {
    console.log("SKIP: monitor.js (already exists)");
}

// 复制_wakeup.js到大鱼目录
var wakeupDest = fishDir + "/_wakeup.js";
if (!fs.existsSync(wakeupDest)) {
    fs.copyFileSync(assetDir + "/_wakeup.js", wakeupDest);
    console.log("OK: 火影-大鱼/_wakeup.js (new)");
} else {
    console.log("SKIP: _wakeup.js (already exists)");
}

// 复制_外部环境BUG清单.md到大鱼目录（大鱼模板引用 ./_外部环境BUG清单.md）
var bugListDest = fishDir + "/_外部环境BUG清单.md";
if (!fs.existsSync(bugListDest)) {
    fs.copyFileSync(assetDir + "/_外部环境BUG清单.md", bugListDest);
    console.log("OK: 火影-大鱼/_外部环境BUG清单.md (new)");
} else {
    console.log("SKIP: _外部环境BUG清单.md (already exists)");
}
} else {
    console.log("SKIP: 火影-大鱼/AGENTS.md (add 模式)");
    console.log("SKIP: monitor.js (add 模式)");
}
console.log("DONE: " + projectDir);
