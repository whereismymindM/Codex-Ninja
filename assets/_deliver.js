// _deliver.js —— 交付信号（只写 .ready，不搬运文件）
// 用法: node _deliver.js <产出文件名> [任务目录名] [源文件路径]
// 传了第3参（任务目录名）→ 直接定位，跳过扫描公告牌（省 readFileSync，防系统负载超时）
// 不传 → 自动扫描公告牌推导任务目录（兼容旧调用）
//
// 统一行为——deliver() 永远只写 .ready 信号，不拷贝文件。
// 文档模式：角色先 fs.writeFileSync 把内容写到 产出/任务NNN/，再调 deliver()
// 代码模式：角色在源文件目录原地改完代码，调 deliver() 发 .ready 信号

var fs = require("fs");
var path = require("path");

var fileName = process.argv[2];
var taskDirHint = process.argv[3] || null; // 可选第3参，传任务目录名跳过公告牌扫描

var sourcePath = process.argv[4] || null; // 可选第4参: 源文件路径，写入 .ready 方便追溯

if (!fileName) {
    console.log("用法: node _deliver.js <产出文件名> [任务目录名]");
    process.exit(1);
}

// 推导产出路径
var projRoot = path.resolve(__dirname, "..");
var worldDir = projRoot + "/我的世界";
var taskDir;

// 快速路径：传了任务目录名 → 跳过公告牌扫描
if (taskDirHint) {
    // L-11 修复：净化任务目录名（禁分隔符/..）——防路径穿越写出项目根
    taskDirHint = taskDirHint.replace(/[\\/]/g, "_").replace(/\.\./g, "_");
    taskDir = taskDirHint;
    console.log("DELIVER_FAST: 跳过公告牌扫描，直接定位 " + taskDirHint);
} else {
    // 慢路径：扫描公告牌推导任务目录（兼容旧调用）
    // ⚠️ H9 修复：全量发布形态下 我的世界/ 会同时存在多张公告牌，慢路径只能取"最大非收工轮"，
    //    无法知道当前正在干第几轮 → .ready 可能写到错误任务目录 → monitor 永不就位。
    //    必须传第 3 参（任务目录名）走快速路径，或确保调用时明确当前轮。
    var N = 1;
    var boardFiles = fs.readdirSync(worldDir).filter(function(f) { return /^公告牌_\d+\.md$/.test(f); });
    var nonRetireCount = 0;
    boardFiles.forEach(function(f) {
      var num = parseInt(f.match(/公告牌_(\d+)\.md/)[1], 10);
      // 复核补充：readFileSync 包 try（与 M-1 同类）——文件并发移动/锁定时读失败，跳过该文件继续，避免崩溃 exit 1
      var boardContent;
      try { boardContent = fs.readFileSync(worldDir + "/" + f, "utf8"); } catch(_eb) { return; }
      if (boardContent.indexOf("模式: 收工") !== -1 || boardContent.indexOf("模式：收工") !== -1 || boardContent.indexOf("· 收工") !== -1) return;
      nonRetireCount++;
      if (num > N) N = num;
    });
    if (nonRetireCount > 1) {
      console.log("DELIVER_WARN: 检测到 " + nonRetireCount + " 张非收工公告牌（全量发布形态），慢路径无法确定当前轮次，.ready 可能写到错误任务目录！请改用 node _deliver.js <产出文件名> <任务目录名> 显式传任务目录。");
    }

    var boardFile = worldDir + "/公告牌_" + String(N).padStart(3, "0") + ".md";
    if (!fs.existsSync(boardFile)) {
      var found = boardFiles.filter(function(f) { return new RegExp("^公告牌_0*" + N + "\\.md$").test(f); });
      if (found.length > 0) boardFile = worldDir + "/" + found[0];
      else console.log("DELIVER_WARN: 找不到公告牌 #" + N);
    }

    taskDir = "任务" + String(N).padStart(3, "0");
    if (fs.existsSync(boardFile)) {
      // 复核补充：readFileSync 包 try——读失败保持默认 任务N 推导，不崩溃
      try {
        var board = fs.readFileSync(boardFile, "utf8");
        var m = board.match(/^-\s*(?:产出|任务目录)[：:]\s*我的世界\/(?:产出\/)?(任务\d+_?[^\s(\[{\/（]+)(?:\/[^\s]+(?:\s*,\s*[^\s]+)*)?\/?\s*$/m);
        if (m) {
            taskDir = m[1];
        }
      } catch(_br) {}
    }
} // 慢路径结束

var outputDir = projRoot + "/我的世界/产出/" + taskDir;

// A-2 修复：行为日志——交付动作写一行到角色操作日志（实弹反馈 #2：干活过程对脚本不可见，只有 poll 事件）
function _logAction(actionMsg) {
    try {
        var _ag = fs.readFileSync(path.resolve(__dirname, "AGENTS.md"), "utf8");
        var _rm = _ag.match(/^# (.+)$/m);
        var _rn = _rm ? _rm[1].trim() : "";
        if (!_rn) return;
        var _logDir = path.resolve(__dirname, "..", "我的世界", _rn + "_大鱼对讲");
        fs.mkdirSync(_logDir, { recursive: true });
        var _ts = new Date().toISOString().substring(11, 19);
        fs.appendFileSync(_logDir + "/" + _rn + "_操作日志.md", "[" + _ts + "] " + actionMsg + "\n", "utf8");
    } catch(_lg) {}
}

// === 路径兜底校验 ===
if (outputDir.indexOf("/我的世界/产出/") === -1 && outputDir.indexOf("\\我的世界\\产出\\") === -1) {
    console.error("DELIVER_ERR: 产出路径异常——" + outputDir + " 不在 我的世界/产出/ 下。请确认公告牌的任务目录字段是否正确。");
    process.exit(1);
}
fs.mkdirSync(outputDir, { recursive: true });

// 5-6 修复（升级计划 5-6，2026-08-04）：fileName 含 / 时视为子路径——在 outputDir 下建子目录，.ready 与源文件同目录
// 例：deliver("lib/validate-patterns.js", ...) → 产出/任务NNN/lib/validate-patterns.js.ready（之前斜杠被拼进文件名，语义丢失）
var readySubDir = outputDir;
var readyName = fileName;
if (fileName.indexOf("/") !== -1 || fileName.indexOf("\\") !== -1) {
    var _parts = fileName.split(/[\\/]/);
    readyName = _parts.pop();
    readySubDir = outputDir + "/" + _parts.join("/");
    fs.mkdirSync(readySubDir, { recursive: true });
}

// deliver 只写 .ready 信号，不搬运文件。文件自行就位。
var readyFile = readySubDir + "/" + readyName + ".ready";
// B-4 修复：metadata 证据链（producer/size/mtime）+ 文档类存在性校验（收工审计可读 .ready 内容验证交付质量）
// ⚠️ T12 陷阱防护：sourcePath（代码类产出，目标在源目录不在 产出/）跳过存在性检查——只加 producer metadata
var _dlContent = "OK " + new Date().toISOString();
if(sourcePath) _dlContent = "source: " + sourcePath + "\n" + _dlContent;
try {
    var _ag2 = fs.readFileSync(path.resolve(__dirname, "AGENTS.md"), "utf8");
    var _rm2 = _ag2.match(/^# (.+)$/m);
    var _producer = _rm2 ? _rm2[1].trim() : "";
    if (_producer) _dlContent += "\nproducer: " + _producer;
    if (!sourcePath) {
        var _target = readySubDir + "/" + readyName;
        try {
            var _tst = fs.statSync(_target);
            _dlContent += "\nsize: " + _tst.size + "\nmtime: " + _tst.mtimeMs;
            if (_tst.size === 0) console.log("DELIVER_WARN: 目标文件 " + readyName + " 大小为 0——内容可能未写入");
        } catch(_tnf) {
            console.log("DELIVER_WARN: 目标文件 " + readyName + " 不存在于 " + readySubDir + "——deliver 只发信号，内容文件需先写入！");
        }
    }
} catch(_lg3) {}
// 原子写入——先写 .tmp 再 rename，读 .ready 时不会读到半截文件
fs.writeFileSync(readyFile + ".tmp", _dlContent, "utf8");
fs.renameSync(readyFile + ".tmp", readyFile);
console.log("SIGNAL: " + readyFile + " 已就绪");
console.log("DELIVERED: " + fileName + " (" + outputDir + ")");
_logAction("DELIVER " + fileName + " -> " + outputDir); // A-2 行为日志
