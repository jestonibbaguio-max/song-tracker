@echo off
cd /d %~dp0
if exist node_modules rd /s /q node_modules
if exist package-lock.json del /f package-lock.json
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
set "NPM_CONFIG_NODE_GYP=C:\Users\michael.bobis\AppData\Roaming\npm\node_modules\node-gyp\bin\node-gyp.js"
set "GYP_MSVS_VERSION=2022"
npm install --loglevel=silly > install-output.txt 2>&1
if %ERRORLEVEL% neq 0 (
  echo INSTALL FAILED with code %ERRORLEVEL%
  exit /b %ERRORLEVEL%
)
echo INSTALL SUCCEEDED
