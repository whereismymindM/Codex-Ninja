// _sign.js — 强制正确签字（路径写死，不会签错地方）
// 用法: node _sign.js <轮次号> [可选消息]
// v1.4: 增加重试 + 自检验证，应对 shell 超时假阴性

var fs = require("fs");
var path = require("path");

var N = process.argv[2];
var msg = process.argv[3] || "";

if (!N) { console.log("用法: node _sign.js <轮次号> [消息]"); process.exit(1); }

// 角色名由scaffold在生成时焊死，不读AGENTS.md——省掉readFileSync+正则，防系统负载超时
var roleName = "{{ROLE_NAME}}";

var signDir = path.resolve(__dirname, "..", "我的世界", roleName + "_大鱼对讲");
fs.mkdirSync(signDir, { recursive: true });


// 快速路径：签字文件已存在且非空 → 直接跳过
if (fs.existsSync(signFile) && fs.statSync(signFile).size > 20) {
    console.log("SIGNED (已存在): " + signFile + " (" + fs.statSync(signFile).size + " 字节)");
    process.exit(0);
}
var signFile = signDir + "/完成_" + String(N).padStart(3, "0") + ".md";
var content = "# " + roleName + " · 第" + N + "轮签字\n\n" + (msg || "已完成。") + "\n";

// 原子写入 + 重试（最多3次，应对 shell 超时假阴性）
var maxRetries = 1; // 原子写入本身就可靠，1次够，多了给shell超时送人头
for (var attempt = 1; attempt <= maxRetries; attempt++) {
    try {
        fs.writeFileSync(signFile + ".tmp", content, "utf8");
        fs.renameSync(signFile + ".tmp", signFile);
        
        // 自检验证：确认文件真的写入了
        if (fs.existsSync(signFile) && fs.statSync(signFile).size > 20) {
            console.log("SIGNED: " + signFile + " (" + content.length + " 字节)");
            process.exit(0);
        }
        console.log("WARN: 签字文件存在但可能不完整，重试 " + attempt + "/" + maxRetries);
    } catch (e) {
        console.log("WARN: 签字失败 " + e.message + "，重试 " + attempt + "/" + maxRetries);
    }
}

// 全部重试失败
console.log("ERROR: 签字失败，已重试 " + maxRetries + " 次");
process.exit(1);