$enc = [System.Text.Encoding]::UTF8

$html = [IO.File]::ReadAllText("index.html", $enc)
$css  = [IO.File]::ReadAllText("style.css",  $enc)
$js   = [IO.File]::ReadAllText("app.js",     $enc)

$html = $html.Replace('<link rel="stylesheet" href="style.css">', "<style>`n$css`n</style>")
$html = $html.Replace('<script src="app.js"></script>', "<script>`n$js`n</script>")

[IO.File]::WriteAllText((Join-Path (Get-Location) "SENASA_App_Standalone.html"), $html, $enc)
Write-Output "Archivo SENASA_App_Standalone.html generado correctamente."
