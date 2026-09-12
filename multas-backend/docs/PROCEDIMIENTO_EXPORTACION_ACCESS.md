# Procedimiento de exportación desde Access

## Opción manual recomendada

1. Trabaje sobre una copia autorizada y de solo lectura del MDB/ACCDB en una estación Windows aislada.
2. En Access, abra cada tabla o consulta de exportación; no habilite macros ni contenido activo.
3. Elija **Datos externos → Archivo de texto**, destino CSV delimitado, separador coma, calificador `"`, encabezados incluidos y codificación UTF-8.
4. Compare encabezados con `database/templates/historical/<entidad>.csv`. No suponga equivalencias: documente tabla, columna, estado y catálogo.
5. Calcule SHA-256 (`Get-FileHash archivo.csv -Algorithm SHA256`) y registre responsable, fecha, origen y conteo.
6. Transfiera únicamente CSV por el canal privado autorizado. Nunca envíe MDB/ACCDB al backend.

## PowerShell opcional

`scripts/export-access-to-csv.ps1` usa ACE/ADODB instalado en la estación Windows. Ejemplo:

```powershell
$map = @{ citizens = "Personas"; vehicles = "Vehiculos" }
.\scripts\export-access-to-csv.ps1 -AccessFile "C:\entrada\historico.accdb" -OutputDirectory "C:\salida" -TableMap $map
```

Revise manualmente encabezados, formatos y conteos. El script no ejecuta macros ni transforma semántica.

## Alternativas MDB/ACCDB

Puede usarse LibreOffice Base, `mdbtools` para MDB compatible o un ETL corporativo aprobado, siempre fuera del servidor. Exporte texto, verifique encoding y no ejecute consultas/objetos activos del archivo.

## Muestra anonimizada

Copie pocas filas, reemplace nombres/direcciones/correos/teléfonos por valores ficticios, regenere identificaciones, placas, boletas y correlativos preservando longitud/formato, y mantenga relaciones mediante nuevos `legacy_id`. Elimine adjuntos. Compruebe que ningún valor pueda reidentificar a una persona antes de versionar la muestra.
