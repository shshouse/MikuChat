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

# 角色配置目录
ROLE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "role")

# 生成参数配置
GENERATION_CONFIG = {
    'max_tokens': 512,
    'temperature': 0.5,  # 降低温度,让模型更关注上下文
    'top_p': 0.85,       # 稍微降低,提高一致性
    'repetition_penalty': 1.05  # 降低惩罚,避免过度避免重复
}

# 图片处理配置
IMAGE_CONFIG = {
    'max_width': 1280,   # 后端最大宽度（比前端稍大，作为最后保护）
    'max_height': 1280,  # 后端最大高度
    'max_pixels': 1280 * 1280  # 最大像素数
}

# 全局变量存储角色数据
roles_cache = {}

def load_roles():
    """加载所有角色配置"""
    global roles_cache
    roles_cache = {}
    
    logger.info(f"尝试从以下路径加载角色: {ROLE_DIR}")
    
    if not os.path.exists(ROLE_DIR):
        logger.warning(f"角色目录不存在: {ROLE_DIR}")
        logger.warning(f"当前工作目录: {os.getcwd()}")
        logger.warning(f"__file__ 路径: {__file__}")
        return
    
    try:
        dir_contents = os.listdir(ROLE_DIR)
        logger.info(f"角色目录内容: {dir_contents}")
        
        for role_id in dir_contents:
            role_path = os.path.join(ROLE_DIR, role_id)
            
            logger.info(f"检查: {role_id} -> {role_path}")
            
            # 跳过非目录和README文件
            if not os.path.isdir(role_path):
                logger.info(f"  跳过（非目录）: {role_id}")
                continue
            
            # 读取角色配置文件
            character_file = os.path.join(role_path, "character.json")
            logger.info(f"  查找配置文件: {character_file}")
            
            if os.path.exists(character_file):
                try:
                    with open(character_file, 'r', encoding='utf-8') as f:
                        character_data = json.load(f)
                        roles_cache[role_id] = character_data
                        logger.info(f"✓ 成功加载角色: {role_id} - {character_data.get('name', 'Unknown')}")
                except Exception as e:
                    logger.error(f"✗ 加载角色 {role_id} 失败: {str(e)}")
                    import traceback
                    logger.error(traceback.format_exc())
            else:
                logger.warning(f"  配置文件不存在: {character_file}")
        
        logger.info(f"========================================")
        logger.info(f"总共加载了 {len(roles_cache)} 个角色")
        logger.info(f"角色列表: {list(roles_cache.keys())}")
        logger.info(f"========================================")
    except Exception as e:
        logger.error(f"加载角色配置失败: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())

def get_role_system_prompt(role_id):
    """获取角色的系统提示词"""
    if role_id and role_id in roles_cache:
        return roles_cache[role_id].get('system_prompt', '')
    return ''

def get_role_live2d_config(role_id):
    """获取角色的Live2D配置"""
    if role_id and role_id in roles_cache:
        return roles_cache[role_id].get('live2d', {})
    return {}

def resize_image_if_needed(image):
    """如果图片太大，调整大小以避免显存溢出"""
    width, height = image.size
    pixels = width * height
    
    logger.info(f"原始图片尺寸: {width}x{height} ({pixels:,} 像素)")
    
    # 检查是否需要调整大小
    if width <= IMAGE_CONFIG['max_width'] and height <= IMAGE_CONFIG['max_height'] and pixels <= IMAGE_CONFIG['max_pixels']:
        logger.info("图片尺寸在限制范围内，无需调整")
        return image
    
    # 计算缩放比例
    scale_w = IMAGE_CONFIG['max_width'] / width
    scale_h = IMAGE_CONFIG['max_height'] / height
    scale_p = (IMAGE_CONFIG['max_pixels'] / pixels) ** 0.5
    
    scale = min(scale_w, scale_h, scale_p)
    
    new_width = int(width * scale)
    new_height = int(height * scale)
    
    logger.warning(f"图片过大！调整大小: {width}x{height} -> {new_width}x{new_height}")
    
    # 使用高质量的重采样方法
    resized_image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    return resized_image

def extract_emotion(response_text, role_id):
    """从回复文本中提取情绪标签"""
    import re
    
    # 尝试匹配 [情绪:XXX] 格式
    emotion_match = re.match(r'\[情绪[:：](.+?)\]', response_text)
    if emotion_match:
        emotion = emotion_match.group(1).strip()
        # 移除情绪标签，只返回文本
        clean_text = re.sub(r'\[情绪[:：].+?\]', '', response_text).strip()
        return emotion, clean_text
    
    # 如果没有情绪标签，返回默认情绪
    live2d_config = get_role_live2d_config(role_id)
    default_emotion = live2d_config.get('default_emotion', '待机') if live2d_config.get('enabled') else None
    
    return default_emotion, response_text

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

@app.route('/roles', methods=['GET'])
def get_roles():
    """获取所有可用角色列表"""
    try:
        roles_list = []
        for role_id, role_data in roles_cache.items():
            roles_list.append({
                'id': role_id,
                'name': role_data.get('name', role_id),
                'nickname': role_data.get('nickname', ''),
                'description': role_data.get('description', ''),
                'personality': role_data.get('personality', [])
            })
        
        return jsonify({
            'status': 'success',
            'roles': roles_list
        })
    except Exception as e:
        logger.error(f"获取角色列表失败: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/role/<role_id>', methods=['GET'])
def get_role_detail(role_id):
    """获取指定角色的详细信息"""
    try:
        if role_id not in roles_cache:
            return jsonify({'error': '角色不存在'}), 404
        
        return jsonify({
            'status': 'success',
            'role': roles_cache[role_id]
        })
    except Exception as e:
        logger.error(f"获取角色详情失败: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/chat', methods=['POST'])
def chat():
    """聊天接口"""
    try:
        data = request.json
        message = data.get('message', '')
        image_data = data.get('image', None)  # base64 编码的图片（可选）
        history = data.get('history', [])  # 对话历史
        role_id = data.get('role_id', None)  # 角色ID
        
        # 打印调试信息
        logger.info("=" * 50)
        logger.info(f"收到新消息: {message[:50]}...")
        logger.info(f"历史记录数量: {len(history)}")
        logger.info(f"历史记录: {history}")
        logger.info(f"角色ID: {role_id}")
        logger.info("=" * 50)
        
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
                
                # 调整图片大小（如果需要）以避免显存溢出
                image = resize_image_if_needed(image)
                
            except Exception as e:
                logger.warning(f"图片处理失败: {str(e)}")
        
        # 构建 Qwen3-VL 的消息格式
        messages = []
        
        # 添加角色系统提示词（如果选择了角色）
        system_prompt = get_role_system_prompt(role_id)
        if system_prompt:
            # 在系统提示词中添加上下文记忆要求
            enhanced_prompt = system_prompt + "\n\n请记住我们的对话历史,并在回答时参考之前的内容。"
            messages.append({
                "role": "system",
                "content": enhanced_prompt
            })
            logger.info(f"使用角色: {role_id}")
        else:
            # 如果没有角色,添加一个基础的系统提示词
            messages.append({
                "role": "system",
                "content": "你是一个helpful的AI助手。请记住我们的对话历史,并在回答时参考之前的内容,保持对话的连贯性。"
            })
            logger.info("使用默认系统提示词")
        
        # 添加历史消息（限制历史长度以节省内存）
        for h in history[-40:]:  # 保留最近20轮对话（40条消息）
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
        
        # 打印最终发送给模型的消息列表
        logger.info(f"最终消息列表（共{len(messages)}条）:")
        for i, msg in enumerate(messages):
            role = msg.get('role', 'unknown')
            content = msg.get('content', '')
            if isinstance(content, str):
                logger.info(f"  [{i}] {role}: {content[:100]}...")
            else:
                logger.info(f"  [{i}] {role}: [复杂内容]")
        
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
        
        # 提取情绪标签
        emotion, clean_response = extract_emotion(response, role_id)
        
        logger.info(f"用户: {message[:50]}... | 回复: {clean_response[:100]}... | 情绪: {emotion}")
        
        return jsonify({
            'response': clean_response,
            'emotion': emotion,
            'role_id': role_id,
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
    
    # 启动时加载模型和角色
    logger.info("="*50)
    logger.info("虚拟人物聊天后端启动中...")
    logger.info("="*50)
    
    # 加载角色配置
    logger.info("加载角色配置...")
    load_roles()
    
    # 加载模型
    success = load_model()
    if not success:
        logger.error("模型加载失败，但服务器仍会启动")
    
    # 启动 Flask 服务器
    logger.info(f"服务器启动在端口 {port}")
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)

if __name__ == '__main__':
    main()

