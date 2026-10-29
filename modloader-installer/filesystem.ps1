# Filesystem operations use extended Windows paths internally. Manifest paths stay
# ordinary relative paths so existing backups and uninstall remain compatible.
function ConvertTo-InstallerNativePath {
    param([string]$Path)
    if ($Path.StartsWith('\\?\')) { return $Path }
    $full = [IO.Path]::GetFullPath($Path)
    if ($full.StartsWith('\\')) { return '\\?\UNC\' + $full.Substring(2) }
    return '\\?\' + $full
}

function Test-InstallerPath {
    param([string]$Path)
    $native = ConvertTo-InstallerNativePath $Path
    return ([IO.File]::Exists($native) -or [IO.Directory]::Exists($native))
}

function New-InstallerDirectory {
    param([string]$Path)
    [IO.Directory]::CreateDirectory((ConvertTo-InstallerNativePath $Path)) | Out-Null
}

function Copy-InstallerFile {
    param([string]$Source, [string]$Target)
    New-InstallerDirectory ([IO.Path]::GetDirectoryName($Target))
    $nativeTarget = ConvertTo-InstallerNativePath $Target
    if ([IO.File]::Exists($nativeTarget)) {
        $attributes = [IO.File]::GetAttributes($nativeTarget)
        [IO.File]::SetAttributes($nativeTarget, ($attributes -band (-bnot [IO.FileAttributes]::ReadOnly)))
    }
    [IO.File]::Copy((ConvertTo-InstallerNativePath $Source), $nativeTarget, $true)
}

function Get-InstallerFiles {
    param([string]$Path, [string[]]$ExcludeRelative = @(), [switch]$SkipDevelopmentCaches)
    $root = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    $nativeRoot = ConvertTo-InstallerNativePath $root
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($root)
    while ($pending.Count) {
        $directory = $pending.Pop()
        foreach ($native in [IO.Directory]::EnumerateFileSystemEntries((ConvertTo-InstallerNativePath $directory))) {
            $ordinary = if ($native.StartsWith('\\?\UNC\')) { '\\' + $native.Substring(8) } else { $native.Substring(4) }
            $relative = $ordinary.Substring($root.Length).TrimStart('\')
            $excluded = $SkipDevelopmentCaches -and (Test-InstallerDevelopmentCache $relative)
            foreach ($prefix in $ExcludeRelative) {
                $prefix = $prefix.Replace('/', '\').TrimEnd('\')
                if ($relative.Equals($prefix, [StringComparison]::OrdinalIgnoreCase) -or $relative.StartsWith($prefix + '\', [StringComparison]::OrdinalIgnoreCase)) { $excluded = $true }
            }
            if ($excluded) { continue }
            if ([IO.Directory]::Exists($native)) { $pending.Push($ordinary) }
            else { [pscustomobject]@{ FullName = $ordinary } }
        }
    }
}

function Get-InstallerFileMetadata {
    param([string]$Path)
    $stream = [IO.File]::OpenRead((ConvertTo-InstallerNativePath $Path))
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        [pscustomobject]@{
            Length = $stream.Length
            Hash = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '')
        }
    } finally {
        $sha.Dispose()
        $stream.Dispose()
    }
}

function Remove-InstallerFile {
    param([string]$Path)
    $native = ConvertTo-InstallerNativePath $Path
    if ([IO.File]::Exists($native)) {
        [IO.File]::SetAttributes($native, [IO.FileAttributes]::Normal)
        [IO.File]::Delete($native)
    }
}

# Caller must check that the resolved directory is within the intended game root.
function Remove-InstallerDirectory {
    param([string]$Path)
    $native = ConvertTo-InstallerNativePath $Path
    foreach ($file in [IO.Directory]::EnumerateFiles($native, '*', [IO.SearchOption]::AllDirectories)) {
        [IO.File]::SetAttributes($file, [IO.FileAttributes]::Normal)
    }
    [IO.Directory]::Delete($native, $true)
}

function Test-InstallerDevelopmentCache {
    param([string]$RelativePath)
    return (($RelativePath.Replace('\', '/') -split '/') -contains '.vite')
}

function Assert-InstallerChildPath {
    param([string]$Root, [string]$Path)
    $base = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    $candidate = [IO.Path]::GetFullPath($Path)
    if (-not $candidate.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing filesystem operation outside $Root : $candidate"
    }
    return $candidate
}

function Get-InstallerDirectories {
    param([string]$Path)
    $root = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    $nativeRoot = ConvertTo-InstallerNativePath $root
    foreach ($native in [IO.Directory]::EnumerateDirectories($nativeRoot)) {
        $ordinary = $root + $native.Substring($nativeRoot.Length)
        [pscustomobject]@{ FullName = $ordinary; Name = [IO.Path]::GetFileName($ordinary) }
    }
}

function Expand-InstallerArchive {
    param([string]$ZipPath, [string]$Target)
    Add-Type -AssemblyName System.IO.Compression
    $root = [IO.Path]::GetFullPath($Target)
    $inputStream = [IO.File]::OpenRead((ConvertTo-InstallerNativePath $ZipPath))
    $archive = [IO.Compression.ZipArchive]::new($inputStream, [IO.Compression.ZipArchiveMode]::Read)
    try {
        # Validate every name before creating anything in the extraction directory.
        $plan = @()
        $seen = @{}
        foreach ($entry in $archive.Entries) {
            $name = $entry.FullName.Replace('\', '/')
            if ($name.StartsWith('/') -or $name.Contains(':') -or ($name -split '/') -contains '..') { throw "Unsafe archive entry: $name" }
            $destination = Assert-InstallerChildPath $root (Join-Path $root $name.Replace('/', '\'))
            if ($seen.ContainsKey($destination)) { throw "Duplicate archive entry: $name" }
            $seen[$destination] = $true
            $plan += [pscustomobject]@{ Entry = $entry; Path = $destination; Directory = $name.EndsWith('/') }
        }
        New-InstallerDirectory $root
        foreach ($item in $plan) {
            if ($item.Directory) { New-InstallerDirectory $item.Path; continue }
            New-InstallerDirectory ([IO.Path]::GetDirectoryName($item.Path))
            $reader = $item.Entry.Open()
            try {
                $writer = [IO.File]::Open((ConvertTo-InstallerNativePath $item.Path), [IO.FileMode]::Create, [IO.FileAccess]::Write)
                try { $reader.CopyTo($writer) } finally { $writer.Dispose() }
            } finally { $reader.Dispose() }
        }
    } finally { $archive.Dispose(); $inputStream.Dispose() }
}

function Compress-InstallerDirectory {
    param([string]$Source, [string]$Destination)
    Add-Type -AssemblyName System.IO.Compression
    $root = [IO.Path]::GetFullPath($Source).TrimEnd('\')
    $outputPath = [IO.Path]::GetFullPath($Destination)
    if ($outputPath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive output must be outside its source directory.' }
    New-InstallerDirectory ([IO.Path]::GetDirectoryName($outputPath))
    $outputStream = [IO.File]::Open((ConvertTo-InstallerNativePath $outputPath), [IO.FileMode]::Create, [IO.FileAccess]::Write)
    $archive = [IO.Compression.ZipArchive]::new($outputStream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in Get-InstallerFiles $root) {
            $relative = $file.FullName.Substring($root.Length).TrimStart('\').Replace('\', '/')
            $entry = $archive.CreateEntry($relative, [IO.Compression.CompressionLevel]::Optimal)
            $reader = [IO.File]::OpenRead((ConvertTo-InstallerNativePath $file.FullName))
            try {
                $writer = $entry.Open()
                try { $reader.CopyTo($writer) } finally { $writer.Dispose() }
            } finally { $reader.Dispose() }
        }
    } finally { $archive.Dispose(); $outputStream.Dispose() }
}
