param(
  [string]$AppUrl = "",
  [string]$RunnerSecret = "",
  [string]$AppUrlBase64 = "",
  [string]$RunnerSecretBase64 = ""
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function ConvertFrom-LngBase64 {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($Value))
}

function Write-Step {
  param([string]$Message)

  Write-Host ""
  Write-Host "== $Message" -ForegroundColor Cyan
}

function Refresh-Path {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Install-WingetPackage {
  param(
    [string]$Id,
    [string]$Name
  )

  $winget = Get-Command winget -ErrorAction SilentlyContinue

  if (-not $winget) {
    Write-Warning "No encontre winget para instalar $Name automaticamente."
    return $false
  }

  Write-Host "Instalando $Name con winget..."
  & $winget.Source install --id $Id -e --source winget --accept-package-agreements --accept-source-agreements

  if ($LASTEXITCODE -ne 0) {
    Write-Warning "winget no pudo instalar $Name."
    return $false
  }

  Refresh-Path
  return $true
}

function Ensure-Node {
  $node = Get-Command node -ErrorAction SilentlyContinue

  if ($node) {
    return $node.Source
  }

  Write-Step "Instalando Node.js"
  [void](Install-WingetPackage -Id "OpenJS.NodeJS.LTS" -Name "Node.js LTS")
  $node = Get-Command node -ErrorAction SilentlyContinue

  if (-not $node) {
    Start-Process "https://nodejs.org/en/download"
    throw "No pude instalar Node automaticamente. Instala Node.js LTS y volve a ejecutar este instalador."
  }

  return $node.Source
}

function Get-ChromePath {
  $candidates = @()

  if ($env:LOCALAPPDATA) {
    $candidates += Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe"
  }

  if ($env:PROGRAMFILES) {
    $candidates += Join-Path $env:PROGRAMFILES "Google\Chrome\Application\chrome.exe"
  }

  $programFilesX86 = [Environment]::GetEnvironmentVariable("PROGRAMFILES(X86)")
  if ($programFilesX86) {
    $candidates += Join-Path $programFilesX86 "Google\Chrome\Application\chrome.exe"
  }

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  $chrome = Get-Command chrome -ErrorAction SilentlyContinue
  if ($chrome) {
    return $chrome.Source
  }

  return ""
}

function Ensure-Chrome {
  $chromePath = Get-ChromePath

  if ($chromePath) {
    return $chromePath
  }

  Write-Step "Instalando Google Chrome"
  [void](Install-WingetPackage -Id "Google.Chrome" -Name "Google Chrome")
  $chromePath = Get-ChromePath

  if (-not $chromePath) {
    Write-Warning "No pude encontrar Google Chrome. El bot intentara usar el navegador interno de Puppeteer."
    return ""
  }

  return $chromePath
}

function Invoke-LngDownload {
  param(
    [string]$Url,
    [string]$OutFile
  )

  Write-Host "Descargando $Url"
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -UseBasicParsing
}

function New-EnvLine {
  param(
    [string]$Key,
    [string]$Value
  )

  $safeValue = ([string]$Value) -replace "[`r`n]", ""
  return "$Key=`"$safeValue`""
}

function Write-StartScript {
  param([string]$Path)

  $content = @'
param([string]$LaunchUrl = "")

$ErrorActionPreference = "SilentlyContinue"

$InstallRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BotScript = Join-Path $InstallRoot "whatsapp-reminder-bot.mjs"
$RunScript = Join-Path $InstallRoot "run-whatsapp-bot.cmd"
$LogFile = Join-Path $InstallRoot "whatsapp-bot.log"
$LauncherLogFile = Join-Path $InstallRoot "whatsapp-launcher.log"
$StatusFile = Join-Path $InstallRoot "whatsapp-bot-status.json"

function Write-LauncherLog {
  param([string]$Message)

  Add-Content -Path $LauncherLogFile -Value "$(Get-Date -Format "yyyy-MM-dd HH:mm:ss") $Message"
}

function Refresh-Path {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Get-StatusPayload {
  if (-not (Test-Path $StatusFile)) {
    return $null
  }

  try {
    return Get-Content -Path $StatusFile -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Test-HealthyStatus {
  param([string]$Status)

  return @(
    "authenticated",
    "idle",
    "loading",
    "processing",
    "qr",
    "ready",
    "sent",
    "starting",
    "startup-waiting",
    "state-change"
  ) -contains $Status
}

function Get-BotProcesses {
  $normalizedScript = $BotScript.ToLowerInvariant()

  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($normalizedScript)
  }
}

function Stop-BotProfileBrowsers {
  $profilePath = Join-Path $InstallRoot ".wwebjs_auth\session-club-cuotas-reminders-v2"
  $normalizedProfile = $profilePath.ToLowerInvariant()

  Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($normalizedProfile)
  } | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
  }
}

Write-LauncherLog "launcher iniciado"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Refresh-Path
  $node = Get-Command node -ErrorAction SilentlyContinue
}

if (-not $node) {
  Write-LauncherLog "node no encontrado"
  exit 1
}

$existingProcesses = @(Get-BotProcesses)
$status = Get-StatusPayload
$statusAgeSeconds = [double]::PositiveInfinity

if ($status -and $status.updatedAt) {
  try {
    $updatedAt = [DateTimeOffset]::Parse([string]$status.updatedAt)
    $statusAgeSeconds = ([DateTimeOffset]::Now - $updatedAt).TotalSeconds
  } catch {
    $statusAgeSeconds = [double]::PositiveInfinity
  }
}

if ($existingProcesses.Count -gt 0 -and $statusAgeSeconds -le 180 -and (Test-HealthyStatus ([string]$status.status))) {
  Write-LauncherLog "bot ya estaba corriendo con status reciente"
  exit 0
}

if ($existingProcesses.Count -gt 0) {
  Write-LauncherLog "reiniciando bot sin status saludable"
  $existingProcesses | ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force
  }
  Start-Sleep -Seconds 2
}

Stop-BotProfileBrowsers

$env:WHATSAPP_BOT_HEADLESS = "false"
$env:WHATSAPP_BOT_SEND_DELAY_MS = "90000"
$env:WHATSAPP_BOT_READY_TIMEOUT_MS = "3600000"
$env:WHATSAPP_BOT_SEND_READY_TIMEOUT_MS = "3600000"
$env:WHATSAPP_BOT_STARTUP_STABLE_DELAY_MS = "15000"
$env:WHATSAPP_BOT_PROTOCOL_TIMEOUT_MS = "3600000"
$env:WHATSAPP_BOT_STATUS_FILE = $StatusFile
$env:WHATSAPP_BOT_CLIENT_ID = "club-cuotas-reminders-v2"

Set-Content -Path $LogFile -Value ""
Write-LauncherLog "iniciando bot visible"

Start-Process -FilePath $RunScript -WorkingDirectory $InstallRoot -WindowStyle Minimized

Write-LauncherLog "bot lanzado"
'@

  Set-Content -Path $Path -Value $content -Encoding UTF8
}

function Write-RunScript {
  param([string]$Path)

  $content = @'
@echo off
cd /d "%~dp0"
node "%~dp0whatsapp-reminder-bot.mjs" >> "%~dp0whatsapp-bot.log" 2>&1
'@

  Set-Content -Path $Path -Value $content -Encoding ASCII
}

function Register-UrlProtocol {
  param([string]$StartScriptPath)

  $powerShellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

  if (-not (Test-Path $powerShellPath)) {
    $powerShellPath = "powershell.exe"
  }

  $protocolKey = "HKCU:\Software\Classes\lng-whatsapp-bot"
  $shellKey = Join-Path $protocolKey "shell"
  $openKey = Join-Path $shellKey "open"
  $commandKey = Join-Path $openKey "command"
  $command = "`"$powerShellPath`" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScriptPath`" `"%1`""

  New-Item -Path $protocolKey -Force | Out-Null
  New-Item -Path $shellKey -Force | Out-Null
  New-Item -Path $openKey -Force | Out-Null
  New-Item -Path $commandKey -Force | Out-Null
  Set-Item -Path $protocolKey -Value "URL:La Nueva Guardia WhatsApp Bot"
  New-ItemProperty -Path $protocolKey -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
  Set-Item -Path $commandKey -Value $command
}

function Create-DesktopShortcut {
  param([string]$StartScriptPath)

  try {
    $powerShellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

    if (-not (Test-Path $powerShellPath)) {
      $powerShellPath = "powershell.exe"
    }

    $desktop = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktop "Iniciar Bot WhatsApp LNG.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $powerShellPath
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScriptPath`""
    $shortcut.WorkingDirectory = Split-Path -Parent $StartScriptPath
    $shortcut.Save()
  } catch {
    Write-Warning "No pude crear el acceso directo del escritorio. El boton de la web igual queda registrado."
  }
}

if ([string]::IsNullOrWhiteSpace($AppUrl) -and -not [string]::IsNullOrWhiteSpace($AppUrlBase64)) {
  $AppUrl = ConvertFrom-LngBase64 $AppUrlBase64
}

if ([string]::IsNullOrWhiteSpace($RunnerSecret) -and -not [string]::IsNullOrWhiteSpace($RunnerSecretBase64)) {
  $RunnerSecret = ConvertFrom-LngBase64 $RunnerSecretBase64
}

if ([string]::IsNullOrWhiteSpace($AppUrl)) {
  throw "Falta AppUrl."
}

if ([string]::IsNullOrWhiteSpace($RunnerSecret)) {
  throw "Falta RunnerSecret."
}

$AppUrl = $AppUrl.Trim().TrimEnd("/")
$InstallRoot = Join-Path $env:LOCALAPPDATA "LaNuevaGuardia\WhatsAppBot"
$BotBaseUrl = "$AppUrl/bot/whatsapp"
$StartScriptPath = Join-Path $InstallRoot "start-whatsapp-bot.ps1"
$RunScriptPath = Join-Path $InstallRoot "run-whatsapp-bot.cmd"

Write-Step "Preparando carpeta local"
New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null

Write-Step "Verificando dependencias"
$nodePath = Ensure-Node
$chromePath = Ensure-Chrome

Write-Host "Node: $nodePath"
if ($chromePath) {
  Write-Host "Chrome: $chromePath"
}

Write-Step "Descargando bot"
Invoke-LngDownload -Url "$BotBaseUrl/package.json" -OutFile (Join-Path $InstallRoot "package.json")
Invoke-LngDownload -Url "$BotBaseUrl/package-lock.json" -OutFile (Join-Path $InstallRoot "package-lock.json")
Invoke-LngDownload -Url "$BotBaseUrl/whatsapp-reminder-bot.mjs" -OutFile (Join-Path $InstallRoot "whatsapp-reminder-bot.mjs")

Write-Step "Configurando entorno"
$envLines = @(
  (New-EnvLine -Key "CLUB_APP_URL" -Value $AppUrl),
  (New-EnvLine -Key "WHATSAPP_BOT_RUNNER_SECRET" -Value $RunnerSecret),
  "WHATSAPP_BOT_POLL_INTERVAL_MS=10000",
  "WHATSAPP_BOT_BATCH_LIMIT=5",
  "WHATSAPP_BOT_SEND_DELAY_MS=90000",
  "WHATSAPP_BOT_READY_TIMEOUT_MS=3600000",
  "WHATSAPP_BOT_SEND_READY_TIMEOUT_MS=3600000",
  "WHATSAPP_BOT_STARTUP_STABLE_DELAY_MS=15000",
  "WHATSAPP_BOT_PROTOCOL_TIMEOUT_MS=3600000",
  "WHATSAPP_BOT_DEFAULT_COUNTRY_CODE=549",
  "WHATSAPP_BOT_DRY_RUN=false",
  "WHATSAPP_BOT_HEADLESS=false",
  (New-EnvLine -Key "WHATSAPP_BOT_BROWSER_PATH" -Value $chromePath),
  "WHATSAPP_SESSION_PATH=`"./.wwebjs_auth`""
)
Set-Content -Path (Join-Path $InstallRoot ".env") -Value $envLines -Encoding UTF8

Write-StartScript -Path $StartScriptPath
Write-RunScript -Path $RunScriptPath

Write-Step "Instalando dependencias del bot"
Refresh-Path
$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
  throw "No encontre npm despues de instalar Node."
}

Push-Location $InstallRoot
try {
  & $npm.Source ci --omit=dev

  if ($LASTEXITCODE -ne 0) {
    & $npm.Source install --omit=dev
  }

  if ($LASTEXITCODE -ne 0) {
    throw "npm no pudo instalar las dependencias del bot."
  }
} finally {
  Pop-Location
}

Write-Step "Registrando boton web"
Register-UrlProtocol -StartScriptPath $StartScriptPath
Create-DesktopShortcut -StartScriptPath $StartScriptPath

Write-Host ""
Write-Host "Instalacion completa." -ForegroundColor Green
Write-Host "Volver a la app y tocar Abrir WhatsApp y correr bot."
Write-Host "La primera vez Windows puede pedir confirmar el enlace y WhatsApp puede pedir QR."
