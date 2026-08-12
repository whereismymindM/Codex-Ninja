// _wakeup.js —— 大鱼唤醒低功耗角色
// 用法: node _wakeup.js <角色名> [原因]
// 在角色的对讲目录下创建 _wakeup.md，角色低功耗轮询检测到后切回活跃模式

var fs = require('fs');
var path = require('path');

var roleName = process.argv[2];
var reason = process.argv[3] || '大鱼召回';

if (!roleName) {
  console.log('用法: node _wakeup.js <角色名> [原因]');
  console.log('示例: node _wakeup.js 架构师-林纳斯 003轮修复方案需修改');
  process.exit(1);
}

// 复核补充：角色名禁止路径分隔符/相对路径/纯点号——防写到我世界/ 之外（与 scaffold M-4 同一漏洞类别的另一入口）
if (/[\\/]|\.\.|^\.+$/.test(roleName)) {
  console.log('ERROR: 角色名不能包含路径分隔符（/ \\）或 ..（当前: ' + roleName + '）');
  process.exit(1);
}

// 对讲目录在 我的世界/{角色名}_大鱼对讲/
var talkDir = path.resolve(__dirname, '..', '我的世界', roleName + '_大鱼对讲');

if (!fs.existsSync(talkDir)) {
  console.log('ERROR: 对讲目录不存在: ' + talkDir);
  process.exit(1);
}

var wakeFile = path.join(talkDir, '_wakeup.md');
var timestamp = new Date().toISOString();
var wakeContent = '# 大鱼唤醒信号\n\n' +
  '- 时间: ' + timestamp + '\n' +
  '- 目标: ' + roleName + '\n' +
  '- 原因: ' + reason + '\n' +
  '- 操作: 收到后立即切回活跃模式，删除本文件确认收到\n';

// L-12 修复：已有未确认的 _wakeup.md 时不覆盖（可能是 monitor 自动唤醒），追加补充原因保留原信号
if (fs.existsSync(wakeFile)) {
  fs.appendFileSync(wakeFile, '\n- 补充唤醒 (' + timestamp + '): ' + reason + '\n');
  console.log('WAKEUP(append): ' + roleName + '（已有唤醒信号，追加原因）');
  console.log('文件: ' + wakeFile);
  process.exit(0);
}

// 原子写入
// 2026-08-12 修复：包 try——Windows rename 目标被占用 EPERM 时不裸崩（与 _sign/_deliver 一致）
try {
  fs.writeFileSync(wakeFile + '.tmp', wakeContent, 'utf8');
  fs.renameSync(wakeFile + '.tmp', wakeFile);
} catch(_aw) {
  console.log('ERROR: 写入唤醒文件失败: ' + (_aw && _aw.message ? _aw.message : _aw));
  process.exit(1);
}

// 自检
if (fs.existsSync(wakeFile) && fs.statSync(wakeFile).size > 30) {
  console.log('WAKEUP: ' + roleName + ' (' + reason + ')');
  console.log('文件: ' + wakeFile);
} else {
  console.log('ERROR: 写入失败');
  process.exit(1);
}