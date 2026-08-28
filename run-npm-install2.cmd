@echo off
cd /d %~dp0
if exist node_modules rd /s /q node_modules
if exist package-lock.json del /f package-lock.json
set "NPM_CONFIG_NODE_GYP=C:\Users\michael.bobis\AppData\Roaming\npm\node_modules\node-gyp\bin\node-gyp.js"
set "npm_config_msvs_version=2022"
set "GYP_MSVS_VERSION=2022"
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
echo NPM_CONFIG_NODE_GYP=%NPM_CONFIG_NODE_GYP%
echo npm_config_msvs_version=%npm_config_msvs_version%
echo GYP_MSVS_VERSION=%GYP_MSVS_VERSION%
npm install --loglevel=silly > install-output2.txt 2>&1
if %ERRORLEVEL% neq 0 (
  echo INSTALL FAILED with code %ERRORLEVEL%
  type install-output2.txt
  exit /b %ERRORLEVEL%
)
echo INSTALL SUCCEEDED
type install-output2.txt
