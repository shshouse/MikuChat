# MikuChat - 虚拟人物聊天软件

基于 Electron + Python 的本地 AI 聊天应用，使用 SmolVLM-500M-Instruct 模型。

## 功能特性

- 💬 流畅的对话体验，现代化 UI 设计
- 🎨 支持图片理解（多模态对话）
- 🖥️ 完全本地运行，保护隐私
- 🚀 轻量级 500M 模型，快速响应
- 🎵 美观的界面设计

## 系统要求

- Windows 10/11 或 macOS/Linux
- Python 3.8 或更高版本
- Node.js 16 或更高版本
- 至少 4GB RAM（推荐 8GB）
- 约 2GB 磁盘空间（用于模型）

## 安装步骤

### 1. 安装 Node.js 依赖

```bash
npm install
```

### 2. 安装 Python 依赖

创建虚拟环境（推荐）：

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

安装依赖包：

```bash
pip install -r python_backend/requirements.txt
```

### 3. 下载模型

#### 方法一：使用魔搭社区（推荐，国内速度快）

```bash
# 先安装 modelscope
pip install modelscope

# 下载模型
python python_backend/download_model.py
```

或者直接使用命令行：

```bash
modelscope download --model HuggingFaceTB/SmolVLM-500M-Instruct
```

#### 方法二：使用 HuggingFace（需要科学上网）

模型会在首次运行时自动下载，或者也可以在界面中点击"下载模型"按钮。

## 使用方法

### 启动应用

```bash
npm start
```

应用会自动启动 Python 后端和 Electron 前端。

### 手动启动后端（可选）

如果需要单独测试后端：

```bash
python python_backend/model_server.py
```

后端会在 `http://127.0.0.1:5000` 运行。

## 项目结构

```
mikuchat/
├── src/                    # Electron 前端代码
│   ├── index.html         # 主页面
│   ├── index.css          # 样式文件
│   ├── index.js           # Electron 主进程
│   ├── renderer.js        # 渲染进程（前端逻辑）
│   └── preload.js         # 预加载脚本
├── python_backend/         # Python 后端
│   ├── model_server.py    # Flask 服务器
│   ├── download_model.py  # 模型下载脚本
│   ├── requirements.txt   # Python 依赖
│   └── models/            # 模型存储目录（自动创建）
├── package.json
└── README.md
```

## API 接口

后端提供以下 REST API：

### 1. 健康检查
- **URL**: `GET /health`
- **响应**: `{ "status": "ok", "model_loaded": true, "device": "cpu" }`

### 2. 聊天
- **URL**: `POST /chat`
- **请求体**:
  ```json
  {
    "message": "你好！",
    "image": "base64_encoded_image" // 可选
  }
  ```
- **响应**:
  ```json
  {
    "response": "你好！很高兴见到你！",
    "status": "success"
  }
  ```

### 3. 重置对话
- **URL**: `POST /reset`
- **响应**: `{ "status": "success", "message": "对话已重置" }`

## 常见问题

### Q: 模型下载很慢怎么办？

A: 使用魔搭社区下载，速度更快。如果仍然很慢，可以尝试使用镜像源。

### Q: 启动时提示 Python 未找到？

A: 确保 Python 已安装并添加到系统 PATH。Windows 用户可能需要将 `python` 改为 `python3` 或使用完整路径。

### Q: 模型加载失败？

A: 检查磁盘空间是否充足，以及是否正确安装了所有依赖。可以查看控制台日志获取详细错误信息。

### Q: CPU 使用率过高？

A: SmolVLM 是小型模型，但仍需要一定算力。如果有 NVIDIA GPU，会自动使用 CUDA 加速。

### Q: 如何使用 GPU 加速？

A: 安装 PyTorch CUDA 版本：
```bash
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

## 开发

### 调试模式

设置环境变量启用开发者工具：

```bash
# Windows
set NODE_ENV=development
npm start

# macOS/Linux
NODE_ENV=development npm start
```

### 打包应用

```bash
npm run make
```

## 技术栈

- **前端**: Electron, HTML/CSS/JavaScript
- **后端**: Python, Flask, Transformers
- **模型**: HuggingFace SmolVLM-500M-Instruct
- **UI**: 自定义 CSS（现代化深色主题）

## 许可证

MIT License

## 致谢

- [SmolVLM](https://huggingface.co/HuggingFaceTB/SmolVLM-500M-Instruct) - 来自 HuggingFace 的轻量级视觉语言模型
- [魔搭社区](https://modelscope.cn/) - 提供模型下载服务
- Electron - 跨平台桌面应用框架

