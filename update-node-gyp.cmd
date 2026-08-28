@echo off
cd /d %~dp0
call "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
npm install --save-dev node-gyp@latest --loglevel=silly > node-gyp-update-output.txt 2>&1
if %ERRORLEVEL% neq 0 (
  echo NODE-GYP UPDATE FAILED with code %ERRORLEVEL%
  type node-gyp-update-output.txt
  exit /b %ERRORLEVEL%
)
echo NODE-GYP UPDATE SUCCEEDED
type node-gyp-update-output.txt
