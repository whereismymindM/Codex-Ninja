param([string]$ProjectDir,[string]$Arg2,[string]$Arg3)
$ErrorActionPreference="Stop"

# 调用独立的 scaffold.js
# M7 修复：透传第 2/3 参数，支持全部模式——
#   scaffold.ps1 <项目目录> <roles.json>            # init（默认）
#   scaffold.ps1 <项目目录> <roles.json> add        # add（追加角色）
#   scaffold.ps1 <项目目录> fish [window|run]       # fish（重建大鱼）
$ScriptDir = $PSScriptRoot
$nodeArgs = @($ProjectDir)
if ($Arg2) { $nodeArgs += $Arg2 }
if ($Arg3) { $nodeArgs += $Arg3 }
node (Join-Path $ScriptDir "scaffold.js") @nodeArgs
