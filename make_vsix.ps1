$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$stage = Join-Path $root 'vsix_stage'
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force "$stage\extension" | Out-Null

Copy-Item "$root\extension.vsixmanifest" "$stage\"
Copy-Item "$root\package.json","$root\README.md","$root\LICENSE","$root\icon.png","$root\language-configuration.json" "$stage\extension\"
Copy-Item -Recurse "$root\syntaxes","$root\snippets","$root\out" "$stage\extension\"

$contentTypes = @'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".vsixmanifest" ContentType="text/xml" />
  <Default Extension=".json" ContentType="application/json" />
  <Default Extension=".md" ContentType="text/markdown" />
  <Default Extension=".png" ContentType="image/png" />
  <Default Extension=".js" ContentType="application/javascript" />
  <Default Extension=".map" ContentType="application/json" />
  <Override PartName="/extension/LICENSE" ContentType="text/plain" />
</Types>
'@
[System.IO.File]::WriteAllText((Join-Path $stage '[Content_Types].xml'), $contentTypes, (New-Object System.Text.UTF8Encoding $false))

$vsix = Join-Path $root 'linkmap-ld-0.1.0.vsix'
$oldVsix = Join-Path $root 'ldscript-linker-0.1.0.vsix'
Remove-Item -Force $vsix,$oldVsix -ErrorAction SilentlyContinue

$zip = [System.IO.Compression.ZipFile]::Open($vsix, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  $stageLen = $stage.Length + 1
  Get-ChildItem -Path $stage -Recurse -File | ForEach-Object {
    $entryName = $_.FullName.Substring($stageLen) -replace '\\', '/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {
  $zip.Dispose()
}

Remove-Item -Recurse -Force $stage
Get-Item $vsix | Select-Object Name,Length
