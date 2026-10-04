[CmdletBinding()]
param(
    [Parameter(ValueFromPipeline = $true)]
    [AllowEmptyString()]
    [string]$Line,

    [string]$OutputPath = 'C:\tmp\sixtyfour-p2p-canary-results\captured-canary-result.txt',

    [switch]$OfflineSelfTest
)

begin {
    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'
    $resultRoot = 'C:\tmp\sixtyfour-p2p-canary-results'
    $safeLines = [Collections.Generic.List[string]]::new()

    function Assert-OutputPath {
        param([Parameter(Mandatory = $true)][string]$Path)

        $full = [IO.Path]::GetFullPath($Path)
        $root = [IO.Path]::GetFullPath($resultRoot).TrimEnd('\') + '\'
        if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Result output must stay inside the reviewed C:\tmp result directory.'
        }
        return $full
    }

    function Assert-NoCredentialShape {
        param([Parameter(Mandatory = $true)][string]$Value)

        if ($Value -match 'cfut_[A-Za-z0-9_-]{8,}' -or
            $Value -match '(?i)Authorization\s*[:=]\s*Bearer' -or
            $Value -match '(?i)\bBearer\s+[A-Za-z0-9._~-]{8,}' -or
            $Value -match '(?i)CLOUDFLARE_(?:API_)?TOKEN\s*[:=]' -or
            $Value -match '(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])') {
            throw 'Credential-shaped content was rejected before result persistence.'
        }
    }

    function Convert-ToSafeLine {
        param([Parameter(Mandatory = $true)][string]$Value)

        Assert-NoCredentialShape -Value $Value
        if ($Value.Length -gt 320) {
            throw 'Result line exceeded the reviewed length limit.'
        }

        $patterns = @(
            '^\d/5 [a-z-]+ PASS HTTP \d{3}$',
            '^DISABLED_CANARY=PASS REQUESTS=[0-5]$',
            '^DISABLED_CANARY=FAIL REASON=Step [1-5] \([a-z-]+\) failed: [ -~]{1,240}$',
            '^DISABLED_TARGET_CANARY=(?:PASS|FAIL)$',
            '^SUBDOMAIN_RECOVERY=(?:PASS|FAIL)$',
            '^ACTION_REQUIRED=(?:DISABLE_WORKERS_DEV_NOW|DISABLE_PRODUCTION_AND_PREVIEW_IN_DASHBOARD_NOW)$',
            '^PUBLIC_WINDOW_UPPER_BOUND_SECONDS=\d{1,3}(?:\.\d{1,2})?$',
            '^CLIPBOARD_OVERWRITTEN=(?:true|false)$'
        )
        foreach ($pattern in $patterns) {
            if ($Value -cmatch $pattern) { return $Value }
        }
        return $null
    }

    function Write-SafeResult {
        param(
            [Parameter(Mandatory = $true)][string[]]$Lines,
            [Parameter(Mandatory = $true)][string]$Path
        )

        $full = Assert-OutputPath -Path $Path
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($full))
        $body = @(
            'FORMAT=CATTAIL_DISABLED_CANARY_RESULT_V1'
            'CONTAINS_CREDENTIALS=false'
            'CONTAINS_ACCOUNT_ID=false'
            $Lines
        )
        [IO.File]::WriteAllLines($full, $body, [Text.UTF8Encoding]::new($false))
        return $full
    }

    if ($OfflineSelfTest) {
        $safeSample = @(
            '1/5 health PASS HTTP 503',
            'DISABLED_CANARY=FAIL REASON=Step 2 (preflight) failed: Expected HTTP 204 but received HTTP 503.',
            'DISABLED_TARGET_CANARY=FAIL',
            'SUBDOMAIN_RECOVERY=PASS',
            'ACTION_REQUIRED=DISABLE_WORKERS_DEV_NOW',
            'PUBLIC_WINDOW_UPPER_BOUND_SECONDS=66',
            'CLIPBOARD_OVERWRITTEN=true'
        )
        $converted = @($safeSample | ForEach-Object { Convert-ToSafeLine -Value $_ })
        if ($converted.Count -ne $safeSample.Count) { throw 'Safe sample was not fully retained.' }
        $selfTestPath = Join-Path $resultRoot 'capture-selftest-result.txt'
        $written = Write-SafeResult -Lines $converted -Path $selfTestPath

        $credentialRejected = $false
        try {
            [void](Convert-ToSafeLine -Value 'DISABLED_CANARY=FAIL REASON=Step 1 (health) failed: Authorization: Bearer sample-credential-value.')
        }
        catch {
            $credentialRejected = $true
        }
        if (-not $credentialRejected) { throw 'Credential-shaped sample was not rejected.' }

        $accountIdRejected = $false
        try {
            [void](Convert-ToSafeLine -Value 'DISABLED_CANARY=FAIL REASON=Step 1 (health) failed: Account 0123456789abcdef0123456789abcdef.')
        }
        catch {
            $accountIdRejected = $true
        }
        if (-not $accountIdRejected) { throw 'Account-ID-shaped sample was not rejected.' }

        $outsideRejected = $false
        try {
            [void](Assert-OutputPath -Path 'C:\tmp\outside-canary-result.txt')
        }
        catch {
            $outsideRejected = $true
        }
        if (-not $outsideRejected) { throw 'Out-of-scope output path was not rejected.' }

        'RESULT_CAPTURE_SELFTEST=PASS'
        'CREDENTIAL_SAMPLE_REJECTED=true'
        'ACCOUNT_ID_SAMPLE_REJECTED=true'
        'OUTSIDE_PATH_REJECTED=true'
        "SELFTEST_RESULT_FILE=$written"
        return
    }
}

process {
    if (-not $OfflineSelfTest -and $null -ne $Line) {
        $converted = Convert-ToSafeLine -Value ([string]$Line)
        if ($null -ne $converted) { $safeLines.Add($converted) }
    }
}

end {
    if (-not $OfflineSelfTest) {
        if ($safeLines.Count -eq 0) { throw 'No reviewed result lines were supplied.' }
        $written = Write-SafeResult -Lines $safeLines.ToArray() -Path $OutputPath
        'SAFE_RESULT_CAPTURE=PASS'
        "CAPTURED_LINES=$($safeLines.Count)"
        "RESULT_FILE=$written"
    }
}
