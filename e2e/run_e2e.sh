#!/usr/bin/env bash
# ============================================================
# codex-ninja e2e 自检脚本
# 用法: bash run_e2e.sh [skill路径]
#   不传参数 → 默认取本脚本上级目录下的 codex-ninja/
# 行为: 在临时目录完整跑一遍「scaffold生成→发布→poll→干活→monitor→收工→待命轮」，
#       每步断言，失败立即退出非 0。跑完自动清理临时目录，不碰任何真实项目。
# ============================================================
set -u

# skill 路径解析
if [ -n "${1:-}" ]; then
  SKILL="$(cd "$1" && pwd)"
else
  SKILL="$(cd "$(dirname "$0")/.." && pwd)"
fi
if [ ! -f "$SKILL/scripts/scaffold.js" ]; then
  echo "ERROR: 未找到 scaffold.js（SKILL=$SKILL）"; exit 1
fi
echo "SKILL: $SKILL"

T=$(mktemp -d /tmp/cn-e2e.XXXXXX)
trap 'rm -rf "$T"' EXIT
cd "$T"

PASS=0; FAIL=0
# check <描述> <期望子串> <实际文本> —— 实际文本含期望子串即通过
check() {
  if printf '%s' "$3" | grep -q -- "$2"; then
    echo "  ✓ $1"; PASS=$((PASS+1))
  else
    echo "  ✗ $1（期望含: $2）"; echo "    实际: $(printf '%s' "$3" | head -2 | tr '\n' ' ')"; FAIL=$((FAIL+1))
  fi
}

echo "===== 1. scaffold init（H-1 占位符 / H10 双 toml / 团队须知）====="
printf '[{"name":"\xe6\xb5\x8b\xe8\xaf\x95\xe7\x94\xb2","desc":"\xe5\x8d\x95\xe4\xba\xba\xe8\xbe\x93\xe5\x87\xba\xe6\xb5\x8b\xe8\xaf\x95","background":"test role"}]' > roles.json
OUT=$(node "$SKILL/scripts/scaffold.js" "$T" roles.json 2>&1)
check "角色 reasonix.toml" "测试甲/reasonix.toml" "$OUT"
check "大鱼 reasonix.toml" "火影-大鱼/reasonix.toml" "$OUT"
check "monitor.js 生成" "monitor.js" "$OUT"
check "玩法文件占位符=0" "0" "$(grep -c '{{ROLE_NAME}}' 测试甲/_单人输出模式.md)"
check "_sign.js 占位符=0" "0" "$(grep -c '{{ROLE_NAME}}' 测试甲/_sign.js)"

echo "===== 2. 写公告牌 + 全量发布 ====="
cat > 火影-大鱼/公告牌_001.md <<'EOF'
# 公告牌 第001轮
- 模式: 单人输出
- 测试甲（状态：活跃，本轮后：待命）
- 任务: 写一份测试报告到产出目录
- 产出负责人: 测试甲
- 产出: 我的世界/产出/任务001_测试/报告.md
- 任务目录: 我的世界/任务001_测试/
EOF
cat > 火影-大鱼/公告牌_002.md <<'EOF'
# 公告牌 第002轮
- 模式: 收工
- 测试甲（状态：退场）
- 任务: 全员退场
EOF
cp 火影-大鱼/公告牌_*.md 我的世界/

echo "===== 3. 角色 poll（慢路径 → BULLETIN N=1）====="
cd 测试甲
OUT=$(node _reasonix_poll.js 测试甲 0); check "BULLETIN N=1" "BULLETIN N=1" "$OUT"

echo "===== 4. 角色干活：产出 + deliver + sign ====="
mkdir -p ../我的世界/产出/任务001_测试 ../我的世界/测试甲_大鱼对讲
printf '# 测试报告\n内容：e2e 验证\n' > ../我的世界/产出/任务001_测试/报告.md
OUT=$(node _deliver.js 报告.md 任务001_测试); check "DELIVERED" "DELIVERED" "$OUT"
OUT=$(node _sign.js 1); check "SIGNED" "SIGNED" "$OUT"

echo "===== 5. monitor 推进 001 → 002（未退场应 MISS + WAIT）====="
cd ..
OUT=$(node monitor.js)
check "推进到 002" "WAIT N=2" "$OUT"
check "测试甲未退场 MISS" "RETIRE 测试甲 MISS" "$OUT"

echo "===== 6. 角色 poll 收工轮 + 创建退场文件 ====="
cd 测试甲
node _reasonix_poll.js 测试甲 1 >/dev/null 2>&1
RC=$?
touch ../我的世界/测试甲_大鱼对讲/测试甲已退场_002
if [ "$RC" -eq 0 ] || [ "$RC" -eq 2 ]; then echo "  ✓ 收工轮 poll 正常（exit=$RC）"; PASS=$((PASS+1)); else echo "  ✗ 收工轮 poll 异常（exit=$RC）"; FAIL=$((FAIL+1)); fi

echo "===== 7. monitor 终局（应 DONE N=2）====="
cd ..
OUT=$(node monitor.js); check "DONE N=2" "DONE N=2" "$OUT"

echo "===== 8. 待命轮（H2: STANDBY 不误报收工）====="
cat > 我的世界/公告牌_003.md <<'EOF'
# 公告牌 第003轮
- 模式: 待命
- 测试甲（状态：待命，本轮后：待命，等通知）
- 任务: 全员待命等通知
- 产出: 我的世界/产出/任务003_待命/x.md
EOF
OUT=$(node monitor.js)
check "STANDBY N=3" "STANDBY N=3" "$OUT"
check "不误判收工" "WAIT N=3" "$OUT"

echo ""
echo "=========================================="
echo "结果: $PASS 通过 / $FAIL 失败"
echo "=========================================="
[ "$FAIL" -eq 0 ] || exit 1
