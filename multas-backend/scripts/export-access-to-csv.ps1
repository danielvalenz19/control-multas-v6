param(
  [Parameter(Mandatory=$true)][string]$AccessFile,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [Parameter(Mandatory=$true)][hashtable]$TableMap
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path -LiteralPath $AccessFile -PathType Leaf)) { throw "No existe el archivo Access." }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$connection = New-Object -ComObject ADODB.Connection
$connection.Open("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$AccessFile;Persist Security Info=False;")
try {
  foreach ($entity in $TableMap.Keys) {
    $table = $TableMap[$entity]
    if ($table -notmatch '^[A-Za-z0-9_ ]+$') { throw "Nombre de tabla no seguro: $table" }
    $recordset = New-Object -ComObject ADODB.Recordset
    $recordset.Open("SELECT * FROM [$table]", $connection)
    try {
      $destination = Join-Path $OutputDirectory "$entity.csv"
      $lines = New-Object System.Collections.Generic.List[string]
      $headers = @($recordset.Fields | ForEach-Object { '"' + $_.Name.Replace('"','""') + '"' })
      $lines.Add(($headers -join ','))
      while (-not $recordset.EOF) {
        $cells = for ($index=0; $index -lt $recordset.Fields.Count; $index++) {
          $value = if ($null -eq $recordset.Fields.Item($index).Value) { "" } else { [string]$recordset.Fields.Item($index).Value }
          '"' + $value.Replace('"','""') + '"'
        }
        $lines.Add(($cells -join ',')); $recordset.MoveNext()
      }
      [System.IO.File]::WriteAllLines($destination, $lines, (New-Object System.Text.UTF8Encoding($true)))
    } finally { $recordset.Close() }
  }
} finally { $connection.Close() }
