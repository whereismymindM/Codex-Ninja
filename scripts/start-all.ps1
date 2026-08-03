# start-all.ps1 —— 一键开启所有角色窗口（窗口常驻形态）
# ============================================================
# 用法：复制到项目根目录 → 双击运行（或 右键 → 用 PowerShell 运行）
# 要求：Windows Terminal（wt 命令，Win10/11 自带）
#
# 修复记录（2026-08-03 实弹测试）：
# 1. 【编码】PowerShell 5.1 按 GBK 读无 BOM 的 UTF-8 脚本 → 中文乱码报错。
#    本文件必须保存为 UTF-8 WITH BOM（重要！另存时选编码）。
# 2. 【参数截断】旧写法 `wt --title x powershell -NoExit -Command "cd '中文路径'; reasonix code"`
#    在 wt → powershell 传递链中「; reasonix code」会被截断（实测：窗口里只剩 cd）。
#    修复：用 `wt -d <目录>` 指定起始目录，命令只传纯 ASCII 的 `reasonix code`，
#    不嵌套中文路径、不分号拼接——从根上绕开编码/引号问题。
# 3. 【防重复】已存在的同名窗口跳过，避免重复运行脚本导致窗口堆叠。
# 4. 角色目录自动识别（含 AGENTS.md + reasonix.toml），无需维护 skip 黑名单。
# ============================================================
param([switch]$IncludeFish)

$projectRoot = $PSScriptRoot

# 角色目录 = 含 AGENTS.md + reasonix.toml 的目录（scaffold 生成物特征）
$roleDirs = Get-ChildItem $projectRoot -Directory | Where-Object {
    $_.Name -notin @("我的世界", "火影-大鱼", "档案馆", "产出", "_回收站") -and
    (Test-Path (Join-Path $_.FullName "AGENTS.md")) -and
    (Test-Path (Join-Path $_.FullName "reasonix.toml"))
}

if ($IncludeFish) {
    $fishDir = Join-Path $projectRoot "火影-大鱼"
    if (Test-Path (Join-Path $fishDir "AGENTS.md")) {
        $roleDirs = @($roleDirs) + (Get-Item $fishDir)
    }
}

if (-not $roleDirs) {
    Write-Host "未找到角色目录（需要 AGENTS.md + reasonix.toml）。请确认脚本放在项目根目录。" -ForegroundColor Yellow
    exit 1
}

foreach ($d in $roleDirs) {
    # 防重复：检查是否已有同名标题窗口（按进程命令行包含目录名判断）
    $alreadyOpen = Get-CimInstance Win32_Process -Filter "Name='wt.exe' or Name='powershell.exe' or Name='OpenConsole.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine.Contains($d.FullName) }
    if ($alreadyOpen) {
        Write-Host "已存在窗口: $($d.Name)（跳过，避免重复）" -ForegroundColor DarkGray
        continue
    }
    # 用 wt -d 指定起始目录，命令只传 reasonix code（纯 ASCII）——绕开中文/分号截断
    Start-Process wt -ArgumentList @("--title", $d.Name, "-d", $d.FullName, "powershell", "-NoExit", "-Command", "reasonix code")
    Write-Host "已开窗口: $($d.Name)"
}

Write-Host ""
Write-Host "共开启 $($roleDirs.Count) 个窗口。在每个窗口输入「进入角色」即可。" -ForegroundColor Green
