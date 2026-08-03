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
      var boardContent = fs.readFileSync(worldDir + "/" + f, "utf8");
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
        var board = fs.readFileSync(boardFile, "utf8");
        var m = board.match(/^-\s*(?:产出|任务目录)[：:]\s*我的世界\/(?:产出\/)?(任务\d+_?[^\s(\[{\/（]+)(?:\/[^\s]+(?:\s*,\s*[^\s]+)*)?\/?\s*$/m);
        if (m) {
            taskDir = m[1];
        }
    }
} // 慢路径结束

var outputDir = projRoot + "/我的世界/产出/" + taskDir;

// === 路径兜底校验 ===
if (outputDir.indexOf("/我的世界/产出/") === -1 && outputDir.indexOf("\\我的世界\\产出\\") === -1) {
    console.error("DELIVER_ERR: 产出路径异常——" + outputDir + " 不在 我的世界/产出/ 下。请确认公告牌的任务目录字段是否正确。");
    process.exit(1);
}
fs.mkdirSync(outputDir, { recursive: true });

// deliver 只写 .ready 信号，不搬运文件。文件自行就位。
var readyFile = outputDir + "/" + fileName + ".ready";
// 原子写入——先写 .tmp 再 rename，读 .ready 时不会读到半截文件
var _dlContent = "OK " + new Date().toISOString();
if(sourcePath) _dlContent = "source: " + sourcePath + "\n" + _dlContent;
fs.writeFileSync(readyFile + ".tmp", _dlContent, "utf8");
fs.renameSync(readyFile + ".tmp", readyFile);
console.log("SIGNAL: " + readyFile + " 已就绪");
console.log("DELIVERED: " + fileName + " (" + outputDir + ")");
