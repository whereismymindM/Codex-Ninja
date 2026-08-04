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

// 防呆：projectDir 不能以 "我的世界" 结尾——角色会被生成到我的世界里面而不是同级
// 正确：projectDir 是 我的世界/ 的上级目录（如 一号舱室-软件开发部）
if (projectDir.replace(/\\/g, "/").replace(/\/$/, "").endsWith("/我的世界")) {
    console.error("ERROR: projectDir 不能是我的世界目录！角色会生成到我的世界里面。");
    console.error("请用我的世界的上级目录（如 一号舱室-软件开发部）作为 projectDir。");
    process.exit(1);
}

var assetDir = path.resolve(__dirname, "..", "assets");

// 解析运行模式：第二个参数是 "fish" 则直接走鱼模式，否则第三个参数是 roles.json
// F-14 修复：isFishMode 需同时满足 第4参为 window/run 或不存在，且当前目录无名为 fish 的文件——
// 若用户 roles 文件恰好叫 fish（无论带不带第4参），按 roles 文件处理而非误入 fish 模式（文件存在优先）
var isFishMode = process.argv[3] === "fish" && !fs.existsSync(process.argv[3]) && (process.argv[4] === undefined || process.argv[4] === "window" || process.argv[4] === "run");
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
    // M-4 修复：角色名禁止路径分隔符/相对路径/纯点号——防 mkdir/写文件逃出项目目录（如 name: "../火影-大鱼"）或写入项目根（name: "."）
    if (/[\\/]|\.\.|^\.+$/.test(r.name)) {
        console.error("ERROR: roles.json 角色名不能包含路径分隔符（/ \\）、'..' 或纯点号（当前: " + r.name + "）");
        process.exit(1);
    }
});

} // !isFishMode

// 读模板
var roleTpl = fs.readFileSync(assetDir + "/模板/Reasonix版_角色_AGENTS模板.md", "utf8").replace(/^\uFEFF/, "");
// 大鱼模板按形态选：window（窗口常驻，默认）| run（run拉起）
var fishTplFile = (isFishMode && fishShape === "run") ? "大鱼_AGENTS模板_run拉起.md" : "大鱼_AGENTS模板_窗口常驻.md";
var fishTpl = fs.readFileSync(assetDir + "/模板/" + fishTplFile, "utf8").replace(/^\uFEFF/, "");

// 鱼模式：只重建大鱼AGENTS.md（纯模板，不注入灵魂——大鱼不需要人格）和monitor.js
if (isFishMode) {
    console.log("MODE: fish —— 重建大鱼+monitor（纯模板，无灵魂）");

    // 大鱼 AGENTS.md —— 纯模板，替换路径变量
    var fishDir = projectDir + "/火影-大鱼";
    fs.mkdirSync(fishDir, { recursive: true });
    // H10 修复：大鱼目录也生成 reasonix.toml（bash_timeout=0 + sandbox=项目根）——与角色一致，
    // 避免大鱼会话回退到上级/全局配置（无 bash_timeout、workspace_root 指向错误目录 → write_file 被沙箱拦截 → bash 绕行）
    var fishRxCfgPath = fishDir + "/reasonix.toml";
    if (!fs.existsSync(fishRxCfgPath)) {
        var fishRootAbs = path.resolve(projectDir).replace(/\\/g, "/") + "/我的世界";   // 收紧沙箱：write_file 只写 我的世界（read_file 读公告牌/角色目录不受限）
        fs.writeFileSync(fishRxCfgPath,
            "[tools]\n" +
            "bash_timeout_seconds = 0   # 大鱼回合内可持续调度/轮询（monitor 周期验证 + 调度循环）\n" +
            "\n" +
            "[sandbox]\n" +
            "workspace_root = \"" + fishRootAbs + "\"   # write_file 沙箱根=项目根，大鱼可直接写 我的世界/，免 bash 绕行\n",
            "utf8");
        console.log("OK: 火影-大鱼/reasonix.toml (bash_timeout=0 + sandbox)");
    }
    var fishContent = fishTpl;
    fs.writeFileSync(fishDir + "/AGENTS.md", fishContent, "utf8");
    console.log("OK: 火影-大鱼/AGENTS.md (" + fs.statSync(fishDir + "/AGENTS.md").size + " bytes)");

    // 形态标志文件：monitor 靠它区分窗口常驻/run拉起的心跳处理（run拉起=角色干完即退，心跳停是正常态）
    var modeFlag = fishDir + "/_运行形态.mode";
    fs.writeFileSync(modeFlag, fishShape, "utf8");
    console.log("OK: 运行形态标志 " + fishShape);

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

    // 7-1 修复：_fish_loop.js —— 大鱼周期验证循环（公告牌检测 30s + monitor 60s），
    // 第七轮实测发现缺失（大鱼只能自补临时版）——必须随 scaffold 部署
    var fishLoopPath = fishDir + "/_fish_loop.js";
    fs.copyFileSync(assetDir + "/_fish_loop.js", fishLoopPath);
    console.log("OK: _fish_loop.js (" + fs.statSync(fishLoopPath).size + " bytes)");

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
    // M6 修复：项目根 AGENTS.md 已存在则不覆盖（与 monitor.js 的"已存在不覆盖"策略一致）——
    // 避免 init 静默覆盖用户自写/旧版文件
    if (!fs.existsSync(projectDir + "/AGENTS.md")) {
        fs.copyFileSync(teamNotice, projectDir + "/AGENTS.md");
        console.log("OK: 团队须知/AGENTS.md → " + projectDir);
    } else {
        console.log("SKIP: 团队须知/AGENTS.md → " + projectDir + "（已存在，不覆盖）");
    }

    fs.mkdirSync(projectDir + "/我的世界/产出", { recursive: true });
    fs.mkdirSync(projectDir + "/我的世界/大鱼_老渣对讲", { recursive: true });
    // B-8 修复：工具源码只读快照——复制 monitor/scaffold/工具脚本到 我的世界/skill文档/工具源码/，
    // 角色可读（ship path 有地形可查），不可写（信息边界意图保留）；版本戳防快照漂移（对话 T13 提案）
    var srcSnap = projectDir + "/我的世界/skill文档/工具源码";
    fs.mkdirSync(srcSnap, { recursive: true });
    var snapFiles = [
        [projectDir + "/monitor.js", "monitor.js"],
        [__dirname + "/scaffold.js", "scaffold.js"],
        [assetDir + "/_reasonix_poll.js", "_reasonix_poll.js"],
        [assetDir + "/_deliver.js", "_deliver.js"],
        [assetDir + "/_sign.js", "_sign.js"],
        [assetDir + "/_lock.js", "_lock.js"],
        [assetDir + "/_poll.js", "_poll.js"],
        [assetDir + "/_wakeup.js", "_wakeup.js"],
        [assetDir + "/_fish_loop.js", "_fish_loop.js"],
        [assetDir + "/wait_file.js", "wait_file.js"]
    ];
    snapFiles.forEach(function(pair) {
        try {
            if (fs.existsSync(pair[0])) fs.copyFileSync(pair[0], srcSnap + "/" + pair[1]);
        } catch(_sn) {}
    });
    fs.writeFileSync(srcSnap + "/版本戳.txt", "快照时间: " + new Date().toISOString() + "\n来源: codex-ninja scaffold init（B-8 只读快照，角色可读不可写；更新=重跑 scaffold）\n", "utf8");
    console.log("OK: 我的世界/skill文档/工具源码/ (B-8 只读快照 + 版本戳)");
} else {
    console.log("SKIP: 我的世界/ (add 模式不重建)");
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

    // 角色目录 reasonix.toml：turn 内循环前置配置（bash_timeout=0）+ 沙箱根（write_file 可直接写 我的世界/）
    var rxCfgPath = rd + "/reasonix.toml";
    if (!fs.existsSync(rxCfgPath)) {
        var projectRootAbs = path.resolve(projectDir).replace(/\\/g, "/") + "/我的世界";   // 收紧沙箱：write_file 只写 我的世界（read_file 读公告牌/角色目录不受限）
        var tmpDirAbs = path.resolve(rd, "临时脚本").replace(/\\/g, "/");   // 角色自己的临时区（沙箱外专属可写，临时脚本不污染 我的世界）
        fs.writeFileSync(rxCfgPath,
            "[tools]\n" +
            "bash_timeout_seconds = 0   # turn 内循环：关闭 bash 前台上限，回合内可持续轮询直到收工\n" +
            "\n" +
            "[sandbox]\n" +
            "workspace_root = \"" + projectRootAbs + "\"   # write_file 沙箱根=我的世界（收紧：角色只写干活区；读角色目录/玩法文件用 read_file 不受限）\n" +
            "allow_write = [\"" + tmpDirAbs + "\"]   # 追加可写：角色自己的 临时脚本/ 目录（临时脚本/中间文件放这，不污染 我的世界）\n",
            "utf8");
        console.log("OK: " + r.name + "/reasonix.toml (bash_timeout=0 + sandbox + allow_write 临时脚本)");
    }
    // 角色临时脚本区（沙箱 allow_write 指向这里）
    fs.mkdirSync(rd + "/临时脚本", { recursive: true });

    // 大鱼对讲目录
    fs.mkdirSync(projectDir + "/我的世界/" + r.name + "_大鱼对讲", { recursive: true });

    // 复制协作模式文件
    ["_双人对话模式.md", "_主笔审核模式.md", "_单人输出模式.md", "_辩论模式.md"].forEach(function(mf) {
        // H-1 修复：玩法文件含 {{ROLE_NAME}} 占位符（等文件内联循环的心跳路径），必须替换为角色名——
        // 否则角色执行时心跳写入字面 {{ROLE_NAME}}_大鱼对讲/ 目录，monitor 读不到 → 误判 DEAD
        var mfContent = fs.readFileSync(assetDir + "/玩法模式/" + mf, "utf8").replace(/\{\{ROLE_NAME\}\}/g, function() { return r.name; }); // 第四轮修复：函数替换防 $& 注入
        fs.writeFileSync(rd + "/" + mf, mfContent, "utf8");
    });

    // 复制工具文件
    fs.copyFileSync(assetDir + "/_poll.js", rd + "/_poll.js");
    fs.copyFileSync(assetDir + "/_reasonix_poll.js", rd + "/_reasonix_poll.js");
    var sc = fs.readFileSync(assetDir + "/_sign.js", "utf8"); sc = sc.replace(/\{\{ROLE_NAME\}\}/g, function() { return r.name; }); fs.writeFileSync(rd + "/_sign.js", sc, "utf8"); // 第四轮修复：函数替换防 $& 注入
    fs.copyFileSync(assetDir + "/_lock.js", rd + "/_lock.js");
    fs.copyFileSync(assetDir + "/_deliver.js", rd + "/_deliver.js"); // v1.3: 行为约束工具脚本
    fs.copyFileSync(assetDir + "/_外部环境BUG清单.md", rd + "/_外部环境BUG清单.md");
    // _wakeup.js 也放角色目录——虽然不是角色用，但方便测试和参考
    fs.copyFileSync(assetDir + "/_wakeup.js", rd + "/_wakeup.js");
    // 7-5 沉淀：wait_file.js 标准等文件脚本 → 角色 临时脚本/（乔布斯体验报告建议）
    fs.copyFileSync(assetDir + "/wait_file.js", rd + "/临时脚本/wait_file.js");

    console.log("OK: " + r.name + (bg ? " (含深度背景 " + bg.length + " 字符)" : ""));
});

// 大鱼 AGENTS.md —— add 模式跳过（追加角色不需要重建大鱼）
if (!isAddMode) {
// 大鱼 AGENTS.md —— 写到火影-大鱼/目录下，不是项目根目录！
// 检查是否已存在，不覆盖已有文件（角色不动项目动）
var fishDir = projectDir + "/火影-大鱼";
fs.mkdirSync(fishDir, { recursive: true });
// H10 修复：init 模式同样生成大鱼 reasonix.toml（不存在才写，与角色目录一致）
var fishRxCfgPath2 = fishDir + "/reasonix.toml";
if (!fs.existsSync(fishRxCfgPath2)) {
    var fishRootAbs2 = path.resolve(projectDir).replace(/\\/g, "/") + "/我的世界";   // 收紧沙箱：write_file 只写 我的世界（read_file 读公告牌/角色目录不受限）
    fs.writeFileSync(fishRxCfgPath2,
        "[tools]\n" +
        "bash_timeout_seconds = 0   # 大鱼回合内可持续调度/轮询\n" +
        "\n" +
        "[sandbox]\n" +
        "workspace_root = \"" + fishRootAbs2 + "\"   # write_file 沙箱根=项目根\n",
        "utf8");
    console.log("OK: 火影-大鱼/reasonix.toml (bash_timeout=0 + sandbox)");
}
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

// 7-2 补：复制_fish_loop.js到大鱼目录（init/add 模式同 fish 模式——第七轮实测 init 生成的大鱼也缺 _fish_loop.js）
var fishLoopDest = fishDir + "/_fish_loop.js";
if (!fs.existsSync(fishLoopDest)) {
    fs.copyFileSync(assetDir + "/_fish_loop.js", fishLoopDest);
    console.log("OK: 火影-大鱼/_fish_loop.js (new)");
} else {
    console.log("SKIP: _fish_loop.js (already exists)");
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
