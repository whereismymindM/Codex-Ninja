# 外部环境BUG清单（Windows + 中文 · bash/Reasonix）

> 本文档汇总在 Windows + bash（git-bash/MSYS）+ Reasonix 环境下运行多Agent协作时遇到的真实坑。
> **新项目启动前，所有角色 Agent 应先读本文档**（30 秒版必读，三原则速查覆盖 90%）。

---

## ⚡ 当前环境必读（30 秒版）

| 必读项 | 一句话 |
|---|---|
| **写完必须验证** | fs.statSync 验大小；replace() 后自检 newContent !== content |
| **MSYS 路径翻译** | 工具脚本路径参数一律相对路径（`../我的世界/`），禁止 POSIX 绝对路径（`/tmp` 会被改写成 `D:\tmp`） |
| **heredoc 挂死** | 等文件禁止 `bash heredoc + node`（引号出错 → bash 永久挂起，心跳断）——用 wait_file.js 或 write_file |
| **中文直写** | 中文长内容用 write_file 原生直写，零编码问题 |

---

## 三原则速查

| # | 原则 | 一句话 | 对应条目 |
|---|------|--------|---------|
| 1 | **写完必须验证** | fs.statSync 验大小；replace() 后自检 | replace 静默失败、超时假阴性 |
| 2 | **别用 heredoc 等文件** | 用 wait_file.js / 内联轮询，禁止 bash heredoc 长等 | heredoc 挂死 |
| 3 | **路径一律相对** | `../我的世界/`，禁止 POSIX 绝对路径（MSYS 会改写） | MSYS 路径翻译 |

---

## 1. 大文件读取：分页读，不一次性输出

**现象**：用 `node -e` 或一次性 `console.log` 输出长文件时，输出在几千字符处被截断——15000 字的文件只看到头尾，中间全丢。

**解法**：分页读，不一次性输出全文（或用 read_file 工具分页读）：

```javascript
var fs = require("fs");
var content = fs.readFileSync("目标文件.md", "utf8");
console.log("文件大小: " + content.length + " 字符");
console.log(content.substring(0, 2000));          // 头部
var pos = content.indexOf("第三章");               // 关键段落（indexOf 定位）
if (pos !== -1) console.log(content.substring(pos, pos + 2000));
console.log(content.substring(content.length - 2000)); // 尾部
```

一次只输出 2000 字，不触发截断。多跑几次覆盖全篇。

---

## 2. 超时假阴性：命令完成了但报超时

**现象**：工具调用返回超时，但输出中已包含操作成功的标志（如 LOCKED、DELIVERED、SIGNED）——实际工作已完成，外层先超时判定了。

**影响**：无法从退出码判断操作是否成功。

**解法**：
- 关键操作（lock/deliver/sign）给足超时
- **操作后主动验证结果**（如签字后检查文件是否存在），不盲信退出码
- 工具脚本（`_sign.js`/`_deliver.js`/`_lock.js`）已内置自检——优先用独立脚本，少手写

---

## 3. replace() 静默失败：匹配不到返回原文，不报错

**现象**：用 `String.replace()` 修改文件内容后，重新读文件发现根本没改——但没有任何报错。

**根本原因**：JS 的 `String.replace()` 匹配不到时**静默返回原字符串**——不抛异常、不打印警告。空格、换行（`\r\n` vs `\n`）、中文标点等细微差异都可能导致匹配失败。

**解法：强制自检**：

```javascript
var newContent = content.replace(oldStr, newStr);
if (newContent === content) {
    console.error("REPLACE_FAILED: 替换未命中！请检查匹配字符串的空白字符和标点");
    process.exit(1);
}
```

**更好的方案**：长文本修改不依赖全文 replace——定位到目标行号精确替换该行，或按章节标题 split → 只改目标段落 → join。

**核心原则：replace() 不可信——每次调用后必须自检 `newContent !== content`，不自检 = 在空气里挥拳。**

---

## 4. 桌面闪退（磁盘 I/O 过载）

**现象**：两个角色同时 poll 公告牌时，Reasonix 桌面突然关闭（不报错、不留日志）。

**根因**：poll 频繁读写磁盘，两个进程并发 → I/O 饱和 → 进程被系统杀掉。

**发生条件**：2+ 角色窗口同时 active poll。

**规避**：
- poll 间隔带内置随机抖动（0-1.5s）错开多角色相位
- 遇到闪退后重开窗口即可恢复（公告牌和产出文件不受影响）
- 频繁闪退 → 调大 poll 间隔

---

## 5. MSYS/git-bash 路径翻译

**现象**：在 bash 里执行 `node script.js /tmp/测试目录/文件` 等 POSIX 风格绝对路径参数时，MSYS 会**静默改写**参数（如 `/tmp/x` → `D:\tmp\x`），Node 收到被改写的路径 → ENOENT。

**根因**：MSYS/git-bash 对命令行参数做路径转换，规则藏在 MSYS 内部（改写部分参数、放过另一些）——不可预测、不可在接收端反译。

**规避**：
- **统一用相对路径**（`../我的世界/...`）——相对路径不以 `/` 开头，MSYS 不碰
- 确需绝对路径：用盘符形式（`C:/x/y`），或 `JSON.stringify(path)` 注入
- **铁律**：工具脚本路径参数一律相对路径（`../我的世界/`），禁止 POSIX 绝对路径——与 `_启动多步曲.md`「路径锚定铁律」同口径

---

## 6. 写临时脚本：用 write_file 原生直写

**现象**：用 heredoc / `cat >` 写含中文/反引号/正则的临时 JS 文件时，引号转义出错 → 内容被破坏或 bash 挂起。

**解法**：
- 临时脚本/中间文件写自己的 `临时脚本/` 目录，用 **write_file 原生直写**（零 shell、零转义问题）
- 含反引号/正则/反斜杠的内容禁用 heredoc
- 纯简单文本才可用 heredoc，且优先 write_file
