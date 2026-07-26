param([string]$ProjectDir,[string]$RolesFile)
$ErrorActionPreference="Stop"

# 调用独立的 scaffold.js
$ScriptDir = $PSScriptRoot
node (Join-Path $ScriptDir "scaffold.js") $ProjectDir $RolesFile
