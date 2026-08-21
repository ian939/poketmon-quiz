@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo.
echo  포켓몬 도감 퀴즈를 준비합니다...
echo.
start "" http://localhost:8080
node serve.mjs 8080
pause
