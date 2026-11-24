# Fetch the newest GitHub build and install it on one iPad over SSH, then launch it.
# Usage: .\deploy.ps1 [-Ip 192.168.1.41] [-RunId <id>]
# Per-iPad settings come from config.json beside this script (git-ignored), copied into the app bundle.
param([string]$Ip = '192.168.1.41', [string]$RunId)
$ErrorActionPreference = 'Stop'
$key = "$env:USERPROFILE\.ssh\ipad_panel_ed25519"
$ssh = @('-i', $key, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', "mobile@$Ip")
$dist = Join-Path $PSScriptRoot 'dist'

Remove-Item $dist -Recurse -Force -ErrorAction SilentlyContinue
$dl = @('run', 'download'); if ($RunId) { $dl += $RunId }
gh @dl -n HomePanel -D $dist
if ($LASTEXITCODE) { throw 'artifact download failed' }

scp -i $key -o IdentitiesOnly=yes -q "$dist\HomePanel.app.tar.gz" "mobile@${Ip}:/var/mobile/HomePanel.app.tar.gz"
$cfg = Join-Path $PSScriptRoot 'config.json'
if (Test-Path $cfg) { scp -i $key -o IdentitiesOnly=yes -q $cfg "mobile@${Ip}:/var/mobile/HomePanel.config.json" }

$apps = '/var/jb/Applications'
ssh @ssh "sudo rm -rf $apps/HomePanel.app && sudo tar -xzf /var/mobile/HomePanel.app.tar.gz -C $apps && if [ -f /var/mobile/HomePanel.config.json ]; then sudo cp /var/mobile/HomePanel.config.json $apps/HomePanel.app/config.json; fi && sudo chown -R root:wheel $apps/HomePanel.app && sudo chmod 755 $apps/HomePanel.app/HomePanel && uicache -p $apps/HomePanel.app && echo INSTALLED"
if ($LASTEXITCODE) { throw 'install failed' }
