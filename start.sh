#!/bin/bash

echo "================================"
echo "   MikuChat 启动脚本 (Linux/macOS)"
echo "================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未找到 Python，请先安装 Python 3.8+"
    exit 1
fi

echo "[1/3] 检查依赖..."

# 检查 node_modules
if [ ! -d "node_modules" ]; then
    echo "[安装] 安装 Node.js 依赖..."
    npm install
fi

# 检查 Python 依赖
python3 -c "import flask" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "[安装] 安装 Python 依赖..."
    pip3 install -r python_backend/requirements.txt
fi

echo "[2/3] 检查模型..."

if [ ! -d "python_backend/models" ]; then
    echo "[提示] 模型未下载"
    echo "首次启动会自动下载模型，或者运行:"
    echo "  python3 python_backend/download_model.py"
    echo ""
fi

echo "[3/3] 启动应用..."
echo ""

npm start

