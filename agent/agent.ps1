param(
    [string]$Arg
)
$raw = $Arg
if (-not $raw) { exit 0 }
try {
    $u = [Uri]$raw
} catch {
    exit 0
}
function Get-QueryMap($query) {
    $out = @{}
    $q = $query
    if ($q.StartsWith("?")) { $q = $q.Substring(1) }
    foreach ($pair in $q.Split("&")) {
        if (-not $pair) { continue }
        $kv = $pair.Split("=",2)
        $k = [Uri]::UnescapeDataString($kv[0])
        $v = if ($kv.Length -gt 1) { [Uri]::UnescapeDataString($kv[1]) } else { "" }
        $out[$k] = $v
    }
    return $out
}
$map = Get-QueryMap $u.Query
$path = $map["path"]
if (-not $path) { exit 0 }
if ($path.StartsWith("\\\\")) {
    $p = $path
} elseif ($path -match "^[A-Za-z]:\\") {
    $p = $path
} else {
    $p = $path
}
try {
    if (Test-Path -LiteralPath $p) {
        Start-Process -FilePath $p
        exit 0
    }
    $dir = Split-Path -LiteralPath $p -Parent
    if ($dir -and (Test-Path -LiteralPath $dir)) {
        Start-Process -FilePath $dir
        exit 0
    }
} catch {
}
exit 0
