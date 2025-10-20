"""
虚拟人物聊天后端服务
使用 SmolVLM-500M-Instruct 模型
"""
import os
import sys
import json
import logging
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
MODEL_NAME = "HuggingFaceTB/SmolVLM-500M-Instruct"
MODEL_CACHE_DIR = os.path.join(os.path.dirname(__file__), "models")

def load_model():
    """加载模型和处理器"""
    global model, processor, device
    
    logger.info("开始加载模型...")
    
    # 检测设备
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"使用设备: {device}")
    
    try:
        # 从魔搭社区加载模型
        from modelscope import snapshot_download
        
        # 下载模型到本地
        model_dir = snapshot_download(MODEL_NAME, cache_dir=MODEL_CACHE_DIR)
        logger.info(f"模型下载到: {model_dir}")
        
        # 加载处理器和模型
        processor = AutoProcessor.from_pretrained(model_dir)
        model = AutoModelForVision2Seq.from_pretrained(
            model_dir,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            device_map=device
        )
        
        logger.info("模型加载成功!")
        return True
        
    except Exception as e:
        logger.error(f"模型加载失败: {str(e)}")
        # 如果魔搭失败，尝试从 HuggingFace 加载
        try:
            logger.info("尝试从 HuggingFace 加载模型...")
            processor = AutoProcessor.from_pretrained(MODEL_NAME, cache_dir=MODEL_CACHE_DIR)
            model = AutoModelForVision2Seq.from_pretrained(
                MODEL_NAME,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
                device_map=device,
                cache_dir=MODEL_CACHE_DIR
            )
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
        'device': str(device) if device else 'unknown'
    })

@app.route('/chat', methods=['POST'])
def chat():
    """聊天接口"""
    try:
        data = request.json
        message = data.get('message', '')
        image_data = data.get('image', None)  # base64 编码的图片（可选）
        
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
        
        # 准备输入
        if image:
            inputs = processor(text=message, images=image, return_tensors="pt").to(device)
        else:
            inputs = processor(text=message, return_tensors="pt").to(device)
        
        # 生成回复
        with torch.no_grad():
            generated_ids = model.generate(
                **inputs,
                max_new_tokens=512,
                do_sample=True,
                temperature=0.7,
                top_p=0.9
            )
        
        # 解码输出
        response = processor.decode(generated_ids[0], skip_special_tokens=True)
        
        # 移除输入部分，只保留生成的回复
        if message in response:
            response = response.replace(message, '').strip()
        
        logger.info(f"用户: {message[:50]}... | 回复: {response[:50]}...")
        
        return jsonify({
            'response': response,
            'status': 'success'
        })
        
    except Exception as e:
        logger.error(f"聊天处理错误: {str(e)}")
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

