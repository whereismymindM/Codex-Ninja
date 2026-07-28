// === 大鱼监控脚本（轮询版）===
// 用法：在项目根目录下 node monitor.js
// 每次运行检查一轮状态后退出，stdout 即时可见
// 大鱼每 30 秒跑一次：WAIT → 等 → DONE → 翻篇
var fs = require("fs");
// 用 __dirname 而不是 process.cwd()——大鱼号架构下大鱼的 CWD 是子目录，我的世界/ 在 monitor.js 同级
var base = __dirname;

// P1-1: N值从状态文件读，崩溃重启不跳轮次
var stateFile = base + "/我的世界/.monitor_state.json";
var N = 1;
if (fs.existsSync(stateFile)) {
    try {
        var state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
        if (state.N && typeof state.N === "number") N = state.N;
    } catch (e) { /* 状态文件损坏，从1开始 */ }
}
// 自检：从N开始逐轮找第一个未完成的
while (true) {
    var bf = base + "/我的世界/公告牌_" + String(N).padStart(3, "0") + ".md";
    if (!fs.existsSync(bf)) break; // 公告牌不存在 → 当前N就是正确轮次
    // 检查该轮是否已完成（所有活跃角色签字 + 产出就位）
    var boardContent = fs.readFileSync(bf, "utf8");
        // Count active roles from bulletin (regex just to count, not to build paths)
    var actCount = (boardContent.match(/- .+?[（(].*状态[:：]活跃/g) || []).length;
    var Npad = String(N).padStart(3, "0");
    var allDone = true, hasActive = actCount > 0;
    // Scan MyWorld for sign-off files - no Chinese path construction!
    var mwDir = base + "/我的世界";
    var dirs = fs.readdirSync(mwDir).filter(function(d) { return d.endsWith("_大鱼对讲"); });
    var signedCount = 0;
    dirs.forEach(function(d) {
        var sf = mwDir + "/" + d + "/完成_" + Npad + ".md";
        try { if (fs.existsSync(sf) && fs.statSync(sf).size > 20) signedCount++; } catch(e) {}
    });
    allDone = hasActive ? (signedCount >= actCount) : true; // 非活跃轮不看签字
    // P2-10: 收工轮特殊处理——公告牌格式为「角色 → 退场」，没有「状态：活跃」
    // 正则匹配不到活跃角色时，检查是否为收工轮，是则验退场文件（v2.15: 休眠角色写已休眠_NNN，收工轮写已退场_NNN，monitor两者都验）
    if (!hasActive && allDone) {
        var isRetire = /模式[：:]\s*收工/.test(boardContent) || /·\s*收工/.test(boardContent);
        if (isRetire) {
            var retireRe = /- (.+?) [（→]/g;
            var retireMatch;
            allDone = true;
            while ((retireMatch = retireRe.exec(boardContent)) !== null) {
                var roleName = retireMatch[1].trim();
                // 过滤非角色行（模式、任务、产出等字段）
                if (roleName === "模式" || roleName === "任务" || roleName === "产出" || roleName === "任务目录" || roleName === "任务目录" || roleName.indexOf(":") !== -1) continue;
                var retireFile = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已退场_" + Npad;
    var sleepFile = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已休眠_" + Npad;
                if (!fs.existsSync(retireFile)) { allDone = false; break; }
            }
        }
    }
    if (!allDone) break; // 这轮没完成 → N停在这
    N++; // 完成了 → 看下一轮
}

var boardFile = base + "/我的世界/公告牌_" + String(N).padStart(3,"0") + ".md";
// P2-10: 公告牌不存在时，回看上一轮是否为已完成的收工轮
if (!fs.existsSync(boardFile)) {
    var prevN = N - 1;
    var prevBoard = base + "/我的世界/公告牌_" + String(prevN).padStart(3,"0") + ".md";
    if (fs.existsSync(prevBoard)) {
        var prevContent = fs.readFileSync(prevBoard, "utf8");
        if (/模式[：:]\s*收工/.test(prevContent) || /·\s*收工/.test(prevContent)) {
            // 上一轮是收工，检查退场文件
            var retireRe = /- (.+?) [（→]/g;
            var retireMatch, allRetired = true;
            while ((retireMatch = retireRe.exec(prevContent)) !== null) {
                var roleName = retireMatch[1].trim();
                if (roleName === "模式" || roleName === "任务" || roleName === "产出" || roleName === "任务目录" || roleName === "任务目录" || roleName.indexOf(":") !== -1) continue;
                var rf = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已退场_" + String(prevN).padStart(3,"0");
    var sf = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已休眠_" + String(prevN).padStart(3,"0");
                if (!fs.existsSync(rf)) { allRetired = false; break; }
            }
            if (allRetired) { console.log("DONE N=" + prevN); process.exit(0); }
        }
    }
    console.log("WAIT N=" + N); process.exit(0);
}

var board;
try { board = fs.readFileSync(boardFile, "utf8").replace(/^\uFEFF/, ""); } // P2-6+P0-4: BOM+异常保护
catch (e) { console.log("READ_ERR " + boardFile + ": " + e.message); process.exit(0); }

// 解析活跃角色——这轮谁在干活
var activeRoles = [];
// 解析所有角色——收工轮检查退场文件用
var allRoles = [];
var re = /- (.+?)[（(].*状态[:：]\s*活跃/g; // P1-2: 同时匹配全角和半角括号
var allRe = /- (.+?)（/g;
var m;
var am;
while ((m = re.exec(board)) !== null) { var rn = m[1].replace(/^组[A-Z]\s*[:：]\s*/, ''); activeRoles.push(rn); }
while ((am = allRe.exec(board)) !== null) { var arn = am[1].replace(/^组[A-Z]\s*[:：]\s*/, ''); allRoles.push(arn); }

// 1. 签字 & 休眠/退场检查
var allSigned = true;
var allRetired = true; // 收工轮用：所有角色是否都写了退场文件（或休眠文件，v2.15两者都验）
if (activeRoles.length === 0) {
    // 收工轮：全员退场，逐个检查退场文件（或休眠文件，v2.15两者都验）是否到位
    console.log("SIGN [收工]");
    allRoles.forEach(function(role) {
        var retireFile = base + "/我的世界/" + role + "_大鱼对讲/" + role + "已退场_" + String(N).padStart(3,"0");
      var sleepFile = base + "/我的世界/" + role + "_大鱼对讲/" + role + "已休眠_" + String(N).padStart(3,"0");
        if (fs.existsSync(retireFile) || fs.existsSync(sleepFile)) { console.log("RETIRE " + role + " OK"); }
        else { console.log("RETIRE " + role + " MISS"); allRetired = false; }
    });
} else {
    activeRoles.forEach(function(role) {
        var sign = base + "/我的世界/" + role + "_大鱼对讲/完成_" + String(N).padStart(3,"0") + ".md";
        // P2-7: 空文件不算签字
        if (fs.existsSync(sign) && fs.statSync(sign).size > 20) { console.log("SIGN " + role + " ✓"); }
        else { console.log("SIGN " + role + " ⚠️"); }
    });
}

// 2. 产出（收工公告牌不需要产出）
var outputReady = activeRoles.length === 0;
// v2.14: 产出校验——优先解析产出行中的具体文件名，逐个fs.existsSync检查
// 格式A（有文件名）: 产出: 我的世界/产出/任务001/server.js, search.js → 逐文件检查
// 格式B（仅目录）: 产出: 我的世界/产出/任务001/ → 回退到目录非空检查
var outputRe = /产出:\s*我的世界\/(\S+)/g;
var outputMatch, allOutputReady = true, outputCount = 0;
while ((outputMatch = outputRe.exec(board)) !== null) {
    outputCount++;
    var fullPath = outputMatch[1];
    var lastSlash = fullPath.lastIndexOf("/");
    var outDir, fileNames;
    if (lastSlash !== -1 && fullPath.substring(lastSlash + 1).indexOf(".") !== -1) {
        outDir = fullPath.substring(0, lastSlash);
        fileNames = fullPath.substring(lastSlash + 1).split(/\s*,\s*/);
    } else {
        outDir = fullPath.replace(/\/$/, "");
        fileNames = null;
    }
    
    var ready = false;
    var outDirPath = base + "/我的世界/" + outDir;
    if (fileNames && fileNames.length > 0) {
        var allExist = true;
        var missing = [];
        fileNames.forEach(function(fn) {
            // P1-3: 检查 .ready 文件而非内容文件——.ready 写入在内容完成之后，无竞态
            var fp = outDirPath + "/" + fn.trim() + ".ready";
            if (!fs.existsSync(fp)) { allExist = false; missing.push(fn.trim()); }
        });
        ready = allExist;
        if (!ready) console.log("OUTPUT " + outDir + " \u2717 (missing: " + missing.join(", ") + ")");
        else console.log("OUTPUT " + outDir + " \u2713 (" + fileNames.length + " files)");
    } else {
        // P1-3: 检查 .ready 文件——有 .ready 说明内容文件已完整写入
        var readyFiles = fs.existsSync(outDirPath) ? fs.readdirSync(outDirPath).filter(function(f) { return f.endsWith(".ready"); }) : [];
        ready = readyFiles.length > 0;
        console.log("OUTPUT " + outDir + " " + (ready ? "\u2713" : "\u2717"));
    }
    if (!ready) allOutputReady = false;
}
if (outputCount > 0) outputReady = allOutputReady;
// 3. 求助
var worldDir = base + "/我的世界";
if (fs.existsSync(worldDir)) {
    fs.readdirSync(worldDir).filter(function(d) { return d.endsWith("_大鱼对讲"); }).forEach(function(dir) {
        var fullDir = worldDir + "/" + dir;
        if (!fs.statSync(fullDir).isDirectory()) return;
        fs.readdirSync(fullDir).filter(function(f) { return f.startsWith("大鱼对话_") && !f.endsWith("_已处理"); }).forEach(function(f) {
            var help = fs.readFileSync(fullDir + "/" + f, "utf8");
            console.log("HELP " + dir + ": " + help.substring(0, 150));
            // P1-3: 原子写入——先写.tmp再rename
var replyPath = fullDir + "/" + f.replace("大鱼对话", "大鱼回复");
fs.writeFileSync(replyPath + ".tmp", "大鱼收到，继续按公告牌行动", "utf8");
fs.renameSync(replyPath + ".tmp", replyPath);
            // 处理完改名，下次不重复读
            fs.renameSync(fullDir + "/" + f, fullDir + "/" + f + "_已处理");
        });
    });
}

// 4. 判断（收工轮额外检查退场文件）
if (outputReady && allRetired) {
    console.log("DONE N=" + N);
    // P1-1: 持久化当前轮次状态
    try { fs.writeFileSync(stateFile, JSON.stringify({ N: N + 1 }), "utf8"); } catch (e) {}
} else {
    console.log("WAIT N=" + N);
}
