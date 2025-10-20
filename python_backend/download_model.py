"""
模型下载脚本
使用魔搭社区下载 SmolVLM 模型
"""
import os
import sys

def download_model():
    """从魔搭社区下载模型"""
    MODEL_NAME = "HuggingFaceTB/SmolVLM-500M-Instruct"
    MODEL_CACHE_DIR = os.path.join(os.path.dirname(__file__), "models")
    
    print("="*60)
    print("开始下载模型: SmolVLM-500M-Instruct")
    print("="*60)
    
    try:
        from modelscope import snapshot_download
        
        print(f"模型将下载到: {MODEL_CACHE_DIR}")
        model_dir = snapshot_download(
            MODEL_NAME, 
            cache_dir=MODEL_CACHE_DIR,
            revision='master'
        )
        
        print("\n" + "="*60)
        print("✓ 模型下载成功!")
        print(f"模型位置: {model_dir}")
        print("="*60)
        
        return True
        
    except ImportError:
        print("\n错误: 未安装 modelscope 库")
        print("请运行: pip install modelscope")
        return False
        
    except Exception as e:
        print(f"\n错误: 下载失败 - {str(e)}")
        print("\n尝试备用方案: 从 HuggingFace 下载")
        
        try:
            from transformers import AutoProcessor, AutoModelForVision2Seq
            
            print("正在从 HuggingFace Hub 下载...")
            processor = AutoProcessor.from_pretrained(MODEL_NAME, cache_dir=MODEL_CACHE_DIR)
            model = AutoModelForVision2Seq.from_pretrained(MODEL_NAME, cache_dir=MODEL_CACHE_DIR)
            
            print("\n" + "="*60)
            print("✓ 从 HuggingFace 下载成功!")
            print(f"模型位置: {MODEL_CACHE_DIR}")
            print("="*60)
            return True
            
        except Exception as e2:
            print(f"\n错误: HuggingFace 下载也失败 - {str(e2)}")
            return False

if __name__ == '__main__':
    success = download_model()
    sys.exit(0 if success else 1)

