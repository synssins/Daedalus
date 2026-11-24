# Sync the tablet renderer and the sample design into the add-on folder, then commit and push.
# Home Assistant builds the add-on from addon\ in this repo (it is the add-on repository), and Docker
# cannot reach outside that folder, so addon\renderer is a committed copy of web\.
#   .\package-addon.ps1      run after changing web\ or design.sample.json; bump version in addon\config.yaml to offer an update
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'addon'
Remove-Item (Join-Path $out 'renderer') -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $PSScriptRoot 'web') (Join-Path $out 'renderer') -Recurse
Remove-Item (Join-Path $out 'renderer\design.js') -ErrorAction SilentlyContinue   # this home's bundled design stays out
Copy-Item (Join-Path $PSScriptRoot 'design.sample.json') (Join-Path $out 'server\seed.json')
"synced: $out\renderer and server\seed.json"
