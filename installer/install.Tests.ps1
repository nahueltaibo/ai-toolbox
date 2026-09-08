# Run with: Invoke-Pester -Path .\installer\install.Tests.ps1
# Targets current Pester (5.x/6.x) syntax - Should -Be, BeforeAll/BeforeEach/AfterAll/AfterEach.

BeforeAll {
    # Dot-sourcing loads every function without running the script's main block (guarded to skip
    # whenever InvocationName is '.'), so this never touches the network, git, or the console.
    . (Join-Path $PSScriptRoot "install.ps1")
}

Describe "Get-MaxLength" {
    It "returns the floor when every value is shorter than it" {
        Get-MaxLength @("a", "bb") 5 | Should -Be 5
    }

    It "returns the longest value's length when it exceeds the floor" {
        Get-MaxLength @("a", "bbbbbb") 2 | Should -Be 6
    }
}

Describe "Get-StatusColor" {
    It "colors 'not installed' gray" {
        Get-StatusColor "not installed" | Should -Be "DarkGray"
    }

    It "colors '-' (not applicable) gray" {
        Get-StatusColor "-" | Should -Be "DarkGray"
    }

    It "colors an update-available string yellow" {
        Get-StatusColor "v1.0.0 -> v1.1.0" | Should -Be "Yellow"
    }

    It "colors an up-to-date version green" {
        Get-StatusColor "v1.0.0" | Should -Be "Green"
    }
}

Describe "Get-InstalledVersion" {
    It "returns null when there's no matching entry" {
        Get-InstalledVersion @() "foo" | Should -BeNullOrEmpty
    }

    It "returns the recorded version for a matching entry" {
        $installs = @([PSCustomObject]@{ id = "foo"; version = "1.0.0" })
        Get-InstalledVersion $installs "foo" | Should -Be "1.0.0"
    }
}

Describe "Format-Status" {
    BeforeAll {
        $tool = [PSCustomObject]@{ id = "foo"; version = "2.0.0" }
    }

    It "reports 'not installed' when there's no installed version" {
        Format-Status $null $tool | Should -Be "not installed"
    }

    It "reports the current version when it matches the registry" {
        Format-Status "2.0.0" $tool | Should -Be "v2.0.0"
    }

    It "reports an upgrade arrow when the installed version is behind the registry" {
        Format-Status "1.0.0" $tool | Should -Be "v1.0.0 -> v2.0.0"
    }
}

Describe "Get-SectionVersion" {
    It "returns null when the marker isn't present" {
        Get-SectionVersion "# CLAUDE.md`n`nsome notes" "output-guidelines" | Should -BeNullOrEmpty
    }

    It "extracts the version from the start marker" {
        $content = "<!-- ai-framework:output-guidelines:v1.2.0:start -->`nbody`n<!-- ai-framework:output-guidelines:end -->"
        Get-SectionVersion $content "output-guidelines" | Should -Be "1.2.0"
    }
}

Describe "Get-EffectiveInstalledVersion" {
    BeforeAll {
        $skillTool = [PSCustomObject]@{ id = "demo-skill"; type = "skill"; version = "1.0.0" }
        $instrTool = [PSCustomObject]@{ id = "output-guidelines"; type = "instructions"; version = "1.0.0" }
    }

    It "reads from the install-state array for a skill tool" {
        $installs = @([PSCustomObject]@{ id = "demo-skill"; version = "1.0.0" })
        Get-EffectiveInstalledVersion $skillTool $installs "C:\doesnt\matter\CLAUDE.md" | Should -Be "1.0.0"
    }

    It "returns null for an instructions tool when the target file doesn't exist" {
        $missing = Join-Path ([System.IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString() + ".md")
        Get-EffectiveInstalledVersion $instrTool @() $missing | Should -BeNullOrEmpty
    }

    It "reads the version from the marker in the target file for an instructions tool" {
        $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("aiframework-effver-" + [Guid]::NewGuid() + ".md")
        try {
            Write-Utf8NoBom -Path $tempFile -Content "<!-- ai-framework:output-guidelines:v1.0.0:start -->`nbody`n<!-- ai-framework:output-guidelines:end -->"
            Get-EffectiveInstalledVersion $instrTool @() $tempFile | Should -Be "1.0.0"
        }
        finally {
            if (Test-Path $tempFile) { Remove-Item -Force $tempFile }
        }
    }
}

Describe "Set-Section / Remove-Section" {
    BeforeEach {
        $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("aiframework-section-" + [Guid]::NewGuid() + ".md")
        $tool = [PSCustomObject]@{ id = "output-guidelines"; version = "1.0.0" }
    }

    AfterEach {
        if (Test-Path $tempFile) { Remove-Item -Force $tempFile }
    }

    It "creates the file when it doesn't exist yet" {
        Set-Section $tempFile $tool "Rule body"
        Test-Path $tempFile | Should -BeTrue
        Get-Content -Raw $tempFile | Should -Match "<!-- ai-framework:output-guidelines:v1.0.0:start -->"
    }

    It "appends the section below existing content without disturbing it" {
        Write-Utf8NoBom -Path $tempFile -Content "# My CLAUDE.md`n`nsome existing notes"
        Set-Section $tempFile $tool "Rule body"
        $content = Get-Content -Raw $tempFile
        $content | Should -Match "some existing notes"
        $content | Should -Match "Rule body"
    }

    It "replaces an existing block in place on update, preserving surrounding content and the newest version" {
        Write-Utf8NoBom -Path $tempFile -Content "# My CLAUDE.md`n`nsome existing notes"
        Set-Section $tempFile $tool "old body"
        $newTool = [PSCustomObject]@{ id = "output-guidelines"; version = "1.1.0" }
        Set-Section $tempFile $newTool "new body"
        $content = Get-Content -Raw $tempFile
        $content | Should -Match "some existing notes"
        $content | Should -Not -Match "old body"
        $content | Should -Match "new body"
        $content | Should -Match "v1.1.0:start"
        ([regex]::Matches($content, "ai-framework:output-guidelines:v\S+:start")).Count | Should -Be 1
    }

    It "Remove-Section deletes the block and leaves the rest of the file intact" {
        Write-Utf8NoBom -Path $tempFile -Content "# My CLAUDE.md`n`nsome existing notes"
        Set-Section $tempFile $tool "Rule body"
        Remove-Section $tempFile $tool.id
        $content = Get-Content -Raw $tempFile
        $content | Should -Match "some existing notes"
        $content | Should -Not -Match "ai-framework:output-guidelines"
    }

    It "Remove-Section is a no-op when the file has no matching block" {
        Write-Utf8NoBom -Path $tempFile -Content "# My CLAUDE.md`n`nsome existing notes"
        Remove-Section $tempFile $tool.id
        Get-Content -Raw $tempFile | Should -Match "some existing notes"
    }
}

Describe "Write-Utf8NoBom" {
    BeforeEach {
        $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
    }

    AfterEach {
        if (Test-Path $tempFile) { Remove-Item -Recurse -Force $tempFile }
    }

    It "round-trips a non-ASCII character without corruption" {
        # Regression test: Get-Content's encoding guessing once mangled em dashes on read, and a
        # literal em dash in the .ps1 source itself was mangled too. Built from a codepoint here
        # so this test file carries no non-ASCII bytes of its own.
        $emDash = [char]0x2014
        $content = "before $emDash after"
        Write-Utf8NoBom -Path $tempFile -Content $content
        [System.IO.File]::ReadAllText($tempFile, [System.Text.Encoding]::UTF8) | Should -Be $content
    }

    It "writes without a UTF-8 BOM" {
        Write-Utf8NoBom -Path $tempFile -Content "hello"
        $bytes = [System.IO.File]::ReadAllBytes($tempFile)
        $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
        $hasBom | Should -BeFalse
    }

    It "creates the parent directory if it doesn't exist yet" {
        $nestedFile = Join-Path $tempFile "nested\file.md"
        Write-Utf8NoBom -Path $nestedFile -Content "hi"
        Test-Path $nestedFile | Should -BeTrue
    }
}

Describe "Save-State / Read-State" {
    BeforeEach {
        $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) ("aiframework-state-" + [Guid]::NewGuid() + ".json")
    }

    AfterEach {
        if (Test-Path $tempFile) { Remove-Item -Force $tempFile }
    }

    It "writes and reads back installed entries" {
        $installs = @([PSCustomObject]@{ id = "foo"; version = "1.0.0"; scope = "user"; installedAt = "2026-01-01" })
        Save-State $tempFile $installs
        $readBack = Read-State $tempFile
        $readBack.Count | Should -Be 1
        $readBack[0].id | Should -Be "foo"
        $readBack[0].version | Should -Be "1.0.0"
    }

    It "Read-State returns an empty array when the file doesn't exist" {
        # Uses its own path rather than the shared $tempFile fixture, so this assertion can't be
        # affected by leftover state from another Describe's use of the same variable name.
        # Plain assignment, not `| Should -HaveCount` or `@(...)`: Read-State uses -NoEnumerate so
        # a caller's simple assignment receives the real array intact. Piping it re-enumerates it
        # (defeating -NoEnumerate) and @() around the call wraps the already-whole array again.
        $missingFile = Join-Path ([System.IO.Path]::GetTempPath()) ("aiframework-missing-" + [Guid]::NewGuid() + ".json")
        $result = Read-State $missingFile
        $result.Count | Should -Be 0
    }

    It "deletes the state file instead of writing an empty installs array" {
        Save-State $tempFile @([PSCustomObject]@{ id = "foo"; version = "1.0.0" })
        Test-Path $tempFile | Should -BeTrue
        Save-State $tempFile @()
        Test-Path $tempFile | Should -BeFalse
    }
}

Describe "Find-RepoRoot" {
    It "returns the override directly when it's set, without shelling out to git" {
        Find-RepoRoot -Override "C:\some\fake\repo" | Should -Be "C:\some\fake\repo"
    }
}

Describe "Get-RemoteOrLocal (local source)" {
    BeforeAll {
        $fixtureDir = Join-Path ([System.IO.Path]::GetTempPath()) ("aiframework-fixture-" + [Guid]::NewGuid())
        New-Item -ItemType Directory -Force -Path $fixtureDir | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $fixtureDir "hello.txt"), "hello world", (New-Object System.Text.UTF8Encoding($false)))
    }

    AfterAll {
        Remove-Item -Recurse -Force $fixtureDir -ErrorAction SilentlyContinue
    }

    It "reads a file relative to -SourceRoot" {
        Get-RemoteOrLocal "hello.txt" $fixtureDir | Should -Be "hello world"
    }

    It "throws when the file doesn't exist under -SourceRoot" {
        { Get-RemoteOrLocal "missing.txt" $fixtureDir } | Should -Throw
    }
}

Describe "Install-Tool and Remove-Tool (repo scope)" {
    BeforeAll {
        $fakeSource = Join-Path ([System.IO.Path]::GetTempPath()) ("aiframework-source-" + [Guid]::NewGuid())
        $fakeRepo = Join-Path ([System.IO.Path]::GetTempPath()) ("aiframework-repo-" + [Guid]::NewGuid())
        New-Item -ItemType Directory -Force -Path (Join-Path $fakeSource "skills\demo-tool") | Out-Null
        New-Item -ItemType Directory -Force -Path $fakeRepo | Out-Null
        $skillContent = "---`nname: demo-tool`ndescription: test fixture`n---`n`nbody"
        [System.IO.File]::WriteAllText((Join-Path $fakeSource "skills\demo-tool\SKILL.md"), $skillContent, (New-Object System.Text.UTF8Encoding($false)))

        $tool = [PSCustomObject]@{ id = "demo-tool"; version = "1.0.0"; path = "skills/demo-tool/SKILL.md" }
        $userState = @()
        $repoState = @()
    }

    AfterAll {
        Remove-Item -Recurse -Force $fakeSource -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $fakeRepo -ErrorAction SilentlyContinue
    }

    It "writes SKILL.md into <repo>/.claude/skills/<id>/" {
        Install-Tool $tool "repo" ([ref]$userState) $fakeRepo ([ref]$repoState) $fakeSource
        $expectedFile = Join-Path $fakeRepo ".claude\skills\demo-tool\SKILL.md"
        Test-Path $expectedFile | Should -BeTrue
        Get-Content -Raw $expectedFile | Should -Match "test fixture"
    }

    It "records the installed version in the repo state" {
        $repoState.Count | Should -Be 1
        $repoState[0].id | Should -Be "demo-tool"
        $repoState[0].version | Should -Be "1.0.0"
    }

    It "persists the repo state file to disk" {
        Test-Path (Join-Path $fakeRepo ".ai-framework-installed.json") | Should -BeTrue
    }

    It "does not touch user scope when installing to repo scope" {
        $userState.Count | Should -Be 0
    }

    It "Remove-Tool deletes the installed folder and clears the state" {
        Remove-Tool $tool "repo" ([ref]$userState) $fakeRepo ([ref]$repoState)
        Test-Path (Join-Path $fakeRepo ".claude\skills\demo-tool") | Should -BeFalse
        $repoState.Count | Should -Be 0
    }

    It "removing the only entry deletes the repo state file" {
        Test-Path (Join-Path $fakeRepo ".ai-framework-installed.json") | Should -BeFalse
    }
}

Describe "Install-Tool and Remove-Tool (instructions type, repo scope)" {
    BeforeAll {
        $fakeSource = Join-Path ([System.IO.Path]::GetTempPath()) ("aiframework-source-" + [Guid]::NewGuid())
        $fakeRepo = Join-Path ([System.IO.Path]::GetTempPath()) ("aiframework-repo-" + [Guid]::NewGuid())
        New-Item -ItemType Directory -Force -Path (Join-Path $fakeSource "instructions\output-guidelines") | Out-Null
        New-Item -ItemType Directory -Force -Path $fakeRepo | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $fakeSource "instructions\output-guidelines\CONTENT.md"), "# Writing Rules`n`nLead with the answer.", (New-Object System.Text.UTF8Encoding($false)))
        # Pre-existing repo CLAUDE.md content that must survive install/update/remove untouched.
        Write-Utf8NoBom -Path (Join-Path $fakeRepo "CLAUDE.md") -Content "# Repo notes`n`nDon't touch this."

        $tool = [PSCustomObject]@{ id = "output-guidelines"; type = "instructions"; version = "1.0.0"; path = "instructions/output-guidelines/CONTENT.md" }
        $userState = @()
        $repoState = @()
    }

    AfterAll {
        Remove-Item -Recurse -Force $fakeSource -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force $fakeRepo -ErrorAction SilentlyContinue
    }

    It "injects the marked section into the repo's CLAUDE.md, leaving existing content intact" {
        Install-Tool $tool "repo" ([ref]$userState) $fakeRepo ([ref]$repoState) $fakeSource
        $content = Get-Content -Raw (Join-Path $fakeRepo "CLAUDE.md")
        $content | Should -Match "Don't touch this."
        $content | Should -Match "<!-- ai-framework:output-guidelines:v1.0.0:start -->"
        $content | Should -Match "Lead with the answer."
    }

    It "does not write a repo state file for an instructions tool" {
        Test-Path (Join-Path $fakeRepo ".ai-framework-installed.json") | Should -BeFalse
    }

    It "Remove-Tool deletes the block and leaves the rest of CLAUDE.md intact" {
        Remove-Tool $tool "repo" ([ref]$userState) $fakeRepo ([ref]$repoState)
        $content = Get-Content -Raw (Join-Path $fakeRepo "CLAUDE.md")
        $content | Should -Match "Don't touch this."
        $content | Should -Not -Match "ai-framework:output-guidelines"
    }
}

Describe "Show-CheckboxMenu" {
    It "returns null (fallback signal) when there's no usable console" {
        Mock Test-ArrowUiSupported { $false }
        Show-CheckboxMenu @("one", "two") "Pick:" | Should -BeNullOrEmpty
    }
}

Describe "Resolve-RepoPath" {
    It "strips surrounding whitespace and quotes" {
        Resolve-RepoPath '  "C:\code\demo"  ' | Should -Be "C:\code\demo"
    }

    It "expands a bare ~ to the home directory" {
        Resolve-RepoPath "~" | Should -Be $HOME
    }

    It "expands a ~-rooted path with either slash style" {
        Resolve-RepoPath "~/code" | Should -Be (Join-Path $HOME "code")
        Resolve-RepoPath "~\code" | Should -Be (Join-Path $HOME "code")
    }

    It "leaves a path whose name merely starts with a tilde alone" {
        Resolve-RepoPath "~tmp" | Should -Be "~tmp"
    }

    It "expands environment variables" {
        Resolve-RepoPath "%TEMP%\demo" | Should -Be (Join-Path $env:TEMP "demo")
    }
}

Describe "Read-RepoRootFromUser" {
    It "returns null when the user enters nothing" {
        Mock Read-Host { "" }
        Read-RepoRootFromUser | Should -BeNullOrEmpty
    }

    It "re-prompts on a path that isn't a directory, then accepts a valid one" {
        $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("aiframework-target-" + [Guid]::NewGuid())
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        try {
            $script:answers = @("C:\definitely\not\here", $dir)
            $script:call = 0
            Mock Read-Host { $script:call++; return $script:answers[$script:call - 1] }
            Read-RepoRootFromUser | Should -Be ((Resolve-Path -LiteralPath $dir).Path)
            $script:call | Should -Be 2
        }
        finally { Remove-Item -Recurse -Force $dir }
    }
}
