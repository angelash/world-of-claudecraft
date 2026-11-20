[CmdletBinding()]
param([ValidateSet('install','status','start','stop','uninstall')][string]$Action = 'status')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$StateDir = Join-Path $ProjectRoot '.local/service'
$Name = 'HakoniwaGame'
$Exe = Join-Path $StateDir "$Name.exe"
$Xml = Join-Path $StateDir "$Name.xml"
$ExpectedHash = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'

function Require-Admin {
  $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Windows SCM registration requires elevation. Run this exact script in an administrator PowerShell.'
  }
}
function Escape-Xml([string]$value) { return [Security.SecurityElement]::Escape($value) }
if ($Action -eq 'status') {
  Get-CimInstance Win32_Service -Filter "Name='$Name'" | Select-Object Name,State,StartMode,StartName,PathName,ProcessId
  Get-NetTCPConnection -State Listen -LocalPort 5180 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess
  exit 0
}
Require-Admin
if ($Action -eq 'install') {
  if (Get-Service -Name $Name -ErrorAction SilentlyContinue) { throw 'Service already registered. Inspect status; do not silently replace it.' }
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 5180 -ErrorAction SilentlyContinue)
  if ($listeners.Count) { throw "Port5180 is occupied by PID(s) $($listeners.OwningProcess -join ','). No process was stopped." }
  New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
  $Node = (Get-Command node.exe -ErrorAction Stop).Source
  if (-not (Test-Path -LiteralPath $Exe)) {
    Invoke-WebRequest -Uri 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' -OutFile $Exe -UseBasicParsing
  }
  if ((Get-FileHash -LiteralPath $Exe -Algorithm SHA256).Hash -ne $ExpectedHash) { throw 'WinSW2.12.0 SHA256 mismatch. Refusing to execute.' }
  $nodeXml = Escape-Xml $Node
  $rootXml = Escape-Xml $ProjectRoot
  $stateXml = Escape-Xml $StateDir
  @"
<service>
  <id>$Name</id>
  <name>Hakoniwa Game</name>
  <description>Hakoniwa fixed5180 service with persistent interruptible five-second restarts.</description>
  <executable>$nodeXml</executable>
  <arguments>--import tsx tools/service/run.ts</arguments>
  <workingdirectory>$rootXml</workingdirectory>
  <env name="HAKONIWA_SERVICE_STATE" value="$stateXml" />
  <startmode>Automatic</startmode>
  <serviceaccount><domain>NT AUTHORITY</domain><user>LocalService</user></serviceaccount>
  <onfailure action="restart" delay="10 sec" />
  <stoptimeout>15 sec</stoptimeout>
  <logpath>$stateXml\logs</logpath>
  <log mode="roll-by-size"><sizeThreshold>10240</sizeThreshold><keepFiles>4</keepFiles></log>
</service>
"@ | Set-Content -LiteralPath $Xml -Encoding utf8
  # Keep the runtime account non-administrative. Only its private state/cache is writable.
  $OwnerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  & icacls.exe $StateDir /inheritance:r /grant:r "*$($OwnerSid):(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-19:(OI)(CI)M' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'State-directory ACL failed' }
  & icacls.exe $ProjectRoot /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Project read ACL failed' }
  & $Exe install
  if ($LASTEXITCODE -ne 0) { throw 'SCM service installation failed' }
  Start-Service -Name $Name
} elseif ($Action -eq 'start') { Start-Service -Name $Name
} elseif ($Action -eq 'stop') {
  throw 'Planned maintenance must use npm run service:restart so the Web interrupt is honored. Stop-Service is reserved for explicit shutdown or uninstall.'
} elseif ($Action -eq 'uninstall') {
  Stop-Service -Name $Name -ErrorAction SilentlyContinue
  & $Exe uninstall
  if ($LASTEXITCODE -ne 0) { throw 'SCM uninstall failed' }
}
Get-CimInstance Win32_Service -Filter "Name='$Name'" | Select-Object Name,State,StartMode,StartName,ProcessId
