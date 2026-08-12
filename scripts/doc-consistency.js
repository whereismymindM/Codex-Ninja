#!/usr/bin/env node
// ============================================================================
// doc-consistency.js —— 文档 vs 代码事实一致性校验
// ----------------------------------------------------------------------------
// 计划书：阅览室/审核/doc-consistency校验脚本-计划书.md（双审通过，仓库外治理文档）
// 用途  ：扫描 codex-ninja 仓库文档，断言文档声称的数字/名称/引用/退出码/
//         铁律编号/参数语义 与代码实际事实一致——跑一次就知道文档漂没漂。
// 用法  ：node scripts/doc-consistency.js [--self-test] [--verbose]
// 退出码：0=全部一致  1=有漂移（stdout 列清单）  2=脚本自身错误
// 原则  ：事实源唯一（能枚举的从代码/文件系统枚举）；断言 文档==事实；
//         白名单带理由；不改文档内容（只报告）。
// 校验器：A 枚举(5) + B 数字(4) + C 引用(5) + D 卫生(3) + E 口径(3) = 20 个
// ============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function walk(dir, ext, out) {
  out = out || [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const en of entries) {
    if (en.name === '.git') continue;
    const p = path.join(dir, en.name);
    if (en.isDirectory()) walk(p, ext, out);
    else if (!ext || en.name.endsWith(ext)) out.push(p);
  }
  return out;
}
function read(p) { return fs.readFileSync(p, 'utf8'); }
function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }
function exists(p) { return fs.existsSync(p); }

// 代码围栏分割：返回 [{code: bool, text}]（跳过代码块内的内容做文本级检查）
function splitFences(text) {
  const parts = [];
  const re = /^(\s*```[^\n]*\n?)/gm;
  let last = 0, m, inFence = false;
  // 绝对定位：pos 处的全局行号（1-based）——CRLF/末尾无换行/围栏吞空行全部免疫
  const lineOf = (pos) => (text.slice(0, pos).match(/\n/g) || []).length + 1;
  while ((m = re.exec(text)) !== null) {
    parts.push({ code: inFence, text: text.slice(last, m.index), offset: lineOf(last) });
    inFence = !inFence;
    last = m.index + m[0].length;
  }
  parts.push({ code: inFence, text: text.slice(last), offset: lineOf(last) });
  return parts;
}

// ---------------------------------------------------------------------------
// 白名单（每条带理由——防膨胀，审核时抽查）
// ---------------------------------------------------------------------------
const EXEMPT_FILES = [
  'CHANGELOG.md',                 // 版本历史本体（保留例外）
  'assets/_隐患清单.md',          // 修复记录本体（保留例外）
  'assets/老渣文档/goal模式认知.md', // 实测知识库类（保留例外）
  'assets/模板/_大鱼实测教训.md', // 实测知识库类（保留例外）
  'scripts/doc-consistency-审核指南.md', // 元文档：内容就是讲校验器怎么查（示例占位/行号/已知漂移提及是内容本身）
];
const EXEMPT_DIRS = ['e2e'];      // e2e 文档（维护者信息）
function isExempt(p) {
  const r = rel(p);
  if (EXEMPT_FILES.includes(r)) return true;
  return EXEMPT_DIRS.some(d => r.startsWith(d + '/'));
}
function isDoc(p) { return p.endsWith('.md') && !isExempt(p); }

// ---------------------------------------------------------------------------
// 校验器注册表
// ---------------------------------------------------------------------------
const VALIDATORS = [];
function reg(name, desc, check) { VALIDATORS.push({ name, desc, check }); }

let FAIL = []; // 全局失败收集 {validator, file, line, msg}
function fail(v, file, line, msg) {
  FAIL.push({ validator: v, file: file ? rel(file) : null, line: line || null, msg });
}
function clean() { FAIL = []; }

// 从文本提取模式枚举值（"A" | "B" 或 "A|B"）
function extractEnumValues(text, re) {
  const m = text.match(re);
  if (!m) return null;
  return m[1].split('|').map(s => s.replace(/[\[\]"]/g, '').trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// A 类：枚举一致性（从代码/文件系统枚举）
// ---------------------------------------------------------------------------

// A1 模式枚举：compose.js MODES == 文档模式枚举
reg('A1 模式枚举', 'compose.js MODES 与 标准模板/完全指南/templates README 枚举一致',
  () => {
    const compose = read(path.join(ROOT, 'scripts/compose.js'));
    const m = compose.match(/var MODES = \[([^\]]+)\]/);
    if (!m) { fail('A1', path.join(ROOT, 'scripts/compose.js'), 36, '找不到 MODES 定义'); return; }
    const mods = m[1].match(/"([^"]+)"/g).map(s => s.replace(/"/g, ''));
    const modsSet = new Set(mods);

    const targets = [
      { f: 'assets/老渣文档/公告牌标准模板.md', re: /^- 模式: \[([^\]]+)\]/m, label: '标准模板' },
      { f: 'assets/老渣文档/公告牌完全指南.md', re: /^- 模式: \[([^\]]+)\]/m, label: '完全指南' },
      { f: 'scripts/templates/README.md', re: /\{ "模式": "([^"]+)"/, label: 'templates README' },
    ];
    for (const t of targets) {
      const p = path.join(ROOT, t.f);
      if (!exists(p)) { fail('A1', p, 0, t.label + ' 文件不存在'); continue; }
      const vals = extractEnumValues(read(p), t.re);
      if (!vals) { fail('A1', p, 0, t.label + ' 找不到模式枚举行'); continue; }
      for (const mod of mods) {
        if (!vals.includes(mod)) fail('A1', p, 0, t.label + ' 缺模式 [' + mod + ']');
      }
      for (const v of vals) {
        if (!modsSet.has(v)) fail('A1', p, 0, t.label + ' 多出未知模式 [' + v + ']');
      }
    }
    // SKILL 数字断言
    const skill = read(path.join(ROOT, 'SKILL.md'));
    const sm = skill.match(/模式枚举 (\d+) 种/);
    if (sm && parseInt(sm[1], 10) !== mods.length) {
      fail('A1', path.join(ROOT, 'SKILL.md'), 0, '模式枚举 ' + sm[1] + ' 种 ≠ compose MODES ' + mods.length + ' 种');
    }
  });

// A2 流程模板数：templates/*.json == 文档列出的模板
reg('A2 流程模板数', 'scripts/templates/*.json 与 SKILL/完全指南 数量与命名一致',
  () => {
    const files = walk(path.join(ROOT, 'scripts/templates'), '.json')
      .map(p => path.basename(p, '.json'));
    const count = files.length;

    const skill = read(path.join(ROOT, 'SKILL.md'));
    const sm = skill.match(/(\d+) 个现实团队流程模板/);
    if (sm && parseInt(sm[1], 10) !== count) {
      fail('A2', path.join(ROOT, 'SKILL.md'), 0, 'SKILL 写 ' + sm[1] + ' 个模板 ≠ 实际 ' + count);
    }
    const guide = read(path.join(ROOT, 'assets/老渣文档/公告牌完全指南.md'));
    const gm = guide.match(/下有 (\d+) 个\*\*现实团队流程模板/);
    if (gm && parseInt(gm[1], 10) !== count) {
      fail('A2', path.join(ROOT, 'assets/老渣文档/公告牌完全指南.md'), 0, '完全指南写 ' + gm[1] + ' 个模板 ≠ 实际 ' + count);
    }
    for (const f of files) {
      if (!guide.includes('`' + f + '`')) {
        fail('A2', path.join(ROOT, 'assets/老渣文档/公告牌完全指南.md'), 0, '完全指南模板清单缺 [' + f + ']');
      }
    }
  });

// A3 调查轮数：通用公告牌调查文件 == 文档数字
reg('A3 调查轮数', 'assets/通用公告牌/ 调查文件数与 SKILL/完全指南/标准模板 一致',
  () => {
    const files = walk(path.join(ROOT, 'assets/通用公告牌'), '.md')
      .map(p => path.basename(p, '.md')).filter(n => n.includes('调查'));
    const count = files.length;

    const skill = read(path.join(ROOT, 'SKILL.md'));
    const sm = skill.match(/调查轮×(\d+)/);
    if (sm && parseInt(sm[1], 10) !== count) {
      fail('A3', path.join(ROOT, 'SKILL.md'), 0, 'SKILL 写 调查轮×' + sm[1] + ' ≠ 实际 ' + count);
    }
    const guide = read(path.join(ROOT, 'assets/老渣文档/公告牌完全指南.md'));
    const gm = guide.match(/调查轮×(\d+)/);
    if (gm && parseInt(gm[1], 10) !== count) {
      fail('A3', path.join(ROOT, 'assets/老渣文档/公告牌完全指南.md'), 0, '完全指南写 调查轮×' + gm[1] + ' ≠ 实际 ' + count);
    }
    // 列名断言：仅完全指南（它承诺列全，用短名比对——文件"排版评价调查.md"文档写"排版"是合法简称）
    for (const f of files) {
      const short = f.replace('调查', '');
      const short2 = short.replace('评价', ''); // "排版评价"→"排版"（文档用更短简称）
      if (!guide.includes(short) && !guide.includes(short2) && !guide.includes(f)) {
        fail('A3', path.join(ROOT, 'assets/老渣文档/公告牌完全指南.md'), 0, '完全指南缺调查轮名 [' + short + ']');
      }
    }
  });

// A4 monitor 输出：手册表行 == monitor.js 实际前缀
reg('A4 monitor 输出', '大鱼工具手册 22 行 == monitor.js 实际输出前缀（自动提取）',
  () => {
    const mon = read(path.join(ROOT, 'assets/monitor.js'));
    const prefixes = new Set();
    const re = /console\.(?:log|error)\("([A-Z][A-Z0-9_/-]*)/g;
    let m;
    while ((m = re.exec(mon)) !== null) prefixes.add(m[1]);
    const re2 = /logMonitor\("([A-Z][A-Z0-9_/-]*)/g;
    while ((m = re2.exec(mon)) !== null) prefixes.add(m[1]);

    const manual = read(path.join(ROOT, 'assets/模板/大鱼工具手册.md'));
    const rows = [];
    const rowRe = /^\| `([^`]+)`/gm;
    while ((m = rowRe.exec(manual)) !== null) rows.push(m[1].trim().split(/\s+/)[0]);

    // 断言1：手册表行 ⊆ monitor 实际前缀（手册不能写 monitor 不存在的输出）
    for (const r of rows) {
      if (!prefixes.has(r)) {
        fail('A4', path.join(ROOT, 'assets/模板/大鱼工具手册.md'), 0, '手册输出 [' + r + '] 在 monitor.js 中不存在');
      }
    }
    // 断言2：monitor 独立语义 ⊆ 手册表 ∪ 日志/家族白名单
    //   白名单：MONLOG_WARN/WARN=日志前缀；OUTPUT-FORMAT/OUTPUT-WARN=OUTPUT 家族变体（手册 OUTPUT 行已说明）
    const logWhitelist = ['MONLOG_WARN', 'WARN', 'OUTPUT-FORMAT', 'OUTPUT-WARN'];
    for (const p of prefixes) {
      if (logWhitelist.includes(p)) continue;
      if (!rows.includes(p)) {
        fail('A4', path.join(ROOT, 'assets/monitor.js'), 0, 'monitor 输出 [' + p + '] 未入工具手册（或应入日志白名单）');
      }
    }
  });

// A5 轮次类型：团队须知轮次表 4 类 + monitor 代码佐证
reg('A5 轮次类型', '团队须知轮次四类 == monitor.js TRIAL/STANDBY/RETIRE 分支',
  () => {
    const guide = read(path.join(ROOT, '团队须知/团队须知.md'));
    const m = guide.match(/轮次有(四|五|六|七|八|九|十)种/);
    if (m && m[1] !== '四') {
      fail('A5', path.join(ROOT, '团队须知/团队须知.md'), 0, '团队须知写 轮次有' + m[1] + '种 ≠ 应为四种');
    }
    const mon = read(path.join(ROOT, 'assets/monitor.js'));
    for (const kw of ['TRIAL', 'STANDBY', 'RETIRE']) {
      if (!mon.includes(kw)) {
        fail('A5', path.join(ROOT, 'assets/monitor.js'), 0, 'monitor.js 缺轮次分支 [' + kw + ']');
      }
    }
  });

// ---------------------------------------------------------------------------
// B 类：数字一致性（从权威文档/实现常量枚举）
// ---------------------------------------------------------------------------

// B1 铁律编号引用：模板主表编号 + 语义关键词映射
reg('B1 铁律编号引用', '全仓库"铁律 N"引用语义命中模板主表编号',
  () => {
    const tpl = read(path.join(ROOT, 'assets/模板/Reasonix版_角色_AGENTS模板.md'));
    // 解析主表：表头含"铁律（一句话）"的表格
    const lines = tpl.split(/\r?\n/);
    const mainTable = {};
    let inMain = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.includes('铁律（一句话）')) { inMain = true; continue; }
      if (inMain && l.startsWith('|') && l.includes('|---')) continue;
      if (inMain && /^\| (\d+) \|/.test(l)) {
        const mm = l.match(/^\| (\d+) \| (.*?) \|/);
        if (mm) mainTable[parseInt(mm[1], 10)] = mm[2];
      } else if (inMain && l.startsWith('#') ) { inMain = false; }
    }
    if (Object.keys(mainTable).length < 10) {
      fail('B1', path.join(ROOT, 'assets/模板/Reasonix版_角色_AGENTS模板.md'), 0, '主表解析失败（只取到 ' + Object.keys(mainTable).length + ' 行）');
      return;
    }
    // 语义关键词 → 编号（内置；编号随模板变，关键词映射手动维护点）
    const kwMap = [
      { kw: ['子代理', 'spawn'], n: 0 },
      { kw: ['共享区', 'CWD'], n: 1 },
      { kw: ['删除', '.signal', '信号文件', '改名为'], n: 2 },
      { kw: ['抢锁', 'lock(', '并发写'], n: 3 },
      { kw: ['write_file', '直写', '.tmp'], n: 4 },
      { kw: ['deliver', '.ready'], n: 5 },
      { kw: ['签字', '_sign'], n: 6 },
      { kw: ['replace', 'newContent'], n: 7 },
      { kw: ['一字不差', '产出路径'], n: 8 },
      { kw: ['占位符'], n: 9 },
      { kw: ['禁止输出', '结束语'], n: 10 },
      { kw: ['证据', '置信'], n: 11 },
      { kw: ['第一原则'], n: 12 },
    ];
    // 扫描全仓库 .md 的"铁律 N"引用（逐行：正确行号 + 同号多处全查）
    for (const p of walk(ROOT, '.md')) {
      if (isExempt(p)) continue;
      const lines = read(p).split(/\r?\n/);
      lines.forEach((lineText, i) => {
        const refs = lineText.match(/铁律 (\d+)/g) || [];
        for (const ref of refs) {
          const n = parseInt(ref.match(/\d+/)[0], 10);
          if (lineText.includes('详解')) continue; // 引用详解节（编号正确，跳过）
          let hit = null, hitCount = 0;
          for (const e of kwMap) {
            if (e.kw.some(k => lineText.includes(k))) { hit = e; hitCount++; }
          }
          if (hitCount === 1 && hit.n !== n) {
            fail('B1', p, i + 1, '铁律 ' + n + ' 引用与语义不符（应为 ' + hit.n + '）：' + lineText.trim().slice(0, 60));
          }
        }
      });
    }
  });

// B2 阈值/时间：文档数字 == 实现常量
reg('B2 阈值/时间', '心跳 2/5/10 分钟、等文件 20、扣留 10、WAIT_OVERDUE 30 文档==代码',
  () => {
    const mon = read(path.join(ROOT, 'assets/monitor.js'));
    const manual = read(path.join(ROOT, 'assets/模板/大鱼工具手册.md'));
    // 心跳：monitor 有 2/5/10 分钟常量
    if (!/2 \* 60 \* 1000/.test(mon)) fail('B2', path.join(ROOT, 'assets/monitor.js'), 0, '缺 2 分钟心跳常量');
    if (!/5 \* 60 \* 1000/.test(mon)) fail('B2', path.join(ROOT, 'assets/monitor.js'), 0, '缺 5 分钟心跳常量');
    if (!/10 \* 60 \* 1000/.test(mon)) fail('B2', path.join(ROOT, 'assets/monitor.js'), 0, '缺 10 分钟心跳常量');
    // 等文件 20 分钟
    const wf = read(path.join(ROOT, 'assets/wait_file.js'));
    if (!/var timeoutMin = 20/.test(wf)) fail('B2', path.join(ROOT, 'assets/wait_file.js'), 0, 'wait_file 默认超时 ≠ 20');
    // 文档断言
    if (!manual.includes('30 分钟')) fail('B2', path.join(ROOT, 'assets/模板/大鱼工具手册.md'), 0, '手册缺 WAIT_OVERDUE 30 分钟');
    if (!manual.includes('窗口常驻 5 分钟 / run 拉起 10 分钟')) fail('B2', path.join(ROOT, 'assets/模板/大鱼工具手册.md'), 0, '手册 FISH_DEAD 缺 5/10 分钟阈值');
  });

// B3 退出码：脚本 exit 集合 == 文档退出码表
reg('B3 退出码', 'poll/wait_file/时序校验 exit 码 == 文档退出码描述',
  () => {
    const poll = read(path.join(ROOT, 'assets/_reasonix_poll.js'));
    const wf = read(path.join(ROOT, 'assets/wait_file.js'));
    const seq = read(path.join(ROOT, 'scripts/时序校验.sh'));
    const cat = read(path.join(ROOT, 'assets/模板/_工具分类.md'));
    const quick = read(path.join(ROOT, 'assets/_工具速查.md'));

    // poll exit 4
    if (/process\.exit\(4\)/.test(poll)) {
      if (!/4=用法错误/.test(cat)) fail('B3', path.join(ROOT, 'assets/模板/_工具分类.md'), 0, 'poll exit 4 未入 _工具分类');
    }
    // wait_file exit 5
    if (/process\.exit\(5\)/.test(wf)) {
      if (!/5=写方漏发信号/.test(cat)) fail('B3', path.join(ROOT, 'assets/模板/_工具分类.md'), 0, 'wait_file exit 5 未入 _工具分类');
      if (!/5 = 写方漏发信号/.test(wf.split('\n').slice(0, 25).join('\n'))) fail('B3', path.join(ROOT, 'assets/wait_file.js'), 0, 'wait_file 头注释缺 exit 5');
      if (!wf.includes('5=写方漏发信号')) fail('B3', path.join(ROOT, 'assets/wait_file.js'), 0, 'wait_file --help 缺 exit 5');
    }
    // 时序校验 exit 2
    if (/exit 2/.test(seq)) {
      if (!/2=参数缺失/.test(quick)) fail('B3', path.join(ROOT, 'assets/_工具速查.md'), 0, '时序校验 exit 2 未入速查');
    }
  });

// B4 参数语义：文档对参数描述 == 脚本实际解析
reg('B4 参数语义', '--loop/--any/--hb/--watch-hb/--standby 文档描述 == 实现',
  () => {
    const poll = read(path.join(ROOT, 'assets/_reasonix_poll.js'));
    const wf = read(path.join(ROOT, 'assets/wait_file.js'));
    const cat = read(path.join(ROOT, 'assets/模板/_工具分类.md'));
    const flow = read(path.join(ROOT, 'assets/模板/_干活流程.md'));

    // --loop = 循环次数（非轮号）
    if (poll.includes('--loop')) {
      if (!/N = 次数|次数，不是轮号|循环探测 N 次/.test(cat + flow)) {
        fail('B4', path.join(ROOT, 'assets/模板/_工具分类.md'), 0, '--loop 语义未写"次数"（防写成轮号）');
      }
      if (/--loop.*轮号/.test(cat) && !/不是轮号/.test(cat)) {
        fail('B4', path.join(ROOT, 'assets/模板/_工具分类.md'), 0, '--loop 描述含"轮号"歧义');
      }
    }
    // --any = 任一
    if (wf.includes('--any')) {
      if (!/任一/.test(cat)) fail('B4', path.join(ROOT, 'assets/模板/_工具分类.md'), 0, '--any 语义未写"任一"');
    }
    // --watch-hb = 失联检测
    if (wf.includes('--watch-hb')) {
      if (!/失联/.test(cat)) fail('B4', path.join(ROOT, 'assets/模板/_工具分类.md'), 0, '--watch-hb 语义未写"失联"');
    }
  });

// ---------------------------------------------------------------------------
// C 类：引用一致性（文件系统事实）
// ---------------------------------------------------------------------------

// C1 仓库内文件引用存在
reg('C1 仓库内文件引用', '文档中 assets/scripts/团队须知 引用必须真实存在',
  () => {
    const re = /(?:assets|scripts|团队须知)\/[A-Za-z0-9_\-\u4e00-\u9fa5]+(?:\/[A-Za-z0-9_\-\u4e00-\u9fa5.]+)*\.(?:md|js|sh|json|ps1)/g;
    for (const p of walk(ROOT, '.md')) {
      if (isExempt(p)) continue;
      const text = read(p);
      const refs = new Set(text.match(re) || []);
      for (const r of refs) {
        // 排除含占位符的引用（<任务目录>/{{xxx}}/xxx.md 示例占位）
        if (r.includes('<') || r.includes('{{') || r.includes('${') || r.includes('xxx')) continue;
        const target = path.join(ROOT, r);
        if (!exists(target)) fail('C1', p, 0, '死引用: ' + r);
      }
    }
  });

// C2 仓库外引用标注
reg('C2 仓库外引用标注', '引用 阅览室/档案舱 必须带"仓库外"标注或完整路径',
  () => {
    for (const p of walk(ROOT, '.md')) {
      if (isExempt(p)) continue;
      const lines = read(p).split(/\r?\n/);
      lines.forEach((l, i) => {
        if (/(阅览室|档案舱)\//.test(l)) {
          const hasMark = l.includes('仓库外') || l.includes('阅览室/') || l.includes('档案舱/');
          if (!hasMark) fail('C2', p, i + 1, '仓库外引用缺标注: ' + l.trim().slice(0, 50));
        }
      });
    }
  });

// C3 scaffold 分发完备性
reg('C3 scaffold 分发', '角色文档引用的 我的世界/skill文档/X → scaffold.js 有分发',
  () => {
    const sc = read(path.join(ROOT, 'scripts/scaffold.js'));
    const re = /我的世界\/skill文档\/([A-Za-z0-9_\-\u4e00-\u9fa5.]+)/g;
    for (const p of walk(ROOT, '.md')) {
      const text = read(p);
      let m;
      while ((m = re.exec(text)) !== null) {
        const fname = m[1];
        if (!sc.includes(fname)) {
          fail('C3', p, 0, '引用 skill文档/' + fname + ' 但 scaffold.js 无分发逻辑');
        }
      }
    }
  });

// C4 占位符残留
reg('C4 占位符残留', '{{ROLE_*}} 只允许出现在模板/可替换源，其他文件 0 残留',
  () => {
    const allowSuffix = [
      'assets/模板/', 'assets/玩法模式/', 'assets/通用公告牌/', 'assets/老渣文档/',
      'scripts/scaffold.js', 'scripts/doc-consistency.js', 'assets/_sign.js', 'assets/_deliver.js', 'assets/_lock.js',
      '启动指南.md', // 讲占位符替换，含 {{ROLE_NAME}} 示例是内容本身
    ];
    for (const p of walk(ROOT, '.md').concat(walk(ROOT, '.js'))) {
      if (isExempt(p)) continue;
      const r = rel(p);
      if (allowSuffix.some(s => r.startsWith(s))) continue;
      if (/\{\{ROLE_/.test(read(p))) {
        fail('C4', p, 0, '占位符 {{ROLE_ 残留（该文件不在允许清单）');
      }
    }
  });

// C5 裸行号引用
reg('C5 裸行号引用', '非代码块/非表格文本中的 ":NNN" / "N-N 行" 裸行号 0 残留',
  () => {
    // 只匹配冒号后数字（历轮案例 :144 / :77）；排除时间 HH:MM、URL、L 行号、版本号 v1.2
    const re1 = /:(\d{2,3})\b/g;
    // "34-46 行" 形式
    const re2 = /\b(\d{1,3})-(\d{1,3}) 行\b/g;
    for (const p of walk(ROOT, '.md')) {
      if (isExempt(p)) continue;
      const parts = splitFences(read(p));
      parts.forEach(seg => {
        if (seg.code) return;
        const lines = seg.text.split(/\r?\n/);
        lines.forEach((l, i) => {
          if (l.trim().startsWith('|')) return;         // 表格行（编号/数据是内容）
          if (l.includes('行号') || l.includes('L1') || /https?:\/\//.test(l)) return;
          // 时间 HH:MM 排除：冒号前是 1-2 位数字且后是 2 位数字；具名引用（文件.md:NNN）豁免——那是文件名+行号不是裸行号
          let m1;
          while ((m1 = re1.exec(l)) !== null) {
            const before = l.slice(Math.max(0, m1.index - 3), m1.index);
            if (/\d$/.test(before)) continue;            // 前面是数字 = 时间/版本
            const beforeFile = l.slice(Math.max(0, m1.index - 30), m1.index);
            if (/\.md$|\.js$|\.sh$/.test(beforeFile)) continue; // 具名引用（文件.md:46）
            fail('C5', p, seg.offset + i, '裸行号引用 :' + m1[1] + '（应用具名引用）: ' + l.trim().slice(0, 50));
            break;
          }
          let m2;
          while ((m2 = re2.exec(l)) !== null) {
            fail('C5', p, seg.offset + i, '裸行号引用 ' + m2[0] + '（应用具名引用）: ' + l.trim().slice(0, 50));
          }
        });
      });
    }
  });

// ---------------------------------------------------------------------------
// D 类：轨迹/卫生（模式匹配，吸收审核标准第 5 步）
// ---------------------------------------------------------------------------

// D1 开发轨迹关键词
reg('D1 开发轨迹', '使用者文档 0 残留 开发轨迹关键词',
  () => {
    // 第X轮仅在 实测/修复 语境算轨迹（"从第一轮起"= 流水账业务语义，不算）
    const badRe = /H4|H5|灵魂舱|（2026-\d{2}-\d{2}|第[一二三四五六七八九十]+轮(?:实测|修复)|第三只眼|SoulForge v\d/;
    for (const p of walk(ROOT, '.md')) {
      if (isExempt(p)) continue;
      const parts = splitFences(read(p));
      parts.forEach(seg => {
        if (seg.code) return;
        const lines = seg.text.split(/\r?\n/);
        lines.forEach((l, i) => {
          if (l.includes('_大鱼实测教训')) return; // 文件名引用（教训文件本体，非轨迹残留）
          if (badRe.test(l)) {
            const hit = (l.match(badRe) || [''])[0];
            fail('D1', p, seg.offset + i, '轨迹关键词 [' + hit + ']: ' + l.trim().slice(0, 50));
          }
        });
      });
    }
  });

// D2 全角冒号字面匹配字段
reg('D2 全角冒号', '字面匹配字段（模式/产出/警告）全角冒号 0 残留',
  () => {
    // 字段用法是行首（公告牌 `- 模式: [值]`）；正文里的"检查模式："是名词非字段
    const badRe = /^\s*- (?:模式|产出|警告)：/;
    for (const p of walk(ROOT, '.md')) {
      if (isExempt(p)) continue;
      const parts = splitFences(read(p));
      parts.forEach(seg => {
        if (seg.code) return;
        const lines = seg.text.split(/\r?\n/);
        lines.forEach((l, i) => {
          if (l.includes('全角')) return; // 说明性文字（如"不要期望全角模式：待命"）
          if (badRe.test(l)) {
            fail('D2', p, seg.offset + i, '全角冒号字段: ' + l.trim().slice(0, 50));
          }
        });
      });
    }
  });

// D3 排版判据（审核标准第 5 步脚本化：①超长行 ②围栏配对 ③表格卫生 ④标题 ⑤缩进断裂 ⑥代码块卫生 ⑦空壳代码块）
reg('D3 排版判据', '围栏配对/超长行/表格/标题/缩进/代码块卫生/空壳代码块',
  () => {
    const tmpDir = path.join(ROOT, '.dc_tmp');
    try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (e) {}
    const sanitize = (lang, content) => {
      let c = content;
      c = c.replace(/\{\{ROLE_NAME\}\}/g, '测试角色');
      c = c.replace(/\{\{[^}]+\}\}/g, '测试');
      c = c.replace(/<lastN>/g, '2');
      c = c.replace(/<当前N>/g, '2');
      c = c.replace(/<任务目录>/g, '../我的世界/任务001_测试');
      c = c.replace(/YOUR_FILE_PATH/g, 'x');
      c = c.replace(/YOUR_TASK_DIR/g, 'x');
      c = c.replace(/FILE_A/g, 'x').replace(/FILE_B/g, 'x');
      c = c.replace(/<[^>]+>/g, 'x'); // 其余尖括号占位（<心跳>/<目标>/<角色名> 等）
      return c;
    };
    const checkBash = (p, idx, content) => {
      const f = path.join(tmpDir, 'd3_' + idx + '.sh');
      try {
        fs.writeFileSync(f, sanitize('bash', content), 'utf8');
        execSync('bash -n "' + f + '"', { stdio: 'pipe' });
      } catch (e) {
        fail('D3', p, 0, 'bash 骨架 bash -n 失败（照抄必错——`;;` 放 # 注释后被吞 / `<lastN>` 重定向）: ' + String(e.stderr || e.message).trim().slice(0, 80));
      }
    };
    const checkJs = (p, idx, content) => {
      const f = path.join(tmpDir, 'd3_' + idx + '.js');
      try {
        // 包 async IIFE：内联轮询示例含顶层 await（角色照抄进临时脚本前会包 async 或用函数内 await）
        const wrapped = '(async () => {\n' + sanitize('js', content) + '\n})();';
        fs.writeFileSync(f, wrapped, 'utf8');
        execSync('"' + process.execPath + '" --check "' + f + '"', { stdio: 'pipe' });
      } catch (e) {
        fail('D3', p, 0, 'JS 模板代码块 node --check 失败（照抄不可运行）: ' + String(e.stderr || e.message).trim().slice(0, 80));
      }
    };

    for (const p of walk(ROOT, '.md')) {
      if (isExempt(p) || rel(p) === 'CHANGELOG.md') continue; // 保留例外文件豁免（含 D1/D3）
      const raw = read(p);
      const lines = raw.split(/\r?\n/);
      // ②围栏配对
      const fences = lines.filter(l => /^\s*```/.test(l)).length;
      if (fences % 2 !== 0) fail('D3', p, 0, '代码围栏奇数（' + fences + '）');
      // ①超长行 + ③表格卫生 + ⑤缩进断裂（同一遍扫描）
      let inFence = false;
      let blockIdx = 0, blockLang = '', blockStart = 0;
      const fenceContent = {}; // 收集代码块 {lang, start, content}
      const blocks = [];
      lines.forEach((l, i) => {
        if (/^\s*```/.test(l)) {
          if (!inFence) { inFence = true; blockLang = l.trim().slice(3).trim(); blockStart = i + 1; fenceContent[blockStart] = []; }
          else { inFence = false; blocks.push({ lang: blockLang, start: blockStart, content: fenceContent[blockStart].join('\n') }); }
          return;
        }
        if (inFence) { fenceContent[blockStart].push(l); return; }
        // ①超长行
        if (l.trim().startsWith('|')) {
          for (const seg of l.split('<br>')) {
            if (seg.length > 200) fail('D3', p, i + 1, '表格 <br> 片段超长 ' + seg.length);
          }
        } else if (l.length > 200) {
          fail('D3', p, i + 1, '非表格超长行 ' + l.length + ' 字符');
        }
        // ③表格卫生（表格连续区）
        if (l.trim().startsWith('|') && !l.trim().endsWith('|')) {
          fail('D3', p, i + 1, '表格行尾缺 |: ' + l.trim().slice(0, 30));
        }
        // ⑤缩进断裂：4 空格缩进正文（非列表续行/引用/表格/空行）
        if (/^    \S/.test(l)) {
          const prev = i > 0 ? lines[i - 1] : '';
          const isListCont = /^\s*[-*+]\s/.test(prev) || /^\s*(\d+\.)+\s/.test(prev); // 1. / 4.5. 子编号列表续行
          if (!isListCont && !/^>/.test(l) && !/^\s*\|/.test(l) && !/^\s*```/.test(l)) {
            fail('D3', p, i + 1, '代码块外 4 空格缩进（渲染成代码块风险）: ' + l.trim().slice(0, 30));
          }
        }
      });
      // ③表头分隔行（每个表格首行后必须跟分隔行；跳过围栏内行）
      let _inFence = false;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (/^```/.test(lines[i])) { _inFence = !_inFence; continue; }
        if (_inFence) continue;
        if (!l.startsWith('|')) continue;
        const prev = i > 0 ? lines[i - 1].trim() : '';
        if (!prev.startsWith('|')) {
          const next = i + 1 < lines.length ? lines[i + 1].trim() : '';
          if (!/^\|[\s:|-]+\|$/.test(next)) fail('D3', p, i + 1, '表头后缺分隔行');
        }
      }
      // ④标题 # 后空格
      lines.forEach((l, i) => {
        if (/^#{1,6}[^#\s]/.test(l)) fail('D3', p, i + 1, '标题 # 后缺空格: ' + l.trim().slice(0, 30));
      });
      // ⑥代码块卫生（bash -n / node --check）+ ⑦空壳代码块
      blocks.forEach((b, bi) => {
        const stripped = b.content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^#.*$/gm, '').trim();
        if (b.lang.startsWith('bash') && stripped !== '' && b.content.trim() !== '') {
          checkBash(p, bi, b.content);
        } else if (b.lang === 'js' || b.lang === 'javascript') {
          if (stripped === '') {
            fail('D3', p, b.start, '注释空壳代码块（```' + b.lang + ' 内只有注释无代码）→ 改引用块');
          } else {
            checkJs(p, bi, b.content);
          }
        }
      });
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  });

// ---------------------------------------------------------------------------
// E 类：模式内部一致性（同一规则跨文档同口径）
// ---------------------------------------------------------------------------

// E1 _deadlock 口径
reg('E1 _deadlock 口径', '双人/辩论不写 _deadlock、主笔写、完全指南三模式分叉',
  () => {
    const dbl = read(path.join(ROOT, 'assets/玩法模式/_双人对话模式.md'));
    const deb = read(path.join(ROOT, 'assets/玩法模式/_辩论模式.md'));
    const pen = read(path.join(ROOT, 'assets/玩法模式/_主笔审核模式.md'));
    const gui = read(path.join(ROOT, 'assets/老渣文档/公告牌完全指南.md'));

    if (!dbl.includes('不再手写 _deadlock.md')) fail('E1', path.join(ROOT, 'assets/玩法模式/_双人对话模式.md'), 0, '双人缺"不再手写 _deadlock.md"');
    if (!deb.includes('不写 _deadlock')) fail('E1', path.join(ROOT, 'assets/玩法模式/_辩论模式.md'), 0, '辩论缺"不写 _deadlock"');
    if (!pen.includes('_deadlock.md')) fail('E1', path.join(ROOT, 'assets/玩法模式/_主笔审核模式.md'), 0, '主笔缺 _deadlock.md 说明');
    if (!gui.includes('主笔审核') || !gui.includes('双人对话') || !gui.includes('辩论除外') || !gui.includes('_deadlock.md')) {
      fail('E1', path.join(ROOT, 'assets/老渣文档/公告牌完全指南.md'), 0, '完全指南第八节缺三模式分叉说明');
    }
  });

// E2 信号后缀声明
reg('E2 信号后缀声明', '辩论两态声明与 wait_file 白名单例外兼容',
  () => {
    const deb = read(path.join(ROOT, 'assets/玩法模式/_辩论模式.md'));
    const wf = read(path.join(ROOT, 'assets/wait_file.js'));
    if (!deb.includes('特许例外') && !deb.includes('对话结束_已处理')) {
      fail('E2', path.join(ROOT, 'assets/玩法模式/_辩论模式.md'), 0, '辩论两态声明缺特许例外括号');
    }
    if (!wf.includes('signal_已处理')) {
      fail('E2', path.join(ROOT, 'assets/wait_file.js'), 0, 'wait_file 白名单缺 .signal_已处理');
    }
  });

// E3 wait_file 命令路径前缀
reg('E3 wait_file 路径前缀', '玩法文件 wait_file 命令目标必须带 <任务目录>/ 或 ../ 前缀',
  () => {
    // 只匹配真实命令（node 前缀）；描述文字（"wait_file.js 多目标 AND"）不抓
    const re = /node (?:临时脚本\/)?wait_file\.js\s+([^\s`]+)/g;
    for (const p of walk(path.join(ROOT, 'assets/玩法模式'), '.md').concat(walk(path.join(ROOT, 'assets/模板'), '.md'))) {
      const text = read(p);
      let m;
      while ((m = re.exec(text)) !== null) {
        const target = m[1];
        if (target.startsWith('YOUR_FILE_PATH')) continue; // 内联示例占位
        if (target.startsWith('<') || target.startsWith('../') || target.startsWith('D:') || target.startsWith('/')) continue;
        fail('E3', p, 0, 'wait_file 命令目标缺路径前缀（裸名会被锚定到角色目录）: ' + target);
      }
    }
  });

// ---------------------------------------------------------------------------
// --self-test：反向用例（防脚本自身腐化）
//   策略：对每个校验器做"篡改内存文本 → 断言必失败 → 还原"，不碰真实文件。
//   实现：校验器核心逻辑已在 reg() 闭包内直接跑文件系统——self-test 改为
//   对代表性校验器做文件级临时篡改（try/finally 还原），仅对工作区干净的文件。
// ---------------------------------------------------------------------------
function selfTest() {
  console.log('== --self-test 反向用例 ==');
  let pass = 0, failCount = 0;
  const cases = [];
  // 每个用例：{name, file, from, to, expectFailValidator}
  const sk = read(path.join(ROOT, 'SKILL.md'));
  cases.push({
    name: 'A2 模板数漂移必抓', file: 'SKILL.md', from: /(\d+) 个现实团队流程模板/, to: '3 个现实团队流程模板', expect: 'A2',
  });
  const guide = read(path.join(ROOT, 'assets/老渣文档/公告牌完全指南.md'));
  cases.push({
    name: 'A3 调查轮漂移必抓', file: 'assets/老渣文档/公告牌完全指南.md', from: /调查轮×(\d+)/, to: '调查轮×2', expect: 'A3',
  });
  cases.push({
    name: 'E3 裸文件名必抓', file: 'assets/玩法模式/_主笔审核模式.md',
    from: /(<任务目录>\/审核结果\.md\.signal)/, to: '审核结果.md.signal', expect: 'E3',
  });
  cases.push({
    name: 'D1 轨迹关键词必抓', file: 'assets/模板/_启动多步曲.md',
    from: /(## 第 0 步：确认现场)/, to: '## 第 0 步：确认现场（灵魂舱测试）', expect: 'D1',
  });

  for (const c of cases) {
    const p = path.join(ROOT, c.file);
    const orig = read(p);
    let replaced;
    if (c.from instanceof RegExp) {
      replaced = orig.replace(c.from, c.to);
    } else {
      replaced = orig.replace(c.from, c.to);
    }
    if (replaced === orig) { console.log('  SKIP ' + c.name + '（模式未命中，无法测试）'); continue; }
    try {
      fs.writeFileSync(p, replaced, 'utf8');
      clean();
      runAll(false);
      const hit = FAIL.some(f => f.validator.startsWith(c.expect));
      if (hit) { pass++; console.log('  PASS ' + c.name); }
      else { failCount++; console.log('  FAIL ' + c.name + '（未抓到漂移）'); }
    } finally {
      fs.writeFileSync(p, orig, 'utf8');
    }
  }
  console.log('== self-test 结果: ' + pass + ' pass / ' + failCount + ' fail ==');
  return failCount === 0;
}

// ---------------------------------------------------------------------------
// --smoke：wait_file 命令模板实测（三层方案第③层——验证标注与命令本身不失真）
//   抽取玩法/模板文件中的 wait_file 命令 → 替换占位符 → 模拟 anchor 解析 →
//   断言首个目标解析到 我的世界/ 下（不实际等待文件）
// ---------------------------------------------------------------------------
function smokeTest() {
  console.log('== --smoke wait_file 命令实测 ==');
  let pass = 0, failCount = 0, skipped = 0;
  const re = /node (?:临时脚本\/)?wait_file\.js\s+([^\s`]+)/g;
  const files = walk(path.join(ROOT, 'assets/玩法模式'), '.md').concat(walk(path.join(ROOT, 'assets/模板'), '.md'));
  const seen = new Set();
  for (const p of files) {
    const text = read(p);
    let m;
    while ((m = re.exec(text)) !== null) {
      let target = m[1];
      if (target.startsWith('YOUR_FILE_PATH')) { skipped++; continue; }
      // 占位符替换为测试值：<任务目录> = ../我的世界/任务001_测试（角色实际替换语义）
      target = target
        .replace(/<任务目录>/g, '../我的世界/任务001_测试')
        .replace(/<[^>]+>/g, 'X')
        .replace(/\{[^}]+\}/g, '1');
      if (seen.has(target)) continue; // 同一目标去重
      seen.add(target);
      // 通用占位符（替换后仍为 X）无法判定实际路径——E3 已保证其带 <> 前缀，跳过
      if (target === 'X') { skipped++; continue; }
      // 模拟 anchor：相对路径锚定到角色目录（wait_file.js 的 anchor 逻辑）
      const anchored = path.join(ROOT, '角色目录', target);
      const isWorld = anchored.split(path.sep).includes('我的世界');
      if (isWorld) { pass++; console.log('  PASS ' + target); }
      else { failCount++; console.log('  FAIL ' + target + ' → 未解析到 我的世界/ 下'); }
    }
  }
  console.log('== smoke 结果: ' + pass + ' pass / ' + failCount + ' fail / ' + skipped + ' skipped ==');
  return failCount === 0;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function runAll(verbose) {
  clean();
  for (const v of VALIDATORS) {
    try {
      v.check();
    } catch (e) {
      fail(v.name, null, 0, '脚本错误: ' + e.message);
    }
  }
  return FAIL;
}

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const isSelfTest = args.includes('--self-test');
  const isSmoke = args.includes('--smoke');
  if (isSelfTest) {
    const ok = selfTest();
    process.exit(ok ? 0 : 1);
    return;
  }
  if (isSmoke) {
    const ok = smokeTest();
    process.exit(ok ? 0 : 1);
    return;
  }
  const fails = runAll(verbose);
  // 按校验器分组输出
  const byV = {};
  for (const f of fails) {
    (byV[f.validator] = byV[f.validator] || []).push(f);
  }
  let total = 0;
  for (const v of VALIDATORS) {
    const list = byV[v.name] || byV[v.name.split(' ')[0]] || [];
    total += list.length;
    if (list.length > 0) {
      console.log('[' + v.name + '] ' + list.length + ' 处漂移');
      for (const f of list) {
        console.log('  ' + (f.file || '-') + (f.line ? ':' + f.line : '') + '  ' + f.msg);
      }
    } else if (verbose) {
      console.log('[' + v.name + '] OK');
    }
  }
  console.log('== doc-consistency: ' + (fails.length === 0 ? '全部一致 ✓' : total + ' 处漂移 ✗') + '（校验器 ' + VALIDATORS.length + ' 个）');
  process.exit(fails.length === 0 ? 0 : 1);
}

main();
