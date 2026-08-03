#!/usr/bin/env bash
# ============================================================
# codex-ninja e2e 系统机制测试
# 覆盖: 心跳 / 锁 / 唤醒 / 死锁 / 断点续接 / 待命轮全路径 / 扣留-补搬 / 追加任务链
# 用法: bash run_e2e_sys.sh [skill路径]
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

T=$(mktemp -d /tmp/cn-e2e-sys.XXXXXX)
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

echo "===== 1. scaffold init（1 角色）====="
printf '[{"name":"\xe6\xb5\x8b\xe8\xaf\x95\xe7\x94\xb2","desc":"\xe7\xb3\xbb\xe7\xbb\x9f\xe6\x9c\xba\xe5\x88\xb6\xe6\xb5\x8b\xe8\xaf\x95","background":"sys"}]' > roles.json
node "$SKILL/scripts/scaffold.js" "$T" roles.json >/dev/null 2>&1 || { echo "scaffold FAIL"; exit 1; }

echo ""
echo "===== 2. 心跳机制：poll 写 _heartbeat + _hb_state，monitor 判定存活 ====="
cd 测试甲
node _reasonix_poll.js 测试甲 0 >/dev/null 2>&1
check "心跳文件 _heartbeat.txt" "1" "$(test -f ../我的世界/测试甲_大鱼对讲/_heartbeat.txt && echo 1 || echo 0)"
check "心跳状态 _hb_state.json" "1" "$(test -f ../我的世界/测试甲_大鱼对讲/_hb_state.json && echo 1 || echo 0)"
cd ..
OUT=$(node monitor.js)
check "无公告牌时 WAIT（死锁检测此时不触发，属预期）" "WAIT" "$OUT"

echo ""
echo "===== 3. 锁机制：acquire / release / 再 acquire ====="
cd 测试甲
OUT=$(node _lock.js acquire); check "抢锁 LOCK_ACQUIRED" "LOCK_ACQUIRED" "$OUT"
OUT=$(node _lock.js release); check "释放 LOCK_RELEASED" "LOCK_RELEASED" "$OUT"
OUT=$(node _lock.js acquire); check "再抢锁" "LOCK_ACQUIRED" "$OUT"
node _lock.js release >/dev/null 2>&1

echo ""
echo "===== 4. 唤醒机制：_wakeup.js → 角色 poll 检测 → WOKEN → _acked ====="
node _wakeup.js 测试甲 "sys测试唤醒" >/dev/null 2>&1
OUT=$(node _reasonix_poll.js 测试甲 0)
check "poll 检测唤醒 WOKEN" "WOKEN" "$OUT"
OUT=$(node _reasonix_poll.js 测试甲 0)
check "唤醒文件改名 _acked" "1" "$(test -f ../我的世界/测试甲_大鱼对讲/_wakeup_acked.md && echo 1 || echo 0)"
cd ..

echo ""
echo "===== 5. 公告牌：001 单人输出 / 002 待命轮(无产出) / 003 收工(扣留不发) ====="
cat > 火影-大鱼/公告牌_001.md <<'EOF'
# 公告牌 第001轮
- 模式: 单人输出
- 测试甲（状态：活跃，本轮后：待命）
- 任务: 写报告
- 产出负责人: 测试甲
- 产出: 我的世界/产出/任务001_测试/报告.md
- 任务目录: 我的世界/任务001_测试/
EOF
cat > 火影-大鱼/公告牌_002.md <<'EOF'
# 公告牌 第002轮
- 模式: 待命
- 测试甲（状态：待命，本轮后：待命，等通知）
- 任务: 全员待命等通知
EOF
cat > 火影-大鱼/公告牌_003.md <<'EOF'
# 公告牌 第003轮
- 模式: 收工
- 测试甲（状态：退场）
- 任务: 全员退场
EOF
cp 火影-大鱼/公告牌_001.md 火影-大鱼/公告牌_002.md 我的世界/   # 003 扣留在大鱼目录
check "收工轮被扣留" "0" "$(ls 我的世界/公告牌_003.md 2>/dev/null | wc -l)"

echo ""
echo "===== 6. 死锁机制：001 未完成时 monitor 检测 _deadlock → 找搭档（需搭档字段）→ 唤醒 ====="
# 死锁找搭档要求公告牌行同时含角色名+搭档（monitor:362）——临时换双人对话公告牌，测完还原
cat > 我的世界/公告牌_001.md <<'EOF'
# 公告牌 第001轮
- 模式: 双人对话
- 测试甲（角色：问方，搭档：测试乙，状态：活跃，本轮后：待命）
- 测试乙（角色：答方，搭档：测试甲，状态：活跃，本轮后：待命）
- 任务: 对话
- 产出负责人: 测试甲
- 产出: 我的世界/产出/任务001_测试/报告.md
- 任务目录: 我的世界/任务001_测试/
EOF
mkdir -p 我的世界/测试乙_大鱼对讲
printf '等文件超时\n' > 我的世界/测试甲_大鱼对讲/_deadlock.md   # 测试乙无心跳文件 → 死锁守卫 catch → 正常唤醒
OUT=$(node monitor.js)
check "monitor 找到搭档并输出" "DEADLOCK partner=测试乙" "$OUT"
check "搭档被唤醒(_wakeup.md)" "1" "$(test -f 我的世界/测试乙_大鱼对讲/_wakeup.md && echo 1 || echo 0)"
rm -f 我的世界/测试甲_大鱼对讲/_deadlock.md
# 还原单人输出公告牌
cat > 我的世界/公告牌_001.md <<'EOF'
# 公告牌 第001轮
- 模式: 单人输出
- 测试甲（状态：活跃，本轮后：待命）
- 任务: 写报告
- 产出负责人: 测试甲
- 产出: 我的世界/产出/任务001_测试/报告.md
- 任务目录: 我的世界/任务001_测试/
EOF

echo ""
echo "===== 7. 001 干活 + 断点续接 ====="
mkdir -p 我的世界/产出/任务001_测试 我的世界/测试甲_大鱼对讲
printf '# 报告\n' > 我的世界/产出/任务001_测试/报告.md
(cd 测试甲 && node _deliver.js 报告.md 任务001_测试 >/dev/null 2>&1 && node _sign.js 1 >/dev/null 2>&1)
# 断点续接：签字已存在 → 角色重启自检 N++ → poll 下一张牌（002 待命轮）
cd 测试甲
OUT=$(node _reasonix_poll.js 测试甲 1)
check "断点续接：poll 到 002 待命轮" "BULLETIN N=2" "$OUT"
cd ..
OUT=$(node monitor.js)
check "001 完成 + 002 待命轮无产出→WAIT N=3" "WAIT N=3" "$OUT"
check "待命轮不误报 STANDBY（无产出行）" "0" "$(echo "$OUT" | grep -c STANDBY || true)"

echo ""
echo "===== 8. 扣留-补搬：003 收工轮补搬 → 角色 poll → 退场 → DONE ====="
cp 火影-大鱼/公告牌_003.md 我的世界/   # 大鱼补搬收工轮（20分钟判定后，此处直接模拟）
cd 测试甲
OUT=$(node _reasonix_poll.js 测试甲 2)
check "poll 感知收工轮 BULLETIN/RETIRED" "BULLETIN N=3\|RETIRED N=3" "$OUT"
touch ../我的世界/测试甲_大鱼对讲/测试甲已退场_003
cd ..
OUT=$(node monitor.js)
check "收工 DONE N=3" "DONE N=3" "$OUT"

echo ""
echo "===== 9. 追加任务链：待命轮 → 追加任务.md → 追加轮 → 新收工轮 ====="
cat > 火影-大鱼/公告牌_004.md <<'EOF'
# 公告牌 第004轮
- 模式: 待命
- 测试甲（状态：待命，本轮后：待命，等通知）
- 任务: 全员待命等通知
EOF
cp 火影-大鱼/公告牌_004.md 我的世界/   # 004 待命轮发布；005 收工轮扣留
# 老渣追加：追加轮=005，新收工轮=006
cat > 火影-大鱼/公告牌_005.md <<'EOF'
# 公告牌 第005轮
- 模式: 单人输出
- 测试甲（状态：活跃，本轮后：待命）
- 任务: 追加任务——写补充报告
- 产出负责人: 测试甲
- 产出: 我的世界/产出/任务005_追加/补充.md
- 任务目录: 我的世界/任务005_追加/
EOF
cat > 火影-大鱼/公告牌_006.md <<'EOF'
# 公告牌 第006轮
- 模式: 收工
- 测试甲（状态：退场）
- 任务: 全员退场
EOF
mkdir -p 我的世界/大鱼_老渣对讲
printf '追加轮=005，新收工轮=006\n' > 我的世界/大鱼_老渣对讲/追加任务.md
cp 火影-大鱼/公告牌_005.md 我的世界/   # 发布追加轮
mkdir -p 我的世界/产出/任务005_追加
printf '# 补充报告\n' > 我的世界/产出/任务005_追加/补充.md
cd 测试甲
OUT=$(node _reasonix_poll.js 测试甲 4)
check "poll 到追加轮 005" "BULLETIN N=5" "$OUT"
node _deliver.js 补充.md 任务005_追加 >/dev/null 2>&1 && node _sign.js 5 >/dev/null 2>&1
cd ..
OUT=$(node monitor.js)
check "追加轮完成推进" "WAIT N=6" "$OUT"
cp 火影-大鱼/公告牌_006.md 我的世界/   # 新收工轮发布
cd 测试甲
node _reasonix_poll.js 测试甲 5 >/dev/null 2>&1
touch ../我的世界/测试甲_大鱼对讲/测试甲已退场_006
cd ..
OUT=$(node monitor.js)
check "追加后收工 DONE N=6" "DONE N=6" "$OUT"

echo ""
echo "=========================================="
echo "结果: $PASS 通过 / $FAIL 失败"
echo "=========================================="
[ "$FAIL" -eq 0 ] || exit 1
