# Cree (ou remet a jour, a chaque lancement) le raccourci "Kinan Orchestre" sur le Bureau, avec l'icone du dashboard.
$ErrorActionPreference = 'Stop'
try {
  $racine = Split-Path -Parent $PSScriptRoot
  $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Kinan Orchestre.lnk'
  $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
  $s.TargetPath = Join-Path $racine 'lancer-kinan-os.cmd'
  $s.WorkingDirectory = $racine
  $s.IconLocation = (Join-Path $racine 'assets\icon.ico') + ',0'
  $s.WindowStyle = 7
  $s.Description = 'Kinan Orchestre'
  $s.Save()
} catch { exit 0 }
