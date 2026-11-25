# Install Daedalus Panel on one iPad over SSH, then relaunch it (also over SSH, so no USB cable is needed).
#   .\deploy.ps1            newest GitHub build + local config.json   (needed after Swift/plist changes)
#   .\deploy.ps1 -WebOnly   just the local web\ folder + config.json  (seconds; no build needed)
# Per-iPad settings come from config.json beside this script (git-ignored), copied into the app bundle.
param([string]$Ip = '192.168.1.41', [string]$RunId, [switch]$WebOnly)
$ErrorActionPreference = 'Stop'
$key = "$env:USERPROFILE\.ssh\ipad_panel_ed25519"
$scp = @('-i', $key, '-o', 'IdentitiesOnly=yes', '-q')
$ssh = @('-i', $key, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', "mobile@$Ip")
$app = '/var/jb/Applications/DaedalusPanel.app'
$tmp = '/var/mobile/DaedalusPanel.stage'

ssh @ssh "rm -rf $tmp && mkdir -p $tmp"
$cfg = Join-Path $PSScriptRoot 'config.json'
if (Test-Path $cfg) { scp @scp $cfg "mobile@${Ip}:$tmp/config.json" }

# The design the app draws: this home's design.json (git-ignored) if present, else the sample.
# Wrapped as a script because a bundled page cannot fetch() local files. Later the add-on supplies it.
$design = Join-Path $PSScriptRoot 'design.json'
if (-not (Test-Path $design)) { $design = Join-Path $PSScriptRoot 'design.sample.json' }
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'web\design.js'), 'window.HP_DESIGN = ' + [IO.File]::ReadAllText($design) + ';')

if ($WebOnly) {
    scp @scp -r (Join-Path $PSScriptRoot 'web') "mobile@${Ip}:$tmp/web"
    $install = "sudo rm -rf $app/web && sudo cp -R $tmp/web $app/web"
} else {
    $dist = Join-Path $PSScriptRoot 'dist'
    Remove-Item "$dist\DaedalusPanel.app.tar" -Force -ErrorAction SilentlyContinue
    # Without a run id, gh picks an arbitrary run's artifact, so always name the newest successful one.
    if (-not $RunId) { $RunId = gh run list --limit 1 --status success --json databaseId --jq '.[0].databaseId' }
    gh run download $RunId -n DaedalusPanel -D $dist
    if ($LASTEXITCODE) { throw 'artifact download failed' }
    scp @scp "$dist\DaedalusPanel.app.tar" "mobile@${Ip}:$tmp/DaedalusPanel.app.tar"
    $install = "sudo rm -rf $app && sudo tar -xf $tmp/DaedalusPanel.app.tar -C /var/jb/Applications && sudo chmod 755 $app/DaedalusPanel"
}

ssh @ssh "$install && if [ -f $tmp/config.json ]; then sudo cp $tmp/config.json $app/config.json; fi && sudo chown -R root:wheel $app && sudo chmod 644 $app/config.json 2>/dev/null; uicache -p $app && rm -rf $tmp && echo INSTALLED"
if ($LASTEXITCODE) { throw 'install failed' }

ssh @ssh 'export PATH=/var/jb/usr/bin:$PATH; killall DaedalusPanel 2>/dev/null; sleep 1; uiopen --bundleid daedalus.panel.app && echo LAUNCHED'
