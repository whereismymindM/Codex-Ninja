# 内联 fallback（仅独立脚本不满足需求时）

> ⚠️ **日常用独立脚本，本文件不用读！** 以下内联 JS 函数**仅作 fallback**——独立脚本（`_sign.js`/`_deliver.js`/`_lock.js`）不满足需求（需要定制内容/逻辑）时才手抄。
> **默认动作永远是：`node _sign.js N` / `node _deliver.js 文件 任务NNN` / `node _lock.js acquire|release`**。跳过本文件不影响任何日常干活。
>
> 独立脚本优先的理由：参数校验 + 原子写 + 自检，免手抄出错面（内联样板是共同最卡点，每轮手抄 15-40 行 = 出错面）。

```js
var sign = async function(roundN) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  var worldDir = "../我的世界";
  if (!fs.default.existsSync(worldDir)) throw new Error("WORLDDIR_MISSING: ../我的世界 不存在（CWD 可能错: " + process.cwd() + "）——禁止静默创建嵌套目录！请先 cd 回角色目录再执行。");
  var ag = fs.default.readFileSync("./AGENTS.md", "utf8");
  var roleMatch = ag.match(/^# (.+)$/m);
  var roleName = roleMatch ? roleMatch[1].trim() : "{{ROLE_NAME}}";
  var Npad = String(roundN).padStart(3, "0");
  var signFile = path.default.join(worldDir, roleName + "_大鱼对讲", "完成_" + Npad + ".md");
  var content = "# " + roleName + " 第" + Npad + "轮签字\n\n任务完成，产出已交付。";
  fs.default.writeFileSync(signFile, content, "utf8");
  try {
    fs.default.appendFileSync(path.default.join(worldDir, roleName + "_大鱼对讲", roleName + "_操作日志.md"), "[" + new Date().toISOString().substring(11,19) + "] SIGN N=" + Npad + "\n", "utf8");
  } catch(_ls) {}
  if(fs.default.statSync(signFile).size > 20) return "SIGNED";
  return "SIGN_FAIL";
};

var deliver = async function(filename, taskDirName, sourcePath) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  var worldDir = "../我的世界";
  if (!fs.default.existsSync(worldDir)) throw new Error("WORLDDIR_MISSING: ../我的世界 不存在（CWD 可能错: " + process.cwd() + "）——禁止静默创建嵌套目录！请先 cd 回角色目录再执行。");
  var outDir = path.default.join(worldDir, "产出", taskDirName);
  if(!fs.default.existsSync(outDir)) fs.default.mkdirSync(outDir, {recursive: true});
  var outPath = path.default.join(outDir, filename);
  var readyPath = outPath + ".ready";
  var roleName = path.default.basename(process.cwd()); // CWD=角色目录，scaffold 用角色名建目录
  var _dlContent = "OK " + new Date().toISOString();
  if(sourcePath) _dlContent = "source: " + sourcePath + "\n" + _dlContent;
  try {
    if(roleName) _dlContent += "\nproducer: " + roleName;
    if(!sourcePath) {
      try {
        var _st = fs.default.statSync(outPath);
        _dlContent += "\nsize: " + _st.size + "\nmtime: " + _st.mtimeMs;
        if(_st.size === 0) console.log("DELIVER_WARN: " + filename + " 大小为 0");
      } catch(_tnf) {
        console.log("DELIVER_WARN: " + filename + " 不存在于 " + outDir + "——deliver 只发信号，内容需先写入！");
      }
    }
  } catch(_md) {}
  fs.default.writeFileSync(readyPath + ".tmp", _dlContent, "utf8");
  fs.default.renameSync(readyPath + ".tmp", readyPath);
  try {
    fs.default.appendFileSync(path.default.join(worldDir, roleName + "_大鱼对讲", roleName + "_操作日志.md"), "[" + new Date().toISOString().substring(11,19) + "] DELIVER " + filename + "\n", "utf8");
  } catch(_ld) {}
  return "DELIVERED to " + outPath;
};

var lock = async function(op, lockName) {
  const fs = await import("node:fs");
  var name = (lockName || "写锁").replace(/[\\/]/g, "_");
  var lockFile = "../我的世界/写锁_" + name + ".lock";
  var LOCK_STALE_SEC = 600;
  var WAIT_TIMEOUT = 180;
  var _hbCtr15 = 0;
  if(op === "acquire") {
    var start = Date.now();
    while(true) {
      try {
        fs.default.writeFileSync(lockFile, String(process.pid), { flag: "wx" });
        return "LOCKED";
      } catch(e) {
        if(e.code !== "EEXIST") throw e;
        try {
          var stat = fs.default.statSync(lockFile);
          var age = (Date.now() - stat.mtimeMs) / 1000;
          if(age > LOCK_STALE_SEC) {
            var holderAlive = false, holderPid = 0;
            try {
              holderPid = parseInt(fs.default.readFileSync(lockFile, "utf8").trim(), 10);
              if (!isNaN(holderPid) && holderPid > 0) {
                try { process.kill(holderPid, 0); holderAlive = true; }
                catch(_kp) { if (_kp.code !== "ESRCH") holderAlive = true; }
              }
            } catch(_eh) { holderAlive = false; }
            if (!holderAlive) { try { fs.default.unlinkSync(lockFile); } catch(_eu) {} continue; }
          }
        } catch(_) {}
        if((Date.now() - start) / 1000 > WAIT_TIMEOUT) return "LOCK_TIMEOUT";
        if (++_hbCtr15 % 12 === 0) {
          try {
            fs.default.mkdirSync("../我的世界/{{ROLE_NAME}}_大鱼对讲", { recursive: true });
            fs.default.writeFileSync("../我的世界/{{ROLE_NAME}}_大鱼对讲/_heartbeat.txt", String(Date.now()), "utf8");
          } catch(_hb) {}
        }
        await new Promise(r=>setTimeout(r,5000));
      }
    }
  } else {
    try {
      if(fs.default.existsSync(lockFile)) fs.default.unlinkSync(lockFile);
    } catch(_er) {}
    return "UNLOCKED";
  }
};
```

---

**回到 `_工具分类.md`**（日常速查用）。签名即上述函数——需要定制逻辑时才读本文件手抄。
