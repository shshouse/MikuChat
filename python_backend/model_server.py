"""
虚拟人物聊天后端服务
使用 Qwen2-VL-2B-Instruct 模型
"""
import os
import sys
import json
import logging

# 设置控制台编码为 UTF-8
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoProcessor, AutoModelForVision2Seq
import torch
from PIL import Image
import io
import base64

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# 全局变量存储模型和处理器
model = None
processor = None
device = None

# 模型配置
MODEL_NAME = "Qwen/Qwen2-VL-2B-Instruct"
MODEL_DISPLAY_NAME = "Qwen2-VL 2B"
MODEL_CACHE_DIR = os.path.join(os.path.dirname(__file__), "models")

# 生成参数配置
GENERATION_CONFIG = {
    'max_tokens': 512,
    'temperature': 0.7,
    'top_p': 0.9,
    'repetition_penalty': 1.1
}

def load_model():
    """加载模型和处理器"""
    global model, processor, device
    
    logger.info("=" * 50)
    logger.info("开始加载模型...")
    
    # 检测设备
    if torch.cuda.is_available():
        device = "cuda"
        logger.info(f"检测到 GPU: {torch.cuda.get_device_name(0)}")
        logger.info(f"CUDA 版本: {torch.version.cuda}")
        logger.info(f"GPU 内存: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.2f} GB")
    else:
        device = "cpu"
        logger.warning("未检测到 CUDA GPU，使用 CPU 模式")
        logger.warning("如果有 NVIDIA GPU，请安装 PyTorch CUDA 版本:")
        logger.warning("pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121")
    
    logger.info(f"使用设备: {device}")
    
    try:
        # 从魔搭社区加载模型
        from modelscope import snapshot_download
        
        # 下载模型到本地
        model_dir = snapshot_download(MODEL_NAME, cache_dir=MODEL_CACHE_DIR)
        logger.info(f"模型下载到: {model_dir}")
        
        # 加载处理器和模型
        processor = AutoProcessor.from_pretrained(model_dir, trust_remote_code=True)
        
        if device == "cuda":
            model = AutoModelForVision2Seq.from_pretrained(
                model_dir,
                torch_dtype=torch.float16,
                device_map="auto",
                trust_remote_code=True
            )
        else:
            model = AutoModelForVision2Seq.from_pretrained(
                model_dir,
                torch_dtype=torch.float32,
                trust_remote_code=True
            )
            model = model.to(device)
        
        logger.info("模型加载成功!")
        return True
        
    except Exception as e:
        logger.error(f"模型加载失败: {str(e)}")
        # 如果魔搭失败，尝试从 HuggingFace 加载
        try:
            logger.info("尝试从 HuggingFace 加载模型...")
            processor = AutoProcessor.from_pretrained(MODEL_NAME, cache_dir=MODEL_CACHE_DIR, trust_remote_code=True)
            
            if device == "cuda":
                model = AutoModelForVision2Seq.from_pretrained(
                    MODEL_NAME,
                    torch_dtype=torch.float16,
                    device_map="auto",
                    cache_dir=MODEL_CACHE_DIR,
                    trust_remote_code=True
                )
            else:
                model = AutoModelForVision2Seq.from_pretrained(
                    MODEL_NAME,
                    torch_dtype=torch.float32,
                    cache_dir=MODEL_CACHE_DIR,
                    trust_remote_code=True
                )
                model = model.to(device)
            
            logger.info("从 HuggingFace 加载成功!")
            return True
        except Exception as e2:
            logger.error(f"HuggingFace 加载也失败: {str(e2)}")
            return False

@app.route('/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'ok',
        'model_loaded': model is not None,
        'device': str(device) if device else 'unknown',
        'model_name': MODEL_DISPLAY_NAME,
        'model_id': MODEL_NAME
    })

@app.route('/chat', methods=['POST'])
def chat():
    """聊天接口"""
    try:
        data = request.json
        message = data.get('message', '')
        image_data = data.get('image', None)  # base64 编码的图片（可选）
        history = data.get('history', [])  # 对话历史
        
        if not message:
            return jsonify({'error': '消息不能为空'}), 400
        
        if model is None:
            return jsonify({'error': '模型未加载'}), 500
        
        # 处理图片（如果有）
        image = None
        if image_data:
            try:
                # 解码 base64 图片
                image_bytes = base64.b64decode(image_data.split(',')[1] if ',' in image_data else image_data)
                image = Image.open(io.BytesIO(image_bytes))
            except Exception as e:
                logger.warning(f"图片处理失败: {str(e)}")
        
        # 构建 Qwen3-VL 的消息格式
        messages = []
        
        # 添加历史消息（限制历史长度以节省内存）
        for h in history[-4:]:  # 只保留最近2轮对话（Qwen3-VL 更占显存）
            if h['role'] == 'user':
                messages.append({
                    "role": "user",
                    "content": h['content']
                })
            elif h['role'] == 'assistant':
                messages.append({
                    "role": "assistant", 
                    "content": h['content']
                })
        
        # 添加当前消息
        if image:
            # Qwen3-VL 的图片+文本格式
            messages.append({
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": message}
                ]
            })
        else:
            messages.append({
                "role": "user",
                "content": message
            })
        
        # 使用 Qwen3-VL 的聊天模板
        try:
            text = processor.apply_chat_template(
                messages, 
                tokenize=False,
                add_generation_prompt=True
            )
            
            # 准备输入
            if image:
                inputs = processor(
                    text=[text],
                    images=[image],
                    padding=True,
                    return_tensors="pt"
                ).to(device)
            else:
                inputs = processor(
                    text=[text],
                    padding=True,
                    return_tensors="pt"
                ).to(device)
        except Exception as e:
            logger.error(f"模板处理失败: {str(e)}")
            # 降级到简单文本
            if image:
                inputs = processor(
                    text=[f"<|im_start|>user\n{message}<|im_end|>\n<|im_start|>assistant\n"],
                    images=[image],
                    return_tensors="pt"
                ).to(device)
            else:
                inputs = processor(
                    text=[f"<|im_start|>user\n{message}<|im_end|>\n<|im_start|>assistant\n"],
                    return_tensors="pt"
                ).to(device)
        
        # 生成回复
        logger.info(f"开始生成回复，输入 token 数: {inputs['input_ids'].shape}")
        
        with torch.no_grad():
            generated_ids = model.generate(
                **inputs,
                max_new_tokens=GENERATION_CONFIG['max_tokens'],
                do_sample=True,
                temperature=GENERATION_CONFIG['temperature'],
                top_p=GENERATION_CONFIG['top_p'],
                repetition_penalty=GENERATION_CONFIG['repetition_penalty'],
                pad_token_id=processor.tokenizer.pad_token_id,
                eos_token_id=processor.tokenizer.eos_token_id
            )
        
        # 解码输出（只解码新生成的部分）
        generated_ids_trimmed = [
            out_ids[len(in_ids):] for in_ids, out_ids in zip(inputs['input_ids'], generated_ids)
        ]
        
        response = processor.batch_decode(
            generated_ids_trimmed,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False
        )[0]
        
        # 清理输出
        response = response.strip()
        
        # 移除可能的系统标记
        for marker in ["<|im_end|>", "<|im_start|>", "assistant", "Assistant:"]:
            response = response.replace(marker, "")
        
        response = response.strip()
        
        logger.info(f"用户: {message[:50]}... | 回复: {response[:100]}...")
        
        return jsonify({
            'response': response,
            'status': 'success'
        })
        
    except Exception as e:
        logger.error(f"聊天处理错误: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/reset', methods=['POST'])
def reset_conversation():
    """重置对话"""
    # 这里可以添加对话历史管理逻辑
    return jsonify({'status': 'success', 'message': '对话已重置'})

def main():
    """主函数"""
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    
    # 启动时加载模型
    logger.info("="*50)
    logger.info("虚拟人物聊天后端启动中...")
    logger.info("="*50)
    
    success = load_model()
    if not success:
        logger.error("模型加载失败，但服务器仍会启动")
    
    # 启动 Flask 服务器
    logger.info(f"服务器启动在端口 {port}")
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)

if __name__ == '__main__':
    main()

