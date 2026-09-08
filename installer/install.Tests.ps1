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

    It "reports 'not installed' when there's no entry" {
        Format-Status @() $tool | Should -Be "not installed"
    }

    It "reports the current version when it matches the registry" {
        $installs = @([PSCustomObject]@{ id = "foo"; version = "2.0.0" })
        Format-Status $installs $tool | Should -Be "v2.0.0"
    }

    It "reports an upgrade arrow when the installed version is behind the registry" {
        $installs = @([PSCustomObject]@{ id = "foo"; version = "1.0.0" })
        Format-Status $installs $tool | Should -Be "v1.0.0 -> v2.0.0"
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

Describe "Show-CheckboxMenu" {
    It "returns null (fallback signal) when there's no usable console" {
        Mock Test-ArrowUiSupported { $false }
        Show-CheckboxMenu @("one", "two") "Pick:" | Should -BeNullOrEmpty
    }
}
