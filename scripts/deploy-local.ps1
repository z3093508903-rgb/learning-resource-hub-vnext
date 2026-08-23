param(
  [string]$PluginDir = '',
  [switch]$SaveConfig
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ConfigPath = Join-Path $RepoRoot '.deploy.local.json'
$ProgramFiles = @('main.js', 'styles.css', 'manifest.json')

function Get-DataFingerprint([string]$PathValue) {
  if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
    return '__MISSING__'
  }
  return (Get-FileHash -LiteralPath $PathValue -Algorithm SHA256).Hash
}

function Get-FileFingerprint([string]$PathValue) {
  if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
    throw "Missing file: $PathValue"
  }
  return (Get-FileHash -LiteralPath $PathValue -Algorithm SHA256).Hash
}

function Restore-ProgramFiles([string]$BackupDir, [string]$TargetDir) {
  foreach ($Name in $ProgramFiles) {
    $BackupPath = Join-Path $BackupDir $Name
    $TargetPath = Join-Path $TargetDir $Name
    if (Test-Path -LiteralPath $BackupPath -PathType Leaf) {
      Copy-Item -LiteralPath $BackupPath -Destination $TargetPath -Force
    } elseif (Test-Path -LiteralPath $TargetPath -PathType Leaf) {
      Remove-Item -LiteralPath $TargetPath -Force
    }
  }
}

if (-not $PluginDir -and (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
  try {
    $SavedConfig = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    $PluginDir = [string]$SavedConfig.pluginDir
  } catch {
    throw "Cannot read $ConfigPath. Delete it and configure the local plugin path again."
  }
}

if (-not $PluginDir) {
  throw @"
Local Obsidian plugin path is not configured.
First run:
  npm run deploy:local -- -PluginDir "C:\path\to\vault\.obsidian\plugins\learning-resource-hub-next" -SaveConfig
After that, use:
  npm run deploy:local
"@
}

$PluginDir = [System.IO.Path]::GetFullPath($PluginDir)
if (-not (Test-Path -LiteralPath $PluginDir -PathType Container)) {
  throw "Plugin directory does not exist: $PluginDir"
}

$SourceManifestPath = Join-Path $RepoRoot 'manifest.json'
$TargetManifestPath = Join-Path $PluginDir 'manifest.json'
$SourceManifest = Get-Content -LiteralPath $SourceManifestPath -Raw | ConvertFrom-Json
if (Test-Path -LiteralPath $TargetManifestPath -PathType Leaf) {
  $TargetManifest = Get-Content -LiteralPath $TargetManifestPath -Raw | ConvertFrom-Json
  if ([string]$TargetManifest.id -ne [string]$SourceManifest.id) {
    throw "Target plugin id '$($TargetManifest.id)' does not match source id '$($SourceManifest.id)'. Refusing to deploy."
  }
}

foreach ($Name in $ProgramFiles) {
  $SourcePath = Join-Path $RepoRoot $Name
  if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    throw "Build output is missing: $SourcePath"
  }
}

if ($SaveConfig) {
  @{ pluginDir = $PluginDir } | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
  Write-Host "Saved local deploy path to $ConfigPath"
}

$DataPath = Join-Path $PluginDir 'data.json'
$DataHashBefore = Get-DataFingerprint $DataPath
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupDir = Join-Path $RepoRoot (Join-Path 'deploy-backups' $Timestamp)
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

foreach ($Name in $ProgramFiles) {
  $TargetPath = Join-Path $PluginDir $Name
  if (Test-Path -LiteralPath $TargetPath -PathType Leaf) {
    Copy-Item -LiteralPath $TargetPath -Destination (Join-Path $BackupDir $Name) -Force
  }
}

$Receipt = [ordered]@{
  timestamp = $Timestamp
  pluginDir = $PluginDir
  sourceVersion = [string]$SourceManifest.version
  dataHashBefore = $DataHashBefore
  dataHashAfter = $null
  files = [ordered]@{}
}

try {
  foreach ($Name in $ProgramFiles) {
    $SourcePath = Join-Path $RepoRoot $Name
    $TargetPath = Join-Path $PluginDir $Name
    $SourceHash = Get-FileFingerprint $SourcePath
    Copy-Item -LiteralPath $SourcePath -Destination $TargetPath -Force
    $TargetHash = Get-FileFingerprint $TargetPath
    if ($SourceHash -ne $TargetHash) {
      throw "Hash mismatch after copying $Name."
    }
    $Receipt.files[$Name] = $TargetHash
  }

  $DataHashAfter = Get-DataFingerprint $DataPath
  $Receipt['dataHashAfter'] = $DataHashAfter
  if ($DataHashBefore -ne $DataHashAfter) {
    throw 'data.json changed during deployment. Program files will be rolled back; inspect Obsidian/plugin activity before retrying.'
  }

  $Receipt['status'] = 'success'
  $Receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $BackupDir 'deployment.json') -Encoding UTF8
  Write-Host "Deployment complete. Version: $($SourceManifest.version)"
  Write-Host "Target: $PluginDir"
  Write-Host "Backup: $BackupDir"
  Write-Host "data.json fingerprint unchanged: $DataHashAfter"
} catch {
  $Failure = $_
  try {
    Restore-ProgramFiles $BackupDir $PluginDir
  } catch {
    Write-Warning "Automatic program-file rollback also failed: $($_.Exception.Message)"
  }
  $Receipt['status'] = 'failed'
  $Receipt['error'] = $Failure.Exception.Message
  $Receipt['dataHashAfter'] = Get-DataFingerprint $DataPath
  $Receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $BackupDir 'deployment.json') -Encoding UTF8
  throw $Failure
}
