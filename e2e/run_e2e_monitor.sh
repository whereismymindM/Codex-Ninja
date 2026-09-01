#!/usr/bin/env bash
# ============================================================
# codex-ninja e2e monitor 机制测试
# 覆盖（2026-09-01 两次改动回归）:
#   1. 「已签未交」点名（WAIT 分支列出"签了但没交产出"的角色）
#   2. DONE 文案修复（"产出就位 x/y"用 outputProgress 聚合——各自+目录产出行显示真实数，不再 0/1）
# 用法: bash run_e2e_monitor.sh [skill路径]
# ============================================================
set -u

if [ -n "${1:-}" ]; then
  SKILL="$(cd "$1" && pwd)"
else
  SKILL="$(cd "$(dirname "$0")/.." && pwd)"
fi
if [ ! -f "$SKILL/scripts/scaffold.js" ]; then
  echo "ERROR: 未找到 scaffold.js（SKILL=$SKILL）"; exit 1
fi
echo "SKILL: $SKILL"

T=$(mktemp -d /tmp/cn-e2e-monitor.XXXXXX)
trap 'rm -rf "$T"' EXIT
cd "$T"

PASS=0; FAIL=0
check() {
  if printf '%s' "$3" | grep -q -- "$2"; then
    echo "  ✓ $1"; PASS=$((PASS+1))
  else
    echo "  ✗ $1（期望含: $2）"; echo "    实际: $(printf '%s' "$3" | head -2 | tr '\n' ' ')"; FAIL=$((FAIL+1))
  fi
}

echo "===== 1. scaffold init（3 角色）====="
printf '[{"name":"testA","desc":"monitor test","background":"sys"},{"name":"testB","desc":"monitor test","background":"sys"},{"name":"testC","desc":"monitor test","background":"sys"}]' > roles.json
node "$SKILL/scripts/scaffold.js" "$T" roles.json >/dev/null 2>&1 || { echo "scaffold FAIL"; exit 1; }
# 写大鱼心跳（防 FISH_DEAD 干扰输出）
mkdir -p fish
node -e "require('fs').writeFileSync('fish/_heartbeat.txt', String(Date.now()), 'utf8')"

echo ""
echo "===== 2. 「已签未交」点名：各自轮，testB 签了没交（testA/testC 已交）====="
cat > fish/board_001.md <<'EOF'
# 公告牌 第001轮
- 模式: 单人输出
- testA（状态：活跃，本轮后：活跃）
- testB（状态：活跃，本轮后：活跃）
- testC（状态：活跃，本轮后：活跃）
- 任务: 各写报告
- 产出负责人: 各自
- 产出: world/output/task001_test/
- 任务目录: world/task001_test/
EOF
node "$SKILL/scripts/scaffold.js" "$T" fish window >/dev/null 2>&1 || true
mkdir -p world/output/task001_test world/testA_talk world/testB_talk world/testC_talk
# 三人签字（>20 字节）
printf 'testA 已完成 001 签字确认。\n' > world/testA_talk/done_001.md
printf 'testB 已完成 001 签字确认。\n' > world/testB_talk/done_001.md
printf 'testC 已完成 001 签字确认。\n' > world/testC_talk/done_001.md
# testA/testC 交产出（带 producer）；testB 签了没交
printf 'OK t\nproducer: testA\n' > world/output/task001_test/report_testA.md.ready
printf 'OK t\nproducer: testC\n' > world/output/task001_test/report_testC.md.ready
# 发布公告牌（fish → world）
cp fish/board_001.md world/board_001.md
OUT=$(node monitor.js)
check "WAIT N=1 且点名已签未交 testB" "已签未交: testB" "$OUT"
check "WAIT 产出计数为真实数 2/3" "产出 2/3" "$OUT"

echo ""
echo "===== 3. testB 补交 → 产出齐 → 推进（自检跳过已完成轮，不重复 DONE——WAIT N=2 即推进成功）====="
printf 'OK t\nproducer: testB\n' > world/output/task001_test/report_testB.md.ready
OUT=$(node monitor.js)
check "001 完成后推进到 N=2" "WAIT N=2" "$OUT"
if printf '%s' "$OUT" | grep -q "产出就位 0/1"; then echo "  ✗ 仍显示 0/1（回归）"; FAIL=$((FAIL+1)); else echo "  ✓ 无 0/1 残留"; PASS=$((PASS+1)); fi

echo ""
echo "===== 4. 单人产出轮回归：产出负责人单角色 + 文件产出行 → 推进正常 ====="
cat > fish/board_002.md <<'EOF'
# 公告牌 第002轮
- 模式: 单人输出
- testA（状态：活跃，本轮后：退场）
- testB（状态：待命，本轮后：退场）
- testC（状态：待命，本轮后：退场）
- 任务: 写报告
- 产出负责人: testA
- 产出: world/output/task002_test/报告.md
- 任务目录: world/task002_test/
EOF
cp fish/board_002.md world/board_002.md
printf '{"N": 2}' > world/.monitor_state.json
mkdir -p world/output/task002_test
printf 'OK t\nproducer: testA\n' > world/output/task002_test/报告.md.ready
OUT=$(node monitor.js)
check "002 完成后推进到 N=3" "WAIT N=3" "$OUT"

echo ""
echo "=============================================="
echo "结果: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "✅ monitor 机制测试全部通过" && exit 0
echo "❌ 有 $FAIL 项失败"; exit 1
