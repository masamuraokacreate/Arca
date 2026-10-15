@echo off
pushd "%~dp0"

echo [1/2] Starting Arca API Server...
start /min cmd /c "npm run api"

timeout /t 3 /nobreak > nul

echo [2/2] Starting Arca Excursion Bot...
start /min cmd /c "python excursion/bot.py"

echo [Done] All services started.
timeout /t 2 /nobreak > nul

popd
exit