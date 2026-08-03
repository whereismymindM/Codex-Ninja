// _sign.js — 强制正确签字（路径写死，不会签错地方）
// 用法: node _sign.js <轮次号> [可选消息]
// 增加重试 + 自检验证，应对 shell 超时假阴性

var fs = require("fs");
var path = require("path");

var N = process.argv[2];
var msg = process.argv[3] || "";

// L-13 修复：N 必须是数字——否则生成 完成_abc.md，monitor 永远等不到
// F-13 修复：且必须是 >=1 的整数——"0"/"0.5" 会静默生成 完成_000.md（monitor 从 N=1 起查，永不匹配）
var nN = parseInt(N, 10);
if (!N || isNaN(nN) || nN < 1 || String(nN) !== String(N).trim()) { console.log("用法: node _sign.js <轮次号> [消息]"); process.exit(1); }
N = nN;

// 角色名由scaffold在生成时焊死，不读AGENTS.md——省掉readFileSync+正则，防系统负载超时
var roleName = "{{ROLE_NAME}}";

var signDir = path.resolve(__dirname, "..", "我的世界", roleName + "_大鱼对讲");
fs.mkdirSync(signDir, { recursive: true });

var signFile = signDir + "/完成_" + String(N).padStart(3, "0") + ".md";

// 快速路径：签字文件已存在且非空 → 直接跳过
// ⚠️ L14 说明：若签错轮/内容错误需要重签，先手动删除旧签字文件再运行本脚本（已有有效签字不会自动覆盖）
if (fs.existsSync(signFile) && fs.statSync(signFile).size > 20) {
    console.log("SIGNED (已存在): " + signFile + " (" + fs.statSync(signFile).size + " 字节)");
    process.exit(0);
}
var content = "# " + roleName + " · 第" + N + "轮签字\n\n" + (msg || "已完成。") + "\n";

// 原子写入 + 自检（1 次写入 + 自检验证，原子写入本身就可靠）
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