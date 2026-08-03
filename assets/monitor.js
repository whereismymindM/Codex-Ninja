// === 大鱼监控脚本（轮询版）===
// 用法：在项目根目录下 node monitor.js
// 每次运行检查一轮状态后退出，stdout 即时可见
// 大鱼每 60 秒跑一次（大鱼模板规定）：WAIT → 等 → DONE → 项目完成（只验证，不翻篇）
var fs = require("fs");
// 用 __dirname 而不是 process.cwd()——大鱼号架构下大鱼的 CWD 是子目录，我的世界/ 在 monitor.js 同级
var base = __dirname;

// 心跳时间戳解析：兼容 毫秒 / 秒 / ISO 字符串（角色可能写任意格式，2026-08-02 实测修复）
function parseHeartbeat(raw) {
    var s = String(raw || "").trim();
    if (!s) return NaN;
    var n = parseInt(s, 10);
    if (!isNaN(n) && n >= 1000000000000) return n;               // 毫秒时间戳
    if (!isNaN(n) && n >= 1000000000 && n < 1000000000000) return n * 1000; // 秒时间戳
    var iso = Date.parse(s);                                      // ISO 字符串
    return isNaN(iso) ? NaN : iso;
}

// P1-1: N值从状态文件读，崩溃重启不跳轮次
var stateFile = base + "/我的世界/.monitor_state.json";
var N = 1;
if (fs.existsSync(stateFile)) {
    try {
        var state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
        if (state.N && typeof state.N === "number") N = state.N;
    } catch (e) { /* 状态文件损坏，从1开始 */ }
}
// 顶层 try-catch：monitor 自身异常不盲飞
try {
// 自检：从N开始逐轮找第一个未完成的
while (true) {
    var bf = base + "/我的世界/公告牌_" + String(N).padStart(3, "0") + ".md";
    if (!fs.existsSync(bf)) break; // 公告牌不存在 → 当前N就是正确轮次
    // 检查该轮是否已完成（所有活跃角色签字 + 产出就位）
    var boardContent = fs.readFileSync(bf, "utf8");
    // Count active roles from bulletin (regex just to count, not to build paths)
    // 只扫公告牌头部（任务: 之前的角色声明区），避免任务描述里的"状态：活跃"文本被误匹配
    var headerPart = boardContent.split(/\n- 任务[:：]/)[0];
    var actCount = (headerPart.match(/- .+?[（(].*状态[:：]\s*活跃/g) || []).length; // M1 修复：与主流程 :123 一致，兼容冒号后带空格
    var Npad = String(N).padStart(3, "0");
    var allDone = true, hasActive = actCount > 0;
    // 产出检查（与主判断一致：推进判定只看产出就位，签字不阻塞推进，不参与自检判据）
    var outReSelf = /(?:^|\n)- 产出[:：]\s*我的世界\/([^\r\n]+)/g; // H1 修复：兼容全角冒号；H3 修复：行首锚定（任务描述里的"产出: 我的世界/…"引用不再误匹配）
    var omSelf; var hasOutSelf = false; var outOkSelf = true;
    while ((omSelf = outReSelf.exec(boardContent)) !== null) {
        hasOutSelf = true;
        var fpSelf = omSelf[1].trim();
        var lsSelf = fpSelf.lastIndexOf("/");
        if (lsSelf !== -1 && fpSelf.substring(lsSelf + 1).indexOf(".") !== -1) {
            var odSelf = fpSelf.substring(0, lsSelf);
            var fnsSelf = fpSelf.substring(lsSelf + 1).split(/\s*,\s*/);
            for (var fiSelf = 0; fiSelf < fnsSelf.length; fiSelf++) {
                var fnSelf = fnsSelf[fiSelf].trim();
                if (fnSelf && !fs.existsSync(base + "/我的世界/" + odSelf + "/" + fnSelf + ".ready")) { outOkSelf = false; break; }
            }
        } else {
            var od2Self = fpSelf.replace(/\/$/, "");
            var dp2Self = base + "/我的世界/" + od2Self;
            var rfsSelf = fs.existsSync(dp2Self) ? fs.readdirSync(dp2Self).filter(function(f) { return f.endsWith(".ready"); }) : [];
            if (rfsSelf.length === 0) { outOkSelf = false; break; }
        }
    }
    if (hasOutSelf && !outOkSelf) allDone = false; // 有产出行但未就位 → 该轮未完成
    if (hasActive && !hasOutSelf) allDone = false; // 活跃轮漏写产出行 → 视为未完成（与主判断一致，避免自检跳过）
    // P2-10: 收工轮特殊处理——公告牌格式为「角色（状态：退场）」，正则匹配角色行（角色名后紧跟全角括号，无空格）
    if (!hasActive && allDone) {
        var isRetire = /模式[：:]\s*收工/.test(boardContent) || /·\s*收工/.test(boardContent);
        if (isRetire) {
            var retireRe = /- (.+?)[（(→]/g; // H8 修复：兼容半角括号
            var retireMatch;
            allDone = true;
            while ((retireMatch = retireRe.exec(boardContent)) !== null) {
                var roleName = retireMatch[1].trim().replace(/^组[A-Z]\s*[:：]\s*/, ""); // H8 修复：先剥离组前缀再过滤，与主流程 :127 一致
                // 过滤非角色行（模式、任务、产出等字段）
                // ⚠️ 黑名单过滤——老渣新增非角色字段（如 - 备注: xxx）需在此补上，否则 monitor 永不推进
                if (roleName === "模式" || roleName === "任务" || roleName === "产出" || roleName === "任务目录" || roleName.indexOf(":") !== -1 || roleName.indexOf("：") !== -1) continue; // H8 修复：黑名单同时匹配全角冒号
                var retireFile = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已退场_" + Npad;
                var sleepFile = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已休眠_" + Npad;
                // 退场文件或休眠文件任一存在即视为已退出（与主逻辑 :123 一致）
                if (!fs.existsSync(retireFile) && !fs.existsSync(sleepFile)) { allDone = false; break; }
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
        // 复核补充：readFileSync 包 try（与 M-1 同类）——读失败跳过收工回看，走 WAIT（安全）；monitor 重跑幂等
        var prevContent;
        try { prevContent = fs.readFileSync(prevBoard, "utf8"); } catch(_pb) {}
        if (prevContent && (/模式[：:]\s*收工/.test(prevContent) || /·\s*收工/.test(prevContent))) {
            // 上一轮是收工，检查退场文件
            var retireRe = /- (.+?)[（(→]/g; // H8 修复：兼容半角括号
            var retireMatch, allRetired = true;
            while ((retireMatch = retireRe.exec(prevContent)) !== null) {
                var roleName = retireMatch[1].trim().replace(/^组[A-Z]\s*[:：]\s*/, ""); // H8 修复：先剥离组前缀再过滤
                // ⚠️ 黑名单过滤——老渣新增非角色字段（如 - 备注: xxx）需在此补上，否则 monitor 永不推进
                if (roleName === "模式" || roleName === "任务" || roleName === "产出" || roleName === "任务目录" || roleName.indexOf(":") !== -1 || roleName.indexOf("：") !== -1) continue; // H8 修复：黑名单同时匹配全角冒号
                var rf = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已退场_" + String(prevN).padStart(3,"0");
                var sf = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已休眠_" + String(prevN).padStart(3,"0");
                if (!fs.existsSync(rf) && !fs.existsSync(sf)) { allRetired = false; break; }
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
var headerPart = board.split(/\n- 任务[:：]/)[0];
var re = /- (.+?)[（(].*状态[:：]\s*活跃/g; // P1-2: 同时匹配全角和半角括号
var allRe = /- (.+?)[（(]/g; // H8 修复：兼容半角括号
var m;
var am;
while ((m = re.exec(headerPart)) !== null) { var rn = m[1].replace(/^组[A-Z]\s*[:：]\s*/, ''); activeRoles.push(rn); }
while ((am = allRe.exec(headerPart)) !== null) { var arn = am[1].replace(/^组[A-Z]\s*[:：]\s*/, ''); allRoles.push(arn); }

// 1. 签字 & 休眠/退场检查
var allRetired = true; // 收工轮用：所有角色是否都写了退场文件（或休眠文件，两者都验）
if (activeRoles.length === 0) {
    // 无活跃角色：可能是收工轮（全员退场），也可能是待命轮（全员待命、无产出）
    var isRetireRound = /模式[：:]\s*收工/.test(board) || /·\s*收工/.test(board);
    if (!isRetireRound) {
        // H2 修复：待命轮不要求退场文件——输出 STANDBY 供大鱼识别（避免误报 SIGN [收工]/RETIRE MISS），并阻止误判 DONE
        console.log("STANDBY N=" + N);
        allRetired = false;
    } else {
        // 收工轮：全员退场，逐个检查退场文件（或休眠文件，两者都验）是否到位
        console.log("SIGN [收工]");
        allRoles.forEach(function(role) {
            var retireFile = base + "/我的世界/" + role + "_大鱼对讲/" + role + "已退场_" + String(N).padStart(3,"0");
            var sleepFile = base + "/我的世界/" + role + "_大鱼对讲/" + role + "已休眠_" + String(N).padStart(3,"0");
            // 收工轮强制退场：心跳超时角色视为已退场（F 模式放宽：干完即退后心跳停是正常态）
            var hbFile3 = base + "/我的世界/" + role + "_大鱼对讲/_heartbeat.txt";
        var hbForce = false;
        try {
          if (fs.existsSync(hbFile3)) {
            var hbT3 = parseHeartbeat(fs.readFileSync(hbFile3, "utf8"));
            var hbTimeout3 = (fs.existsSync(base + "/火影-大鱼/_运行形态.mode") && fs.readFileSync(base + "/火影-大鱼/_运行形态.mode", "utf8").trim() === "run") ? 10 * 60 * 1000 : 2 * 60 * 1000;
            if (!isNaN(hbT3) && Date.now() - hbT3 > hbTimeout3) hbForce = true;
          }
        } catch(_e4) {}
        if (fs.existsSync(retireFile) || fs.existsSync(sleepFile) || hbForce) {
            console.log("RETIRE " + role + " OK" + (hbForce ? " (force)" : ""));
            // 2026-08-02 优化：流水账覆盖校验——退场角色应有全程总结（≥2 行：至少一轮 + 退场），
            // 不足标 ⚠️（不阻塞退场，提醒角色复盘漏写）
            try {
                var flowFile = base + "/我的世界/" + role + "_大鱼对讲/" + role + "_流水账.md";
                if (fs.existsSync(flowFile)) {
                    var flowLines = fs.readFileSync(flowFile, "utf8").split("\n").filter(function(l) { return l.trim().length > 0; }).length;
                    if (flowLines < 2) {
                        // M16 修复：全程待命角色写一行"全程待命"是角色模板允许的合规写法，豁免 ⚠️
                        var _flowContent = fs.readFileSync(flowFile, "utf8");
                        if (_flowContent.indexOf("全程待命") !== -1) console.log("FLOW " + role + " OK（全程待命，单行豁免）");
                        else console.log("FLOW " + role + " ⚠️ 流水账过简（" + flowLines + " 行，应为全程总结）");
                    }
                    else console.log("FLOW " + role + " OK (" + flowLines + " 行)");
                } else {
                    console.log("FLOW " + role + " ⚠️ 无流水账");
                }
            } catch(_e6) {}
        }
        else { console.log("RETIRE " + role + " MISS"); allRetired = false; }
    });
    } // end isRetireRound
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
// 产出校验——优先解析产出行中的具体文件名，逐个fs.existsSync检查
// 格式A（有文件名）: 产出: 我的世界/产出/任务001/server.js, search.js → 逐文件检查
// 格式B（仅目录）: 产出: 我的世界/产出/任务001/ → 回退到目录非空检查
var outputRe = /(?:^|\n)- 产出[:：]\s*我的世界\/([^\r\n]+)/g; // H1 修复：兼容全角冒号；H3 修复：行首锚定（自检/主流程/复检三处已同步）
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
        if (!ready) {
            // fallback: 老渣可能把产出路径错写成源文件目录（如 soulforge/）
            // 实际 .ready 在 产出/ 子目录下——扫描兜底
            var outBase = base + "/我的世界/产出";
            if (fs.existsSync(outBase)) {
                try {
                    var outDirs = fs.readdirSync(outBase).filter(function(d2) {
                        // H4 修复：fallback 只扫描当前轮次的任务目录（任务NNN_*），避免跨轮同名 .ready 误命中导致本轮提前 DONE
                        return fs.statSync(outBase + "/" + d2).isDirectory() && d2.indexOf("任务" + String(N).padStart(3, "0")) === 0;
                    });
                    var fbOk = missing.every(function(fn) {
                        return outDirs.some(function(d2) {
                            return fs.existsSync(outBase + "/" + d2 + "/" + fn + ".ready");
                        });
                    });
                    if (fbOk) { ready = true; console.log("OUTPUT " + outDir + " \u2713 (fallback: 产出/)"); }
                    else console.log("OUTPUT " + outDir + " \u2717 (missing: " + missing.join(", ") + ")");
                } catch(_e5) { console.log("OUTPUT " + outDir + " \u2717 (missing: " + missing.join(", ") + ")"); }
            } else { console.log("OUTPUT " + outDir + " \u2717 (missing: " + missing.join(", ") + ")"); }
        } else console.log("OUTPUT " + outDir + " \u2713 (" + fileNames.length + " files)");
    } else {
        // P1-3: 检查 .ready 文件——有 .ready 说明内容文件已完整写入
        var readyFiles = fs.existsSync(outDirPath) ? fs.readdirSync(outDirPath).filter(function(f) { return f.endsWith(".ready"); }) : [];
        ready = readyFiles.length > 0;
        console.log("OUTPUT " + outDir + " " + (ready ? "\u2713" : "\u2717"));
    }
    if (!ready) allOutputReady = false;
}
if (outputCount > 0) outputReady = allOutputReady;
// H2 修复：收工轮（isRetireRound）误写产出行不阻塞收工判定——monitor 对收工轮只看退场文件（与文档承诺一致）；
// 活跃轮时 isRetireRound 未赋值（undefined）不生效，待命轮保持原有产出检查
if (isRetireRound) outputReady = true;
// 3.5 活跃角色完成状态（F 模式大鱼调度用：逐角色输出签字/产出就位，方便大鱼决定唤醒谁）
if (activeRoles.length > 0) {
    activeRoles.forEach(function(role) {
        var signFile = base + "/我的世界/" + role + "_大鱼对讲/完成_" + String(N).padStart(3, "0") + ".md";
        var signed = fs.existsSync(signFile) && fs.statSync(signFile).size > 20;
        console.log("ROLE " + role + " " + (signed ? "DONE" : "PENDING") + " N=" + N);
    });
}
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
        // H3 修复：大鱼已写具体回复则不覆盖（自动回复仅作兜底，避免覆盖/抢占大鱼的具体回复）
        if (!fs.existsSync(replyPath)) {
            fs.writeFileSync(replyPath + ".tmp", "大鱼收到，继续按公告牌行动", "utf8");
            fs.renameSync(replyPath + ".tmp", replyPath);
        }
            // 处理完改名，下次不重复读
            fs.renameSync(fullDir + "/" + f, fullDir + "/" + f + "_已处理");
        });
    });
}


// 3.5 心跳检测：检查所有角色心跳文件，超时自动唤醒
var HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000; // 2分钟无心跳 → 判定掉线
// 运行形态判定：看 火影-大鱼/_运行形态.mode（scaffold fish 命令写入）
//   = "run" → run拉起（角色干完即退，心跳停是正常态）；否则 → 窗口常驻（心跳停=掉线，自动唤醒）
var F_SCHEDULED = false;
try {
    var modeFlag = worldDir.replace(/我的世界$/, "火影-大鱼") + "/_运行形态.mode";
    F_SCHEDULED = fs.existsSync(modeFlag) && fs.readFileSync(modeFlag, "utf8").trim() === "run";
} catch(e) {}
if (fs.existsSync(worldDir)) {
    fs.readdirSync(worldDir).filter(function(d) { return d.endsWith("_大鱼对讲"); }).forEach(function(dir) {
        // M2 修复：已退场角色跳过心跳检测——退场后心跳停是正常态，不应被唤醒
        // （复核修正：indexOf 用 !== -1——退场文件名是 {角色名}已退场_NNN，不以"已退场_"开头，=== 0 恒 false 等于没修）
        // 注意：不查 已休眠_——休眠是中间态，心跳停=角色真死，monitor 必须靠心跳检测写 _wakeup.md 唤醒它
        try {
            var _dirEntries = fs.readdirSync(worldDir + "/" + dir);
            if (_dirEntries.some(function(f) { return f.indexOf("已退场_") !== -1; })) return;
        } catch(_e7) {}
        var hbFile = worldDir + "/" + dir + "/_heartbeat.txt";
        if (!fs.existsSync(hbFile)) return;
        try {
            var hbTime = parseHeartbeat(fs.readFileSync(hbFile, "utf8"));
            if (isNaN(hbTime)) return;
            var hbAge = Date.now() - hbTime;
            // F 模式下放宽到 10 分钟（角色干完即退后心跳停是正常态），且不自动写唤醒
            var timeoutMs = F_SCHEDULED ? 10 * 60 * 1000 : HEARTBEAT_TIMEOUT_MS;
            if (hbAge > timeoutMs) {
                var roleName = dir.replace("_大鱼对讲", "");
                console.log("DEAD " + roleName + " (heartbeat: " + Math.round(hbAge/1000) + "s stale)");
                if (F_SCHEDULED) {
                    console.log("SKIP " + roleName + " (F-mode: 大鱼调度决定是否唤醒)");
                    return; // F 模式：不写 _wakeup.md，唤醒由大鱼负责
                }
                var wakeFile = worldDir + "/" + dir + "/_wakeup.md";
                // 防竞争：写 _wakeup.md 前重读心跳——角色可能刚好恢复
                try {
                    var hbNow = parseHeartbeat(fs.readFileSync(hbFile, "utf8"));
                    if (!isNaN(hbNow) && Date.now() - hbNow < 30000) {
                        console.log("SKIP " + roleName + " (just recovered)");
                        return; // 角色刚恢复，不写唤醒文件
                    }
                } catch(_e2) {}
                fs.writeFileSync(wakeFile, "auto-wakeup: heartbeat timeout " + Math.round(hbAge/1000) + "s", "utf8");
                console.log("WAKE " + roleName + " -> _wakeup.md");
            }
        } catch(_e) { /* heartbeat corrupt, skip */ }
        // 死锁检测——角色超时写了_deadlock.md -> 读公告牌找搭档 -> 唤醒搭档
                var __dlFile = worldDir + "/" + dir + "/_deadlock.md";
        if (fs.existsSync(__dlFile)) {
          try {
            var __role = dir.replace("_大鱼对讲", "");
            console.log("DEADLOCK " + __role);
            var __bf = base + "/我的世界/公告牌_" + String(N).padStart(3,"0") + ".md";
            if (fs.existsSync(__bf)) {
              var __bc = fs.readFileSync(__bf, "utf8");
              // 找搭档：搜索角色名所在行，提取"搭档：XXX"
              var __lines = __bc.split(/\r?\n/);
              for (var __i = 0; __i < __lines.length; __i++) {
                var __l = __lines[__i];
                if (__l.indexOf(__role) !== -1 && __l.indexOf("搭档") !== -1) {
                  var __m = __l.match(/搭档[\uFF1A\u003A]\s*(\S+?)(?=[，,;；\)）]|\s*$)/); // L12 修复：搭档名在行尾（无尾随分隔符）也能匹配
                  if (__m && __m[1]) {
                    var __partner = __m[1].trim();
                    console.log("DEADLOCK partner=" + __partner);
                    var __pw = worldDir + "/" + __partner + "_大鱼对讲/_wakeup.md";
                    fs.writeFileSync(__pw, "auto-wakeup: partner deadlock", "utf8");
                    console.log("WAKE " + __partner + " (deadlock)");
                  }
                  break;
                }
              }
            }
            fs.unlinkSync(__dlFile);
          } catch(__e6) {}
        }

    });
}
// 4. 快速复检：产出目录 mtime 近期变化 → 每2s复检产出，最多10s
// 不再卡等完整 10-15s 周期——角色很可能正在写最后的内容
if (!outputReady && activeRoles.length > 0) {
    try {
        var _now = Date.now();
        var _recentChange = false;
        var _outBase = base + "/我的世界/产出";
        if (fs.existsSync(_outBase)) {
            var _outDirs = fs.readdirSync(_outBase).filter(function(d) { return fs.statSync(_outBase + "/" + d).isDirectory(); });
            for (var _di = 0; _di < _outDirs.length; _di++) {
                try {
                    var _dmtime = fs.statSync(_outBase + "/" + _outDirs[_di]).mtimeMs;
                    if (_now - _dmtime < 30000) { _recentChange = true; break; }
                } catch(_oe) {}
            }
        }
        if (_recentChange) {
            console.log("RETRY: 产出目录近期有变化，快速复检（最多5次×2s）");
            for (var _retry = 0; _retry < 5 && !outputReady; _retry++) {
                var _wu = Date.now() + 2000;
                while (Date.now() < _wu) {}
                outputRe.lastIndex = 0;
                var _allOk = true, _anyOutput = false;
                while ((outputMatch = outputRe.exec(board)) !== null) {
                    _anyOutput = true;
                    var _fullPath2 = outputMatch[1];
                    var _lastSlash2 = _fullPath2.lastIndexOf("/");
                    var _outDir2, _fileNames2;
                    if (_lastSlash2 !== -1 && _fullPath2.substring(_lastSlash2 + 1).indexOf(".") !== -1) {
                        _outDir2 = _fullPath2.substring(0, _lastSlash2);
                        _fileNames2 = _fullPath2.substring(_lastSlash2 + 1).split(/\s*,\s*/);
                    } else {
                        _outDir2 = _fullPath2.replace(/\/$/, "");
                        _fileNames2 = null;
                    }
                    var _odp = base + "/我的世界/" + _outDir2;
                    if (_fileNames2 && _fileNames2.length > 0) {
                        for (var _fi = 0; _fi < _fileNames2.length; _fi++) {
                            if (!fs.existsSync(_odp + "/" + _fileNames2[_fi].trim() + ".ready")) { _allOk = false; break; }
                        }
                    } else {
                        var _rfs = fs.existsSync(_odp) ? fs.readdirSync(_odp).filter(function(f) { return f.endsWith(".ready"); }) : [];
                        if (_rfs.length === 0) _allOk = false;
                    }
                }
                if (_anyOutput && _allOk) { outputReady = true; console.log("RETRY: 产出就绪（第" + (_retry+1) + "次复检）"); break; }
            }
        }
    } catch(_re) { /* 快速复检异常不影响主流程 */ }
}

// 5. 判断（收工轮额外检查退场文件）
// 产出优先检查 + mtime快速复检已在前面完成
if (outputReady && allRetired) {
    console.log("DONE N=" + N);
    // P1-1: 持久化当前轮次状态
    try { fs.writeFileSync(stateFile, JSON.stringify({ N: N + 1 }), "utf8"); } catch (e) {}
} else {
    console.log("WAIT N=" + N);
}

} catch(e) {
    console.log("CRASH " + e.message);
    process.exit(1);
}