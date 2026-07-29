// _deliver.js —— 强制原子产出（路径写死，不会放错目录）
// 用法: node _deliver.js <产出文件名> <内容临时文件路径> [任务目录名]
// 传了第3参（任务目录名）→ 直接定位，跳过扫描公告牌（省 readFileSync，防系统负载超时）
// 不传 → 自动扫描公告牌推导任务目录（兼容旧调用）
//
// ⚠️ 文件大小变化是正常的：交付后字节数可能变小，因为 fs.writeFileSync
//    会把 Windows 换行符 \r\n 统一转成 \n（Node.js 默认行为）。
//    内容完整无损，别因为大小变化反复验证——确认头尾关键词对就行。

var fs = require("fs");
var path = require("path");

var fileName = process.argv[2];
var contentFile = process.argv[3];
var taskDirHint = process.argv[4] || null; // v2.1: 可选第4参，传任务目录名跳过公告牌扫描

if (!fileName || !contentFile) {
    console.log("用法: node _deliver.js <产出文件名> <内容文件> [任务目录名]");
    process.exit(1);
}

// 读内容
if (!fs.existsSync(contentFile)) {
    console.error("DELIVER_ERR: 内容文件不存在: " + contentFile);
    process.exit(1);
}
var content = fs.readFileSync(contentFile, "utf8");

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
    var N = 1;
    var boardFiles = fs.readdirSync(worldDir).filter(function(f) { return /^公告牌_\d+\.md$/.test(f); });
    boardFiles.forEach(function(f) {
      var num = parseInt(f.match(/公告牌_(\d+)\.md/)[1], 10);
      var boardContent = fs.readFileSync(worldDir + "/" + f, "utf8");
      if (boardContent.indexOf("模式: 收工") !== -1 || boardContent.indexOf("· 收工") !== -1) return;
      if (num > N) N = num;
    });

    var boardFile = worldDir + "/公告牌_" + String(N).padStart(3, "0") + ".md";
    if (!fs.existsSync(boardFile)) {
      var found = boardFiles.filter(function(f) { return new RegExp("^公告牌_0*" + N + "\\.md$").test(f); });
      if (found.length > 0) boardFile = worldDir + "/" + found[0];
      else console.log("DELIVER_WARN: 找不到公告牌 #" + N);
    }

    taskDir = "任务" + String(N).padStart(3, "0");
    if (fs.existsSync(boardFile)) {
        var board = fs.readFileSync(boardFile, "utf8");
        var m = board.match(/我的世界\/(?:产出\/)?(任务\d+_?[^\s(\[{\/（]+)\/?\s*$/m);
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

var outputFile = outputDir + "/" + fileName;

// 原子写入
if (content.length < 10) {
    console.error("DELIVER_ERR: 内容太短（" + content.length + " 字节，最少需要10字节），拒绝产出");
    process.exit(1);
}

// try-finally：内容写入后必须生成 .ready，中断也不漏
try {
  fs.writeFileSync(outputFile + ".tmp", content, "utf8");
  fs.renameSync(outputFile + ".tmp", outputFile);
} finally {
  fs.writeFileSync(outputFile + ".ready", "OK " + new Date().toISOString(), "utf8");
}
console.log("SIGNAL: " + outputFile + ".ready 已就绪");
console.log("DELIVERED: " + outputFile + " (" + content.length + " 字节)");
