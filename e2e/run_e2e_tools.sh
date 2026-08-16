#!/usr/bin/env bash
# ============================================================
# codex-ninja e2e 自检 · 工具链路（boardlint / check / ecoscope）
# 用法: bash run_e2e_tools.sh [skill路径]
# 行为: 临时目录构造公告牌批次 → 逐工具断言（boardlint 契约校验 / check 收工核对 / ecoscope 看板），
#       失败立即退出非 0。跑完自动清理临时目录，不碰任何真实项目。
# 覆盖: 9 个新工具中 Skill 侧 3 个（boardlint/check/ecoscope）——工具舱 7 个由 发布门禁 run-all-checks.sh 覆盖
# ============================================================
set -u

if [ -n "${1:-}" ]; then
  SKILL="$(cd "$1" && pwd)"
else
  SKILL="$(cd "$(dirname "$0")/.." && pwd)"
fi
if [ ! -f "$SKILL/scripts/boardlint.js" ]; then
  echo "ERROR: 未找到 boardlint.js（SKILL=$SKILL）"; exit 1
fi
echo "SKILL: $SKILL"

T=$(mktemp -d /tmp/cn-e2e-tools.XXXXXX)
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

FIRST='🔒 第一原则：最后一个动作必须是工具调用，不能纯文字下线；poll 到收工轮才合法退场'
mkdir -p 火影-大鱼 我的世界/产出/任务001_测试 我的世界/架构师_大鱼对讲

# ── 1. boardlint：标准批次应全过 ──
echo "===== 1. boardlint 标准批次（全过 exit 0）====="
cat > 火影-大鱼/公告牌_001.md <<EOF
# 公告牌 第001轮
$FIRST
- 产出类型: 文档
- 模式: 单人输出
- 架构师（状态：活跃，本轮后：待命）
- 任务: 写测试文档到 我的世界/产出/任务001_测试/out.md
- 产出负责人: 架构师
- 产出: 我的世界/产出/任务001_测试/out.md
- 任务目录: 我的世界/任务001_测试/
EOF
cat > 火影-大鱼/公告牌_002.md <<EOF
# 公告牌 第002轮
$FIRST
- 模式: 收工
- 架构师（状态：退场）
- 任务: 全员退场
EOF
OUT=$(node "$SKILL/scripts/boardlint.js" 火影-大鱼 2>&1)
check "boardlint 标准批次退出码" "退出码: 0" "退出码: $?"
check "boardlint 无阻断项" "无阻断项" "$OUT"

# ── 2. boardlint：异常批次应检出（模式外值/占位符/编号断档）──
echo "===== 2. boardlint 异常批次（检出 exit 1）====="
mkdir -p 异常
cat > 异常/公告牌_001.md <<EOF
# 公告牌 第001轮
$FIRST
- 模式: 交叉碰撞
- 架构师（状态：活跃，本轮后：待命）
- 任务: 写 {角色}_报告.md 到 我的世界/产出/任务001_测试/
- 产出负责人: 架构师
- 产出: 我的世界/产出/任务001_测试/{角色}_报告.md
- 任务目录: 我的世界/任务001_测试/
EOF
cat > 异常/公告牌_003.md <<EOF
# 公告牌 第003轮
$FIRST
- 模式: 收工
- 架构师（状态：退场）
- 任务: 全员退场
EOF
OUT=$(node "$SKILL/scripts/boardlint.js" 异常 2>&1); RC=$?
check "boardlint 异常批次退出码 1" "退出码: 1" "退出码: $RC"
check "boardlint 检出编号断档" "编号不连续" "$OUT"
check "boardlint 检出占位符" "占位符" "$OUT"
check "boardlint 检出模式外值" "模式枚举外值" "$OUT"

# ── 3. check：收工批次应全绿（产出/签字/退场/两件套）──
echo "===== 3. check 收工批次（全绿 exit 0）====="
cp 火影-大鱼/公告牌_001.md 我的世界/
cp 火影-大鱼/公告牌_002.md 我的世界/
echo "测试文档内容" > 我的世界/产出/任务001_测试/out.md
echo "size: 24" > 我的世界/产出/任务001_测试/out.md.ready
echo "架构师 第001轮完成" > 我的世界/架构师_大鱼对讲/完成_001.md
touch 我的世界/架构师_大鱼对讲/架构师已退场_002
mkdir -p 我的世界/大鱼_老渣对讲
echo "# 产出总结" > 我的世界/大鱼_老渣对讲/产出总结.md
echo "# 项目完成" > 我的世界/大鱼_老渣对讲/项目完成.md
OUT=$(node "$SKILL/scripts/check.js" . 2>&1); RC=$?
check "check 收工批次退出码 0" "退出码: 0" "退出码: $RC"
check "check 全部合规" "全部合规" "$OUT"
check "check 两件套在" "项目完成.md 在" "$OUT"

# ── 4. check：缺签字/缺退场应检出 ──
echo "===== 4. check 缺项检出（exit 1）====="
rm 我的世界/架构师_大鱼对讲/完成_001.md 我的世界/架构师_大鱼对讲/架构师已退场_002
OUT=$(node "$SKILL/scripts/check.js" . 2>&1); RC=$?
check "check 缺项退出码 1" "退出码: 1" "退出码: $RC"
check "check 检出缺签字" "缺签字" "$OUT"
check "check 检出未退场" "未退场" "$OUT"

# ── 5. ecoscope：--html 自包含看板 ──
echo "===== 5. ecoscope --html 自包含看板 ====="
echo "$(date +%s%3N)" > 我的世界/架构师_大鱼对讲/_heartbeat.txt
OUT=$(node "$SKILL/scripts/ecoscope.js" . --html 2>&1)
check "ecoscope HTML 含 DOCTYPE" "<!DOCTYPE html>" "$OUT"
check "ecoscope HTML 含自动刷新" "content=\"30\"" "$OUT"
check "ecoscope HTML 角色存活表" "架构师" "$OUT"

# ── 6. ecoscope：CLI 文本模式 ──
echo "===== 6. ecoscope CLI 文本模式 ====="
OUT=$(node "$SKILL/scripts/ecoscope.js" . 2>&1)
check "ecoscope CLI 角色表" "当前轮状态" "$OUT"
check "ecoscope CLI 心跳判定" "心跳" "$OUT"

echo ""
echo "===== 结果: PASS=$PASS FAIL=$FAIL ====="
if [ "$FAIL" = "0" ]; then
  echo "结论: ✅ e2e 工具链路全部通过"
  exit 0
else
  echo "结论: ❌ $FAIL 项失败"
  exit 1
fi
