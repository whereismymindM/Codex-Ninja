# 外部环境BUG清单（PowerShell + 中文）

> 本文档汇总了在 Windows PowerShell 环境下运行多Agent协作时遇到的所有外部环境坑。
> 新项目启动前，所有角色Agent应先阅读本文档。也可考虑整合到 SKILL.md 中。

---

## 三原则速查（30秒看完，覆盖90%的坑）

下面 12 条 BUG 本质上就三条原则（BUG 8 历史废弃删除，编号保留不再重排）。新角色开工前先记住这三条，踩坑了再回来细查：

| # | 原则 | 一句话 | 覆盖的 BUG |
|---|------|--------|-----------|
| 1 | **别让 PowerShell 碰中文** | 读写中文文件走 Node.js 临时 .js 文件 | BUG 1, 2, 3 |
| 2 | **写完必须验证** | fs.statSync 验大小; replace() 后自检 | BUG 4, 12 |
| 3 | **REPL 是持久化运行时**（仅 Codex 版；Reasonix 已无 REPL） | 变量复用不复声明; 别依赖 homeDir | BUG 9, 10 |

> 编码细节：反引号别嵌套 Markdown 代码块用 lines.push()（BUG 11）；双窗口 poll 太密会 I/O 闪退间隔 >= 5 秒（BUG 13）。

---

### BUG 13：Reasonix 桌面闪退（磁盘 I/O 过载）

**现象**：两个角色同时 poll 公告牌时，Reasonix 桌面突然关闭（不报错、不留日志）。
**根因**：_poll.js 频繁读写磁盘，两个进程并发 → I/O 饱和 → Reasonix 进程被系统杀掉。
**发生条件**：经典模式，2+ 角色窗口同时 active poll。
**规避方案**：
- _poll.js 实际间隔：首轮 3s、渐进放缓（3/5/8/12/20/30s），低功耗固定 3s——多角色并发时用内置 0-1.5s 随机抖动错开相位
- 遇到闪退后重开窗口即可恢复（公告牌和产出文件不受影响）
- 如果频繁闪退，改 _poll.js 的 intervals 数组（如整体上调至 5s 起），或给两个角色配不同 --phase（如 0 与 1300ms）

---

---

## BUG 1：node -e 内联 + 中文 = 灾难 [最严重]

**现象**：用 `node -e` 执行包含中文的 JavaScript 代码时，Node 报 `SyntaxError: Unexpected identifier` 或 `Unterminated string constant`。

**根本原因**：中文弯引号（“”）、破折号（—）、省略号（…）甚至中文括号【】等 Unicode 字符，在 PowerShell 传参给 Node 时经过双重解析——PowerShell 先吃一遍字符串，Node 再吃一遍——导致字符被错误解析为 JS 字符串界定符。

**触发条件**：
- 在 `node -e` 的反引号模板字面量中写中文 -> 必炸
- 通过 PowerShell 管道（`@'...'@ | node -`）传中文内容 -> 必炸
- 即使不走管道，纯 `node -e "..."` 里包含弯引号也可能炸

**唯一可靠解法：临时 .js 文件**

> ⚠️ **跨进程传 Windows 路径的额外注意**：当你需要把路径注入到生成的 JS 代码时（比如生成子进程脚本），不要直接拼接字符串——`{{项目根目录}}` 中的 `\U`、`\D` 会被当成 Unicode 转义符。**统一用 `JSON.stringify(path)` 安全注入**，确保路径被正确转义。这是最稳妥的跨进程路径传递方式。

```powershell
# 第1步：把写入逻辑写到临时 .js 文件
@'
var fs = require("fs");
var content = `你要写的长中文内容`;
fs.writeFileSync("目标文件.md.tmp", content, "utf8");
fs.renameSync("目标文件.md.tmp", "目标文件.md");
''@ | Set-Content -Encoding UTF8 _write_temp.js

# 第2步：执行临时文件
node _write_temp.js

# 第3步：清理
Remove-Item _write_temp.js
```

**关键要点**：
- JS 内容用反引号模板字面量 `` ` ``，不用双引号——避免转义噩梦
- `.tmp` -> rename，原子写入——防止搭档读到半截文件
- 跑完立刻删 `_write_temp.js`，别留垃圾

---

## BUG 2：PowerShell Get-Content 默认编码导致中文乱码

**现象**：`Get-Content -Raw` 读中文文件，输出全是乱码。

**原因**：PowerShell 5.x 默认用系统编码（GBK/ASCII）而不是 UTF-8。

**解决方案**：
- 读中文文件：永远加 `-Encoding UTF8`
  ```powershell
  Get-Content -Path file.md -Encoding UTF8 -Raw
  ```
- 更好的方案：直接用 Node.js 读写中文文件，默认 UTF-8，不翻车
  ```javascript
  var fs = require("fs");
  var content = fs.readFileSync("file.md", "utf8");  // 读
  fs.writeFileSync("file.md", content, "utf8");       // 写
  ```

---

## BUG 3：PowerShell 对 `--` 的解析冲突 [已规避]

**现象**：`node -e` 内联脚本中出现 `--` 时，PowerShell 将其解析为运算符。

**实际影响**：`_poll.js --signal` 的 `--` 是作为 `shell_command` 参数传入的，未被 PowerShell 拦截。临时 .js 文件方案也完全绕过了这个坑。

**规避方案**：含 `--` 的代码（如 CSS `var(--color-xxx)`）不要放 `node -e` 里；用临时 .js 文件执行。

---

## BUG 4：大文件读取超时 + 输出截断 + PowerShell 启动慢

**现象**：
- 用 `node -e` 读长文件时 shell_command 超时（默认 10 秒）
- 即使不超时，输出也会在几千字符处被截断（stdout 缓冲区上限），15000 字的文件只看到头尾，中间全丢

**原因**：`fs.readFileSync` + `console.log` 输出到终端时，PowerShell 管道既有耗时瓶颈又有容量上限。此外，**PowerShell 命令本身启动就需要 5-10 秒**——即使是简单的 `Start-Sleep`，通过 `execSync` 调用也会拖慢整体流程。这就是为什么 `_poll.js` 的 `safeSleep` 做了降级：先试 PowerShell，失败了切 Node.js 忙等。

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
## BUG 6：PowerShell here-string 被中文内容打断

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
## 总结：一套组合拳解决所有问题

| 场景 | 不要用 | 要用 |
|------|--------|------|
| 写中文文件 | `node -e` | 临时 .js 文件 -> `node` 执行 -> 删除 |
| 读中文文件 | `Get-Content` 不加 `-Encoding UTF8` | `fs.readFileSync(path, "utf8")` |
| 长文件操作 | 默认 10s timeout + 一次性 console.log | `timeout_ms: 30000` + 分段 substring 输出 |
| 含 `--` 的代码 | `node -e` 内联 | 临时 .js 文件 |

**核心原则：在 PowerShell 环境下，凡是涉及中文内容的操作，一步到位用 Node.js + 临时 .js 文件——别跟 `node -e` 较劲。**

---
---

> BUG 8：历史编号已废弃删除（内容并入其他条目）。编号不再重排以保持既有引用稳定。

## BUG 9：Node REPL 变量名冲突 [v1.4 新增]（⚠️ 仅 Codex 版有效——Reasonix 已无 REPL js() 工具，此条仅为历史参考）

适用范围：仅单窗口模式。

现象：在 REPL 中多次调用 js 工具时，第二次报 "Identifier has already been declared"。

原因：REPL 的顶层绑定是持久化的。第一次 const fs = await import(...) 之后，第二次再用 const fs = ... 就冲突。

解法：
- 第一次 const 声明后，后续直接复用已有变量名
- 或用 var 声明可重复赋值的变量
- 实在混乱：调用 js_reset 清空 REPL 重新开始

核心原则：单窗口模式下，REPL 是持久化运行时——"第一次声明，后续复用"。

---

## BUG 10：nodeRepl.homeDir 为 null [v1.4 新增]（⚠️ 仅 Codex 版有效）

适用范围：仅单窗口模式。

现象：REPL 中 nodeRepl.homeDir 返回 null，基于它拼接的路径全部失败。

原因：REPL 运行在子进程中，没有暴露宿主用户的 home 目录（只有 cwd 和 tmpDir）。

解法：
- 绝对路径直接硬编码或用 nodeRepl.cwd 推导
- 在 spawn sub-agent 的 message 中传入项目绝对路径

核心原则：别依赖 homeDir——把路径传给 sub-agent，让它直接用。
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

**核心原则：写长中文 Markdown 到 JS 文件时——永远不用模板字面量，用 lines.push()。** BUG 1 警告了 node -e + 中文但没警告模板字面量 + Markdown 反引号的嵌套冲突——本 BUG 补齐这个盲区。
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