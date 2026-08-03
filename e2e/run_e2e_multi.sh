#!/usr/bin/env bash
# ============================================================
# codex-ninja e2e 多角色协作测试（双人对话 / 主笔审核 / 辩论 / 收工）
# 用法: bash run_e2e_multi.sh [skill路径]
# 行为: 在临时目录生成 3 角色（测试甲/乙/丙），跑 4 轮公告牌，
#       用文件操作模拟各角色按协议干活（写信号文件/deliver/sign），
#       每轮后 monitor 应正确推进，收工轮 DONE。自动清理。
# 覆盖点: 信号文件协议（.signal→内容配对）、F-2 打回 signal 归档、
#         主笔审核打回→通过、辩论裁判 deliver(.ready)、全员退场审计。
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

T=$(mktemp -d /tmp/cn-e2e-multi.XXXXXX)
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

echo "===== 1. scaffold init（3 角色：测试甲/测试乙/测试丙）====="
printf '[{"name":"\xe6\xb5\x8b\xe8\xaf\x95\xe7\x94\xb2","desc":"\xe9\x97\xae\xe6\x96\xb9/\xe4\xb8\xbb\xe7\xac\x94/\xe6\xad\xa3\xe6\x96\xb9","background":"a"},\n{"name":"\xe6\xb5\x8b\xe8\xaf\x95\xe4\xb9\x99","desc":"\xe7\xad\x94\xe6\x96\xb9/\xe5\xae\xa1\xe6\xa0\xb8/\xe5\x8f\x8d\xe6\x96\xb9","background":"b"},\n{"name":"\xe6\xb5\x8b\xe8\xaf\x95\xe4\xb8\x99","desc":"\xe8\xa3\x81\xe5\x88\xa4","background":"c"}]' > roles.json
node "$SKILL/scripts/scaffold.js" "$T" roles.json >/dev/null 2>&1 || { echo "scaffold FAIL"; exit 1; }
check "3 角色生成" "测试丙" "$(ls -d 测试*/ | tr '\n' ' ')"

# 写公告牌工具：4 轮（双人/主笔/辩论/收工）
cat > 火影-大鱼/公告牌_001.md <<'EOF'
# 公告牌 第001轮
- 产出类型: 文档
- 模式: 双人对话
- 测试甲（角色：问方，搭档：测试乙，状态：活跃，本轮后：待命）
- 测试乙（角色：答方，搭档：测试甲，状态：活跃，本轮后：待命）
- 测试丙（状态：待命）
- 任务: 测试甲深挖需求，测试乙倾囊相授，聊完产出需求文档
- 产出负责人: 测试甲
- 产出: 我的世界/产出/任务001_需求/需求文档.md
- 任务目录: 我的世界/任务001_需求/
EOF
cat > 火影-大鱼/公告牌_002.md <<'EOF'
# 公告牌 第002轮
- 产出类型: 文档
- 模式: 主笔审核
- 测试甲（角色：主笔，搭档：测试乙，状态：活跃，本轮后：待命）
- 测试乙（角色：审核，搭档：测试甲，状态：活跃，本轮后：待命）
- 测试丙（状态：待命）
- 任务: 测试甲写产品方案，测试乙审核（可打回），通过后交付
- 产出负责人: 测试甲
- 产出: 我的世界/产出/任务002_方案/产品方案.md
- 任务目录: 我的世界/任务002_方案/
EOF
cat > 火影-大鱼/公告牌_003.md <<'EOF'
# 公告牌 第003轮
- 产出类型: 文档
- 模式: 辩论
- 辩论轮数: 1
- 测试甲（角色：正方，搭档：测试乙，状态：活跃，本轮后：待命）
- 测试乙（角色：反方，搭档：测试甲，状态：活跃，本轮后：待命）
- 测试丙（角色：裁判，状态：活跃，本轮后：待命）
- 任务: 辩「微服务 vs 单体」，正反立论+找茬+自由辩论1轮+总结，裁判裁决
- 产出负责人: 测试丙
- 产出: 我的世界/产出/任务003_辩论/裁判结论.md
- 任务目录: 我的世界/任务003_辩论/
EOF
cat > 火影-大鱼/公告牌_004.md <<'EOF'
# 公告牌 第004轮
- 模式: 收工
- 测试甲（状态：退场）
- 测试乙（状态：退场）
- 测试丙（状态：退场）
- 任务: 全员退场
EOF
cp 火影-大鱼/公告牌_*.md 我的世界/
check "4 张公告牌发布" "公告牌_004" "$(ls 我的世界/公告牌_*.md | tr '\n' ' ')"

echo ""
echo "===== 2. 001 双人对话：问2轮 → 问方交付+签字，答方签字 ====="
mkdir -p 我的世界/任务001_需求 我的世界/产出/任务001_需求
D=我的世界/任务001_需求
printf 'T1问：微服务适合什么场景？\n' > $D/对话_001_T1_问.md; touch $D/对话_001_T1_问.md.signal
printf 'T1答：适合大团队、独立伸缩、故障隔离……\n' > $D/对话_001_T1_答.md; touch $D/对话_001_T1_答.md.signal
printf 'T2问：单体何时更好？团队多小不该拆？\n' > $D/对话_001_T2_问.md; touch $D/对话_001_T2_问.md.signal
printf 'T2答：同义复述（无新东西）……\n' > $D/对话_001_T2_答.md; touch $D/对话_001_T2_答.md.signal
touch $D/对话结束.signal
printf '# 需求文档\n基于对话提炼的核心洞察\n' > 我的世界/产出/任务001_需求/需求文档.md
OUT=$(cd 测试甲 && node _deliver.js 需求文档.md 任务001_需求); check "问方 deliver" "DELIVERED" "$OUT"
OUT=$(cd 测试甲 && node _sign.js 1); check "问方 sign" "SIGNED" "$OUT"
OUT=$(cd 测试乙 && node _sign.js 1); check "答方 sign" "SIGNED" "$OUT"
OUT=$(node monitor.js); check "001 完成推进" "WAIT N=2" "$OUT"

echo ""
echo "===== 3. 002 主笔审核：先打回（验 F-2 signal 归档）→ 再通过 → 主笔交付 ====="
mkdir -p 我的世界/任务002_方案 我的世界/产出/任务002_方案
D2=我的世界/任务002_方案
printf '# 产品方案 v1\n第一版内容\n' > 我的世界/产出/任务002_方案/产品方案.md
printf '请审核 v1\n' > $D2/请审核.md; touch $D2/请审核.md.signal
printf '状态：不通过\n缺少数据支撑\n' > $D2/审核结果.md; touch $D2/审核结果.md.signal
# 主笔处理打回：改名归档 .md + .signal（F-2 协议），改产出，重发请审核
mv $D2/审核结果.md $D2/审核结果_第1次.md
mv $D2/审核结果.md.signal $D2/审核结果_第1次.md.signal_acked
printf '# 产品方案 v2\n第一版内容+数据支撑\n' > 我的世界/产出/任务002_方案/产品方案.md
printf '请审核 v2\n' > $D2/请审核.md; touch $D2/请审核.md.signal
# 审核方：改名旧请审核 + 归档 signal（F-2 审核侧），写通过
mv $D2/请审核.md $D2/请审核_已处理.md
mv $D2/请审核.md.signal $D2/请审核_已处理.md.signal_acked
printf '状态：通过\n达标\n' > $D2/审核结果.md; touch $D2/审核结果.md.signal
# F-2 归档验证：旧 signal 应已改名归档（非删除），当前轮只剩 1 个有效 signal（审核结果.md.signal）
check "F-2 主笔侧归档(.md.signal_acked)" "1" "$(ls $D2/审核结果_第1次.md.signal_acked 2>/dev/null | wc -l)"
check "F-2 审核侧归档(请审核.signal_acked)" "1" "$(ls $D2/请审核_已处理.md.signal_acked 2>/dev/null | wc -l)"
check "有效 signal 仅 1 个（当前轮）" "1" "$(ls $D2/*.signal 2>/dev/null | wc -l)"
OUT=$(cd 测试甲 && node _deliver.js 产品方案.md 任务002_方案); check "主笔 deliver" "DELIVERED" "$OUT"
OUT=$(cd 测试甲 && node _sign.js 2); check "主笔 sign" "SIGNED" "$OUT"
OUT=$(cd 测试乙 && node _sign.js 2); check "审核 sign" "SIGNED" "$OUT"
OUT=$(node monitor.js); check "002 完成推进" "WAIT N=3" "$OUT"

echo ""
echo "===== 4. 003 辩论：立论→找茬→自由辩论1轮→总结→裁判 deliver ====="
mkdir -p 我的世界/任务003_辩论 我的世界/产出/任务003_辩论
D3=我的世界/任务003_辩论
printf '正方立论：微服务边界清晰、独立伸缩……\n' > $D3/辩论_01_正方立论.md; touch $D3/辩论_01_正方立论.md.signal
printf '反方立论：单体简单、心智负担低……\n' > $D3/辩论_02_反方立论.md; touch $D3/辩论_02_反方立论.md.signal
printf '反方找茬：正方未提运维成本……\n' > $D3/辩论_03_反方找茬.md; touch $D3/辩论_03_反方找茬.md.signal
printf '正方找茬：反方忽略团队规模前提……\n' > $D3/辩论_04_正方找茬.md; touch $D3/辩论_04_正方找茬.md.signal
printf 'T1正方：针对运维成本回应……\n' > $D3/辩论_05_T1_正方.md; touch $D3/辩论_05_T1_正方.md.signal
printf 'T1反方：继续推进反驳……\n' > $D3/辩论_05_T1_反方.md; touch $D3/辩论_05_T1_反方.md.signal
printf '正方总结\n' > $D3/辩论_06_正方总结.md; touch $D3/辩论_06_正方总结.md.signal
printf '反方总结\n' > $D3/辩论_06_反方总结.md; touch $D3/辩论_06_反方总结.md.signal
printf '# 裁判结论\n微服务胜（团队>20人场景）\n' > 我的世界/产出/任务003_辩论/裁判结论.md
OUT=$(cd 测试丙 && node _deliver.js 裁判结论.md 任务003_辩论); check "裁判 deliver" "DELIVERED" "$OUT"
OUT=$(cd 测试甲 && node _sign.js 3); check "正方 sign" "SIGNED" "$OUT"
OUT=$(cd 测试乙 && node _sign.js 3); check "反方 sign" "SIGNED" "$OUT"
OUT=$(cd 测试丙 && node _sign.js 3); check "裁判 sign" "SIGNED" "$OUT"
OUT=$(node monitor.js); check "003 完成推进" "WAIT N=4" "$OUT"

echo ""
echo "===== 5. 004 收工轮：全员退场 → DONE ====="
for r in 测试甲 测试乙 测试丙; do touch "我的世界/${r}_大鱼对讲/${r}已退场_004"; done
OUT=$(node monitor.js); check "收工 DONE" "DONE N=4" "$OUT"

echo ""
echo "=========================================="
echo "结果: $PASS 通过 / $FAIL 失败"
echo "=========================================="
[ "$FAIL" -eq 0 ] || exit 1
