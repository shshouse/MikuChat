@echo off
echo ================================
echo    MikuChat 启动脚本 (Windows)
echo ================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)

REM 检查 Python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到 Python，请先安装 Python 3.8+
    pause
    exit /b 1
)

echo [1/3] 检查依赖...

REM 检查 node_modules
if not exist "node_modules" (
    echo [安装] 安装 Node.js 依赖...
    call npm install
)

REM 检查 Python 依赖
python -c "import flask" 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [安装] 安装 Python 依赖...
    pip install -r python_backend\requirements.txt
)

echo [2/3] 检查模型...

if not exist "python_backend\models" (
    echo [提示] 模型未下载
    echo 首次启动会自动下载模型，或者运行:
    echo   python python_backend\download_model.py
    echo.
)

echo [3/3] 启动应用...
echo.

npm start

