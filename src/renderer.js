// 渲染进程脚本 - 处理前端逻辑

const API_URL = 'http://127.0.0.1:5000';
let selectedImage = null;
let conversationHistory = [];  // 存储对话历史

// DOM 元素
const chatContainer = document.getElementById('chatContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const imageBtn = document.getElementById('imageBtn');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const previewImage = document.getElementById('previewImage');
const removeImageBtn = document.getElementById('removeImageBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');

// 初始化
async function init() {
  setupEventListeners();
  checkServerStatus();
  
  // 定期检查服务器状态
  setInterval(checkServerStatus, 5000);
}

// 设置事件监听器
function setupEventListeners() {
  // 发送消息
  sendBtn.addEventListener('click', sendMessage);
  
  // 回车发送，Shift+回车换行
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  // 自动调整输入框高度
  messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = messageInput.scrollHeight + 'px';
  });
  
  // 新对话
  newChatBtn.addEventListener('click', newConversation);
  
  // 图片上传
  imageBtn.addEventListener('click', () => imageInput.click());
  imageInput.addEventListener('change', handleImageSelect);
  removeImageBtn.addEventListener('click', removeImage);
  
  // 快捷按钮
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      messageInput.value = prompt;
      sendMessage();
    });
  });
}

// 检查服务器状态
async function checkServerStatus() {
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();
    
    if (data.status === 'ok' && data.model_loaded) {
      statusIndicator.classList.add('connected');
      statusText.textContent = '已连接';
      sendBtn.disabled = false;
      
      // 更新模型名称显示
      if (data.model_name) {
        const modelInfoElement = document.querySelector('.model-info small');
        if (modelInfoElement) {
          modelInfoElement.textContent = data.model_name;
        }
        const chatHeaderModel = document.querySelector('.character-info small');
        if (chatHeaderModel) {
          chatHeaderModel.textContent = data.model_name + ' 模型';
        }
      }
    } else {
      statusIndicator.classList.remove('connected');
      statusText.textContent = data.model_loaded ? '模型未加载' : '连接中...';
    }
  } catch (error) {
    statusIndicator.classList.remove('connected');
    statusText.textContent = '离线';
    console.error('服务器连接失败:', error);
  }
}

// 发送消息
async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;
  
  // 清除欢迎消息
  const welcomeMsg = chatContainer.querySelector('.welcome-message');
  if (welcomeMsg) {
    welcomeMsg.remove();
  }
  
  // 添加用户消息
  addMessage(message, 'user', selectedImage);
  
  // 清空输入
  const imageToSend = selectedImage;
  messageInput.value = '';
  messageInput.style.height = 'auto';
  removeImage();
  
  // 显示输入中指示器
  const typingId = addTypingIndicator();
  
  try {
    // 调用 API
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        image: imageToSend,
        history: conversationHistory,  // 发送对话历史
      }),
    });
    
    if (!response.ok) {
      throw new Error('服务器响应错误');
    }
    
    const data = await response.json();
    
    // 移除输入中指示器
    removeTypingIndicator(typingId);
    
    // 添加 AI 回复
    addMessage(data.response, 'assistant');
    
    // 更新对话历史
    conversationHistory.push({
      role: 'user',
      content: message
    });
    conversationHistory.push({
      role: 'assistant',
      content: data.response
    });
    
    // 限制历史长度（最多保留最近10轮对话）
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }
    
  } catch (error) {
    removeTypingIndicator(typingId);
    addMessage('抱歉，我现在无法回复。请确保后端服务正在运行。', 'assistant', null, true);
    console.error('发送消息失败:', error);
  }
}

// 添加消息到聊天界面
function addMessage(text, sender, image = null, isError = false) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}`;
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = sender === 'user' ? '👤' : '🎵';
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  if (image && sender === 'user') {
    const img = document.createElement('img');
    img.src = image;
    img.className = 'message-image';
    content.appendChild(img);
  }
  
  const textDiv = document.createElement('div');
  textDiv.textContent = text;
  if (isError) {
    textDiv.style.color = '#ff6b6b';
  }
  content.appendChild(textDiv);
  
  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = new Date().toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  content.appendChild(time);
  
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(content);
  
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// 添加输入中指示器
function addTypingIndicator() {
  const id = 'typing-' + Date.now();
  const messageDiv = document.createElement('div');
  messageDiv.id = id;
  messageDiv.className = 'message assistant';
  
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = '🎵';
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  const typing = document.createElement('div');
  typing.className = 'typing-indicator';
  typing.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  
  content.appendChild(typing);
  messageDiv.appendChild(avatar);
  messageDiv.appendChild(content);
  
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  return id;
}

// 移除输入中指示器
function removeTypingIndicator(id) {
  const element = document.getElementById(id);
  if (element) {
    element.remove();
  }
}

// 新对话
async function newConversation() {
  // 清空对话历史
  conversationHistory = [];
  
  chatContainer.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">🌟</div>
      <h2>欢迎使用 MikuChat!</h2>
      <p>我是你的AI虚拟伙伴，有什么可以帮助你的吗？</p>
      <div class="quick-actions">
        <button class="quick-btn" data-prompt="你好！请介绍一下你自己">👋 打个招呼</button>
        <button class="quick-btn" data-prompt="你能做什么？">💡 你能做什么</button>
        <button class="quick-btn" data-prompt="给我讲个笑话吧">😄 讲个笑话</button>
      </div>
    </div>
  `;
  
  // 重新绑定快捷按钮
  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      messageInput.value = prompt;
      sendMessage();
    });
  });
  
  try {
    await fetch(`${API_URL}/reset`, { method: 'POST' });
  } catch (error) {
    console.error('重置对话失败:', error);
  }
}

// 处理图片选择
function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    selectedImage = event.target.result;
    previewImage.src = selectedImage;
    imagePreview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

// 移除图片
function removeImage() {
  selectedImage = null;
  imagePreview.style.display = 'none';
  previewImage.src = '';
  imageInput.value = '';
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

