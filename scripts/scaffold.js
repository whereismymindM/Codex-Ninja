// scaffold.js —— 多Agent协作项目脚手架
// 用法：
//   node scaffold.js <项目目录> fish [window|run]        → 只重建大鱼+monitor（window=窗口常驻模板，run=run拉起模板，默认window）
//   node scaffold.js <项目目录> <roles.json>             → init（默认，全新项目）
//   node scaffold.js <项目目录> <roles.json> add         → add（追加角色）
var fs = require("fs");
var path = require("path");

var projectDir = process.argv[2];

// L15 修复：缺少项目目录参数时直接报错，避免相对 CWD 污染
if (!projectDir) {
    console.error("ERROR: 缺少项目目录参数（第一个参数）——用法: node scaffold.js <项目目录> <roles.json> [add]  或  node scaffold.js <项目目录> fish [window|run]");
    process.exit(1);
}

// 防呆：projectDir 不能以 "world" 结尾——角色会被生成到world里面而不是同级
// 正确：projectDir 是 world/ 的上级目录（如 一号舱室-软件开发部）
if (projectDir.replace(/\\/g, "/").replace(/\/$/, "").endsWith("/world")) {
    console.error("ERROR: projectDir 不能是world目录！角色会生成到world里面。");
    console.error("请用world的上级目录（如 一号舱室-软件开发部）作为 projectDir。");
    process.exit(1);
}

var assetDir = path.resolve(__dirname, "..", "assets");

// 解析运行模式：第二个参数是 "fish" 则直接走鱼模式，否则第三个参数是 roles.json
// F-14 修复：isFishMode 需同时满足 第4参为 window/run 或不存在，且当前目录无名为 fish 的文件——
// 若用户 roles 文件恰好叫 fish（无论带不带第4参），按 roles 文件处理而非误入 fish 模式（文件存在优先）
var isFishMode = process.argv[3] === "fish" && (!fs.existsSync(process.argv[3]) || (fs.statSync(process.argv[3]).isDirectory && fs.statSync(process.argv[3]).isDirectory())) && (process.argv[4] === undefined || process.argv[4] === "window" || process.argv[4] === "run"); // 2026-08-19: F-14 误伤修复——existsSync 对目录也返回 true（fish 目录已存在时 fish window 被误判为 roles 分支）；改"fish 是目录也允许 fish 模式"，仅"roles 文件恰好叫 fish"（文件）才走 roles 分支
var mode, rolesFile, isAddMode, fishShape;
if (isFishMode) {
    mode = "fish";
    rolesFile = null;
    isAddMode = false;
    // 形态：window（窗口常驻，默认）| run（run拉起）
    fishShape = (process.argv[4] || "window").toLowerCase();
    if (fishShape !== "window" && fishShape !== "run") {
        console.error("ERROR: fish 形态必须是 window 或 run，当前: " + fishShape);
        process.exit(1);
    }
    console.log("MODE: fish (" + fishShape + " 形态)");
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

// L15 修复：校验角色 name 字段（非空、去首尾空白），防止生成异常目录
roles.forEach(function(r) {
    if (!r || typeof r.name !== "string" || r.name.trim().length === 0) {
        console.error("ERROR: roles.json 中每个角色必须有非空 name 字段（当前项: " + JSON.stringify(r) + "）");
        process.exit(1);
    }
    r.name = r.name.trim();
    // M-4 修复：角色名禁止路径分隔符/相对路径/纯点号——防 mkdir/写文件逃出项目目录（如 name: "../fish"）或写入项目根（name: "."）
    if (/[\\/]|\.\.|^\.+$/.test(r.name)) {
        console.error("ERROR: roles.json 角色名不能包含路径分隔符（/ \\）、'..' 或纯点号（当前: " + r.name + "）");
        process.exit(1);
    }
});

} // !isFishMode

// 读模板
var roleTpl = fs.readFileSync(assetDir + "/role-templates/role_AGENTS_template.md", "utf8").replace(/^\uFEFF/, "");
// 大鱼模板按形态选：window（窗口常驻，默认）| run（run拉起）
var fishTplFile = (isFishMode && fishShape === "run") ? "bigfish_AGENTS_template_run.md" : "bigfish_AGENTS_template_window.md";
var fishTpl = fs.readFileSync(assetDir + "/role-templates/" + fishTplFile, "utf8").replace(/^\uFEFF/, "");

// 鱼模式：只重建大鱼AGENTS.md（纯模板，不注入灵魂——大鱼不需要人格）和monitor.js
if (isFishMode) {
    console.log("MODE: fish —— 重建大鱼+monitor（纯模板，无灵魂）");

    // 大鱼 AGENTS.md —— 纯模板，替换路径变量
    var fishDir = projectDir + "/fish";
    fs.mkdirSync(fishDir, { recursive: true });
    // H10 修复：大鱼目录也生成 reasonix.toml（bash_timeout=0 + sandbox=项目根）——与角色一致，
    // 避免大鱼会话回退到上级/全局配置（无 bash_timeout、workspace_root 指向错误目录 → write_file 被沙箱拦截 → bash 绕行）
    var fishRxCfgPath = fishDir + "/reasonix.toml";
    if (!fs.existsSync(fishRxCfgPath)) {
        var fishRootAbs = path.resolve(projectDir).replace(/\\/g, "/") + "/world";   // 收紧沙箱：write_file 只写 world（read_file 读公告牌/角色目录不受限）
        var fishDirAbs = path.resolve(projectDir).replace(/\\/g, "/") + "/fish";   // 8-5 修复：大鱼自己的目录也追加可写（心跳 _heartbeat.txt/日志——缺这个大鱼 write_file 写不了自己目录被迫 bash 绕行）
        fs.writeFileSync(fishRxCfgPath,
            "[tools]\n" +
            "bash_timeout_seconds = 0   # 大鱼回合内可持续调度/轮询（monitor 周期验证 + 调度循环）\n" +
            "\n" +
            "[sandbox]\n" +
            "workspace_root = \"" + fishRootAbs + "\"   # write_file 沙箱根=项目根，大鱼可直接写 world/，免 bash 绕行\n" +
            "allow_write = [\"" + fishDirAbs + "\"]   # 追加可写：大鱼自己的目录（心跳/日志，8-5 修复）\n",
            "utf8");
        console.log("OK: fish/reasonix.toml (bash_timeout=0 + sandbox)");
    }
    var fishContent = fishTpl;
    fs.writeFileSync(fishDir + "/AGENTS.md", fishContent, "utf8");
    console.log("OK: fish/AGENTS.md (" + fs.statSync(fishDir + "/AGENTS.md").size + " bytes)");

    // 形态标志文件：monitor 靠它区分窗口常驻/run拉起的心跳处理（run拉起=角色干完即退，心跳停是正常态）
    var modeFlag = fishDir + "/_run_shape.mode";
    fs.writeFileSync(modeFlag, fishShape, "utf8");
    console.log("OK: 运行形态标志 " + fishShape);

    // 大鱼→老渣对讲目录，收工时写审计报告用
    fs.mkdirSync(projectDir + "/world/fish_laozha_talk", { recursive: true });
    console.log("OK: world/fish_laozha_talk/");

    // monitor.js
    var monitorPath = projectDir + "/monitor.js";
    fs.copyFileSync(assetDir + "/monitor.js", monitorPath);
    console.log("OK: monitor.js (" + fs.statSync(monitorPath).size + " bytes)");

    // _wakeup.js —— 大鱼唤醒低功耗角色的工具
    var wakeupPath = fishDir + "/_wakeup.js";
    fs.copyFileSync(assetDir + "/_wakeup.js", wakeupPath);
    console.log("OK: _wakeup.js (" + fs.statSync(wakeupPath).size + " bytes)");

    // 8-1 大鱼自评阻断③修正：大鱼也要能交付专属任务产物给老渣——fish 也发 _deliver.js/_sign.js（老渣对讲任务交付用，不走公告牌 monitor）
    var fishDeliverPath = fishDir + "/_deliver.js";
    fs.copyFileSync(assetDir + "/_deliver.js", fishDeliverPath);
    console.log("OK: fish/_deliver.js (" + fs.statSync(fishDeliverPath).size + " bytes)");
    var fishSignContent = fs.readFileSync(assetDir + "/_sign.js", "utf8").replace(/\{\{ROLE_NAME\}\}/g, function() { return "fish_laozha"; }); // 2026-08-20 P0 修复：原焊死 "fish" → 签字写 world/fish_talk/，但 monitor 只认 fish_laozha_talk/（大鱼全程疑惑整理反馈）——改 fish_laozha 后签字落对讲目录，无需手动补拷
    fs.writeFileSync(fishDir + "/_sign.js", fishSignContent, "utf8");
    console.log("OK: fish/_sign.js (" + fs.statSync(fishDir + "/_sign.js").size + " bytes)");

    // 7-1 修复：_fish_loop.js —— 大鱼周期验证循环（公告牌检测 30s + monitor 60s），
    // 第七轮实测发现缺失（大鱼只能自补临时版）——必须随 scaffold 部署
    var fishLoopPath = fishDir + "/_fish_loop.js";
    fs.copyFileSync(assetDir + "/_fish_loop.js", fishLoopPath);
    console.log("OK: _fish_loop.js (" + fs.statSync(fishLoopPath).size + " bytes)");
    // 13-y 纠正（12-10 方向错误）：_reasonix_poll.js 不再复制给大鱼——大鱼工具复盘 A 段明确"角色侧工具，大鱼不 poll 公告牌"；
    //   大鱼保持在场 = bash while + 持续工具调用（回合保持铁律已改），无需 _reasonix_poll.js（该文件仅角色目录需要，:252 保留）

    // _env_bug_list.md —— 大鱼模板引用 ./_env_bug_list.md，必须复制到位
    var bugListPath = fishDir + "/_env_bug_list.md";
    fs.copyFileSync(assetDir + "/_env_bug_list.md", bugListPath);
    console.log("OK: _env_bug_list.md (" + fs.statSync(bugListPath).size + " bytes)");

    // 8-4 修复：bigfish_board_manual.md —— 大鱼模板「公告牌校验+发布」节引用它（发布前必读），必须复制到位
    var fishManualPath = fishDir + "/bigfish_board_manual.md";
    fs.copyFileSync(assetDir + "/role-templates/bigfish_board_manual.md", fishManualPath);
    console.log("OK: fish/bigfish_board_manual.md (" + fs.statSync(fishManualPath).size + " bytes)");

    // 8-5 修复：_bigfish_lessons.md —— 大鱼模板「实测教训」节引用它（运行时沉淀），必须复制到位
    var fishLessonPath = fishDir + "/_bigfish_lessons.md";
    fs.copyFileSync(assetDir + "/role-templates/_bigfish_lessons.md", fishLessonPath);
    console.log("OK: fish/_bigfish_lessons.md (" + fs.statSync(fishLessonPath).size + " bytes)");

    // bigfish_tool_manual.md —— 大鱼模板「周期验证」节引用它（monitor 24 种输出全解，免翻源码），必须复制到位
    var fishToolManualPath = fishDir + "/bigfish_tool_manual.md";
    fs.copyFileSync(assetDir + "/role-templates/bigfish_tool_manual.md", fishToolManualPath);
    console.log("OK: fish/bigfish_tool_manual.md (" + fs.statSync(fishToolManualPath).size + " bytes)");

    // 2026-08-20 修复：fish 模式也部署团队须知——原代码 fish 分支在部署逻辑（下方 !isAddMode）之前 exit，fish 模式重建的项目永远没有 team_notes.md（角色第 0 步读 ../team_notes.md 落空，实测两批角色都踩）
    var teamNotice = path.resolve(assetDir, "..", "team-notes/team_notes.md");
    if (!fs.existsSync(projectDir + "/team_notes.md")) {
        fs.copyFileSync(teamNotice, projectDir + "/team_notes.md");
        console.log("OK: team-notes/team_notes.md → " + projectDir);
    } else {
        console.log("SKIP: team-notes/team_notes.md → " + projectDir + "（已存在，不覆盖）");
    }

    console.log("DONE: " + projectDir);
    process.exit(0);
}

// 创建基础目录（add 模式跳过——这些目录已存在）
if (!isAddMode) {
    fs.mkdirSync(projectDir + "/world", { recursive: true });
    // 部署团队须知到项目根目录（projectDir，角色窗口的父级），所有角色窗口共享
    var teamNotice = path.resolve(assetDir, "..", "team-notes/team_notes.md");
    // M6 修复：项目根 team_notes.md 已存在则不覆盖（与 monitor.js 的"已存在不覆盖"策略一致）——
    // 避免 init 静默覆盖用户自写/旧版文件
    if (!fs.existsSync(projectDir + "/team_notes.md")) {
        fs.copyFileSync(teamNotice, projectDir + "/team_notes.md");
        console.log("OK: team-notes/team_notes.md → " + projectDir);
    } else {
        console.log("SKIP: team-notes/team_notes.md → " + projectDir + "（已存在，不覆盖）");
    }

    fs.mkdirSync(projectDir + "/world/output", { recursive: true });
    fs.mkdirSync(projectDir + "/world/fish_laozha_talk", { recursive: true });
    // B-8 修复：工具源码只读快照——复制 monitor/scaffold/工具脚本到 world/skill文档/工具源码/，
    // 角色可读（ship path 有地形可查），不可写（信息边界意图保留）；版本戳防快照漂移（对话 T13 提案）
    var srcSnap = projectDir + "/world/skill文档/工具源码";
    fs.mkdirSync(srcSnap, { recursive: true });
    var snapFiles = [
        [projectDir + "/monitor.js", "monitor.js"],
        [__dirname + "/scaffold.js", "scaffold.js"],
        [assetDir + "/_reasonix_poll.js", "_reasonix_poll.js"],
        [assetDir + "/_deliver.js", "_deliver.js"],
        [assetDir + "/_sign.js", "_sign.js"],
        [assetDir + "/_lock.js", "_lock.js"],
        [assetDir + "/_wakeup.js", "_wakeup.js"],
        [assetDir + "/_fish_loop.js", "_fish_loop.js"],
        [assetDir + "/wait_file.js", "wait_file.js"],
        [__dirname + "/compose.js", "compose.js"]
    ];
    snapFiles.forEach(function(pair) {
        try {
            if (fs.existsSync(pair[0])) fs.copyFileSync(pair[0], srcSnap + "/" + pair[1]);
        } catch(_sn) {}
    });
    // 外部审核修复（2026-08-12）：_Multi-pass_solo.md（单人输出终审格式参考）分发到 world/skill文档/——
    //   角色玩法文件 _solo_output_mode.md 引用它（../world/skill文档/_Multi-pass_solo.md），不分发 = 悬空引用；已存在不覆盖（与 scaffold 风格一致）
    try {
        var _mpsDestInit = projectDir + "/world/skill文档/_Multi-pass_solo.md";
        if (!fs.existsSync(_mpsDestInit)) fs.copyFileSync(assetDir + "/operator-docs/_Multi-pass_solo.md", _mpsDestInit);
    } catch(_mps) {}
    fs.writeFileSync(srcSnap + "/版本戳.txt", "快照时间: " + new Date().toISOString() + "\n来源: codex-ninja scaffold init（B-8 只读快照，角色可读不可写；更新=重跑 scaffold）\n", "utf8");
    console.log("OK: world/skill文档/工具源码/ (B-8 只读快照 + 版本戳)");
} else {
    // add 模式：不重建基础目录，但补全 _Multi-pass_solo.md 分发——新增角色引用它，老项目（旧版 scaffold 建的）可能没有，
    //   不补 = 新角色 _solo_output_mode.md 的引用悬空（外部审核修复 2026-08-12）
    try {
        var _mpsDestAdd = projectDir + "/world/skill文档/_Multi-pass_solo.md";
        if (!fs.existsSync(_mpsDestAdd)) {
            fs.mkdirSync(projectDir + "/world/skill文档", { recursive: true });
            fs.copyFileSync(assetDir + "/operator-docs/_Multi-pass_solo.md", _mpsDestAdd);
            console.log("OK: world/skill文档/_Multi-pass_solo.md (add 补全分发)");
        }
    } catch(_mpsA) {}
    console.log("SKIP: world/ (add 模式不重建)");
}

// 处理每个角色
roles.forEach(function(r) {
    var rd = projectDir + "/" + r.name;
    // M5 修复：角色目录已存在 → 警告跳过，不覆盖已有角色的 AGENTS.md/工具脚本/玩法文件。
    // add 的用途是补新角色；重复跑/撞名时保留现有文件，避免静默覆盖丢失定制（重置角色请先移除该角色目录）
    if (fs.existsSync(rd + "/AGENTS.md")) {
        console.log("SKIP: " + r.name + "（目录已存在，跳过生成——如需重置请先移除该角色目录）");
        return;
    }
    fs.mkdirSync(rd, { recursive: true });

    // 替换模板变量（第四轮修复：replace 用函数返回值——字符串替换中 $&/$'/$$ 会被当替换模式注入）
    var content = roleTpl
        .replace(/\{\{ROLE_NAME\}\}/g, function() { return r.name; })
        .replace(/\{\{ROLE_DESC\}\}/g, function() { return r.desc || r.name; }); // F-14 修复：desc 缺失时兜底用 name（避免生成字面 undefined）

    // 注入背景
    var bg = r.background;
    if (bg && bg.trim().length > 0) {
        // 去掉用户可能重复写的标题
        bg = bg.replace(/^## 🎭 角色深度背景\s*\n*/g, "").trim();
        content = content.replace(/\{\{ROLE_BACKGROUND\}\}/g, function() { return "## 🎭 角色深度背景\n\n" + bg.trim(); });
    } else {
        content = content.replace(/\{\{ROLE_BACKGROUND\}\}/g, function() { return "## 🎭 角色深度背景\n\n> ⚠️ 未设定深度背景。请基于上方角色描述自由发挥，保持角色一致性。"; });
    }

    fs.writeFileSync(rd + "/AGENTS.md", content, "utf8");

    // 角色目录 reasonix.toml：turn 内循环前置配置（bash_timeout=0）+ 沙箱根（write_file 可直接写 world/）
    var rxCfgPath = rd + "/reasonix.toml";
    if (!fs.existsSync(rxCfgPath)) {
        var projectRootAbs = path.resolve(projectDir).replace(/\\/g, "/") + "/world";   // 收紧沙箱：write_file 只写 world（read_file 读公告牌/角色目录不受限）
        var tmpDirAbs = path.resolve(rd, "temp-scripts").replace(/\\/g, "/");   // 角色自己的临时区（沙箱外专属可写，temp-scripts不污染 world）
        fs.writeFileSync(rxCfgPath,
            "[tools]\n" +
            "bash_timeout_seconds = 0   # turn 内循环：关闭 bash 前台上限，回合内可持续轮询直到收工\n" +
            "\n" +
            "[sandbox]\n" +
            "workspace_root = \"" + projectRootAbs + "\"   # write_file 沙箱根=world（收紧：角色只写干活区；读角色目录/玩法文件用 read_file 不受限）\n" +
            "allow_write = [\"" + tmpDirAbs + "\"]   # 追加可写：角色自己的 temp-scripts/ 目录（temp-scripts/中间文件放这，不污染 world）\n",
            "utf8");
        console.log("OK: " + r.name + "/reasonix.toml (bash_timeout=0 + sandbox + allow_write temp-scripts)");
    }
    // 角色temp-scripts区（沙箱 allow_write 指向这里）
    fs.mkdirSync(rd + "/temp-scripts", { recursive: true });

    // 大鱼对讲目录
    fs.mkdirSync(projectDir + "/world/" + r.name + "_talk", { recursive: true });

    // 复制协作模式文件
    ["_dual_chat_mode.md", "_lead_review_mode.md", "_solo_output_mode.md", "_debate_mode.md"].forEach(function(mf) {
        // H-1 修复：玩法文件含 {{ROLE_NAME}} 占位符（等文件内联循环的心跳路径），必须替换为角色名——
        // 否则角色执行时心跳写入字面 {{ROLE_NAME}}_talk/ 目录，monitor 读不到 → 误判 DEAD
        var mfContent = fs.readFileSync(assetDir + "/play-modes/" + mf, "utf8").replace(/\{\{ROLE_NAME\}\}/g, function() { return r.name; }); // 第四轮修复：函数替换防 $& 注入
        fs.writeFileSync(rd + "/" + mf, mfContent, "utf8");
    });

    // 解耦四件套：启动多步曲/公告牌解读/干活流程/工具分类（2026-08-06 解耦改造新增）
    // 均含 {{ROLE_NAME}} 占位符（心跳路径/对讲目录），必须替换为角色名——与玩法文件同一逻辑
    ["_startup_steps.md", "_board_reading.md", "_workflow.md", "_tool_guide.md"].forEach(function(dec) {
        var decContent = fs.readFileSync(assetDir + "/role-templates/" + dec, "utf8").replace(/\{\{ROLE_NAME\}\}/g, function() { return r.name; });
        fs.writeFileSync(rd + "/" + dec, decContent, "utf8");
        console.log("OK: " + r.name + "/" + dec + " (解耦四件套)");
    });
    // 8-4 精简：内联 fallback 独立文件（_工具分类 引用它，需一并复制；含占位符同样替换）
    var fbContent = fs.readFileSync(assetDir + "/role-templates/_inline_fallback.md", "utf8").replace(/\{\{ROLE_NAME\}\}/g, function() { return r.name; });
    fs.writeFileSync(rd + "/_inline_fallback.md", fbContent, "utf8");
    console.log("OK: " + r.name + "/_inline_fallback.md (8-4 内联 fallback 独立文件)");

    // 复制工具文件
    fs.copyFileSync(assetDir + "/_reasonix_poll.js", rd + "/_reasonix_poll.js");
    var sc = fs.readFileSync(assetDir + "/_sign.js", "utf8"); sc = sc.replace(/\{\{ROLE_NAME\}\}/g, function() { return r.name; }); fs.writeFileSync(rd + "/_sign.js", sc, "utf8"); // 第四轮修复：函数替换防 $& 注入
    fs.copyFileSync(assetDir + "/_lock.js", rd + "/_lock.js");
    fs.copyFileSync(assetDir + "/_deliver.js", rd + "/_deliver.js"); // v1.3: 行为约束工具脚本
    fs.copyFileSync(assetDir + "/_env_bug_list.md", rd + "/_env_bug_list.md");
    // _wakeup.js 也放角色目录——虽然不是角色用，但方便测试和参考
    fs.copyFileSync(assetDir + "/_wakeup.js", rd + "/_wakeup.js");
    // 7-5 沉淀：wait_file.js 标准等文件脚本 → 角色 temp-scripts/（乔布斯体验报告建议）
    fs.copyFileSync(assetDir + "/wait_file.js", rd + "/temp-scripts/wait_file.js");

    console.log("OK: " + r.name + (bg ? " (含深度背景 " + bg.length + " 字符)" : ""));
});

// 大鱼 AGENTS.md —— add 模式跳过（追加角色不需要重建大鱼）
if (!isAddMode) {
// 大鱼 AGENTS.md —— 写到fish/目录下，不是项目根目录！
// 检查是否已存在，不覆盖已有文件（角色不动项目动）
var fishDir = projectDir + "/fish";
fs.mkdirSync(fishDir, { recursive: true });
// H10 修复：init 模式同样生成大鱼 reasonix.toml（不存在才写，与角色目录一致）
var fishRxCfgPath2 = fishDir + "/reasonix.toml";
if (!fs.existsSync(fishRxCfgPath2)) {
    var fishRootAbs2 = path.resolve(projectDir).replace(/\\/g, "/") + "/world";   // 收紧沙箱：write_file 只写 world（read_file 读公告牌/角色目录不受限）
    var fishDirAbs2 = path.resolve(projectDir).replace(/\\/g, "/") + "/fish";   // 8-5 修复：大鱼自己的目录也追加可写（心跳/日志，与 fish 分支同逻辑）
    fs.writeFileSync(fishRxCfgPath2,
        "[tools]\n" +
        "bash_timeout_seconds = 0   # 大鱼回合内可持续调度/轮询\n" +
        "\n" +
        "[sandbox]\n" +
        "workspace_root = \"" + fishRootAbs2 + "\"   # write_file 沙箱根=项目根\n" +
        "allow_write = [\"" + fishDirAbs2 + "\"]   # 追加可写：大鱼自己的目录（心跳/日志，8-5 修复）\n",
        "utf8");
    console.log("OK: fish/reasonix.toml (bash_timeout=0 + sandbox)");
}
var fishAgentsPath = fishDir + "/AGENTS.md";
if (!fs.existsSync(fishAgentsPath)) {
    fs.writeFileSync(fishAgentsPath, fishTpl, "utf8");
    console.log("OK: fish/AGENTS.md (new)");
} else {
    console.log("SKIP: fish/AGENTS.md (already exists)");
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
    console.log("OK: fish/_wakeup.js (new)");
} else {
    console.log("SKIP: _wakeup.js (already exists)");
}

// 7-2 补：复制_fish_loop.js到大鱼目录（init/add 模式同 fish 模式——第七轮实测 init 生成的大鱼也缺 _fish_loop.js）
var fishLoopDest = fishDir + "/_fish_loop.js";
if (!fs.existsSync(fishLoopDest)) {
    fs.copyFileSync(assetDir + "/_fish_loop.js", fishLoopDest);
    console.log("OK: fish/_fish_loop.js (new)");
} else {
    console.log("SKIP: _fish_loop.js (already exists)");
}

// 复制_env_bug_list.md到大鱼目录（大鱼模板引用 ./_env_bug_list.md）
var bugListDest = fishDir + "/_env_bug_list.md";
if (!fs.existsSync(bugListDest)) {
    fs.copyFileSync(assetDir + "/_env_bug_list.md", bugListDest);
    console.log("OK: fish/_env_bug_list.md (new)");
} else {
    console.log("SKIP: _env_bug_list.md (already exists)");
}

// 8-4 修复：init 分支也发 bigfish_board_manual.md（与 fish 分支同逻辑——大鱼模板「公告牌校验+发布」节引用它，init 不发=悬空引用）
var fishManualDest = fishDir + "/bigfish_board_manual.md";
if (!fs.existsSync(fishManualDest)) {
    fs.copyFileSync(assetDir + "/role-templates/bigfish_board_manual.md", fishManualDest);
    console.log("OK: fish/bigfish_board_manual.md (new)");
} else {
    console.log("SKIP: fish/bigfish_board_manual.md (already exists)");
}

// 8-5 修复：init 分支也发 _bigfish_lessons.md（与 fish 分支同逻辑——大鱼模板「实测教训」节引用它，init 不发=悬空引用）
var fishLessonDest = fishDir + "/_bigfish_lessons.md";
if (!fs.existsSync(fishLessonDest)) {
    fs.copyFileSync(assetDir + "/role-templates/_bigfish_lessons.md", fishLessonDest);
    console.log("OK: fish/_bigfish_lessons.md (new)");
} else {
    console.log("SKIP: fish/_bigfish_lessons.md (already exists)");
}

// bigfish_tool_manual.md：init 分支也发（与 fish 分支同逻辑——大鱼模板「周期验证」节引用它，init 不发=悬空引用）
var fishToolManualDest = fishDir + "/bigfish_tool_manual.md";
if (!fs.existsSync(fishToolManualDest)) {
    fs.copyFileSync(assetDir + "/role-templates/bigfish_tool_manual.md", fishToolManualDest);
    console.log("OK: fish/bigfish_tool_manual.md (new)");
} else {
    console.log("SKIP: fish/bigfish_tool_manual.md (already exists)");
}

// 8-2 修复：init 分支也发 _deliver.js/_sign.js 给大鱼（与 fish 分支同逻辑——大鱼模板「专属任务交付闭环」引用这两个工具，init 不发=悬空引用）
var fishDeliverDest = fishDir + "/_deliver.js";
if (!fs.existsSync(fishDeliverDest)) {
    fs.copyFileSync(assetDir + "/_deliver.js", fishDeliverDest);
    console.log("OK: fish/_deliver.js (new)");
} else {
    console.log("SKIP: fish/_deliver.js (already exists)");
}
var fishSignDest = fishDir + "/_sign.js";
if (!fs.existsSync(fishSignDest)) {
    var fishSignContent2 = fs.readFileSync(assetDir + "/_sign.js", "utf8").replace(/\{\{ROLE_NAME\}\}/g, function() { return "fish"; });
    fs.writeFileSync(fishSignDest, fishSignContent2, "utf8");
    console.log("OK: fish/_sign.js (new)");
} else {
    console.log("SKIP: fish/_sign.js (already exists)");
}
} else {
    console.log("SKIP: fish/AGENTS.md (add 模式)");
    console.log("SKIP: monitor.js (add 模式)");
}
console.log("DONE: " + projectDir);
