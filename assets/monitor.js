// === 大鱼监控脚本（轮询版）===
// 用法：在项目根目录下 node monitor.js
// 每次运行检查一轮状态后退出，stdout 即时可见
// 大鱼每 60 秒跑一次（大鱼模板规定）：WAIT → 等 → DONE → 项目完成（只验证，不翻篇）
var fs = require("fs");
// 用 __dirname 而不是 process.cwd()——大鱼号架构下大鱼的 CWD 是子目录，我的世界/ 在 monitor.js 同级
var base = __dirname;

// ② 监控日志：monitor 每次运行追加一行到 我的世界/监控日志.md（历史流水，可追溯每周期检测轨迹）
function logMonitor(summary) {
  try {
    var _ts = new Date().toISOString().substring(11, 19);
    fs.appendFileSync(base + "/我的世界/监控日志.md", "[" + _ts + "] " + summary + "\n", "utf8");
  } catch(e) {
    // 12-14：不再静默吞——监控日志写入失败要可见（第三轮实测：约 8 分钟断档被 catch 吞掉，只能靠 _fish_loop.log 补证）
    console.error("MONLOG_WARN: 监控日志写入失败: " + (e && e.message ? e.message : e) + " ——监控日志可能断档，以 _fish_loop.log 为准");
  }
}

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
var outputReadyCount = 0; // 12-24 判定摘要：已就位产出行计数（WAIT 原因输出用）——修复未声明直接引用导致的 CRASH
if (fs.existsSync(stateFile)) {
    try {
        var state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
        if (state.N && Number.isInteger(state.N) && state.N >= 1) N = state.N; // 第四轮修复：校验正整数，防 公告牌_1.5.md 永久 WAIT
    } catch (e) { /* 状态文件损坏，从1开始 */ }
}
// 顶层 try-catch：monitor 自身异常不盲飞
try {
// 自检：从N开始逐轮找第一个未完成的
while (true) {
    var bf = base + "/我的世界/公告牌_" + String(N).padStart(3, "0") + ".md";
    if (!fs.existsSync(bf)) break; // 公告牌不存在 → 当前N就是正确轮次
    // 检查该轮是否已完成（所有活跃角色签字 + 产出就位）
    // 第四轮修复：自检 readFileSync 包 try——读失败视为当前轮未完成（break 交主流程处理，主流程 :117 有 READ_ERR 保护）
    var boardContent;
    try { boardContent = fs.readFileSync(bf, "utf8"); } catch(_sb) { break; }
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
        if (/[\{\}]/.test(fpSelf)) { console.log("OUTPUT-FORMAT ⚠️ 产出路径含占位符（{}）: " + fpSelf + "——公告牌产出行应为具体文件名或尾斜杠目录，占位符永不匹配（12-1 fail-loud）"); }
        var lsSelf = fpSelf.lastIndexOf("/");
        // F-11 修复：格式A/B 判定改按"尾斜杠"（目录形式带 /）而非"含点"——无扩展名产出文件（如 …/任务001/说明）不再误判为目录
        if (lsSelf !== -1 && !fpSelf.endsWith("/")) {
            var odSelf = fpSelf.substring(0, lsSelf);
            var fnsSelf = fpSelf.substring(lsSelf + 1).split(/\s*,\s*/);
            for (var fiSelf = 0; fiSelf < fnsSelf.length; fiSelf++) {
                var fnSelf = fnsSelf[fiSelf].trim();
                var _rpSelf = base + "/我的世界/" + odSelf + "/" + fnSelf + ".ready";
                if (fnSelf && !fs.existsSync(_rpSelf)) { outOkSelf = false; break; }
                // B-5 修复：self-check 处也做 metadata 校验（size:0 空交付提示，收工审计可见）
                if (fnSelf) {
                    try {
                        var _rcSelf = fs.readFileSync(_rpSelf, "utf8");
                        if (/size:\s*0\b/.test(_rcSelf)) console.log("OUTPUT-WARN " + fnSelf + " .ready 显示 size=0——空交付（收工审计将标红）！");
                    } catch(_rmS) {}
                }
            }
        } else {
            var od2Self = fpSelf.replace(/\/$/, "");
            var dp2Self = base + "/我的世界/" + od2Self;
            // F-10 修复：自检格式B readdirSync 包 try（目录并发被删不 CRASH，与主流程 :251 一致）
            var rfsSelf = [];
            try { rfsSelf = fs.existsSync(dp2Self) ? fs.readdirSync(dp2Self).filter(function(f) { return f.endsWith(".ready"); }) : []; } catch(_rds) {}
            // 12-15 大鱼自检：自检格式 B 同步严格判定——产出负责人=各自 时需 .ready ≥ 活跃角色数
            //   （否则自检提前推进 N，主流程严格检查形同虚设——本轮 002 图灵先交、自检 15:25 判完成即此路径）
            var _ownerSelf = boardContent.match(/\n- 产出负责人[:：]\s*(.+)/);
            var _ownerEachSelf = _ownerSelf && _ownerSelf[1].trim() === "各自";
            if (_ownerEachSelf ? rfsSelf.length < actCount : rfsSelf.length === 0) { outOkSelf = false; break; }
        }
    }
    if (hasOutSelf && !outOkSelf) allDone = false; // 有产出行但未就位 → 该轮未完成
    if (hasActive && !hasOutSelf) allDone = false; // 活跃轮漏写产出行 → 视为未完成（与主判断一致，避免自检跳过）
    // P2-10: 收工轮特殊处理——公告牌格式为「角色（状态：退场）」，正则匹配角色行（角色名后紧跟全角括号，无空格）
    if (!hasActive && allDone) {
        var isRetire = /模式[：:]\s*收工/.test(boardContent) || /(?:^|\n)\s*·\s*收工/.test(boardContent); // 第四轮修复：·收工 锚定行首，防任务描述含"· 收工"误判
        if (isRetire) {
            var retireRe = /- (.+?)[（(].*状态[:：]\s*(?:退场|休眠)/g; // 第四轮修复：状态限定——只有含"状态：退场/休眠"的行才是角色行，`- 备注（补充）: xxx` 类字段行不再被当角色；H8 兼容半角括号
            var retireMatch;
            allDone = true;
            while ((retireMatch = retireRe.exec(boardContent)) !== null) {
                var roleName = retireMatch[1].trim().replace(/^组[A-Z]\s*[:：]\s*/, ""); // H8 修复：先剥离组前缀再过滤，与主流程 :127 一致
                // 过滤非角色行（模式、任务、产出等字段）
                // ⚠️ 黑名单过滤——老渣新增非角色字段（如 - 备注: xxx）需在此补上，否则 monitor 永不推进
                if (roleName === "模式" || roleName === "任务" || roleName === "产出" || roleName === "产出负责人" || roleName === "任务目录" || roleName === "辩论轮数" || roleName.indexOf(":") !== -1 || roleName.indexOf("：") !== -1) continue; // H8 修复：黑名单同时匹配全角冒号
                var retireFile = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已退场_" + Npad;
                var sleepFile = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已休眠_" + Npad;
                // 退场文件或休眠文件任一存在即视为已退出（与主逻辑 :123 一致）；4 修复：兼容 .acked 后缀（角色归档退场文件后的形态）
                if (!fs.existsSync(retireFile) && !fs.existsSync(retireFile + ".acked") && !fs.existsSync(sleepFile) && !fs.existsSync(sleepFile + ".acked")) { allDone = false; break; }
            }
        }
    }
    if (!allDone) break; // 这轮没完成 → N停在这
    N++; // 完成了 → 看下一轮
}

var boardFile = base + "/我的世界/公告牌_" + String(N).padStart(3,"0") + ".md";

// ── 8-2 大鱼心跳检测（决策者验证，P0-1）────────────────────────────
//   放在 boardFile 判断之前——扣留期（收工轮被扣、下一张牌不存在）monitor 会在下方提前 WAIT 退出，
//   这段必须在此执行，否则最需要检测的场景反而检测不到（冒烟实测确认）
//   大鱼每回合醒来/轮询动作顺带写 火影-大鱼/_heartbeat.txt（模板已加）
//   判据：心跳 stale 且 无近期产出 → FISH_DEAD；_fish_loop.log 更新 ≠ 大鱼在场（脚本≠决策者，铁律 4）
var _fishSrcDir = base + "/火影-大鱼";
var FISH_HB_FILE = _fishSrcDir + "/_heartbeat.txt";
// 运行形态（自读，不依赖后面的 F_SCHEDULED——本段在 monitor 顶部执行）
var _fishModeRun = false;
try { _fishModeRun = fs.existsSync(_fishSrcDir + "/_运行形态.mode") && fs.readFileSync(_fishSrcDir + "/_运行形态.mode", "utf8").trim() === "run"; } catch(_fmr) {}
var _fishDead = false;
try {
    if (fs.existsSync(FISH_HB_FILE)) {
        var _fishHbTime = parseHeartbeat(fs.readFileSync(FISH_HB_FILE, "utf8"));
        if (!isNaN(_fishHbTime)) {
            var _fishHbAge = Date.now() - _fishHbTime;
            // 阈值：窗口常驻 5 分钟 / run 形态 10 分钟（8-5 修复：窗口常驻原 2 分钟对大鱼太短——大鱼回合内轮询
            //   间隔 55-60s，但两次动作间可能间隔 >2 分钟（读长文档/写报告/思考），2 分钟误判 FISH_DEAD（实测 08-07 误报 5 次）
            //   5 分钟足够区分"正常节奏"与"真掉线"，又不像 run 形态 10 分钟那么迟钝）
            var _fishTimeoutMs = _fishModeRun ? 10 * 60 * 1000 : 5 * 60 * 1000;
            if (_fishHbAge > _fishTimeoutMs) {
                // 复核：大鱼对讲目录近期有新产出 = 写报告/交付中，不算死
                // ⚠️ 排除 monitor 自写的 需人工干预_*（monitor 写的文件不算大鱼产出，否则死循环抑制 FISH_DEAD）
                var _fishRecentOutput = false;
                try {
                    var _fishCut = Date.now() - _fishTimeoutMs;
                    var _fishDirs = [base + "/我的世界/大鱼_老渣对讲"];
                    for (var _fd = 0; _fd < _fishDirs.length; _fd++) {
                        if (!fs.existsSync(_fishDirs[_fd])) continue;
                        var _fEntries = fs.readdirSync(_fishDirs[_fd]);
                        for (var _fe = 0; _fe < _fEntries.length; _fe++) {
                            if (_fEntries[_fe].indexOf("需人工干预_") === 0) continue; // 8-2 修复：排除 monitor 自写干预文件
                            try { if (fs.statSync(_fishDirs[_fd] + "/" + _fEntries[_fe]).mtimeMs > _fishCut) { _fishRecentOutput = true; break; } } catch(_fes) {}
                        }
                        if (_fishRecentOutput) break;
                    }
                } catch(_fsc) {}
                if (!_fishRecentOutput) _fishDead = true;
            }
        }
    }
} catch(_fishE) { /* 大鱼目录缺失/心跳损坏，跳过 */ }
// 收口豁免：上一轮是已完成的收工轮（项目结束，大鱼合法收口心跳停是正常态）
try {
    if (_fishDead) {
        var _prevBf2 = base + "/我的世界/公告牌_" + String(N - 1).padStart(3,"0") + ".md";
        if (fs.existsSync(_prevBf2)) {
            var _prevBc2 = fs.readFileSync(_prevBf2, "utf8");
            if (/模式[：:]\s*收工/.test(_prevBc2)) _fishDead = false; // 上一轮是收工轮 → 项目已收口，不报
        }
    }
} catch(_pe2) {}
if (_fishDead) {
    console.log("FISH_DEAD (heartbeat: " + Math.round(_fishHbAge/1000) + "s stale, no recent output)");
    logMonitor("FISH_DEAD 大鱼心跳 stale");
    try {
        var _fishIv = base + "/我的世界/大鱼_老渣对讲/需人工干预_大鱼.md";
        if (!fs.existsSync(_fishIv)) {
            var _fishIvContent = "# 需人工干预: 大鱼（决策者掉线）\n\n" +
                "- 时间: " + new Date().toISOString() + "\n" +
                "- 现象: 大鱼心跳 stale 且无新产出——大鱼掉线（回合结束/窗口关），扣留收工轮无人补搬，项目可能静默卡死\n" +
                "- 建议动作: 去大鱼窗口输入「进入角色」重启大鱼（启动铁律第 1 条先看牌 → 校验发布 → 补搬收工轮）\n";
            fs.writeFileSync(_fishIv, _fishIvContent, "utf8");
            console.log("INTERVENE 大鱼 -> 大鱼_老渣对讲/需人工干预_大鱼.md");
        }
    } catch(_fiv) {}
}

// ── 8-2 扣留超时报警（STANDBY_OVERDUE，P0-1 状态可区分）──────────
//   场景：待命轮后收工轮被扣留（大鱼目录仍有收工轮未发布）→ 正常 monitor 输出 WAIT N=收工轮编号（预期），
//   但"扣留等追加"与"大鱼掉线无人补搬"不可区分——加 OVERDUE 提示
var _standbyOverdue = false;
try {
    // ① 大鱼目录仍扣着收工轮（存在未发布的收工轮 = 扣留中）
    var _retireKept = fs.readdirSync(_fishSrcDir).some(function(_ff) {
        return /^公告牌_(\d+)\.md$/.test(_ff) && (function() {
            try { return /模式[：:]\s*收工/.test(fs.readFileSync(_fishSrcDir + "/" + _ff, "utf8")); } catch(_rke) { return false; }
        })();
    });
    if (_retireKept) {
        // ② 基线：前一轮完成时刻（最后一个 完成_{N}.md mtime）+ 10 分钟
        var _overdueMs = 10 * 60 * 1000;
        var _baseTs = 0;
        try {
            var _worldDirTop = base + "/我的世界";
            var _prevSigns = fs.readdirSync(_worldDirTop).filter(function(_d) { return _d.endsWith("_大鱼对讲"); });
            for (var _psi = 0; _psi < _prevSigns.length; _psi++) {
                try {
                    var _sDir = _worldDirTop + "/" + _prevSigns[_psi];
                    var _sFiles = fs.readdirSync(_sDir);
                    for (var _sf = 0; _sf < _sFiles.length; _sf++) {
                        var _sM = String(_sFiles[_sf]).match(/^完成_(\d+)\.md$/);
                        if (_sM) {
                            var _sTs = fs.statSync(_sDir + "/" + _sFiles[_sf]).mtimeMs;
                            if (_sTs > _baseTs) _baseTs = _sTs;
                        }
                    }
                } catch(_se) {}
            }
        } catch(_ps) {}
        // ③ 无新动作判定：超时且无追加信号
        var _noNewAction = _baseTs > 0 && (Date.now() - _baseTs > _overdueMs);
        var _appendTask = fs.existsSync(_fishSrcDir + "/追加任务.md");
        if (_noNewAction && !_appendTask) _standbyOverdue = true;
    }
} catch(_soe) {}
// 收口豁免：上一轮是收工轮则不算扣留（_retireKept 已覆盖——收工轮已发布就不在大鱼目录）
// 追加豁免：追加任务.md 存在 = 老渣追加中，不报警（_appendTask 已覆盖）

// P2-10: 公告牌不存在时，回看上一轮是否为已完成的收工轮
if (!fs.existsSync(boardFile)) {
    var prevN = N - 1;
    var prevBoard = base + "/我的世界/公告牌_" + String(prevN).padStart(3,"0") + ".md";
    if (fs.existsSync(prevBoard)) {
        // 复核补充：readFileSync 包 try（与 M-1 同类）——读失败跳过收工回看，走 WAIT（安全）；monitor 重跑幂等
        var prevContent;
        try { prevContent = fs.readFileSync(prevBoard, "utf8"); } catch(_pb) {}
        // 12-17 大鱼自检：回看竞态（WAIT N=4 抖动）——prevBoard 半写/瞬读失败时 prevContent 为空 → 跳过收工回看误报 WAIT；
        //   补一次重读（500ms 缓冲，覆盖补搬瞬间/半写状态），仍失败才走 WAIT（安全，monitor 重跑幂等）
        if (!prevContent) {
            var _reWait = Date.now() + 500;
            while (Date.now() < _reWait) { /* 短缓冲 */ }
            try { prevContent = fs.readFileSync(prevBoard, "utf8"); } catch(_pb2) {}
        }
        if (prevContent && (/模式[：:]\s*收工/.test(prevContent) || /(?:^|\n)\s*·\s*收工/.test(prevContent))) {
            // 上一轮是收工，检查退场文件
            var retireRe = /- (.+?)[（(].*状态[:：]\s*(?:退场|休眠)/g; // 第四轮修复：状态限定——只有含"状态：退场/休眠"的行才是角色行，`- 备注（补充）: xxx` 类字段行不再被当角色；H8 兼容半角括号
            var retireMatch, allRetired = true;
            var _retireTotal = 0, _retireOk = 0; // 12-24 判定摘要：回看收工轮退场计数
            while ((retireMatch = retireRe.exec(prevContent)) !== null) {
                _retireTotal++;
                var roleName = retireMatch[1].trim().replace(/^组[A-Z]\s*[:：]\s*/, ""); // H8 修复：先剥离组前缀再过滤
                // ⚠️ 黑名单过滤——老渣新增非角色字段（如 - 备注: xxx）需在此补上，否则 monitor 永不推进
                if (roleName === "模式" || roleName === "任务" || roleName === "产出" || roleName === "产出负责人" || roleName === "任务目录" || roleName === "辩论轮数" || roleName.indexOf(":") !== -1 || roleName.indexOf("：") !== -1) continue; // H8 修复：黑名单同时匹配全角冒号
                var rf = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已退场_" + String(prevN).padStart(3,"0");
                var sf = base + "/我的世界/" + roleName + "_大鱼对讲/" + roleName + "已休眠_" + String(prevN).padStart(3,"0");
                if (!fs.existsSync(rf) && !fs.existsSync(rf + ".acked") && !fs.existsSync(sf) && !fs.existsSync(sf + ".acked")) { allRetired = false; break; } // 4 修复：兼容 .acked
                _retireOk++;
            }
            if (allRetired) { console.log("DONE N=" + prevN + " (回看确认: 收工轮 全员退场 " + _retireOk + "/" + _retireTotal + ")"); logMonitor("DONE N=" + prevN); process.exit(0); } // 12-24 摘要
        }
    }
    // 8-2 扣留超时报警：扣留期（收工轮被扣、下一张牌不存在）真实输出点——WAIT 前先判 OVERDUE
    if (_standbyOverdue) {
        console.log("STANDBY_OVERDUE N=" + N + "（待命轮基线已过 10 分钟无新动作且收工轮仍扣留——大鱼可能掉线，检查 需人工干预_大鱼.md；若大鱼在场请立即补搬收工轮）");
        logMonitor("STANDBY_OVERDUE N=" + N);
    }
    console.log("WAIT N=" + N); logMonitor("WAIT N=" + N); process.exit(0);
}

var board;
try { board = fs.readFileSync(boardFile, "utf8").replace(/^\uFEFF/, ""); } // P2-6+P0-4: BOM+异常保护
catch (e) { console.log("READ_ERR " + boardFile + ": " + e.message); logMonitor("READ_ERR " + boardFile); process.exit(0); }

// 解析活跃角色——这轮谁在干活
var activeRoles = [];
// 解析所有角色——收工轮检查退场文件用
var allRoles = [];
var headerPart = board.split(/\n- 任务[:：]/)[0];
var re = /- (.+?)[（(].*状态[:：]\s*活跃/g; // P1-2: 同时匹配全角和半角括号
var allRe = /- (.+?)[（(].*状态[:：]\s*(?:退场|休眠)/g; // 第五轮修复：allRoles 状态限定（与自检 retireRe 一致）——`- 备注（补充）: xxx` 等自定义字段行不再被当角色（黑名单只覆盖已知 6 字段，限定正则根治任意字段行）
var m;
var am;
while ((m = re.exec(headerPart)) !== null) { var rn = m[1].replace(/^组[A-Z]\s*[:：]\s*/, ''); activeRoles.push(rn); }
while ((am = allRe.exec(headerPart)) !== null) {
    var arn = am[1].replace(/^组[A-Z]\s*[:：]\s*/, '');
    // 第四轮修复：字段行黑名单——带括号的字段行（如 `- 模式: 收工（全员确认）`）不当角色，防收工轮查不存在的退场文件卡死
    if (arn === "模式" || arn === "任务" || arn === "产出" || arn === "产出负责人" || arn === "任务目录" || arn === "辩论轮数" || arn.indexOf(":") !== -1 || arn.indexOf("：") !== -1) continue;
    allRoles.push(arn);
}

// 1. 签字 & 休眠/退场检查
var outputProgress = []; // 12-24 判定摘要：各产出行就位进度 {ok, need, have}
var missingRetireNames = []; // 12-24 判定摘要：收工轮未退场角色名单
var allRetired = true; // 收工轮用：所有角色是否都写了退场文件（或休眠文件，两者都验）
if (activeRoles.length === 0) {
    // 无活跃角色：可能是收工轮（全员退场），也可能是待命轮（全员待命、无产出）
    var isRetireRound = /模式[：:]\s*收工/.test(board) || /(?:^|\n)\s*·\s*收工/.test(board); // 第四轮修复：·收工 锚定行首
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
            // 4 修复：兼容 .acked 后缀（角色归档退场文件后的形态）
            var retireAcked = retireFile + ".acked", sleepAcked = sleepFile + ".acked";
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
        if (fs.existsSync(retireFile) || fs.existsSync(retireAcked) || fs.existsSync(sleepFile) || fs.existsSync(sleepAcked) || hbForce) {
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
        else { console.log("RETIRE " + role + " MISS"); allRetired = false; missingRetireNames.push(role); } // 12-24 判定摘要：未退场角色收集
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
    if (/[\{\}]/.test(fullPath)) { console.log("OUTPUT-FORMAT ⚠️ 产出路径含占位符（{}）: " + fullPath + "——公告牌产出行应为具体文件名或尾斜杠目录，占位符永不匹配（12-1 fail-loud）"); }
    var lastSlash = fullPath.lastIndexOf("/");
    var outDir, fileNames;
    if (lastSlash !== -1 && !fullPath.endsWith("/")) { // F-11 修复：格式A/B 判定改按尾斜杠（目录形式带 /）而非含点
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
        // B-5 修复：.ready 存在时读 metadata 校验——size:0（空交付）或缺失 size 行（无 metadata 旧版/代码类）输出提示，供收工审计参考
        if (ready && fileNames) {
            fileNames.forEach(function(fn) {
                try {
                    var _rfp = outDirPath + "/" + fn.trim() + ".ready";
                    var _rc = fs.readFileSync(_rfp, "utf8");
                    if (/size:\s*0\b/.test(_rc)) console.log("OUTPUT-WARN " + fn.trim() + " .ready 显示 size=0——空交付（收工审计将标红）！");
                    else if (!/size:/.test(_rc) && !/source:/.test(_rc)) console.log("OUTPUT-WARN " + fn.trim() + " .ready 无 metadata（旧版或非标准交付，收工审计将标红）");
                } catch(_rm) {}
            });
        }
        if (!ready) {            // fallback: 老渣可能把产出路径错写成源文件目录（如 soulforge/）
            // 实际 .ready 在 产出/ 子目录下——扫描兜底
            var outBase = base + "/我的世界/产出";
            if (fs.existsSync(outBase)) {
                try {
                    var outDirs = fs.readdirSync(outBase).filter(function(d2) {
                        // H4 修复：fallback 只扫描当前轮次的任务目录，避免跨轮同名 .ready 误命中导致本轮提前 DONE
                        // F-12 修复：前缀加边界（任务001 不命中 任务0010 四位目录）——目录名 == 任务NNN 或以 任务NNN_ 开头
                        var taskPrefix = "任务" + String(N).padStart(3, "0");
                        return fs.statSync(outBase + "/" + d2).isDirectory() && (d2 === taskPrefix || d2.indexOf(taskPrefix + "_") === 0);
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
        outputProgress.push({ ok: ready, need: fileNames.length, have: ready ? fileNames.length : 0 }); // 12-24 摘要
    } else {
        // P1-3: 检查 .ready 文件——有 .ready 说明内容文件已完整写入
        // 第四轮修复：readdirSync 包 try（目录并发被删时不 CRASH）
        // 12-15 大鱼自检：格式 B 判定过早——'产出负责人: 各自'（多角色共产出）时任一 .ready 就判完成，
        //   会早于"语义完成"（本轮 002：图灵先交付 monitor 15:25 判完成，乔布斯/纳特 15:26 才交）。
        //   修复：产出负责人=各自 → 需 .ready 数量 ≥ 活跃角色数；否则（单人产出）保持"任一即完成"。
        var readyFiles = [];
        try { readyFiles = fs.existsSync(outDirPath) ? fs.readdirSync(outDirPath).filter(function(f) { return f.endsWith(".ready"); }) : []; } catch(_rd) {}
        var _ownerMatch = board.match(/\n- 产出负责人[:：]\s*(.+)/);
        var _ownerEach = _ownerMatch && _ownerMatch[1].trim() === "各自";
        ready = _ownerEach ? readyFiles.length >= activeRoles.length : readyFiles.length > 0;
        console.log("OUTPUT " + outDir + " " + (ready ? "\u2713" : "\u2717") + (_ownerEach ? " (" + readyFiles.length + "/" + activeRoles.length + " .ready)" : ""));
        outputProgress.push({ ok: ready, need: _ownerEach ? activeRoles.length : 1, have: _ownerEach ? readyFiles.length : (ready ? 1 : 0) }); // 12-24 摘要
    }
    if (!ready) allOutputReady = false;
    else outputReadyCount++; // 12-24 判定摘要：已就位产出行计数（WAIT 原因输出用）
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
            // 第四轮修复：包 try——writeFileSync/renameSync 并发失败不 CRASH（Windows rename 目标已存在抛 EPERM）
            try {
                fs.writeFileSync(replyPath + ".tmp", "大鱼收到，继续按公告牌行动", "utf8");
                fs.renameSync(replyPath + ".tmp", replyPath);
            } catch(_hr) {}
        }
            // 处理完改名，下次不重复读（第四轮修复：并发双跑 renameSync ENOENT 不 CRASH）
            try { fs.renameSync(fullDir + "/" + f, fullDir + "/" + f + "_已处理"); } catch(_hr2) {}
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
            // A-1 修复（实弹测试：贾维斯 bash sleep 等文件时心跳断 → 误判 DEAD 5+ 次）：
            // DEAD 判定前检查「心跳超时窗口内是否有新产出/对话文件」——角色在干活（写文件）而心跳没更新 = 活着，不算 DEAD。
            // 心跳不能单独作为死亡证据（大鱼审计建议："DEAD 应结合该窗口内无新产出文件判定"）。
            if (hbAge > timeoutMs) {
                var roleName = dir.replace("_大鱼对讲", "");
                var hasRecentOutput = false;
                try {
                    // 扫 我的世界/产出 与 我的世界/任务* 下最近 timeoutMs 内修改的文件
                    var _scanDirs = [worldDir + "/产出"];
                    try {
                        var _taskDirs = fs.readdirSync(worldDir).filter(function(td) { return /^任务\d+/.test(td); });
                        _taskDirs.forEach(function(td) { _scanDirs.push(worldDir + "/" + td); });
                    } catch(_ts) {}
                    // 12-29 优化：扫描目录 mtime 门控——无变化时跳过 _scanRecent 深扫（monitor 60s 常驻开销大头：
                    //   产出/任务目录一旦静止，递归 readdirSync 每次全跑白耗）。门控 key 存 .monitor_state.json。
                    var _skipDeepScan = false;
                    try {
                        var _scanMtimes = [];
                        _scanDirs.forEach(function(d) { try { _scanMtimes.push(Math.round(fs.statSync(d).mtimeMs)); } catch(_e) {} });
                        var _mtimeKey = "scan|" + _scanMtimes.join(",");
                        var _stScan = {};
                        try { if (fs.existsSync(stateFile)) _stScan = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch(_sr3) {}
                        if (_stScan.lastScanKey === _mtimeKey) { _skipDeepScan = true; }
                        else { _stScan.lastScanKey = _mtimeKey; try { fs.writeFileSync(stateFile, JSON.stringify(_stScan), "utf8"); } catch(_w3) {} }
                    } catch(_sc2) {}
                    var _cutoff = Date.now() - timeoutMs;
                    function _scanRecent(dir) {
                        var entries;
                        try { entries = fs.readdirSync(dir); } catch(e) { return; }
                        for (var i = 0; i < entries.length; i++) {
                            var full = dir + "/" + entries[i];
                            try {
                                var st = fs.statSync(full);
                                if (st.isDirectory()) { _scanRecent(full); }
                                else if (st.mtimeMs > _cutoff) { hasRecentOutput = true; return; }
                            } catch(e) {}
                        }
                    }
                    if (!_skipDeepScan) _scanDirs.forEach(function(d) { if (fs.existsSync(d)) _scanRecent(d); });
                } catch(_sc) {}
                if (hasRecentOutput) {
                    // 角色在写文件（干活中），心跳只是没同步——视为活着，不 DEAD 不唤醒
                    console.log("SKIP " + roleName + " (心跳超时但窗口内有新产出文件——干活中)");
                    return;
                }
                console.log("DEAD " + roleName + " (heartbeat: " + Math.round(hbAge/1000) + "s stale, no recent output)");
                if (F_SCHEDULED) {
                    console.log("SKIP " + roleName + " (F-mode: 大鱼调度决定是否唤醒)");
                    return; // F 模式：不写 _wakeup.md，唤醒由大鱼负责
                }
                var wakeFile = worldDir + "/" + dir + "/_wakeup.md";
                // ③ 挂死识别：上一轮已写过唤醒信号但角色未 ack（没改名 _acked）+ 仍无产出 → 挂死，需人工干预
                //    （挂起 bash 感知不到 _wakeup.md，唤醒无效——升级为 STUCK + 写老渣干预信号）
                if (fs.existsSync(wakeFile)) {
                    console.log("STUCK " + roleName + " (心跳stale + 唤醒未确认 + 无产出——挂死，需人工干预)");
                    logMonitor("STUCK " + roleName);
                    try {
                        var _ivFile = base + "/我的世界/大鱼_老渣对讲/需人工干预_" + roleName + ".md";
                        if (!fs.existsSync(_ivFile)) {
                            var _ivContent = "# 需人工干预: " + roleName + "\n\n" +
                                "- 时间: " + new Date().toISOString() + "\n" +
                                "- 现象: 心跳 stale + 唤醒信号未确认 + 无新产出（挂死，疑似 bash 长等 / heredoc 挂起 / 回合异常）\n" +
                                "- 建议动作: 去该角色窗口按 Ctrl+C 中断挂起命令；或重启 reasonix code（进入角色目录跑 reasonix code，输入「进入角色」）\n";
                            fs.writeFileSync(_ivFile, _ivContent, "utf8");
                            console.log("INTERVENE " + roleName + " -> 大鱼_老渣对讲/需人工干预_" + roleName + ".md");
                        }
                    } catch(_iv) {}
                    return; // 不重复写唤醒（上一轮已写，无效）
                }
                // 防竞争：写 _wakeup.md 前重读心跳——角色可能刚好恢复
                try {
                    var hbNow = parseHeartbeat(fs.readFileSync(hbFile, "utf8"));
                    if (!isNaN(hbNow) && Date.now() - hbNow < 30000) {
                        console.log("SKIP " + roleName + " (just recovered)");
                        return; // 角色刚恢复，不写唤醒文件
                    }
                } catch(_e2) {}
                // 第四轮修复：写唤醒文件包 try——写失败不 CRASH（下一轮 monitor 会重试）
                try {
                    fs.writeFileSync(wakeFile, "auto-wakeup: heartbeat timeout " + Math.round(hbAge/1000) + "s", "utf8");
                    console.log("WAKE " + roleName + " -> _wakeup.md");
                } catch(_wf) { console.log("WARN 写唤醒文件失败: " + _wf.message); }
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
                  var __m = __l.match(/搭档[\uFF1A\u003A]\s*(\S+?)(?=[，,;；\)）。！？]|\s*$)/); // L12 修复：搭档名在行尾/句号结尾也能匹配；第四轮修复：补句号终止符
                  if (__m && __m[1]) {
                    var __partner = __m[1].trim();
                    console.log("DEADLOCK partner=" + __partner);
                    var __pw = worldDir + "/" + __partner + "_大鱼对讲/_wakeup.md";
                    // 第四轮修复：写唤醒前重读搭档心跳——刚恢复则跳过（与主唤醒路径 :318 一致）
                    var __partnerAlive = false;
                    try {
                        var __phb = parseHeartbeat(fs.readFileSync(worldDir + "/" + __partner + "_大鱼对讲/_heartbeat.txt", "utf8"));
                        if (!isNaN(__phb) && Date.now() - __phb < 30000) __partnerAlive = true;
                    } catch(_ph) {}
                    if (__partnerAlive) {
                        console.log("SKIP " + __partner + " (just recovered, deadlock)");
                    } else {
                        try { fs.writeFileSync(__pw, "auto-wakeup: partner deadlock", "utf8"); console.log("WAKE " + __partner + " (deadlock)"); } catch(_pw2) {}
                    }
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
                // F-17 修复：忙等 → Atomics.wait（与 _poll/_lock 统一），降级 100ms 切片兜底
                try {
                    var _sab = new SharedArrayBuffer(4);
                    var _v = new Int32Array(_sab);
                    Atomics.wait(_v, 0, 0, 2000);
                } catch(_at) {
                    var _wu = Date.now() + 2000;
                    while (Date.now() < _wu) {
                        var _rem = _wu - Date.now();
                        if (_rem > 100) { var _w3 = Date.now() + 100; while (Date.now() < _w3) {} }
                    }
                }
                outputRe.lastIndex = 0;
                var _allOk = true, _anyOutput = false;
                while ((outputMatch = outputRe.exec(board)) !== null) {
                    _anyOutput = true;
                    var _fullPath2 = outputMatch[1];
                    var _lastSlash2 = _fullPath2.lastIndexOf("/");
                    var _outDir2, _fileNames2;
                    if (_lastSlash2 !== -1 && !_fullPath2.endsWith("/")) { // F-11 修复：复检同样按尾斜杠判定格式A/B
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
                        // 12-15 大鱼自检：快速复检格式 B 同步数量校验（产出负责人=各自 → 需 .ready ≥ 活跃角色数）
                        var _rfs = fs.existsSync(_odp) ? fs.readdirSync(_odp).filter(function(f) { return f.endsWith(".ready"); }) : [];
                        var _ownerR = board.match(/\n- 产出负责人[:：]\s*(.+)/);
                        var _ownerEachR = _ownerR && _ownerR[1].trim() === "各自";
                        if (_ownerEachR ? _rfs.length < activeRoles.length : _rfs.length === 0) _allOk = false;
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
    // 12-24 判定摘要：DONE 带完成原因（大鱼不用读源码就懂）
    var _doneWhy = isRetireRound ? ("全员退场 " + allRoles.length + "/" + allRoles.length) : ("产出就位 " + outputReadyCount + "/" + outputCount);
    console.log("DONE N=" + N + " (" + _doneWhy + ")"); logMonitor("DONE N=" + N);
    // P1-1: 持久化当前轮次状态
    // 8-3: DONE 时清除 waitSince（轮次完成，卡轮计时归零——否则下轮沿用旧时间戳误报）
    try { fs.writeFileSync(stateFile, JSON.stringify({ N: N + 1, waitSinceN: undefined, waitSince: undefined }), "utf8"); } catch (e) {}
} else {
    // 12-24 判定摘要：WAIT 带等待原因（大鱼 002 自检最卡②——"WAIT N=3 得读源码才懂"）
    var _why = [];
    if (!outputReady && outputProgress.length > 0) {
        var _totNeed = 0, _totHave = 0;
        outputProgress.forEach(function(_p) { _totNeed += _p.need; _totHave += _p.have; });
        _why.push("产出 " + _totHave + "/" + _totNeed + " .ready 未就位");
    }
    if (isRetireRound && !allRetired) _why.push("收工轮 退场 " + (allRoles.length - missingRetireNames.length) + "/" + allRoles.length + " 缺 " + (missingRetireNames.join(",") || "?"));
    // 8-3 产出卡轮熔断（WAIT_OVERDUE，P0 窗口常驻版）：当前轮产出不齐持续 WAIT 超 30 分钟 → 机器自动报警
    //   角色心跳正常但在干活+产出路径错/deliver 参数错 → .ready 永不齐 → 无限 WAIT 无升级（run 形态已有熔断，窗口常驻补上）
    //   只报警不干预（写 需人工干预 提示大鱼核查产出路径/deliver 参数），与干预阶梯（大鱼肉眼）互补
    var _waitOverdue = false;
    try {
        var _st2 = {};
        try { if (fs.existsSync(stateFile)) _st2 = JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch(_sr2) {}
        var _WAIT_OVERDUE_MS = 30 * 60 * 1000;
        if (_st2.waitSinceN !== N || !_st2.waitSince) {
            // 首次进入当前轮 WAIT → 记录起始时间
            _st2.waitSinceN = N; _st2.waitSince = Date.now();
            try { fs.writeFileSync(stateFile, JSON.stringify(_st2), "utf8"); } catch(_w2) {}
        } else if (Date.now() - _st2.waitSince > _WAIT_OVERDUE_MS) {
            _waitOverdue = true;
        }
    } catch(_woe) {}
    console.log("WAIT N=" + N + (_why.length ? " (" + _why.join("; ") + ")" : "")); logMonitor("WAIT N=" + N);
    if (_waitOverdue) {
        console.log("WAIT_OVERDUE N=" + N + "（当前轮 WAIT 超 30 分钟——产出卡轮：核查角色产出路径是否与公告牌一字不差 / deliver 参数 / 搭档是否完成前置；已写 需人工干预 提示大鱼）");
        logMonitor("WAIT_OVERDUE N=" + N);
        try {
            var _woIv = base + "/我的世界/大鱼_老渣对讲/需人工干预_产出卡轮_" + String(N).padStart(3,"0") + ".md";
            if (!fs.existsSync(_woIv)) {
                var _woContent = "# 需人工干预: 第" + String(N).padStart(3,"0") + "轮产出卡轮\n\n" +
                    "- 时间: " + new Date().toISOString() + "\n" +
                    "- 现象: 当前轮 WAIT 超 30 分钟（产出 " + (_why.length ? _why.join("; ") : "未就位") + "）——角色可能在干活但产出路径错/deliver 参数错\n" +
                    "- 建议动作: ①读公告牌产出行核对路径 ②查角色对讲目录/操作日志看其交付动作 ③确认前置依赖是否就位 ④必要时 _wakeup.js 提示角色核查产出路径\n";
                fs.writeFileSync(_woIv, _woContent, "utf8");
                console.log("INTERVENE 产出卡轮 -> 大鱼_老渣对讲/需人工干预_产出卡轮_" + String(N).padStart(3,"0") + ".md");
            }
        } catch(_woe2) {}
    }
}

} catch(e) {
    console.log("CRASH " + e.message);
    process.exit(1);
}