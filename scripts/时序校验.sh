#!/bin/bash
# 时序校验.sh —— 收工后老渣待办 #3：mtime 顺序合规检查
# 用法: bash 时序校验.sh <项目根目录>
# 检查三种协作模式的流程顺序是否合规（靠文件 mtime 判定，零 token，无需 AI 汇报）：
#   双人对话：问先答后（答.md mtime >= 问.md）
#   辩论：01立论->02立论->03找茬->04找茬->05自由辩论->06总结（mtime 单调递增）
#   主笔审核：请审核 mtime <= 审核结果 mtime（打回循环交替递增）
# 输出：✅ 合规 / ⚠️ 违规（含文件名与时间）
# 退出码：0=全部合规 1=发现违规 2=用法错误
# 2026-08-07 初版（ASCII基线 后设计，收工两件套配套）

if [ -z "$1" ]; then
    echo "用法: bash 时序校验.sh <项目根目录>"
    echo "例:   bash 时序校验.sh \"<项目根目录绝对路径>\""
    exit 2
fi
WORLD="$1/我的世界"
if [ ! -d "$WORLD" ]; then
    echo "ERROR: 找不到 我的世界/（$WORLD）——请确认传入的是项目根目录"
    exit 2
fi

VIOLATIONS=0
TS() { stat -c %Y "$1" 2>/dev/null || echo 0; }
LOG() { echo "  $1"; }

echo "=============================================="
echo "时序校验（mtime 顺序合规）"
echo "项目: $1"
echo "=============================================="

# ── 双人对话：问先答后 ──────────────────────────────
echo ""
echo "[双人对话] 问.md -> 答.md（答须晚于问）"
FOUND=0
while IFS= read -r qfile; do
    FOUND=1
    # 从问文件推导对应答文件
    afile="${qfile%_问.md}_答.md"
    if [ -f "$afile" ]; then
        qt=$(TS "$qfile"); at=$(TS "$afile")
        if [ "$at" -lt "$qt" ]; then
            VIOLATIONS=$((VIOLATIONS+1))
            LOG "⚠️ 抢答: $(basename "$afile") 早于 $(basename "$qfile")（答 $(date -d @$at +%H:%M:%S) < 问 $(date -d @$qt +%H:%M:%S)）"
        else
            LOG "✅ $(basename "${qfile%_问.md}") 顺序正确（问 $(date -d @$qt +%H:%M:%S) → 答 $(date -d @$at +%H:%M:%S)）"
        fi
    fi
done < <(find "$WORLD" ! -path "*_回收站*" -name "对话_*_T*_问.md" 2>/dev/null | sort)
[ "$FOUND" = "0" ] && LOG "  （无双人对话文件）"

# ── 辩论：阶段不倒退 + 文件时间序递增 ──────────
echo ""
echo "[辩论] 阶段推进（01→02→03→04→05→06 不倒退）+ 文件 mtime 递增"
FOUND=0
while IFS= read -r bdir; do
    FOUND=1
    # 收集该任务目录下所有辩论文件，按 mtime 排序（时间序）——同阶段内先手方先写，字典序≠时间序
    files=$(find "$bdir" -maxdepth 1 -name "辩论_*.md" ! -name "辩论_终结.md" 2>/dev/null | while read f; do echo "$(TS "$f") $f"; done | sort -n | awk '{print $2}')
    if [ -z "$files" ]; then continue; fi
    # 终结收敛豁免（2026-08-08 修复）：任务目录存在 辩论_终结.md = 任一方主动终结，
    # 之后直接进入 06 总结（跳过多余回合）——05→06 的"阶段倒退"是合法收敛，不报违规。
    term_file="$bdir/辩论_终结.md"
    if [ -f "$term_file" ]; then
        term_ts=$(TS "$term_file")
        LOG "  📌 $(basename "$bdir") 有辩论_终结.md（$(date -d @$term_ts +%H:%M:%S)）——终结收敛，05 后跳步豁免"
    else
        term_ts=0
    fi
    prev_t=0; prev_stage="00"; prev_name=""
    for f in $files; do
        t=$(TS "$f"); name=$(basename "$f")
        # 提取阶段号（辩论_NN_* 的 NN）
        stage=$(echo "$name" | sed -n 's/^辩论_\([0-9][0-9]*\)_.*/\1/p')
        # 终结后阶段 06 且终结文件晚于上一文件 → 合法提前收敛，豁免阶段倒退检查
        if [ "$stage" = "06" ] && [ "$term_ts" -gt "$prev_t" ] && [ "$term_ts" -ne 0 ]; then
            LOG "  ✅ $(basename "$bdir")/$name $(date -d @$t +%H:%M:%S) [阶段06，终结收敛豁免]"
            prev_t=$t; prev_name="$name"; [ -n "$stage" ] && prev_stage="$stage"
            continue
        fi
        if [ -n "$stage" ] && [ "$stage" -lt "$prev_stage" ]; then
            VIOLATIONS=$((VIOLATIONS+1))
            LOG "⚠️ $(basename "$bdir"): $name（阶段 $stage）早于 $prev_name（阶段 $prev_stage）——阶段倒退！"
        elif [ "$t" -lt "$prev_t" ]; then
            VIOLATIONS=$((VIOLATIONS+1))
            LOG "⚠️ $(basename "$bdir"): $name 早于 $prev_name（$name $(date -d @$t +%H:%M:%S) < $prev_name $(date -d @$prev_t +%H:%M:%S)）——跳步！"
        else
            LOG "✅ $(basename "$bdir")/$name $(date -d @$t +%H:%M:%S)${stage:+ [阶段$stage]}"
        fi
        prev_t=$t; prev_name="$name"; [ -n "$stage" ] && prev_stage="$stage"
    done
done < <(find "$WORLD" -type d -path "*任务*" ! -path "*_回收站*" 2>/dev/null | while read d; do
    find "$d" -maxdepth 1 -name "辩论_01_*.md" 2>/dev/null | grep -q . && echo "$d"
done)
[ "$FOUND" = "0" ] && LOG "  （无辩论文件）"

# ── 主笔审核：请审核 <= 审核结果（打回循环配对）──
echo ""
echo "[主笔审核] 每次请审核.md 须早于对应 审核结果（打回循环：请审->结果N->重发请审->结果N+1）"
FOUND=0
while IFS= read -r sdir; do
    FOUND=1
    # 配对：请审核.md 与 审核结果_第N次.md 按 mtime 就近配对，检查每对 请审 <= 结果
    # 简化判定：收集所有 请审核*.md 和 审核结果*.md（排除 signal/已处理），
    # 按 mtime 排序后，检查"结果文件"是否都晚于"至少一个早于它的请审核文件"
    ask_files=$(find "$sdir" -maxdepth 1 -name "请审核*.md" ! -name "*.signal*" 2>/dev/null | sort)
    result_files=$(find "$sdir" -maxdepth 1 -name "审核结果*.md" ! -name "*.signal*" ! -name "*_已处理*" 2>/dev/null | sort)
    if [ -z "$result_files" ]; then continue; fi
    # 每个结果文件：找 mtime 早于它的最近的请审核文件（视为对应这次打回循环的请审）
    for rf in $result_files; do
        rt=$(TS "$rf"); rname=$(basename "$rf")
        # 找最近一次早于该结果的请审核
        latest_ask=""; latest_at=0
        for af in $ask_files; do
            at=$(TS "$af")
            if [ "$at" -le "$rt" ] && [ "$at" -gt "$latest_at" ]; then latest_at=$at; latest_ask=$af; fi
        done
        if [ -n "$latest_ask" ]; then
            LOG "✅ $(basename "$sdir")/$rname（请审 $(date -d @$latest_at +%H:%M:%S) ≤ 结果 $(date -d @$rt +%H:%M:%S)）"
        else
            VIOLATIONS=$((VIOLATIONS+1))
            LOG "⚠️ $(basename "$sdir")/$rname 之前没有请审核记录——结果先于请审，打回循环异常！"
        fi
    done
done < <(find "$WORLD" -type d -path "*任务*" ! -path "*_回收站*" 2>/dev/null | while read d; do
    find "$d" -maxdepth 1 \( -name "请审核*.md" -o -name "审核结果*.md" \) ! -name "*.signal*" 2>/dev/null | grep -q . && echo "$d"
done)
[ "$FOUND" = "0" ] && LOG "  （无主笔审核文件）"

# ── 信号文件卫生：残留 .signal / 追加式改名 ──────────
# 13-1 修复（信号_acked 协议）：等文件方读完 .md 后应 rename 后缀替换（.signal → .signal_acked），
#   残留 .signal 会让下轮 wait_file 误命中旧信号；追加式 .signal.signal_acked = 改名格式错。
echo ""
echo "[信号卫生] 任务目录无残留 .signal、无追加式 .signal.signal_acked"
FOUND=0
while IFS= read -r sdir; do
    FOUND=1
    # 1) 残留未处理信号（排除合法的 _已处理.signal——对话结束信号改名形态）
    while IFS= read -r sig; do
        VIOLATIONS=$((VIOLATIONS+1))
        LOG "⚠️ $(basename "$sdir"): $(basename "$sig") 残留未处理（应 rename 后缀替换为 .signal_acked，或等文件用 wait_file.js --ack 自动处理）"
    done < <(find "$sdir" -maxdepth 1 -name "*.signal" ! -name "*_已处理.signal" 2>/dev/null)
    # 2) 追加式改名错误（xxx.md.signal.signal_acked）
    while IFS= read -r bad; do
        VIOLATIONS=$((VIOLATIONS+1))
        LOG "⚠️ $(basename "$sdir"): $(basename "$bad") 追加式改名（应为 xxx.md.signal_acked，原 .signal 应消失）"
    done < <(find "$sdir" -maxdepth 1 -name "*.signal.signal_acked" 2>/dev/null)
done < <(find "$WORLD" -type d -path "*任务*" ! -path "*_回收站*" 2>/dev/null | while read d; do
    cnt=$(find "$d" -maxdepth 1 \( -name "*.signal" -o -name "*.signal.signal_acked" \) ! -name "*_已处理.signal" 2>/dev/null | grep -c .)
    [ "$cnt" -gt 0 ] && echo "$d"
done)
[ "$FOUND" = "0" ] && LOG "  （无任务目录或信号卫生干净）"

echo ""
echo "=============================================="
if [ "$VIOLATIONS" = "0" ]; then
    echo "结果: ✅ 时序全部合规"
    exit 0
else
    echo "结果: ⚠️ 发现 $VIOLATIONS 处时序违规（详见上方）"
    exit 1
fi
