# Build a self-contained copy of the add-on in dist\homepanel, ready to copy to Home Assistant's \addons share.
# The add-on needs the tablet renderer inside its own folder (Docker cannot reach outside it), so this copies web\ in.
#   .\package-addon.ps1                              makes dist\homepanel
#   .\package-addon.ps1 -To \\192.168.1.104\addons   also copies it to the share (needs access to the share)
param([string]$To)
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'dist\homepanel'
Remove-Item $out -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $out | Out-Null
foreach ($f in 'config.yaml', 'Dockerfile', 'requirements.txt', 'DOCS.md') { Copy-Item (Join-Path $PSScriptRoot "addon\$f") $out }
foreach ($d in 'server', 'studio') { Copy-Item (Join-Path $PSScriptRoot "addon\$d") (Join-Path $out $d) -Recurse }
Copy-Item (Join-Path $PSScriptRoot 'web') (Join-Path $out 'renderer') -Recurse
Remove-Item (Join-Path $out 'renderer\design.js') -ErrorAction SilentlyContinue   # this home's bundled design stays out
Copy-Item (Join-Path $PSScriptRoot 'design.sample.json') (Join-Path $out 'server\seed.json')
Get-ChildItem $out -Recurse -Directory -Filter '__pycache__' | Remove-Item -Recurse -Force
"packaged: $out"
if ($To) {
    $dest = Join-Path $To 'homepanel'
    Remove-Item $dest -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item $out $dest -Recurse
    "copied to: $dest"
}
