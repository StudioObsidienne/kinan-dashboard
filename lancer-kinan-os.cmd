@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Premiere installation, un instant...
  call npm install
)
if not exist "node_modules\electron\dist\ffmpeg.dll" (
  echo.
  echo Un fichier du moteur a ete retire par l'antivirus ^(faux positif connu^).
  echo Reparation automatique, un instant...
  rmdir /s /q "node_modules\electron"
  call npm install
)
if not exist "node_modules\electron\dist\ffmpeg.dll" (
  echo.
  echo Reparation impossible : l'antivirus a de nouveau retire le fichier.
  echo Rien de grave : ce n'est pas un virus. Dans Securite Windows, Protection contre
  echo les virus ^> Historique de protection, choisissez Restaurer sur "ffmpeg.dll".
  echo Details : MODE-EMPLOI.md ^(section Antivirus^).
  pause
  exit /b 1
)
call npm start
