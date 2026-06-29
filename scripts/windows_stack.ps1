[CmdletBinding()]
param(
  [ValidateSet('status', 'unregister-service', 'start', 'stop', 'restart')]
  [string]$Action = 'status',
  [string]$ServiceName = 'WorldOfClaudeCraftStack',
  [string]$WrapperDirectory = 'C:\Services\WorldOfClaudeCraftStack',
  [switch]$RemoveWrapperDirectory,
  [switch]$StartAfterUnregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$StateDirectory = Join-Path $RepoRoot 'tmp\stack'
$LauncherMetaPath = Join-Path $StateDirectory 'launcher.json'
$LauncherStdoutBasePath = Join-Path $StateDirectory 'launcher.stdout.log'
$LauncherStderrBasePath = Join-Path $StateDirectory 'launcher.stderr.log'
$StackPorts = @(5173, 8787)

function Write-Info {
  param([string]$Message)
  Write-Host "[stack] $Message"
}

function Write-WarnLine {
  param([string]$Message)
  Write-Warning "[stack] $Message"
}

function Ensure-StateDirectory {
  if (-not (Test-Path -LiteralPath $StateDirectory)) {
    $null = New-Item -ItemType Directory -Path $StateDirectory -Force
  }
}

function Rotate-File {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  $previousPath = "$Path.prev"
  if (Test-Path -LiteralPath $previousPath) {
    Remove-Item -LiteralPath $previousPath -Force
  }
  Move-Item -LiteralPath $Path -Destination $previousPath -Force
}

function Test-FileUnlocked {
  param([string]$Path)
  try {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $stream.Close()
    return $true
  } catch {
    return $false
  }
}

function Get-LogPathForStart {
  param([string]$BasePath)
  Ensure-StateDirectory
  if (-not (Test-Path -LiteralPath $BasePath)) {
    return $BasePath
  }
  if (Test-FileUnlocked -Path $BasePath) {
    Rotate-File -Path $BasePath
    return $BasePath
  }
  $directory = Split-Path -Parent $BasePath
  $fileName = [System.IO.Path]::GetFileNameWithoutExtension($BasePath)
  $extension = [System.IO.Path]::GetExtension($BasePath)
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  return (Join-Path $directory "$fileName.$stamp$extension")
}

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Require-Administrator {
  if (-not (Test-IsAdministrator)) {
    throw 'Run this action from an elevated PowerShell window.'
  }
}

function Get-ProcessCommandLine {
  param([int]$ProcessId)
  $processRecord = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  if ($null -eq $processRecord) {
    return $null
  }
  return [string]$processRecord.CommandLine
}

function Test-TrackedLauncherCommandLine {
  param([string]$CommandLine)
  if ([string]::IsNullOrWhiteSpace($CommandLine)) {
    return $false
  }
  return $CommandLine.IndexOf('online_lan.mjs', [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
    $CommandLine.IndexOf($RepoRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
}

function Test-TrackedLauncherByStartTime {
  param(
    [System.Diagnostics.Process]$Process,
    [object]$Meta
  )
  if ($null -eq $Process -or $null -eq $Meta) {
    return $false
  }
  if ($Process.ProcessName -ne 'node') {
    return $false
  }
  try {
    $metaStartedAt = [datetimeoffset]::Parse([string]$Meta.startedAt)
    $deltaSeconds = [math]::Abs(($Process.StartTime.ToUniversalTime() - $metaStartedAt.UtcDateTime).TotalSeconds)
    return $deltaSeconds -le 60
  } catch {
    return $false
  }
}

function Read-LauncherMeta {
  if (-not (Test-Path -LiteralPath $LauncherMetaPath)) {
    return $null
  }
  return Get-Content -Raw -LiteralPath $LauncherMetaPath | ConvertFrom-Json
}

function Remove-LauncherMeta {
  if (Test-Path -LiteralPath $LauncherMetaPath) {
    Remove-Item -LiteralPath $LauncherMetaPath -Force
  }
}

function Save-LauncherMeta {
  param(
    [int]$ProcessId,
    [string]$StdoutPath,
    [string]$StderrPath
  )
  Ensure-StateDirectory
  [pscustomobject]@{
    pid = $ProcessId
    startedAt = (Get-Date).ToString('o')
    repoRoot = $RepoRoot
    stdoutLog = $StdoutPath
    stderrLog = $StderrPath
  } | ConvertTo-Json | Set-Content -LiteralPath $LauncherMetaPath -Encoding utf8
}

function Get-TrackedLauncher {
  $meta = Read-LauncherMeta
  if ($null -eq $meta) {
    return $null
  }
  $launcherPid = [int]$meta.pid
  $process = Get-Process -Id $launcherPid -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    return [pscustomobject]@{
      Meta = $meta
      Running = $false
      CommandLine = $null
      Process = $null
    }
  }
  $commandLine = Get-ProcessCommandLine -ProcessId $launcherPid
  return [pscustomobject]@{
    Meta = $meta
    Running = (
      (Test-TrackedLauncherCommandLine -CommandLine $commandLine) -or
      (Test-TrackedLauncherByStartTime -Process $process -Meta $meta)
    )
    CommandLine = $commandLine
    Process = $process
  }
}

function Get-ServiceRecord {
  param([string]$Name)
  $controller = Get-Service -Name $Name -ErrorAction SilentlyContinue
  $serviceInfo = Get-CimInstance Win32_Service -Filter "Name = '$Name'" -ErrorAction SilentlyContinue
  if ($null -eq $controller -and $null -eq $serviceInfo) {
    return $null
  }
  return [pscustomobject]@{
    Name = $Name
    DisplayName = if ($null -ne $serviceInfo) { [string]$serviceInfo.DisplayName } elseif ($null -ne $controller) { [string]$controller.DisplayName } else { $Name }
    Status = if ($null -ne $controller) { [string]$controller.Status } elseif ($null -ne $serviceInfo) { [string]$serviceInfo.State } else { 'Unknown' }
    StartMode = if ($null -ne $serviceInfo) { [string]$serviceInfo.StartMode } else { 'Unknown' }
    PathName = if ($null -ne $serviceInfo) { [string]$serviceInfo.PathName } else { '' }
  }
}

function Get-StackListeners {
  $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -in $StackPorts } |
    Sort-Object LocalPort, OwningProcess -Unique
  $rows = @()
  foreach ($listener in $listeners) {
    $processName = ''
    $commandLine = ''
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if ($null -ne $process) {
      $processName = [string]$process.ProcessName
      $commandLine = [string](Get-ProcessCommandLine -ProcessId $listener.OwningProcess)
    }
    $rows += [pscustomobject]@{
      Port = [int]$listener.LocalPort
      Pid = [int]$listener.OwningProcess
      Process = $processName
      Address = [string]$listener.LocalAddress
      CommandLine = $commandLine
    }
  }
  return @($rows)
}

function Wait-PortsState {
  param(
    [bool]$ShouldExist,
    [int]$TimeoutSeconds = 90
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $listeners = @(Get-StackListeners)
    $portsPresent = if ($listeners.Count -gt 0) {
      @($listeners | ForEach-Object { $_.Port } | Sort-Object -Unique)
    } else {
      @()
    }
    $allPresent = @($StackPorts | Where-Object { $_ -in $portsPresent }).Count -eq $StackPorts.Count
    if ($ShouldExist -and $allPresent) {
      return
    }
    if (-not $ShouldExist -and $listeners.Count -eq 0) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  $portList = $StackPorts -join ', '
  if ($ShouldExist) {
    throw "Timed out waiting for listeners on ports $portList."
  }
  throw "Timed out waiting for ports $portList to become free."
}

function Show-LogTail {
  param(
    [string]$Path,
    [string]$Label
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }
  Write-Info "$Label tail:"
  Get-Content -LiteralPath $Path -Tail 20 | ForEach-Object { Write-Host $_ }
}

function Resolve-NodePath {
  $command = Get-Command node.exe,node -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $command) {
    throw 'Could not find node on PATH.'
  }
  return [string]$command.Source
}

function Invoke-StackStart {
  $tracked = Get-TrackedLauncher
  if ($null -ne $tracked -and $tracked.Running) {
    throw "Launcher PID $($tracked.Process.Id) is already running. Use the restart action instead."
  }
  if ($null -ne $tracked -and -not $tracked.Running) {
    Remove-LauncherMeta
  }

  $listeners = @(Get-StackListeners)
  if ($listeners.Count -gt 0) {
    $listenerPids = @($listeners | Select-Object -ExpandProperty Pid -Unique)
    throw "Ports 5173 or 8787 are already in use by PID(s) $($listenerPids -join ', '). Stop that existing stack first. If it was started from an admin PowerShell window, stop it once from an admin window before starting the normal user-managed stack."
  }

  Ensure-StateDirectory
  $stdoutPath = Get-LogPathForStart -BasePath $LauncherStdoutBasePath
  $stderrPath = Get-LogPathForStart -BasePath $LauncherStderrBasePath

  $nodePath = Resolve-NodePath
  $process = Start-Process -FilePath $nodePath `
    -ArgumentList @('scripts/online_lan.mjs', '--restart') `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  Save-LauncherMeta -ProcessId $process.Id -StdoutPath $stdoutPath -StderrPath $stderrPath
  Write-Info "Started launcher PID $($process.Id). Waiting for ports 5173 and 8787."

  try {
    Wait-PortsState -ShouldExist $true -TimeoutSeconds 120
  } catch {
    Show-LogTail -Path $stdoutPath -Label 'stdout'
    Show-LogTail -Path $stderrPath -Label 'stderr'
    throw
  }

  try {
    $status = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/status' -TimeoutSec 5
    Write-Info "Realm $($status.realm) is live, players online: $($status.players_online)."
  } catch {
    Write-WarnLine 'Ports are up, but /api/status did not respond yet.'
  }

  Write-Info "Logs: $stdoutPath"
}

function Invoke-StackStop {
  $tracked = Get-TrackedLauncher
  if ($null -eq $tracked) {
    Write-Info 'No tracked launcher metadata was found.'
    $listeners = @(Get-StackListeners)
    if ($listeners.Count -gt 0) {
      Write-WarnLine 'Ports 5173 or 8787 are still busy. Run the status action to inspect owners.'
    }
    return
  }

  if ($tracked.Running -and $null -ne $tracked.Process) {
    Write-Info "Stopping launcher PID $($tracked.Process.Id)."
    $taskkillOutput = & taskkill /PID $tracked.Process.Id /T /F 2>&1
    if ($LASTEXITCODE -ne 0) {
      $taskkillText = ($taskkillOutput | Out-String).Trim()
      if ($taskkillText.IndexOf('Access is denied', [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        throw 'The current stack was started from an elevated window. Stop it once from that same admin PowerShell window, then start it again from a normal PowerShell window so this Codex session can maintain it.'
      }
      throw "taskkill failed for PID $($tracked.Process.Id): $taskkillText"
    }
    try {
      Wait-Process -Id $tracked.Process.Id -Timeout 20 -ErrorAction SilentlyContinue
    } catch {
      Write-WarnLine 'Launcher process is taking longer than expected to exit.'
    }
  } else {
    Write-Info 'Tracked launcher metadata was stale, removing it.'
  }

  try {
    Wait-PortsState -ShouldExist $false -TimeoutSeconds 30
  } catch {
    $listeners = @(Get-StackListeners)
    if ($listeners.Count -gt 0) {
      Write-WarnLine 'Ports are still in use after stopping the tracked launcher.'
    }
    throw
  } finally {
    Remove-LauncherMeta
  }

  Write-Info 'Stack listeners are down.'
}

function Remove-WrapperDirectorySafe {
  if (-not (Test-Path -LiteralPath $WrapperDirectory)) {
    Write-Info "Wrapper directory not present: $WrapperDirectory"
    return
  }
  $resolved = (Resolve-Path -LiteralPath $WrapperDirectory).Path
  $normalized = $resolved.TrimEnd('\')
  if (-not $normalized.StartsWith('C:\Services\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove wrapper directory outside C:\Services: $resolved"
  }
  if ($normalized.Equals('C:\Services', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Refusing to remove C:\Services directly.'
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
  Write-Info "Removed wrapper directory: $resolved"
}

function Wait-ServiceRemoved {
  param([string]$Name)
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    if ($null -eq (Get-ServiceRecord -Name $Name)) {
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Timed out waiting for service $Name to disappear from SCM."
}

function Invoke-ServiceUnregister {
  Require-Administrator

  $service = Get-ServiceRecord -Name $ServiceName
  if ($null -eq $service) {
    Write-Info "Service $ServiceName is not registered."
  } else {
    Write-Info "Unregistering service $ServiceName ($($service.DisplayName))."
    try {
      Set-Service -Name $ServiceName -StartupType Disabled -ErrorAction Stop
    } catch {
      Write-WarnLine "Could not change startup type: $($_.Exception.Message)"
    }

    try {
      Stop-Service -Name $ServiceName -Force -ErrorAction Stop
    } catch {
      $serviceController = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
      if ($null -eq $serviceController -or $serviceController.Status -ne 'Stopped') {
        throw
      }
    }

    & sc.exe delete $ServiceName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "sc.exe delete failed for service $ServiceName."
    }
    Wait-ServiceRemoved -Name $ServiceName
    Write-Info "Service $ServiceName was removed from SCM."
  }

  if ($RemoveWrapperDirectory) {
    Remove-WrapperDirectorySafe
  } elseif (Test-Path -LiteralPath $WrapperDirectory) {
    Write-Info "Wrapper files still exist at $WrapperDirectory."
  }

  if ($StartAfterUnregister) {
    Write-WarnLine 'Skipping StartAfterUnregister because unregister-service runs elevated. Start the stack afterward from a normal, non-admin PowerShell window so this Codex session can maintain it.'
  }
}

function Show-Status {
  Write-Info "Repo root: $RepoRoot"

  $service = Get-ServiceRecord -Name $ServiceName
  if ($null -eq $service) {
    Write-Info "Service ${ServiceName}: not registered."
  } else {
    Write-Info "Service ${ServiceName}: $($service.Status), start mode $($service.StartMode)."
    if (-not [string]::IsNullOrWhiteSpace($service.PathName)) {
      Write-Info "Service binary: $($service.PathName)"
    }
  }

  $tracked = Get-TrackedLauncher
  if ($null -eq $tracked) {
    Write-Info 'Tracked launcher: none.'
  } elseif ($tracked.Running -and $null -ne $tracked.Process) {
    Write-Info "Tracked launcher: PID $($tracked.Process.Id), started $($tracked.Meta.startedAt)."
    if ($tracked.Meta.PSObject.Properties.Name -contains 'stdoutLog') {
      Write-Info "Tracked stdout log: $($tracked.Meta.stdoutLog)"
    }
  } else {
    Write-WarnLine 'Tracked launcher metadata exists, but the process is not live.'
  }

  $listeners = @(Get-StackListeners)
  if ($listeners.Count -eq 0) {
    Write-Info 'No listeners on 5173 or 8787.'
  } else {
    Write-Info 'Current listeners:'
    $listeners |
      Select-Object Port, Pid, Process, Address, CommandLine |
      Format-Table -AutoSize
  }

  try {
    $status = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/status' -TimeoutSec 3
    Write-Info "Realm $($status.realm) reports $($status.players_online) players online."
  } catch {
    Write-WarnLine 'HTTP status probe to /api/status did not succeed.'
  }
}

switch ($Action) {
  'status' {
    Show-Status
  }
  'unregister-service' {
    Invoke-ServiceUnregister
  }
  'start' {
    Invoke-StackStart
  }
  'stop' {
    Invoke-StackStop
  }
  'restart' {
    Invoke-StackStop
    Invoke-StackStart
  }
}
