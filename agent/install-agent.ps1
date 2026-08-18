param(
    [string]$Dest = "C:\EmpresaDrive",
    [switch]$AllUsers
)

$dest = $Dest
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$src = Join-Path $PSScriptRoot "agent.ps1"
Copy-Item -Path $src -Destination (Join-Path $dest "agent.ps1") -Force

$protoRoot = if ($AllUsers) { "HKLM\Software\Classes" } else { "HKCU\Software\Classes" }
$protoKey = "$protoRoot\empresa-drive"

& reg.exe add $protoKey /ve /d "URL: Empresa Drive" /f | Out-Null
if ($LASTEXITCODE -ne 0) { throw "No se pudo registrar $protoKey" }

& reg.exe add $protoKey /v "URL Protocol" /f | Out-Null
if ($LASTEXITCODE -ne 0) { throw "No se pudo registrar URL Protocol" }

$cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$dest\agent.ps1`" `"%1`""
& reg.exe add "$protoKey\shell\open\command" /ve /d $cmd /f | Out-Null
if ($LASTEXITCODE -ne 0) { throw "No se pudo registrar el comando del protocolo" }

Write-Output "OK"
