# 外部环境BUG清单（Windows + 中文）

> 本文档汇总了在 Windows 环境下运行多Agent协作时遇到的所有外部环境坑。
> 新项目启动前，所有角色Agent应先阅读本文档。也可考虑整合到 SKILL.md 中。

---

## ⚡ 当前环境必读（bash/Reasonix 下实际要防的，30 秒版）

> 历史说明：PowerShell 时代的 BUG 1/2/3/9/10（node -e 中文、Get-Content 编码、`--` 解析、REPL 冲突）在 bash/Reasonix 环境下不触发，已删除。编号保留不再重排，以保持既有引用稳定。

| 必读项 | 对应 BUG | 一句话 |
|---|---|---|
| **写完必须验证** | BUG 4, 12 | fs.statSync 验大小；replace() 后自检 newContent !== content |
| **MSYS 路径翻译** | BUG 14 | 工具脚本路径参数一律相对路径（`../我的世界/`），禁止 POSIX 绝对路径（`/tmp` 会被改写成 `D:\tmp`） |
| **heredoc 挂死** | BUG 6（实弹教训） | 等文件禁止 `bash heredoc + node`（引号出错 → bash 永久挂起，心跳断）——用 wait_file.js 或 write_file |
| **中文直写** | （Reasonix 原生支持，无编号） | 中文长内容用 write_file 原生直写，零编码问题 |

> 其余 BUG 为通用 Node/环境坑（bash 下同样要防）。

---

## 三原则速查（30秒看完，覆盖90%的坑）

下面这些 BUG 本质上就三条原则。新角色开工前先记住这三条，踩坑了再回来细查：

| # | 原则 | 一句话 | 覆盖的 BUG |
|---|------|--------|-----------|
| 1 | **写完必须验证** | fs.statSync 验大小; replace() 后自检 | BUG 4, 12 |
| 2 | **别用 heredoc 等文件** | 用 wait_file.js / 内联轮询，禁止 bash heredoc 长等 | BUG 6（实弹教训） |
| 3 | **路径一律相对** | `../我的世界/`，禁止 POSIX 绝对路径（MSYS 会改写） | BUG 14 |

> 编码细节：反引号别嵌套 Markdown 代码块用 lines.push()（BUG 11）；双窗口 poll 太密会 I/O 闪退（BUG 13：实际间隔首轮 3s、低功耗固定 3s，需多角色错相）。

---

## BUG 4：大文件读取超时 + 输出截断

**现象**：
- 用 `node -e` 读长文件时 shell_command 超时（默认 10 秒）
- 即使不超时，输出也会在几千字符处被截断（stdout 缓冲区上限），15000 字的文件只看到头尾，中间全丢

**原因**：`fs.readFileSync` + `console.log` 输出到终端时，PowerShell 管道既有耗时瓶颈又有容量上限。此外，**PowerShell 命令本身启动就需要 8-18 秒**——即使是简单的 `Start-Sleep`，通过 `execSync` 调用也会拖慢整体流程。这就是为什么 `_poll.js` 的 `safeSleep` 做了降级：先试 PowerShell，失败了切 Node.js 忙等。

**解决方案**：
- 超时问题：`timeout_ms` 设到 30000 以上
- 截断问题：分三段读，不一次性输出全文

```javascript
// 读长文件的标准姿势
var fs = require("fs");
var path = "目标文件.md";
var content = fs.readFileSync(path, "utf8");

// 1. 先看多大
console.log("文件大小: " + content.length + " 字符");

// 2. 读头部
console.log(content.substring(0, 2000));

// 3. 读关键段落（用 indexOf 定位章节标题）
var pos = content.indexOf("第三章");
if (pos !== -1) console.log(content.substring(pos, pos + 2000));

// 4. 读尾部
console.log(content.substring(content.length - 2000));
```
一次只输出 2000 字，不会触发截断。多跑几次覆盖全篇。

---

## BUG 5：shell_command 超时假阴性 —— 命令完成了但报超时

**现象**：shell_command 返回 command timed out，但输出中已经包含操作成功的标志（如 LOCK_ACQUIRED、DELIVERED、LOCK_RELEASED）。实际工作已完成，但 shell 监控线程先超时了。

**根本原因**：PowerShell 启动需要 8-18 秒，加上命令执行时间后接近或超过默认的 timeout_ms 边界。Node 子进程仍在运行并完成了工作，但 shell 外层已经判定超时。

**影响**：Agent 无法从 exit code 判断操作是否成功，每次都需要额外手动验证文件是否存在。

**解法**：
- 关键操作（lock/deliver/sign）统一设 timeout_ms: 60000
- 操作后主动验证结果（如签字后检查文件是否存在），不盲信 exit code
- 工具脚本内部增加明确的退出信号，即使外部超时也能从输出判断结果

---
## BUG 6：PowerShell here-string 被中文内容打断（⚠️ 仅 PowerShell；bash heredoc 无此问题——实弹验证：图灵×贾维斯 16 轮对话全用 write_file，零 temp-.js）

**现象**：用 PowerShell here-string 写临时 JS 文件时，如果 JS 模板字符串中包含中文弯引号或中文括号，PowerShell 解析器提前终止 here-string，报 The string is missing the terminator。

**根本原因**：PowerShell 的 here-string 解析器在遇到某些 Unicode 字符时，将其误判为字符串界定符或终止符。双引号 here-string 比单引号 here-string 更稳定。

**解法**：
- 优先用双引号 here-string
- 更稳妥：直接用 Node.js 写临时文件，绕开 PowerShell 的字符串解析
- 如果内容包含 $ 变量引用，双引号 here-string 会展开变量——改用单引号或 Node.js

---
## BUG 7：工具脚本操作成功但外部超时

**现象**：node _lock.js release 超时了但锁实际已释放；node _sign.js 超时了但签字文件已创建。Agent 误以为操作失败，重试或跳过。

**受影响的工具**：_lock.js acquire/release、_sign.js、_deliver.js——任何通过 shell_command 调用的 Node 脚本都可能触发。

**解法**：
- 工具脚本内部增加幂等性——release 时如果锁已不存在也返回成功
- 调用工具脚本后必须自检结果（如检查签字文件是否真的创建了）
- AGENTS.md 增加铁律：运行工具脚本后，验证结果文件存在才继续下一步

---

> BUG 8：历史编号已废弃删除（内容并入其他条目）。编号不再重排以保持既有引用稳定。

---

## BUG 11：JS 模板字面量反引号 vs Markdown 代码块冲突 [v1.5 新增]

**现象**：用临时 .js 文件写长中文 Markdown 时，如果 Markdown 内容中包含代码块反引号，会和 JS 模板字面量的反引号冲突，Node 报 SyntaxError。

**经典场景**：
```javascript
// ❌ 这行会炸——Markdown 代码块里的反引号截断了 JS 模板字符串
var content = `...Markdown正文...
```python
def hello():
    pass
```
...继续...`;
```

**根本原因**：JS 模板字面量用反引号界定，Markdown 代码块也用反引号——两者嵌套时，第一个 Markdown 代码块的反引号被 JS 解析为模板字符串终止符，后面的内容被当成 JS 代码执行，语法必炸。

**解法**：用 lines.push() 数组拼接，不用模板字面量——每条都是普通双引号字符串，反引号当普通字符。

```javascript
// ✅ 正确姿势：lines.push() + 双引号
var lines = [];
lines.push("# 标题");
lines.push("");
lines.push("正文内容...");
lines.push("");
lines.push("```python");
lines.push("def hello():");
lines.push("    pass");
lines.push("```");
var content = lines.join("\n");
fs.writeFileSync("目标文件.md.tmp", content, "utf8");
fs.renameSync("目标文件.md.tmp", "目标文件.md");
```

**核心原则：写长中文 Markdown 到 JS 文件时——永远不用模板字面量，用 lines.push()。**（node -e + 中文的坑与模板字面量 + Markdown 反引号嵌套是同类问题，本 BUG 补齐盲区）
---

## BUG 12：replace() 静默失败——匹配不到时返回原文，不报错 [v1.5 新增]

**现象**：用 String.replace() 修改文件内容后，重新读文件发现根本没改——但 Node.js 没有报任何错误。

**根本原因**：JavaScript 的 String.replace() 在正则或字符串匹配不到时，静默返回原字符串——不抛异常、不打印警告、不给任何信号。空格、换行、中文标点等细微差异都可能导致匹配失败。

**经典场景**：
```javascript
// 想替换 import 块——但文件里的换行是 \r\n，替换字符串用的是 \n，匹配不到
var content = fs.readFileSync("file.py", "utf8");
var newContent = content.replace("import os\nimport sys", "import os\nimport sys\nimport json");
// newContent === content → 静默失败，白改了
fs.writeFileSync("file.py", newContent, "utf8");
```

**解法：强制自检——每次 replace 后必须验证**：
```javascript
var content = fs.readFileSync("file.py", "utf8");
var newContent = content.replace(oldStr, newStr);
if (newContent === content) {
    console.error("REPLACE_FAILED: 替换未命中！请检查匹配字符串的空白字符和标点");
    process.exit(1);
}
fs.writeFileSync("file.py", newContent, "utf8");
```

**更好的方案：优先用行级精确操作**——长文本修改不依赖全文 replace，而是：定位到目标行号→精确替换该行，或按章节标题 split→只改目标段落→再 join。

**核心原则：replace() 不可信——每次调用后必须自检 newContent !== content，不自检=在空气里挥拳。**

---

## BUG 13：Reasonix 桌面闪退（磁盘 I/O 过载）

**现象**：两个角色同时 poll 公告牌时，Reasonix 桌面突然关闭（不报错、不留日志）。
**根因**：_poll.js 频繁读写磁盘，两个进程并发 → I/O 饱和 → Reasonix 进程被系统杀掉。
**发生条件**：经典模式，2+ 角色窗口同时 active poll。
**规避方案**：
- _poll.js 实际间隔：首轮 3s、渐进放缓（3/5/8/12/20/30s），低功耗固定 3s——多角色并发时用内置 0-1.5s 随机抖动错开相位
- 遇到闪退后重开窗口即可恢复（公告牌和产出文件不受影响）
- 如果频繁闪退，改 _poll.js 的 intervals 数组（如整体上调至 5s 起），或给两个角色配不同 --phase（如 0 与 1300ms）
- 实弹佐证（2026-08-03）：本次 3 窗口常驻测试中贾维斯曾出现一次约 6 分钟无心跳无产出的真实中断（疑似闪退），自动恢复后跑完全程——闪退可恢复、不丢进度，但 monitor 会误报 DEAD 并写唤醒文件（见 心跳判定 A-1 修复）

---

## BUG 14：MSYS/git-bash 路径翻译 [2026-08-03 新增，实弹发现]

**现象**：角色在 bash 里执行 `node _poll.js /tmp/测试目录/文件` 等 POSIX 风格绝对路径参数时，MSYS 会**静默改写**参数（如 `/tmp/x` → `D:\tmp\x`），Node 收到被改写的路径 → ENOENT。
**根因**：MSYS/git-bash 对命令行参数做路径转换，规则藏在 MSYS 内部（改写部分参数、放过另一些），不可预测、不可在接收端反译。
**发生条件**：任何在 git-bash 下向 Node 传 POSIX 绝对路径参数的场景。
**规避方案**：
- **统一用相对路径**（`../我的世界/...`）——相对路径不以 `/` 开头，MSYS 不碰
- 确需绝对路径：用 `node -e` 内 `JSON.stringify(path)` 注入，或写成 `C:/x/y` 盘符形式（部分场景仍可能被改）
- **铁律**：工具脚本路径参数一律相对路径（`../我的世界/`），禁止 POSIX 绝对路径——与角色模板「等待脚本路径统一」同口径