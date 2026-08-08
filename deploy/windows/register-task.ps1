# Registers (or replaces) the at-logon Task Scheduler task that runs the
# Gabriel receiver under pythonw (no console window). Run as the normal user.

$ErrorActionPreference = "Stop"

$python = (Get-Command python.exe).Source
$pythonw = Join-Path (Split-Path $python) "pythonw.exe"
if (-not (Test-Path $pythonw)) { throw "pythonw.exe not found next to $python" }

$logfile = Join-Path $env:USERPROFILE ".config\gabriel\receiver.log"

$action = New-ScheduledTaskAction -Execute $pythonw `
    -Argument "-m gabriel recv --logfile `"$logfile`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

Register-ScheduledTask -TaskName "Gabriel Receiver" `
    -Action $action -Trigger $trigger -Settings $settings -Force

Start-ScheduledTask -TaskName "Gabriel Receiver"
Write-Host "Registered and started 'Gabriel Receiver'. Log: $logfile"
