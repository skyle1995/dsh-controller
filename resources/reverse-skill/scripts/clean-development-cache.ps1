param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path.TrimEnd('\')
$relativePaths = @(
    '.pytest_cache',
    '.playwright-cli',
    'launcher-rs\target',
    'launcher-rs\target-clean-gate',
    'launcher-rs\ui\node_modules\.vite',
    'services\license-api\target',
    'services\license-admin\target',
    'services\license-signer\target',
    'target-installer'
)

# Each verification run uses an isolated Cargo target directory (for example
# `launcher-rs/target-gate` or `launcher-rs/target-cursor-check`).  These are
# generated artifacts, not source files, and can be removed by the same guarded
# cleanup path as the canonical targets above.
$launcherRoot = Join-Path $root 'launcher-rs'
if (Test-Path -LiteralPath $launcherRoot) {
    $relativePaths += Get-ChildItem -LiteralPath $launcherRoot -Directory -Force |
        Where-Object { $_.Name -like 'target-*' } |
        ForEach-Object { Join-Path 'launcher-rs' $_.Name }
}

$targets = @()
foreach ($relative in $relativePaths) {
    $candidate = Join-Path $root $relative
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $resolved = (Resolve-Path -LiteralPath $candidate).Path.TrimEnd('\')
    if (-not $resolved.StartsWith("$root\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "cache target is outside repository root: $resolved"
    }
    $gitPath = $resolved.Substring($root.Length + 1).Replace('\', '/')
    $tracked = & git -C $root ls-files -- $gitPath
    if ($tracked) { throw "cache target contains tracked files: $gitPath" }
    $bytes = (Get-ChildItem -LiteralPath $resolved -File -Recurse -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    $targets += [pscustomobject]@{ Path = $resolved; Bytes = [int64]$bytes }
}

if (-not $Execute) {
    $targets | Select-Object Path, @{Name='GiB';Expression={[math]::Round($_.Bytes / 1GB, 3)}}
    Write-Output 'Dry-run only. Add -Execute to remove these generated directories.'
    exit 0
}

foreach ($target in $targets) {
    # Build artifacts can disappear while traversing (for example, a prior
    # interrupted cleanup). Treat missing files as already removed and keep
    # processing the remaining cache directories.
    Remove-Item -LiteralPath $target.Path -Recurse -Force -ErrorAction SilentlyContinue
}
$freed = ($targets | Measure-Object -Property Bytes -Sum).Sum
Write-Output ("Removed {0} generated cache directories; reclaimed approximately {1:N2} GiB." -f $targets.Count, ($freed / 1GB))
