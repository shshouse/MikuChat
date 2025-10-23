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
const live2dContainer = document.getElementById('live2dContainer');
const live2dImage = document.getElementById('live2dImage');

// 初始化
async function init() {
  setupEventListeners();
  
  // 先检查服务器状态
  await checkServerStatus();
  
  // 加载角色列表（带重试机制）
  await loadRolesWithRetry();
  
  // 加载对话历史
  loadConversations();
  
  // 定期检查服务器状态
  setInterval(checkServerStatus, 5000);
  
  // 每30秒重新加载一次角色列表（防止初始加载失败）
  setInterval(async () => {
    if (availableRoles.length === 0) {
      console.log('角色列表为空，尝试重新加载...');
      await loadRoles();
    }
  }, 30000);
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
  
  // 更新对话计数
  updateConversationCounter();
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
  
  // 添加总空间占用显示
  const totalSize = getTotalConversationsSize();
  const headerDiv = document.createElement('div');
  headerDiv.className = 'history-stats';
  headerDiv.innerHTML = `
    <div style="color: var(--text-secondary); font-size: 11px; padding: 8px 12px; border-bottom: 1px solid var(--border-color);">
      共 ${conversations.length} 个对话 | 总占用: ${formatSize(totalSize)}
    </div>
  `;
  historyList.appendChild(headerDiv);
  
  conversations.forEach(conversation => {
    const item = document.createElement('div');
    item.className = 'history-item';
    if (conversation.id === currentConversationId) {
      item.classList.add('active');
    }
    
    const roleInfo = conversation.roleName || 'AI助手';
    const timeStr = formatTime(new Date(conversation.updatedAt));
    const size = calculateConversationSize(conversation);
    const sizeStr = formatSize(size);
    
    // 判断是否有图片
    const hasImage = conversation.messages.some(msg => msg.image);
    const imageIcon = hasImage ? '<span class="has-image-icon" title="包含图片">🖼️</span>' : '';
    
    item.innerHTML = `
      <div class="history-item-content">
        <div class="history-item-title">${imageIcon}${conversation.title}</div>
        <div class="history-item-meta">
          <span class="history-item-role">${roleInfo}</span>
          <span class="history-item-time">${timeStr}</span>
          <span class="history-item-size" title="空间占用">${sizeStr}</span>
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
      // 如果消息包含图片，传递图片数据
      addMessage(msg.content, 'user', msg.image || null, false);
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

// 更新对话计数显示
function updateConversationCounter() {
  const characterInfo = document.querySelector('.character-info small');
  if (characterInfo) {
    const messageCount = conversationHistory.length;
    const roundCount = Math.floor(messageCount / 2);
    
    // 获取模型名称(如果已经显示了的话)
    const currentText = characterInfo.textContent;
    const modelName = currentText.includes('模型') ? currentText.split('|')[0].trim() : 'Qwen2-VL 2B 模型';
    
    if (messageCount > 0) {
      characterInfo.textContent = `${modelName} | ${roundCount}轮对话 (${messageCount}条消息)`;
    } else {
      characterInfo.textContent = modelName;
    }
    
    console.log(`对话计数更新: ${roundCount}轮对话, ${messageCount}条消息`);
  }
}

// ============ Live2D 立绘管理 ============

// 获取当前角色的Live2D配置
async function getCurrentRoleLive2DConfig() {
  if (!currentRoleId) return null;
  
  try {
    const response = await fetch(`${API_URL}/role/${currentRoleId}`);
    const data = await response.json();
    
    if (data.status === 'success' && data.role.live2d && data.role.live2d.enabled) {
      return data.role.live2d;
    }
  } catch (error) {
    console.error('获取Live2D配置失败:', error);
  }
  
  return null;
}

// 显示立绘
function showLive2D(roleId, emotion = '待机') {
  if (!roleId) {
    live2dContainer.style.display = 'none';
    return;
  }
  
  // 构建图片路径：role/{roleId}/picture/{emotion}.png
  const imagePath = `../role/${roleId}/picture/${emotion}.png`;
  
  live2dImage.src = imagePath;
  live2dImage.onerror = () => {
    // 如果图片加载失败，尝试加载待机图
    if (emotion !== '待机') {
      live2dImage.src = `../role/${roleId}/picture/待机.png`;
    } else {
      // 如果待机图也失败，隐藏立绘
      live2dContainer.style.display = 'none';
    }
  };
  live2dImage.onload = () => {
    live2dContainer.style.display = 'block';
  };
}

// 隐藏立绘
function hideLive2D() {
  live2dContainer.style.display = 'none';
}

// 更新立绘情绪
async function updateLive2DEmotion(emotion) {
  if (!currentRoleId) return;
  
  const config = await getCurrentRoleLive2DConfig();
  if (!config) return;
  
  // 如果有指定情绪，显示对应立绘
  if (emotion && emotion !== '待机') {
    showLive2D(currentRoleId, emotion);
    
    // 5秒后回到待机状态
    setTimeout(() => {
      showLive2D(currentRoleId, '待机');
    }, 5000);
  } else {
    // 否则显示待机立绘
    showLive2D(currentRoleId, '待机');
  }
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

// 计算对话占用的空间大小
function calculateConversationSize(conversation) {
  const jsonString = JSON.stringify(conversation);
  return jsonString.length * 2; // JavaScript字符串使用UTF-16，每个字符2字节
}

// 格式化文件大小
function formatSize(bytes) {
  if (bytes < 1024) {
    return bytes + ' B';
  } else if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  } else {
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }
}

// 计算所有对话的总大小
function getTotalConversationsSize() {
  const jsonString = JSON.stringify(conversations);
  return jsonString.length * 2;
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
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
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
      
      return true;
    } else {
      statusIndicator.classList.remove('connected');
      statusText.textContent = data.model_loaded ? '模型未加载' : '连接中...';
      return false;
    }
  } catch (error) {
    statusIndicator.classList.remove('connected');
    statusText.textContent = '离线';
    console.error('服务器连接失败:', error);
    return false;
  }
}

// 带重试机制的角色加载
async function loadRolesWithRetry(maxRetries = 5, retryDelay = 3000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`[尝试 ${i + 1}/${maxRetries}] 加载角色列表...`);
      const success = await loadRoles();
      
      if (success && availableRoles.length > 0) {
        console.log('✓ 角色列表加载成功！');
        return true;
      }
      
      if (i < maxRetries - 1) {
        console.log(`等待 ${retryDelay/1000} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      console.error(`加载角色失败 (尝试 ${i + 1}/${maxRetries}):`, error);
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  console.warn('⚠ 角色列表加载失败，将只显示默认助手');
  return false;
}

// 加载角色列表
async function loadRoles() {
  try {
    console.log('正在请求角色列表:', `${API_URL}/roles`);
    const response = await fetch(`${API_URL}/roles`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('收到角色列表响应:', data);
    
    if (data.status === 'success') {
      availableRoles = data.roles;
      console.log('可用角色列表:', availableRoles);
      console.log(`  共 ${availableRoles.length} 个角色`);
      
      // 打印每个角色的详细信息
      availableRoles.forEach((role, index) => {
        console.log(`  [${index + 1}] ${role.name} (${role.id})`);
      });
      
      renderRoleList();
      return true;
    } else {
      console.error('角色列表状态异常:', data);
      return false;
    }
  } catch (error) {
    console.error('加载角色列表失败:', error);
    return false;
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
async function selectRole(roleId, roleName, clearHistory = true) {
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
    
    // 显示立绘（待机状态）
    showLive2D(roleId, '待机');
  } else {
    characterAvatar.textContent = 'AI';
    characterName.textContent = 'AI助手';
    
    // 隐藏立绘
    hideLive2D();
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
  
  // 保存图片引用
  const imageToSend = selectedImage;
  
  // 添加用户消息
  addMessage(message, 'user', imageToSend);
  
  // 清空输入
  messageInput.value = '';
  messageInput.style.height = 'auto';
  removeImage();
  
  // 显示输入中指示器
  const typingId = addTypingIndicator();
  
  try {
    // 打印调试信息
    console.log('=== 发送消息 ===');
    console.log('当前消息:', message);
    console.log('历史记录数量:', conversationHistory.length);
    console.log('历史记录:', conversationHistory);
    
    // 调用 API
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        image: imageToSend,
        history: conversationHistory,  // 发送之前的对话历史（不包含当前消息）
        role_id: currentRoleId,  // 发送当前选择的角色ID
      }),
    });
    
    if (!response.ok) {
      throw new Error('服务器响应错误');
    }
    
    const data = await response.json();
    
    // 打印响应信息
    console.log('=== 收到响应 ===');
    console.log('响应内容:', data.response);
    console.log('情绪:', data.emotion);
    console.log('完整响应:', data);
    
    // 移除输入中指示器
    removeTypingIndicator(typingId);
    
    // 添加 AI 回复
    addMessage(data.response, 'assistant');
    
    // 更新立绘情绪
    if (data.emotion) {
      updateLive2DEmotion(data.emotion);
    }
    
    // 更新对话历史
    const userMessage = {
      role: 'user',
      content: message
    };
    
    // 如果有图片，保存图片数据
    if (imageToSend) {
      userMessage.image = imageToSend;
    }
    
    conversationHistory.push(userMessage);
    conversationHistory.push({
      role: 'assistant',
      content: data.response
    });
    
    // 限制历史长度（最多保留最近20轮对话）
    if (conversationHistory.length > 40) {
      conversationHistory = conversationHistory.slice(-40);
    }
    
    // 保存对话到本地存储
    updateCurrentConversation();
    
    // 更新对话计数显示
    updateConversationCounter();
    
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
  
  // 更新对话计数
  updateConversationCounter();
  
  try {
    await fetch(`${API_URL}/reset`, { method: 'POST' });
  } catch (error) {
    console.error('重置对话失败:', error);
  }
}

// 图片压缩配置
const IMAGE_CONFIG = {
  maxWidth: 1024,        // 最大宽度
  maxHeight: 1024,       // 最大高度
  quality: 0.85,         // JPEG 质量 (0-1)
  maxFileSize: 5 * 1024 * 1024  // 最大文件大小 5MB
};

// 处理图片选择
async function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  // 检查文件类型
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件！');
    return;
  }
  
  // 检查原始文件大小
  const originalSize = file.size;
  console.log(`原始文件大小: ${formatFileSize(originalSize)}`);
  
  // 如果文件太大，先提示用户
  if (originalSize > IMAGE_CONFIG.maxFileSize) {
    const confirmed = confirm(
      `图片文件较大 (${formatFileSize(originalSize)})，将自动压缩以避免显存溢出。\n` +
      `压缩后最大尺寸: ${IMAGE_CONFIG.maxWidth}x${IMAGE_CONFIG.maxHeight}\n\n` +
      `是否继续？`
    );
    if (!confirmed) {
      imageInput.value = '';
      return;
    }
  }
  
  try {
    // 压缩图片
    const compressedImage = await compressImage(file);
    
    // 保存压缩后的图片
    selectedImage = compressedImage.dataUrl;
    previewImage.src = compressedImage.dataUrl;
    imagePreview.style.display = 'block';
    
    // 显示压缩信息
    console.log(`图片压缩完成:`);
    console.log(`  原始尺寸: ${compressedImage.originalWidth}x${compressedImage.originalHeight}`);
    console.log(`  压缩后尺寸: ${compressedImage.width}x${compressedImage.height}`);
    console.log(`  原始大小: ${formatFileSize(originalSize)}`);
    console.log(`  压缩后大小: ${formatFileSize(compressedImage.size)}`);
    console.log(`  压缩率: ${((1 - compressedImage.size / originalSize) * 100).toFixed(1)}%`);
    
    // 在界面上显示压缩信息
    showImageInfo(compressedImage, originalSize);
    
  } catch (error) {
    console.error('图片处理失败:', error);
    alert('图片处理失败，请尝试其他图片');
    imageInput.value = '';
  }
}

// 压缩图片
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onerror = () => reject(new Error('文件读取失败'));
    
    reader.onload = (event) => {
      const img = new Image();
      
      img.onerror = () => reject(new Error('图片加载失败'));
      
      img.onload = () => {
        try {
          // 记录原始尺寸
          const originalWidth = img.width;
          const originalHeight = img.height;
          
          // 计算压缩后的尺寸（保持宽高比）
          let width = img.width;
          let height = img.height;
          
          if (width > IMAGE_CONFIG.maxWidth || height > IMAGE_CONFIG.maxHeight) {
            const ratio = Math.min(
              IMAGE_CONFIG.maxWidth / width,
              IMAGE_CONFIG.maxHeight / height
            );
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
          }
          
          // 创建 Canvas 进行压缩
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          
          const ctx = canvas.getContext('2d');
          
          // 使用高质量的图像缩放
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // 绘制图片
          ctx.drawImage(img, 0, 0, width, height);
          
          // 转换为 base64（JPEG 格式以获得更好的压缩）
          const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_CONFIG.quality);
          
          // 计算压缩后的大小
          const base64Length = dataUrl.split(',')[1].length;
          const size = Math.floor(base64Length * 0.75); // base64 大约是原始大小的 4/3
          
          resolve({
            dataUrl: dataUrl,
            width: width,
            height: height,
            originalWidth: originalWidth,
            originalHeight: originalHeight,
            size: size
          });
        } catch (error) {
          reject(error);
        }
      };
      
      img.src = event.target.result;
    };
    
    reader.readAsDataURL(file);
  });
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return bytes + ' B';
  } else if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  } else {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }
}

// 显示图片信息
function showImageInfo(compressedImage, originalSize) {
  // 在预览图片下方显示信息
  let infoDiv = document.getElementById('imageInfo');
  if (!infoDiv) {
    infoDiv = document.createElement('div');
    infoDiv.id = 'imageInfo';
    infoDiv.style.cssText = `
      font-size: 11px;
      color: var(--text-secondary, #999);
      margin-top: 4px;
      padding: 4px 8px;
      background: rgba(0,0,0,0.2);
      border-radius: 4px;
    `;
    imagePreview.appendChild(infoDiv);
  }
  
  const compressionRatio = ((1 - compressedImage.size / originalSize) * 100).toFixed(0);
  
  infoDiv.innerHTML = `
    <div>尺寸: ${compressedImage.originalWidth}×${compressedImage.originalHeight} → ${compressedImage.width}×${compressedImage.height}</div>
    <div>大小: ${formatFileSize(originalSize)} → ${formatFileSize(compressedImage.size)} (压缩${compressionRatio}%)</div>
  `;
}

// 移除图片
function removeImage() {
  selectedImage = null;
  imagePreview.style.display = 'none';
  previewImage.src = '';
  imageInput.value = '';
  
  // 移除图片信息显示
  const infoDiv = document.getElementById('imageInfo');
  if (infoDiv) {
    infoDiv.remove();
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

