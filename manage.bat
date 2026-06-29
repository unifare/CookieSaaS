@echo off
setlocal
chcp 65001 >nul

:menu
echo =======================================
echo    Cookie Service 管理脚本 (Windows)
echo =======================================
echo 1. 启动服务 (前台运行)
echo 2. 启动服务 (后台运行)
echo 3. 停止服务
echo 4. 查看日志
echo 0. 退出
echo =======================================
set /p opt="请选择操作 (0-4): "

if "%opt%"=="1" goto start_fg
if "%opt%"=="2" goto start_bg
if "%opt%"=="3" goto stop_srv
if "%opt%"=="4" goto view_logs
if "%opt%"=="0" exit /b
goto menu

:start_fg
echo 正在前台启动...
npm run start
pause
goto menu

:start_bg
echo 正在后台启动...
start /b cmd /c "npm run start > service.log 2>&1"
echo 已后台启动，输出重定向到 service.log
echo 您可以稍后使用选项 4 查看日志。
pause
goto menu

:stop_srv
echo 正在停止服务 (端口 28472)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr "28472" ^| find "LISTENING"') do taskkill /f /pid %%a
echo 服务已尝试停止。
pause
goto menu

:view_logs
echo ==== 日志输出 (尾部) ====
if exist service.log (
    type service.log
) else (
    echo 无日志文件。
)
echo =========================
pause
goto menu

