# Install Daedalus Panel on Android tablets and Google TV devices over the network, each one as soon as it allows it.
#   .\deploy-android.ps1                    every device on this network that answers adb, found again each round
#   .\deploy-android.ps1 -Ip 192.168.1.50   the named devices only; ends when all of them are done
# A device answers once "USB debugging" (on some, "Network debugging") is on in its Developer options. The first
# time, it asks on its own screen "Allow USB debugging?": tick "Always allow from this computer" and choose Allow.
# This script keeps asking every few seconds until then, installs, and starts the app. Stop it with Ctrl+C.
param([string[]]$Ip, [string]$Apk = (Join-Path $PSScriptRoot 'dist\DaedalusPanel.apk'), [int]$Every = 5)

$adb = 'adb'
if ($env:ANDROID_HOME -and (Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe")) { $adb = "$env:ANDROID_HOME\platform-tools\adb.exe" }
if (-not (Test-Path $Apk)) { throw "No APK at $Apk. Build it first: sh android/build.sh" }

# Every address on this computer's own networks with the adb port (5555) open.
function Find-AdbDevices {
    $found = @()
    $nets = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixLength -ge 24 }
    foreach ($n in $nets) {
        $base = $n.IPAddress.Substring(0, $n.IPAddress.LastIndexOf('.') + 1)
        $tries = foreach ($i in 1..254) {
            $c = New-Object Net.Sockets.TcpClient
            [pscustomobject]@{ Ip = "$base$i"; Client = $c; Wait = $c.BeginConnect("$base$i", 5555, $null, $null) }
        }
        Start-Sleep -Milliseconds 700
        foreach ($t in $tries) {
            if ($t.Wait.IsCompleted -and $t.Client.Connected -and $t.Ip -ne $n.IPAddress) { $found += $t.Ip }
            $t.Client.Close()
        }
    }
    $found | Select-Object -Unique
}

$done = @{}
$said = @{}
Write-Host "Installing $Apk"
while ($true) {
    $list = $Ip
    if (-not $list) { $list = @(Find-AdbDevices) }
    if (-not $list) { Write-Host 'No device answers yet. Turn on USB debugging (or Network debugging) in its Developer options.' }
    foreach ($d in $list) {
        if ($done[$d]) { continue }
        $t = "$($d):5555"
        & $adb connect $t | Out-Null
        $line = (& $adb devices) | Where-Object { $_ -like "$t*" }
        if ($line -match "\tdevice") {
            $model = (& $adb -s $t shell getprop ro.product.model)
            Write-Host "$d ($model): allowed, installing"
            & $adb -s $t install -r $Apk
            if ($LASTEXITCODE -eq 0) {
                & $adb -s $t shell am start -n daedalus.panel.app/.MainActivity | Out-Null
                Write-Host "$d ($model): installed and started" -ForegroundColor Green
                $done[$d] = $true
            } else {
                Write-Host "$d ($model): install failed, trying again" -ForegroundColor Yellow
            }
        } else {
            if (-not $said[$d]) { Write-Host "$($d): waiting. On its screen: Allow USB debugging > Always allow from this computer > Allow"; $said[$d] = $true }
            & $adb disconnect $t | Out-Null   # so the next round asks again
        }
    }
    if ($Ip -and -not ($Ip | Where-Object { -not $done[$_] })) { break }
    Start-Sleep -Seconds $Every
}
Write-Host 'All done.'
