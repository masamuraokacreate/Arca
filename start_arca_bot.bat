@echo off
pushd "%~dp0"

echo [1/2] APIサーバーを起動中...
start cmd /k "npm run api"

timeout /t 3 /nobreak > nul

echo [2/2] Botを起動中...
python excursion/bot.py

pause
popd