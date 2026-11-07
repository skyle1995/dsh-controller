#requires -Version 5

[CmdletBinding()]
param(
    [string]$SourceRoot,
    [string]$StagingRoot,
    [string]$PythonPath = 'python',
    [switch]$KeepStaging
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$checks = New-Object System.Collections.Generic.List[object]
if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
    $SourceRoot = Split-Path -Path $PSScriptRoot -Parent
}
$sourceRootPath = [System.IO.Path]::GetFullPath($SourceRoot)
$createdStaging = $false

function Add-ValidationCheck {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Passed,
        [Parameter(Mandatory = $true)][string]$Details
    )

    $checks.Add([pscustomobject]@{
        name = $Name
        passed = $Passed
        details = $Details
    })
}

function Get-RelativeFileHashMap {
    param([Parameter(Mandatory = $true)][string]$Root)

    $map = @{}
    foreach ($file in Get-ChildItem -LiteralPath $Root -Recurse -File) {
        $relative = $file.FullName.Substring($Root.Length).TrimStart('\', '/')
        $map[$relative] = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    }
    return $map
}

function Test-PowerShellSyntax {
    param([Parameter(Mandatory = $true)][string]$Path)

    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors) | Out-Null
    return @($errors)
}

if ([string]::IsNullOrWhiteSpace($StagingRoot)) {
    $StagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("wujin-base-install-{0}" -f [guid]::NewGuid().ToString('N'))
}
$stagingRootPath = [System.IO.Path]::GetFullPath($StagingRoot)

if (Test-Path -LiteralPath $stagingRootPath) {
    throw "StagingRoot must not already exist: $stagingRootPath"
}

$payloadRoot = Join-Path $stagingRootPath 'payload\reverse-skill'
$archivePath = Join-Path $stagingRootPath 'reverse-skill.zip'
$installRoot = Join-Path $stagingRootPath 'installed\reverse-skill'
$manifestPath = Join-Path $sourceRootPath 'skills\scripts\bootstrap-manifest.json'
$powershellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

try {
    New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null
    $createdStaging = $true

    $payloadEntries = @(
        'README.md',
        'README_AI.md',
        'README_EN.md',
        'README-kali.md',
        'RULES.md',
        'RULES_zh.md',
        'CLAUDE.md',
        'LICENSE',
        'reverse-skill.png',
        'scripts',
        'skills',
        'CTF-Sandbox-Orchestrator',
        'burp-mcp-full',
        'docs',
        'kali'
    )

    $missingPayload = @($payloadEntries | Where-Object {
        -not (Test-Path -LiteralPath (Join-Path $sourceRootPath $_))
    })
    Add-ValidationCheck -Name 'payload-required-entries' -Passed ($missingPayload.Count -eq 0) -Details $(
        if ($missingPayload.Count -eq 0) { "$($payloadEntries.Count) required entries found" }
        else { "missing: $($missingPayload -join ', ')" }
    )

    foreach ($entry in $payloadEntries) {
        $sourcePath = Join-Path $sourceRootPath $entry
        if (Test-Path -LiteralPath $sourcePath) {
            Copy-Item -LiteralPath $sourcePath -Destination $payloadRoot -Recurse -Force
        }
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $capabilities = @($manifest.capabilities)
    Add-ValidationCheck -Name 'manifest-json' -Passed ($capabilities.Count -gt 0) -Details "$($capabilities.Count) capabilities parsed"

    $requiredFields = @('name', 'bootstrapKind', 'docsUrl', 'canAutoInstall')
    $fieldErrors = New-Object System.Collections.Generic.List[string]
    foreach ($capability in $capabilities) {
        foreach ($field in $requiredFields) {
            if (-not $capability.PSObject.Properties[$field]) {
                $fieldErrors.Add("$($capability.name):missing-$field")
            }
        }
    }
    Add-ValidationCheck -Name 'manifest-required-fields' -Passed ($fieldErrors.Count -eq 0) -Details $(
        if ($fieldErrors.Count -eq 0) { 'all required fields present' }
        else { $fieldErrors -join ', ' }
    )

    $duplicateNames = @($capabilities | Group-Object -Property name | Where-Object Count -gt 1 | ForEach-Object Name)
    Add-ValidationCheck -Name 'manifest-unique-names' -Passed ($duplicateNames.Count -eq 0) -Details $(
        if ($duplicateNames.Count -eq 0) { 'all capability names unique' }
        else { "duplicates: $($duplicateNames -join ', ')" }
    )

    $criticalScripts = @(
        'skills\scripts\refresh-tool-index.ps1',
        'skills\scripts\lib\ToolDiscovery.ps1'
    )
    $syntaxErrors = New-Object System.Collections.Generic.List[string]
    foreach ($relativePath in $criticalScripts) {
        $path = Join-Path $sourceRootPath $relativePath
        foreach ($parseError in Test-PowerShellSyntax -Path $path) {
            $syntaxErrors.Add("${relativePath}:$($parseError.Message)")
        }
    }
    Add-ValidationCheck -Name 'powershell-syntax' -Passed ($syntaxErrors.Count -eq 0) -Details $(
        if ($syntaxErrors.Count -eq 0) { "$($criticalScripts.Count) critical scripts parsed" }
        else { $syntaxErrors -join ' | ' }
    )

    $sourceHashes = Get-RelativeFileHashMap -Root $payloadRoot
    Compress-Archive -Path (Join-Path $payloadRoot '*') -DestinationPath $archivePath -CompressionLevel Optimal
    New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
    Expand-Archive -LiteralPath $archivePath -DestinationPath $installRoot -Force
    $installedHashes = Get-RelativeFileHashMap -Root $installRoot

    $hashMismatches = @($sourceHashes.Keys | Where-Object {
        -not $installedHashes.ContainsKey($_) -or $installedHashes[$_] -ne $sourceHashes[$_]
    })
    $archivePassed = $sourceHashes.Count -eq $installedHashes.Count -and $hashMismatches.Count -eq 0
    Add-ValidationCheck -Name 'archive-round-trip' -Passed $archivePassed -Details $(
        "source=$($sourceHashes.Count), installed=$($installedHashes.Count), mismatches=$($hashMismatches.Count), zipBytes=$((Get-Item -LiteralPath $archivePath).Length)"
    )

    $outputMarkdown = Join-Path $installRoot 'skills\tool-index.md'
    $outputJson = Join-Path $installRoot 'skills\tool-index.json'
    $refreshScript = Join-Path $installRoot 'skills\scripts\refresh-tool-index.ps1'
    $refreshOutput = & $powershellPath -NoProfile -ExecutionPolicy Bypass -File $refreshScript -OutputMarkdown $outputMarkdown -OutputJson $outputJson 2>&1
    $refreshExitCode = $LASTEXITCODE
    $refreshPassed = $refreshExitCode -eq 0 -and (Test-Path -LiteralPath $outputMarkdown) -and (Test-Path -LiteralPath $outputJson)
    Add-ValidationCheck -Name 'tool-index-generation' -Passed $refreshPassed -Details $(
        if ($refreshPassed) { "exit=0; $($refreshOutput -join '; ')" }
        else { "exit=$refreshExitCode; $($refreshOutput -join '; ')" }
    )

    $indexToolCount = 0
    $indexCapabilityCount = 0
    if ($refreshPassed) {
        try {
            $index = Get-Content -LiteralPath $outputJson -Raw -Encoding UTF8 | ConvertFrom-Json
            $indexToolCount = @($index.tools).Count
            $indexCapabilityCount = @($index.capabilities).Count
            Add-ValidationCheck -Name 'tool-index-structure' -Passed ($indexToolCount -gt 0 -and $indexCapabilityCount -eq $capabilities.Count) -Details "tools=$indexToolCount, capabilities=$indexCapabilityCount"
        }
        catch {
            Add-ValidationCheck -Name 'tool-index-structure' -Passed $false -Details $_.Exception.Message
        }
    }
    else {
        Add-ValidationCheck -Name 'tool-index-structure' -Passed $false -Details 'generation did not complete'
    }

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $adapterTestOutput = & $PythonPath -m unittest discover -s (Join-Path $sourceRootPath 'launcher\tests') -v 2>&1
        $adapterTestExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    Add-ValidationCheck -Name 'ai-adapter-isolation-tests' -Passed ($adapterTestExitCode -eq 0) -Details $(
        if ($adapterTestExitCode -eq 0) { 'isolated create, merge, idempotency, conflict, selection and rollback tests passed' }
        else { "exit=$adapterTestExitCode; $($adapterTestOutput -join '; ')" }
    )

    $passed = @($checks | Where-Object { -not $_.passed }).Count -eq 0
    $summary = [pscustomobject]@{
        passed = $passed
        source_root = $sourceRootPath
        staging_root = $stagingRootPath
        archive_bytes = (Get-Item -LiteralPath $archivePath).Length
        payload_files = $sourceHashes.Count
        manifest_capabilities = $capabilities.Count
        index_tools = $indexToolCount
        index_capabilities = $indexCapabilityCount
        checks = $checks.ToArray()
    }
    $summary | ConvertTo-Json -Depth 6

    if (-not $passed) {
        exit 1
    }
}
finally {
    if ($createdStaging -and -not $KeepStaging) {
        $tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if ($stagingRootPath.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $stagingRootPath)) {
            Remove-Item -LiteralPath $stagingRootPath -Recurse -Force
        }
    }
}
