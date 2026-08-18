#!/bin/bash
# run_e2e_trial.sh —— 试用轮协议 e2e（D组#11 落地版）
# 依据：task003_做肉 e2e_assert.md（后端开发-DHH 设计，T1-T7 规格）
# 用途：独立回归试用轮链路（TRIAL 输出/反馈切换/熔断豁免/回归护栏），不扰动既有三脚本（52/52）
# 用法：bash run_e2e_trial.sh [skill路径，默认上级 codex-ninja]
# 退出码：0=全过 1=有失败

SKILL="${1:-$(cd "$(dirname "$0")/.." && pwd)}"
MONITOR="$SKILL/assets/monitor.js"
PASS=0; FAIL=0
TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

check() { # $1=描述 $2=stdout内容 $3=期望子串（$4=反期望子串）
  local desc="$1" out="$2" want="$3" nowant="$4"
  if echo "$out" | grep -q "$want"; then
    if [ -n "$nowant" ] && echo "$out" | grep -q "$nowant"; then
      echo "  ✗ $desc（含不应有: $nowant）"; FAIL=$((FAIL+1))
    else
      echo "  ✓ $desc"; PASS=$((PASS+1))
    fi
  else
    echo "  ✗ $desc（缺期望: $want）"; FAIL=$((FAIL+1))
  fi
}

# ── 构造沙箱：monitor.js + world/ ──
setup() { # $1=沙箱路径
  local d="$1"
  mkdir -p "$d/world/output" "$d/world/任务NNN_试用"
  cp "$MONITOR" "$d/monitor.js"
}

echo "=========================================="
echo "run_e2e_trial.sh —— 试用轮协议回归"
echo "monitor: $MONITOR"
echo "=========================================="

# ── T1：模式:试用 + 无反馈文件 → TRIAL，无 STANDBY ──
S="$TMPROOT/t1"; setup "$S"
cat > "$S/world/board_001.md" << 'EOF'
# 公告牌 第001轮
🔒 第一原则：最后一个动作必须是工具调用，不能纯文字下线；poll 到收工轮才合法退场
- 产出类型: 文档
- 模式: 试用
- 测试甲（状态：待命）
- 产出负责人: 测试甲
- 产出: world/output/task001_试用/试用报告.md
- 任务目录: world/task001_试用/
EOF
OUT=$(cd "$S" && node monitor.js 2>&1)
echo "── T1 等真人反馈（TRIAL）──"
check "TRIAL 输出出现" "$OUT" "TRIAL N=1" "STANDBY"

# ── T2：T1 + 写入 试用反馈.md → WAIT 含原因，无 TRIAL/STANDBY ──
S="$TMPROOT/t2"; setup "$S"
cp "$TMPROOT/t1/world/board_001.md" "$S/world/"
mkdir -p "$S/world/task001_试用"
echo "反馈：请验证 TRIAL 输出" > "$S/world/task001_试用/试用反馈.md"
OUT=$(cd "$S" && node monitor.js 2>&1)
echo "── T2 反馈已到（WAIT+原因）──"
check "WAIT N=1 且含原因" "$OUT" "WAIT N=1" ""
check "含 试用反馈已到" "$OUT" "试用反馈已到" "TRIAL"

# ── T3：T2 + 产出 .ready + 签字 → 推进 WAIT N=2（既有机制，非 DONE）──
S="$TMPROOT/t3"; setup "$S"
cp "$TMPROOT/t1/world/board_001.md" "$S/world/"
mkdir -p "$S/world/task001_试用" "$S/world/output/task001_试用" "$S/world/测试甲_talk"
echo "反馈" > "$S/world/task001_试用/试用反馈.md"
echo "OK" > "$S/world/output/task001_试用/试用报告.md.ready"
echo "sign" > "$S/world/测试甲_talk/done_001.md"
OUT=$(cd "$S" && node monitor.js 2>&1)
echo "── T3 产出就位（推进 WAIT N=2）──"
check "推进到 N=2" "$OUT" "WAIT N=2" ""
check "不再输出 TRIAL" "$OUT" "WAIT N=2" "TRIAL"

# ── T4：T1 + waitSince 31 分钟前 → 无 WAIT_OVERDUE（等反馈豁免熔断）──
S="$TMPROOT/t4"; setup "$S"
cp "$TMPROOT/t1/world/board_001.md" "$S/world/"
PAST_MS=$(( $(date +%s) * 1000 - 31 * 60 * 1000 ))
echo "{\"N\":1,\"waitSinceN\":1,\"waitSince\":$PAST_MS}" > "$S/world/.monitor_state.json"
OUT=$(cd "$S" && node monitor.js 2>&1)
echo "── T4 等反馈阶段熔断豁免 ──"
check "无 WAIT_OVERDUE" "$OUT" "TRIAL N=1" "WAIT_OVERDUE"

# ── T5：T2 + waitSince 31 分钟前 → 含 WAIT_OVERDUE（反馈后熔断恢复）──
S="$TMPROOT/t5"; setup "$S"
cp "$TMPROOT/t1/world/board_001.md" "$S/world/"
mkdir -p "$S/world/task001_试用"
echo "反馈" > "$S/world/task001_试用/试用反馈.md"
echo "{\"N\":1,\"waitSinceN\":1,\"waitSince\":$PAST_MS}" > "$S/world/.monitor_state.json"
OUT=$(cd "$S" && node monitor.js 2>&1)
echo "── T5 反馈后熔断恢复 ──"
check "含 WAIT_OVERDUE" "$OUT" "WAIT_OVERDUE" ""

# ── T6：模式:待命 → STANDBY（回归护栏，对齐 run_e2e.sh 构造：带产出行未就位 → 自检不推进）──
S="$TMPROOT/t6"; setup "$S"
cat > "$S/world/board_001.md" << 'EOF'
# 公告牌 第001轮
🔒 第一原则：最后一个动作必须是工具调用，不能纯文字下线；poll 到收工轮才合法退场
- 模式: 待命
- 测试甲（状态：待命，本轮后：待命，等通知）
- 任务: 全员待命等通知
- 产出: world/output/task001_待命/x.md
EOF
OUT=$(cd "$S" && node monitor.js 2>&1)
echo "── T6 待命轮回归 ──"
check "STANDBY 输出" "$OUT" "STANDBY N=1" ""

# ── T7：模式:收工 + 全员退场 → DONE（回归护栏）──
S="$TMPROOT/t7"; setup "$S"
cat > "$S/world/board_001.md" << 'EOF'
# 公告牌 第001轮
🔒 第一原则：最后一个动作必须是工具调用，不能纯文字下线；poll 到收工轮才合法退场
- 模式: 收工
- 测试甲（状态：退场）
- 任务: 全员退场
EOF
mkdir -p "$S/world/测试甲_talk"
touch "$S/world/测试甲_talk/测试甲retired_001"
OUT=$(cd "$S" && node monitor.js 2>&1)
echo "── T7 收工轮回归 ──"
check "DONE 输出" "$OUT" "DONE N=1" ""

echo ""
echo "=========================================="
echo "结果: $PASS 通过 / $FAIL 失败"
echo "=========================================="
[ "$FAIL" -eq 0 ] || exit 1
