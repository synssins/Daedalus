# Install HomePanel on one iPad over SSH, then relaunch it over USB.
#   .\deploy.ps1            newest GitHub build + local config.json   (needed after Swift/plist changes)
#   .\deploy.ps1 -WebOnly   just the local web\ folder + config.json  (seconds; no build needed)
# Per-iPad settings come from config.json beside this script (git-ignored), copied into the app bundle.
param([string]$Ip = '192.168.1.41', [string]$RunId, [switch]$WebOnly)
$ErrorActionPreference = 'Stop'
$key = "$env:USERPROFILE\.ssh\ipad_panel_ed25519"
$scp = @('-i', $key, '-o', 'IdentitiesOnly=yes', '-q')
$ssh = @('-i', $key, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', "mobile@$Ip")
$app = '/var/jb/Applications/HomePanel.app'
$tmp = '/var/mobile/HomePanel.stage'

ssh @ssh "rm -rf $tmp && mkdir -p $tmp"
$cfg = Join-Path $PSScriptRoot 'config.json'
if (Test-Path $cfg) { scp @scp $cfg "mobile@${Ip}:$tmp/config.json" }

if ($WebOnly) {
    scp @scp -r (Join-Path $PSScriptRoot 'web') "mobile@${Ip}:$tmp/web"
    $install = "sudo rm -rf $app/web && sudo cp -R $tmp/web $app/web"
} else {
    $dist = Join-Path $PSScriptRoot 'dist'
    Remove-Item "$dist\HomePanel.app.tar" -Force -ErrorAction SilentlyContinue
    # Without a run id, gh picks an arbitrary run's artifact, so always name the newest successful one.
    if (-not $RunId) { $RunId = gh run list --limit 1 --status success --json databaseId --jq '.[0].databaseId' }
    gh run download $RunId -n HomePanel -D $dist
    if ($LASTEXITCODE) { throw 'artifact download failed' }
    scp @scp "$dist\HomePanel.app.tar" "mobile@${Ip}:$tmp/HomePanel.app.tar"
    $install = "sudo rm -rf $app && sudo tar -xf $tmp/HomePanel.app.tar -C /var/jb/Applications && sudo chmod 755 $app/HomePanel"
}

ssh @ssh "$install && if [ -f $tmp/config.json ]; then sudo cp $tmp/config.json $app/config.json; fi && sudo chown -R root:wheel $app && sudo chmod 644 $app/config.json 2>/dev/null; uicache -p $app && rm -rf $tmp && echo INSTALLED"
if ($LASTEXITCODE) { throw 'install failed' }

& "$env:USERPROFILE\.local\bin\pymobiledevice3.exe" developer dvt launch --kill-existing home.panel.app
