// 渲染进程脚本 - 处理前端逻辑

const API_URL = 'http://127.0.0.1:5000';
let selectedImage = null;
let conversationHistory = [];  // 存储对话历史
let currentRoleId = null;  // 当前选择的角色ID
let availableRoles = [];  // 可用角色列表
let currentConversationId = null;  // 当前对话ID
let conversations = [];  // 所有对话记录

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
const roleList = document.getElementById('roleList');
const historyList = document.getElementById('historyList');

// 初始化
async function init() {
  setupEventListeners();
  await loadRoles();  // 加载角色列表
  loadConversations();  // 加载对话历史
  checkServerStatus();
  
  // 定期检查服务器状态
  setInterval(checkServerStatus, 5000);
}

// ============ 对话历史管理 ============

// 从 localStorage 加载所有对话
function loadConversations() {
  const saved = localStorage.getItem('mikuchat_conversations');
  if (saved) {
    try {
      conversations = JSON.parse(saved);
    } catch (e) {
      console.error('加载对话历史失败:', e);
      conversations = [];
    }
  }
  renderHistoryList();
}

// 保存对话到 localStorage
function saveConversations() {
  try {
    localStorage.setItem('mikuchat_conversations', JSON.stringify(conversations));
  } catch (e) {
    console.error('保存对话失败:', e);
  }
}

// 创建新对话
function createNewConversation() {
  const id = Date.now().toString();
  const conversation = {
    id: id,
    title: '新对话',
    roleId: currentRoleId,
    roleName: getCurrentRoleName(),
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  conversations.unshift(conversation);  // 添加到开头
  currentConversationId = id;
  saveConversations();
  renderHistoryList();
  
  return conversation;
}

// 更新当前对话
function updateCurrentConversation() {
  if (!currentConversationId) {
    // 如果没有当前对话，创建新对话
    createNewConversation();
  }
  
  const conversation = conversations.find(c => c.id === currentConversationId);
  if (conversation) {
    conversation.messages = conversationHistory;
    conversation.roleId = currentRoleId;
    conversation.roleName = getCurrentRoleName();
    conversation.updatedAt = new Date().toISOString();
    
    // 如果是第一条消息，使用用户消息作为标题
    if (conversationHistory.length > 0 && conversation.title === '新对话') {
      const firstUserMessage = conversationHistory.find(m => m.role === 'user');
      if (firstUserMessage) {
        conversation.title = firstUserMessage.content.substring(0, 30) + 
                           (firstUserMessage.content.length > 30 ? '...' : '');
      }
    }
    
    saveConversations();
    renderHistoryList();
  }
}

// 加载指定对话
function loadConversation(conversationId) {
  const conversation = conversations.find(c => c.id === conversationId);
  if (!conversation) return;
  
  currentConversationId = conversationId;
  conversationHistory = [...conversation.messages];
  
  // 切换到对话的角色
  if (conversation.roleId !== currentRoleId) {
    selectRole(conversation.roleId, conversation.roleName, false);  // 不清空历史
  }
  
  // 渲染对话消息
  renderConversationMessages();
  renderHistoryList();
}

// 删除对话
function deleteConversation(conversationId, event) {
  if (event) {
    event.stopPropagation();
  }
  
  if (!confirm('确定要删除这个对话吗？')) {
    return;
  }
  
  conversations = conversations.filter(c => c.id !== conversationId);
  
  // 如果删除的是当前对话，清空当前对话
  if (currentConversationId === conversationId) {
    currentConversationId = null;
    conversationHistory = [];
    showWelcomeMessage();
  }
  
  saveConversations();
  renderHistoryList();
}

// 渲染历史对话列表
function renderHistoryList() {
  historyList.innerHTML = '';
  
  if (conversations.length === 0) {
    historyList.innerHTML = '<div style="color: var(--text-secondary); font-size: 12px; padding: 12px;">暂无对话历史</div>';
    return;
  }
  
  conversations.forEach(conversation => {
    const item = document.createElement('div');
    item.className = 'history-item';
    if (conversation.id === currentConversationId) {
      item.classList.add('active');
    }
    
    const roleInfo = conversation.roleName || 'AI助手';
    const timeStr = formatTime(new Date(conversation.updatedAt));
    
    item.innerHTML = `
      <div class="history-item-content">
        <div class="history-item-title">${conversation.title}</div>
        <div class="history-item-meta">
          <span class="history-item-role">${roleInfo}</span>
          <span class="history-item-time">${timeStr}</span>
        </div>
      </div>
      <button class="history-item-delete" title="删除对话">×</button>
    `;
    
    // 点击加载对话
    const content = item.querySelector('.history-item-content');
    content.addEventListener('click', () => loadConversation(conversation.id));
    
    // 点击删除按钮
    const deleteBtn = item.querySelector('.history-item-delete');
    deleteBtn.addEventListener('click', (e) => deleteConversation(conversation.id, e));
    
    historyList.appendChild(item);
  });
}

// 渲染对话消息
function renderConversationMessages() {
  chatContainer.innerHTML = '';
  
  if (conversationHistory.length === 0) {
    showWelcomeMessage();
    return;
  }
  
  conversationHistory.forEach(msg => {
    if (msg.role === 'user') {
      addMessage(msg.content, 'user', null, false);
    } else if (msg.role === 'assistant') {
      addMessage(msg.content, 'assistant', null, false);
    }
  });
}

// 显示欢迎消息
function showWelcomeMessage() {
  const roleName = getCurrentRoleName();
  const welcomeText = currentRoleId ? 
    `你好！我是${roleName}，有什么可以帮助你的吗？` :
    '我是你的AI虚拟伙伴，有什么可以帮助你的吗？';
  
  chatContainer.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">★</div>
      <h2>欢迎使用 MikuChat!</h2>
      <p>${welcomeText}</p>
      <div class="quick-actions">
        <button class="quick-btn" data-prompt="你好！请介绍一下你自己">打个招呼</button>
        <button class="quick-btn" data-prompt="你能做什么？">你能做什么</button>
        <button class="quick-btn" data-prompt="给我讲个笑话吧">讲个笑话</button>
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
}

// 获取当前角色名称
function getCurrentRoleName() {
  if (!currentRoleId) return 'AI助手';
  const role = availableRoles.find(r => r.id === currentRoleId);
  return role ? role.name : 'AI助手';
}

// 格式化时间
function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  
  // 今天
  if (diff < 24 * 60 * 60 * 1000 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  
  // 昨天
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.getDate() === yesterday.getDate() && 
      date.getMonth() === yesterday.getMonth() && 
      date.getFullYear() === yesterday.getFullYear()) {
    return '昨天';
  }
  
  // 一周内
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return '周' + days[date.getDay()];
  }
  
  // 更早
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
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

// 加载角色列表
async function loadRoles() {
  try {
    const response = await fetch(`${API_URL}/roles`);
    const data = await response.json();
    
    if (data.status === 'success') {
      availableRoles = data.roles;
      renderRoleList();
    }
  } catch (error) {
    console.error('加载角色列表失败:', error);
  }
}

// 渲染角色列表
function renderRoleList() {
  // 清空现有角色列表（保留默认助手）
  const defaultRole = roleList.querySelector('[data-role-id=""]');
  roleList.innerHTML = '';
  if (defaultRole) {
    roleList.appendChild(defaultRole);
    // 为默认角色添加点击事件
    defaultRole.addEventListener('click', () => selectRole(null, 'AI助手'));
  }
  
  // 添加角色到列表
  availableRoles.forEach(role => {
    const roleItem = document.createElement('div');
    roleItem.className = 'role-item';
    roleItem.setAttribute('data-role-id', role.id);
    
    roleItem.innerHTML = `
      <div class="role-avatar">${role.nickname ? role.nickname[0].toUpperCase() : role.name[0]}</div>
      <div class="role-info">
        <div class="role-name">${role.name}</div>
        <div class="role-desc">${role.description}</div>
      </div>
    `;
    
    roleItem.addEventListener('click', () => selectRole(role.id, role.name));
    roleList.appendChild(roleItem);
  });
}

// 选择角色
function selectRole(roleId, roleName, clearHistory = true) {
  currentRoleId = roleId;
  
  // 更新UI显示
  document.querySelectorAll('.role-item').forEach(item => {
    item.classList.remove('active');
  });
  
  const selectedItem = document.querySelector(`[data-role-id="${roleId || ''}"]`);
  if (selectedItem) {
    selectedItem.classList.add('active');
  }
  
  // 更新聊天头部显示
  const characterAvatar = document.querySelector('.character-avatar');
  const characterName = document.querySelector('.character-info h3');
  
  if (roleId) {
    const role = availableRoles.find(r => r.id === roleId);
    if (role) {
      characterAvatar.textContent = role.nickname ? role.nickname[0].toUpperCase() : role.name[0];
      characterName.textContent = role.name;
    }
  } else {
    characterAvatar.textContent = 'AI';
    characterName.textContent = 'AI助手';
  }
  
  // 清空对话历史（切换角色时）
  if (clearHistory) {
    newConversation();
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
        role_id: currentRoleId,  // 发送当前选择的角色ID
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
    
    // 保存对话到本地存储
    updateCurrentConversation();
    
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
  avatar.textContent = sender === 'user' ? '我' : 'AI';
  
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
  avatar.textContent = 'AI';
  
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
  currentConversationId = null;
  
  // 显示欢迎消息
  showWelcomeMessage();
  
  // 更新历史列表（取消当前对话的高亮）
  renderHistoryList();
  
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

