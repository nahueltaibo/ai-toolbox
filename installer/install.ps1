param(
    # Local ai-toolbox checkout to read from instead of downloading from GitHub. Defaults to this
    # script's own repo root when run from a real file inside one (so a local checkout just works
    # with no flags); stays empty when piped in via `irm | iex`, where there's no real file on disk.
    [string]$Source = $(
        if ($PSScriptRoot) {
            $candidate = Split-Path -Parent $PSScriptRoot
            if (Test-Path (Join-Path $candidate "registry.json")) { $candidate }
        }
    ),
    # Non-interactive: act on a single tool id instead of showing the picker.
    [string]$Id,
    [ValidateSet("user", "repo")]
    [string]$Scope,
    [switch]$Remove,
    # Print the status table and exit.
    [switch]$List,
    # Override the repo-level target instead of auto-detecting the git root of the current directory.
    [string]$TargetRepo
)

$ErrorActionPreference = "Stop"
$RawBase = "https://raw.githubusercontent.com/nahueltaibo/ai-toolbox/main"

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-RemoteOrLocal([string]$RelativePath, [string]$SourceRoot = $Source) {
    if ($SourceRoot) {
        $path = Join-Path $SourceRoot $RelativePath
        if (-not (Test-Path $path)) { throw "Not found: $path" }
        # Get-Content's encoding auto-detection mangles non-ASCII in BOM-less UTF-8 files; read raw bytes instead.
        return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    }
    return (Invoke-WebRequest -UseBasicParsing -Uri "$RawBase/$RelativePath").Content
}

function Get-UserSkillsRoot { Join-Path $HOME ".claude\skills" }
function Get-UserStateFile { Join-Path $HOME ".ai-framework-installed.json" }
function Get-RepoSkillsRoot([string]$RepoRoot) { Join-Path $RepoRoot ".claude\skills" }
function Get-RepoStateFile([string]$RepoRoot) { Join-Path $RepoRoot ".ai-framework-installed.json" }
function Get-UserClaudeMdPath { Join-Path $HOME ".claude\CLAUDE.md" }
function Get-RepoClaudeMdPath([string]$RepoRoot) { Join-Path $RepoRoot "CLAUDE.md" }

# Instructions-type tools live as a marker-delimited block inside CLAUDE.md rather than a standalone
# file, so multiple entries (and the user's own notes) can share one file. The version rides in the
# start marker itself - the file is the source of truth, not the separate install-state JSON - so
# staleness is detectable even if that file was hand-copied or committed without the state file.
function Get-SectionPattern([string]$Id) {
    return "(?s)<!-- ai-framework:$([regex]::Escape($Id)):v\S+:start -->.*?<!-- ai-framework:$([regex]::Escape($Id)):end -->"
}

function Get-SectionVersion([string]$Content, [string]$Id) {
    if ($Content -match "<!-- ai-framework:$([regex]::Escape($Id)):v(\S+):start -->") { return $Matches[1] }
    return $null
}

function New-SectionBlock($Tool, [string]$Body) {
    $start = "<!-- ai-framework:$($Tool.id):v$($Tool.version):start -->"
    $end = "<!-- ai-framework:$($Tool.id):end -->"
    return "$start`n$($Body.Trim())`n$end"
}

function Set-Section([string]$TargetFile, $Tool, [string]$Body) {
    $block = New-SectionBlock $Tool $Body
    $existing = ""
    if (Test-Path $TargetFile) { $existing = [System.IO.File]::ReadAllText($TargetFile, [System.Text.Encoding]::UTF8) }
    $pattern = Get-SectionPattern $Tool.id
    if ($existing -match $pattern) {
        # Double every '$' first - .NET's string-replacement overload treats '$1' etc. as backreferences,
        # and the injected body is arbitrary markdown that may contain a literal '$'.
        $updated = [regex]::Replace($existing, $pattern, $block.Replace('$', '$$'))
    }
    elseif ($existing.Trim().Length -gt 0) {
        $updated = $existing.TrimEnd() + "`n`n" + $block + "`n"
    }
    else {
        $updated = $block + "`n"
    }
    Write-Utf8NoBom -Path $TargetFile -Content $updated
}

function Remove-Section([string]$TargetFile, [string]$Id) {
    if (-not (Test-Path $TargetFile)) { return }
    $existing = [System.IO.File]::ReadAllText($TargetFile, [System.Text.Encoding]::UTF8)
    $pattern = Get-SectionPattern $Id
    if ($existing -notmatch $pattern) { return }
    $updated = [regex]::Replace($existing, $pattern, "")
    $updated = [regex]::Replace($updated, "(\r?\n){3,}", "`n`n").Trim()
    if ($updated.Length -gt 0) { $updated += "`n" }
    Write-Utf8NoBom -Path $TargetFile -Content $updated
}

# For "skill" tools, installed version comes from the tracked install-state JSON. For "instructions"
# tools it comes straight from the marker in the target CLAUDE.md, which is the actual ground truth.
function Get-EffectiveInstalledVersion($Tool, $Installs, [string]$TargetFile) {
    if ($Tool.type -eq "instructions") {
        if (-not $TargetFile -or -not (Test-Path $TargetFile)) { return $null }
        $content = [System.IO.File]::ReadAllText($TargetFile, [System.Text.Encoding]::UTF8)
        return Get-SectionVersion $content $Tool.id
    }
    return Get-InstalledVersion $Installs $Tool.id
}

function Find-RepoRoot([string]$Override = $TargetRepo) {
    if ($Override) { return $Override }
    $gitOutput = git rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -eq 0 -and $gitOutput) { return ($gitOutput -replace '/', '\') }
    return $null
}

function Read-State([string]$StateFile) {
    # -NoEnumerate is what actually keeps an array intact across the pipeline boundary - the unary
    # comma operator builds a *new* wrapping array instead (correct for a real multi-item array by
    # coincidence, wrong for the 0- and 1-item cases, where it silently nests instead of preserving).
    if (Test-Path $StateFile) {
        $json = Get-Content -Raw -Path $StateFile | ConvertFrom-Json
        if ($json.installs) {
            Write-Output -NoEnumerate @($json.installs)
            return
        }
    }
    Write-Output -NoEnumerate @()
}

function Save-State([string]$StateFile, $Installs) {
    $installsArray = @($Installs)
    if ($installsArray.Count -eq 0) {
        # Nothing left to track - don't leave an empty state file behind.
        if (Test-Path $StateFile) { Remove-Item -Force $StateFile }
        return
    }
    $obj = [PSCustomObject]@{ installs = $installsArray }
    Write-Utf8NoBom -Path $StateFile -Content ($obj | ConvertTo-Json -Depth 5)
}

function Get-InstalledVersion($Installs, [string]$ToolId) {
    $entry = $Installs | Where-Object { $_.id -eq $ToolId }
    if ($entry) { return $entry.version }
    return $null
}

function Format-Status([string]$InstalledVersion, $Tool) {
    if (-not $InstalledVersion) { return "not installed" }
    if ($InstalledVersion -ne $Tool.version) { return "v$InstalledVersion -> v$($Tool.version)" }
    return "v$InstalledVersion"
}

function Get-StatusColor([string]$Status) {
    if ($Status -eq "not installed" -or $Status -eq "-") { return "DarkGray" }
    if ($Status -like "*->*") { return "Yellow" }
    return "Green"
}

function Get-MaxLength([string[]]$Values, [int]$Floor) {
    $max = $Floor
    foreach ($v in $Values) { if ($v.Length -gt $max) { $max = $v.Length } }
    return $max
}

function Test-ArrowUiSupported {
    # Fails when there's no real console to move a cursor in (piped/redirected stdin, some CI runners, ISE).
    try {
        if ([Console]::IsInputRedirected) { return $false }
        $null = [Console]::WindowWidth
        $null = [Console]::CursorTop
        return $true
    }
    catch {
        return $false
    }
}

function Write-MenuLine([string]$Text, [bool]$Highlighted) {
    $width = [Console]::WindowWidth - 1
    $line = $Text
    if ($line.Length -gt $width) { $line = $line.Substring(0, $width) }
    $line = $line.PadRight($width)
    if ($Highlighted) { Write-Host $line -ForegroundColor Black -BackgroundColor Cyan }
    else { Write-Host $line }
}

# Arrow-key checkbox picker. Returns an array of selected indices into $Items, or $null if the
# caller should fall back to plain Read-Host (no usable console), or an empty array if cancelled.
function Show-CheckboxMenu([string[]]$Items, [string]$Title) {
    if (-not (Test-ArrowUiSupported)) { return $null }
    if (-not $Items -or $Items.Count -eq 0) { Write-Output -NoEnumerate @(); return }

    $selected = New-Object bool[] ($Items.Count)
    $cursor = 0
    $cancelled = $false

    Write-Host $Title -ForegroundColor Cyan
    Write-Host "  Up/Down to move, Space to select, Enter to confirm, Esc to cancel" -ForegroundColor DarkGray
    [Console]::CursorVisible = $false

    function Draw {
        for ($i = 0; $i -lt $Items.Count; $i++) {
            $mark = if ($selected[$i]) { "[x]" } else { "[ ]" }
            Write-MenuLine "$(if ($i -eq $cursor) { '>' } else { ' ' }) $mark $($Items[$i])" ($i -eq $cursor)
        }
    }

    try {
        Draw
        while ($true) {
            $key = [Console]::ReadKey($true)
            if ($key.Key -eq "UpArrow") { $cursor = ($cursor - 1 + $Items.Count) % $Items.Count }
            elseif ($key.Key -eq "DownArrow") { $cursor = ($cursor + 1) % $Items.Count }
            elseif ($key.Key -eq "Spacebar") { $selected[$cursor] = -not $selected[$cursor] }
            elseif ($key.Key -eq "Enter") { break }
            elseif ($key.Key -eq "Escape") { $cancelled = $true; break }
            else { continue }
            # Move up by relative offset (not a cached absolute row) so this still lands in the
            # right place even if the console scrolled since the last redraw.
            [Console]::SetCursorPosition(0, [Console]::CursorTop - $Items.Count)
            Draw
        }
    }
    finally {
        [Console]::CursorVisible = $true
    }
    Write-Host ""

    if ($cancelled) { Write-Output -NoEnumerate @(); return }
    $result = @()
    for ($i = 0; $i -lt $Items.Count; $i++) { if ($selected[$i]) { $result += $i } }
    if ($result.Count -eq 0) { $result = @($cursor) }
    # -NoEnumerate: a single checked item must still come back as a 1-element array, not unroll to
    # a bare int - the caller distinguishes "selected item 0" from "nothing selected" by shape.
    Write-Output -NoEnumerate $result
}

# Arrow-key single-item picker. Returns the chosen index, $null if the caller should fall back to
# Read-Host, or -1 if cancelled.
function Show-SingleSelectMenu([string[]]$Items, [string]$Title) {
    if (-not (Test-ArrowUiSupported)) { return $null }
    if (-not $Items -or $Items.Count -eq 0) { return -1 }

    $cursor = 0
    $cancelled = $false

    Write-Host $Title -ForegroundColor Cyan
    Write-Host "  Up/Down to move, Enter to confirm, Esc to cancel" -ForegroundColor DarkGray
    [Console]::CursorVisible = $false

    function Draw {
        for ($i = 0; $i -lt $Items.Count; $i++) {
            Write-MenuLine "$(if ($i -eq $cursor) { '>' } else { ' ' }) $($Items[$i])" ($i -eq $cursor)
        }
    }

    try {
        Draw
        while ($true) {
            $key = [Console]::ReadKey($true)
            if ($key.Key -eq "UpArrow") { $cursor = ($cursor - 1 + $Items.Count) % $Items.Count }
            elseif ($key.Key -eq "DownArrow") { $cursor = ($cursor + 1) % $Items.Count }
            elseif ($key.Key -eq "Enter") { break }
            elseif ($key.Key -eq "Escape") { $cancelled = $true; break }
            else { continue }
            [Console]::SetCursorPosition(0, [Console]::CursorTop - $Items.Count)
            Draw
        }
    }
    finally {
        [Console]::CursorVisible = $true
    }
    Write-Host ""

    if ($cancelled) { return -1 }
    return $cursor
}

function Show-Table($Tools, $UserState, $RepoRoot, $RepoState) {
    $maxDescWidth = 55
    $rows = @()
    for ($i = 0; $i -lt $Tools.Count; $i++) {
        $t = $Tools[$i]
        $desc = $t.description
        if ($desc.Length -gt $maxDescWidth) { $desc = $desc.Substring(0, $maxDescWidth - 3) + "..." }
        $userVersion = Get-EffectiveInstalledVersion $t $UserState (Get-UserClaudeMdPath)
        $repoStatus = "-"
        if ($RepoRoot) {
            $repoVersion = Get-EffectiveInstalledVersion $t $RepoState (Get-RepoClaudeMdPath $RepoRoot)
            $repoStatus = Format-Status $repoVersion $t
        }
        $rows += [PSCustomObject]@{
            Num         = "$($i + 1)"
            Name        = $t.id
            Description = $desc
            User        = Format-Status $userVersion $t
            Repo        = $repoStatus
        }
    }

    $numW = Get-MaxLength @($rows | ForEach-Object { $_.Num }) 1
    $nameW = Get-MaxLength (@("Name") + @($rows | ForEach-Object { $_.Name })) 4
    $descW = Get-MaxLength (@("Description") + @($rows | ForEach-Object { $_.Description })) 11
    $userW = Get-MaxLength (@("User") + @($rows | ForEach-Object { $_.User })) 4
    $repoW = Get-MaxLength (@("Repo") + @($rows | ForEach-Object { $_.Repo })) 4

    Write-Host ""
    if ($RepoRoot) { Write-Host "Repo: $RepoRoot" -ForegroundColor DarkGray }
    Write-Host ""

    $headerLine = "{0,-$numW}  {1,-$nameW}  {2,-$descW}  {3,-$userW}  {4,-$repoW}" -f "#", "Name", "Description", "User", "Repo"
    Write-Host $headerLine
    Write-Host ("-" * $headerLine.Length) -ForegroundColor DarkGray

    foreach ($r in $rows) {
        Write-Host ("{0,-$numW}  {1,-$nameW}  {2,-$descW}  " -f $r.Num, $r.Name, $r.Description) -NoNewline
        Write-Host ("{0,-$userW}" -f $r.User) -ForegroundColor (Get-StatusColor $r.User) -NoNewline
        Write-Host "  " -NoNewline
        Write-Host ("{0,-$repoW}" -f $r.Repo) -ForegroundColor (Get-StatusColor $r.Repo)
    }
    Write-Host ""
}

function Install-Instructions($Tool, [string]$ScopeName, [string]$RepoRoot, [string]$SourceRoot) {
    if ($ScopeName -eq "user") {
        $targetFile = Get-UserClaudeMdPath
    }
    else {
        if (-not $RepoRoot) { Write-Host "  No git repo detected here - skipping repo install for $($Tool.id)" -ForegroundColor Yellow; return }
        $targetFile = Get-RepoClaudeMdPath $RepoRoot
    }
    $body = Get-RemoteOrLocal $Tool.path $SourceRoot
    Set-Section $targetFile $Tool $body
    Write-Host "  Installed $($Tool.id) v$($Tool.version) -> $ScopeName ($targetFile)" -ForegroundColor Green
}

function Remove-Instructions($Tool, [string]$ScopeName, [string]$RepoRoot) {
    if ($ScopeName -eq "user") {
        $targetFile = Get-UserClaudeMdPath
    }
    else {
        if (-not $RepoRoot) { return }
        $targetFile = Get-RepoClaudeMdPath $RepoRoot
    }
    Remove-Section $targetFile $Tool.id
    Write-Host "  Removed $($Tool.id) from $ScopeName" -ForegroundColor Yellow
}

function Install-Tool($Tool, [string]$ScopeName, [ref]$UserState, [string]$RepoRoot, [ref]$RepoState, [string]$SourceRoot = $Source) {
    if ($Tool.type -eq "instructions") {
        Install-Instructions $Tool $ScopeName $RepoRoot $SourceRoot
        return
    }

    $content = Get-RemoteOrLocal $Tool.path $SourceRoot

    if ($ScopeName -eq "user") {
        $targetFile = Join-Path (Join-Path (Get-UserSkillsRoot) $Tool.id) "SKILL.md"
        $stateFile = Get-UserStateFile
        $installs = @($UserState.Value | Where-Object { $_.id -ne $Tool.id })
    }
    else {
        if (-not $RepoRoot) { Write-Host "  No git repo detected here - skipping repo install for $($Tool.id)" -ForegroundColor Yellow; return }
        $targetFile = Join-Path (Join-Path (Get-RepoSkillsRoot $RepoRoot) $Tool.id) "SKILL.md"
        $stateFile = Get-RepoStateFile $RepoRoot
        $installs = @($RepoState.Value | Where-Object { $_.id -ne $Tool.id })
    }

    Write-Utf8NoBom -Path $targetFile -Content $content
    $installs += [PSCustomObject]@{
        id          = $Tool.id
        version     = $Tool.version
        scope       = $ScopeName
        installedAt = (Get-Date -Format "yyyy-MM-dd")
    }
    Save-State $stateFile $installs

    if ($ScopeName -eq "user") { $UserState.Value = $installs } else { $RepoState.Value = $installs }
    Write-Host "  Installed $($Tool.id) v$($Tool.version) -> $ScopeName ($targetFile)" -ForegroundColor Green
}

function Remove-Tool($Tool, [string]$ScopeName, [ref]$UserState, [string]$RepoRoot, [ref]$RepoState) {
    if ($Tool.type -eq "instructions") {
        Remove-Instructions $Tool $ScopeName $RepoRoot
        return
    }

    if ($ScopeName -eq "user") {
        $targetDir = Join-Path (Get-UserSkillsRoot) $Tool.id
        $stateFile = Get-UserStateFile
        $installs = @($UserState.Value | Where-Object { $_.id -ne $Tool.id })
    }
    else {
        if (-not $RepoRoot) { return }
        $targetDir = Join-Path (Get-RepoSkillsRoot $RepoRoot) $Tool.id
        $stateFile = Get-RepoStateFile $RepoRoot
        $installs = @($RepoState.Value | Where-Object { $_.id -ne $Tool.id })
    }

    if (Test-Path $targetDir) { Remove-Item -Recurse -Force $targetDir }
    Save-State $stateFile $installs
    if ($ScopeName -eq "user") { $UserState.Value = $installs } else { $RepoState.Value = $installs }
    Write-Host "  Removed $($Tool.id) from $ScopeName" -ForegroundColor Yellow
}

# --- main ---
# Skipped when dot-sourced (Pester loads the functions above this way) so tests never trigger a
# network fetch, a git call, or an interactive prompt just by importing the script.
if ($MyInvocation.InvocationName -ne '.') {

    $registry = Get-RemoteOrLocal "registry.json" | ConvertFrom-Json
    $tools = @($registry.tools)

    $repoRoot = Find-RepoRoot
    $userState = Read-State (Get-UserStateFile)
    $repoState = @()
    if ($repoRoot) { $repoState = Read-State (Get-RepoStateFile $repoRoot) }

    if ($List) {
        Show-Table $tools $userState $repoRoot $repoState
        exit 0
    }

    if ($Id) {
        $tool = $tools | Where-Object { $_.id -eq $Id }
        if (-not $tool) { Write-Error "Unknown tool id: $Id"; exit 1 }
        if (-not $Scope) { $Scope = "user" }
        if ($Remove) {
            Remove-Tool $tool $Scope ([ref]$userState) $repoRoot ([ref]$repoState)
        }
        else {
            Install-Tool $tool $Scope ([ref]$userState) $repoRoot ([ref]$repoState)
        }
        exit 0
    }

    Write-Host "ai-toolbox installer" -ForegroundColor Cyan
    Show-Table $tools $userState $repoRoot $repoState

    $itemLabels = @("All tools")
    foreach ($t in $tools) {
        $userVersion = Get-EffectiveInstalledVersion $t $userState (Get-UserClaudeMdPath)
        $repoStatus = "-"
        if ($repoRoot) {
            $repoVersion = Get-EffectiveInstalledVersion $t $repoState (Get-RepoClaudeMdPath $repoRoot)
            $repoStatus = Format-Status $repoVersion $t
        }
        $itemLabels += "{0,-22} User: {1,-20} Repo: {2}" -f $t.id, (Format-Status $userVersion $t), $repoStatus
    }

    $usingArrowUi = Test-ArrowUiSupported

    if (-not $usingArrowUi) {
        # No usable console for arrow-key input (e.g. redirected stdin) - fall back to plain text entry.
        $selection = Read-Host "`nTool number(s) to install/update (comma-separated), 'a' for all, 'r <numbers|a>' to remove, or Enter to quit"
        if ([string]::IsNullOrWhiteSpace($selection)) { exit 0 }

        $isRemove = $false
        if ($selection.Trim() -like 'r *') {
            $isRemove = $true
            $selection = $selection.Trim().Substring(2)
        }
        $selection = $selection.Trim()

        if ($selection -eq 'a') {
            $selectedTools = $tools
        }
        else {
            $selectedTools = @()
            foreach ($token in ($selection -split ',')) {
                $token = $token.Trim()
                if (-not $token) { continue }
                $n = 0
                if ([int]::TryParse($token, [ref]$n) -and $n -ge 1 -and $n -le $tools.Count) {
                    $selectedTools += $tools[$n - 1]
                }
                else {
                    Write-Host "Skipping invalid selection: $token" -ForegroundColor Yellow
                }
            }
        }

        if ($selectedTools.Count -eq 0) { Write-Host "Nothing selected."; exit 0 }

        $scopesToApply = @("user")
        if ($repoRoot) {
            $scopeChoice = Read-Host "Target - [1] User  [2] Repo ($repoRoot)  [3] Both (default: 1)"
            switch ($scopeChoice.Trim()) {
                "2" { $scopesToApply = @("repo") }
                "3" { $scopesToApply = @("user", "repo") }
                default { $scopesToApply = @("user") }
            }
        }
    }
    else {
        # A small step wizard (tools -> action -> target) so "< Back" can return to the previous
        # step instead of the only alternative being to cancel the whole thing and start over.
        $step = 0
        while ($step -lt 3) {
            switch ($step) {
                0 {
                    $chosenIndices = Show-CheckboxMenu $itemLabels "`nSelect tool(s):"
                    if ($chosenIndices.Count -eq 0) { Write-Host "Cancelled."; exit 0 }
                    if ($chosenIndices -contains 0) {
                        $selectedTools = $tools
                    }
                    else {
                        $selectedTools = $chosenIndices | ForEach-Object { $tools[$_ - 1] }
                    }
                    $step = 1
                }
                1 {
                    $actionItems = @("< Back", "Install / update", "Remove")
                    $actionIdx = Show-SingleSelectMenu $actionItems "`nAction:"
                    if ($actionIdx -le 0) { $step = 0; continue }
                    $isRemove = ($actionIdx -eq 2)
                    $step = 2
                }
                2 {
                    $scopeItems = @("< Back", "User")
                    if ($repoRoot) { $scopeItems += "Repo ($repoRoot)"; $scopeItems += "Both" }
                    $scopeIdx = Show-SingleSelectMenu $scopeItems "`nTarget:"
                    if ($scopeIdx -le 0) { $step = 1; continue }

                    if ($scopeIdx -eq 1) { $scopesToApply = @("user") }
                    elseif ($scopeIdx -eq 2) { $scopesToApply = @("repo") }
                    else { $scopesToApply = @("user", "repo") }
                    $step = 3
                }
            }
        }
    }

    $actionWord = if ($isRemove) { "Remove" } else { "Install/update" }
    $toolNames = ($selectedTools | ForEach-Object { $_.id }) -join ", "
    $scopeWord = $scopesToApply -join " + "
    Write-Host ""
    Write-Host "$actionWord [$toolNames] -> $scopeWord" -ForegroundColor Cyan
    $confirm = Read-Host "Proceed? (y/N)"
    if ($confirm.Trim().ToLower() -ne "y") { Write-Host "Cancelled."; exit 0 }

    foreach ($tool in $selectedTools) {
        foreach ($scopeName in $scopesToApply) {
            if ($isRemove) {
                Remove-Tool $tool $scopeName ([ref]$userState) $repoRoot ([ref]$repoState)
            }
            else {
                Install-Tool $tool $scopeName ([ref]$userState) $repoRoot ([ref]$repoState)
            }
        }
    }

    Write-Host "`nDone." -ForegroundColor Cyan
    Show-Table $tools $userState $repoRoot $repoState
}
