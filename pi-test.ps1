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

$cliJs = Join-Path -Path $PSScriptRoot -ChildPath "packages/coding-agent/dist/cli.js"
$provider = if ($env:PI_PROVIDER) { $env:PI_PROVIDER } else { "opencode-go" }
$allArgs = @("--provider", $provider) + $args
& node $cliJs $allArgs
