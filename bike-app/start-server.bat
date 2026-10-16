@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   自行车定位助手 本地服务器
echo   http://localhost:8080
echo   关闭本窗口即可停止服务器
echo ============================================
echo.
node server.js
if errorlevel 1 (
  echo.
  echo [错误] 未找到 Node.js，请先安装 Node.js 后重试。
  pause
)
