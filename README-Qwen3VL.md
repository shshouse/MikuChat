# MikuChat - Qwen3-VL 8B 版本

## 📦 当前配置

**模型：** Qwen3-VL-8B-Instruct  
**来源：** 阿里云魔搭社区  
**位置：** `python_backend/models/Qwen/Qwen3-VL-8B-Instruct/`  
**大小：** 约 16GB（4个分片）  
**显存需求：** 8GB（fp16）或 4GB（int8 量化）

---

## 🚀 快速启动

### Windows:
```bash
双击 start.bat
```

### Linux/Mac:
```bash
bash start.sh
```

---

## ⚙️ 生成参数配置

当前参数位于 `python_backend/model_server.py`:

```python
GENERATION_CONFIG = {
    'max_tokens': 1024,         # 最大生成长度（约600-800字）
    'temperature': 0.7,         # 创造性（0.1-2.0，越高越随机）
    'top_p': 0.9,              # 核采样参数
    'repetition_penalty': 1.1  # 重复惩罚（1.0-2.0）
}
```

### 调整建议：

**更保守的回复**（适合事实性任务）：
```python
'temperature': 0.3
'repetition_penalty': 1.3
```

**更有创意的回复**（适合创作任务）：
```python
'temperature': 1.0
'repetition_penalty': 1.0
```

**更长的回复**：
```python
'max_tokens': 2048  # 约1200-1600字
```

---

## 💾 显存优化

### 如果遇到显存不足 (CUDA Out of Memory)

**方法1：使用 int8 量化（推荐）**

修改 `model_server.py` 第 76-81 行：

```python
if device == "cuda":
    model = AutoModelForVision2Seq.from_pretrained(
        model_dir,
        load_in_8bit=True,  # ← 添加这一行
        device_map="auto",
        trust_remote_code=True
    )
```

**效果：** 显存占用约 4-5GB，轻微性能损失

---

**方法2：使用 4bit 量化（激进优化）**

需要先安装：
```bash
pip install bitsandbytes accelerate
```

修改 `model_server.py` 第 76-81 行：

```python
from transformers import BitsAndBytesConfig

if device == "cuda":
    quantization_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16
    )
    
    model = AutoModelForVision2Seq.from_pretrained(
        model_dir,
        quantization_config=quantization_config,
        device_map="auto",
        trust_remote_code=True
    )
```

**效果：** 显存占用约 2-3GB，明显性能损失

---

## 🎯 模型特点

### ✅ 优势
- **中文理解优秀**：专门针对中文优化
- **多模态能力强**：图像理解准确
- **推理能力好**：复杂问题分析能力强
- **上下文长**：支持更长的对话历史

### ⚠️ 注意事项
- **启动时间长**：首次加载需要 30-60 秒
- **显存要求高**：建议 8GB 显存（可通过量化降低）
- **推理速度**：比 500M 模型慢，但质量更高

---

## 🧪 测试建议

### 1. 中文理解测试
```
问：分析一下《三体》这本书的主题思想
问：用古诗词的风格描述一下人工智能
问：解释一下"薛定谔的猫"这个思想实验
```

### 2. 图像理解测试（上传图片）
```
问：这张图片里有什么？请详细描述
问：分析这张图的构图和色彩搭配
问：这张图片想表达什么情感？
```

### 3. 复杂推理测试
```
问：如果今天是星期三，100天后是星期几？
问：一个房间有4个角，每个角有一只猫，每只猫前面有3只猫，房间里有几只猫？
问：比较一下机器学习和深度学习的区别
```

---

## 📁 项目结构

```
mikuchat/
├── python_backend/
│   ├── models/
│   │   └── Qwen/
│   │       └── Qwen3-VL-8B-Instruct/    # 模型文件（16GB）
│   ├── model_server.py                   # 后端服务（Flask）
│   ├── download_model.py                 # 模型下载脚本
│   └── requirements.txt                  # Python 依赖
├── src/
│   ├── index.html                        # 前端界面
│   ├── index.css                         # 样式
│   ├── renderer.js                       # 前端逻辑
│   ├── index.js                          # Electron 主进程
│   └── preload.js                        # 预加载脚本
├── start.bat                             # Windows 启动脚本
├── start.sh                              # Linux/Mac 启动脚本
└── package.json                          # Node.js 配置
```

---

## 🔧 常见问题

**Q: 启动后一直显示"连接中..."？**  
A: 正常现象，8B 模型加载需要 30-60 秒。查看终端看是否有错误。

**Q: 提示 CUDA Out of Memory？**  
A: 显存不足，使用上面的 int8 或 4bit 量化方法。

**Q: 回复速度很慢？**  
A: 这是正常的，8B 模型比小模型慢。可以降低 `max_tokens` 参数。

**Q: 回复质量不理想？**  
A: 尝试调整 `temperature` 和 `repetition_penalty` 参数。

**Q: 想换其他模型？**  
A: 修改 `model_server.py` 中的 `MODEL_NAME` 为其他模型路径，并下载对应模型。

---

## 🎨 推荐的其他模型

如果你想尝试其他模型，可以下载：

| 模型 | 下载命令 | 特点 |
|------|----------|------|
| **Qwen2-VL-7B** | `modelscope download --model Qwen/Qwen2-VL-7B-Instruct` | 更快的版本 |
| **InternVL2-8B** | `modelscope download --model OpenGVLab/InternVL2-8B` | 高质量视觉理解 |
| **MiniCPM-V-2.6** | `modelscope download --model openbmb/MiniCPM-V-2_6` | 端侧优化 |

---

## 📞 技术支持

- **查看日志**：启动时的终端输出
- **检查显存**：`nvidia-smi` 命令
- **检查模型**：确认 `models/Qwen/` 目录完整

---

## 🎉 享受 AI 对话

现在你拥有一个基于 Qwen3-VL-8B 的高质量 AI 聊天应用！

**特色功能：**
- ✅ 中文对话流畅自然
- ✅ 支持图片理解和分析
- ✅ 多轮对话记忆上下文
- ✅ 美观的现代化界面
- ✅ 本地运行，隐私安全

**开始使用：** 双击 `start.bat` 启动应用！🚀

