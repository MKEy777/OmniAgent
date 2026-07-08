# Load .env if present
$envFile = Join-Path -Path $PSScriptRoot -ChildPath ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*([^#=]+)=(.*)$") {
      $key = $matches[1].Trim()
      $val = $matches[2].Trim()
      Set-Item -Path "env:$key" -Value $val
    }
  }
}

# Auto-deploy memory extension from source (ensures real-time sync on every launch)
$extDir = Join-Path -Path $env:USERPROFILE -ChildPath ".pi/agent/extensions"
$extSrc = Join-Path -Path $PSScriptRoot -ChildPath "packages/coding-agent/examples/extensions/memory.ts"
$extDst = Join-Path -Path $extDir -ChildPath "memory.ts"
if (!(Test-Path $extDir)) { New-Item -ItemType Directory -Path $extDir -Force | Out-Null }
Copy-Item -LiteralPath $extSrc -Destination $extDst -Force

$cliJs = Join-Path -Path $PSScriptRoot -ChildPath "packages/coding-agent/dist/cli.js"
$provider = if ($env:PI_PROVIDER) { $env:PI_PROVIDER } else { "opencode-go" }
$allArgs = @("--provider", $provider) + $args
& node $cliJs $allArgs
