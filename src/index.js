const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { spawn } = require('child_process');
const net = require('net');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let pythonProcess = null;
let mainWindow = null;
const PYTHON_PORT = 5000;

// 检查端口是否可用
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

// 检查后端服务是否真的准备好
async function waitForBackendReady(maxWaitTime = 60000) {
  const http = require('http');
  const startTime = Date.now();
  
  console.log('等待后端服务完全准备好...');
  
  while (Date.now() - startTime < maxWaitTime) {
    try {
      // 尝试调用健康检查接口
      const response = await new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${PYTHON_PORT}/health`, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(2000);
      });
      
      // 检查模型是否已加载
      if (response.status === 'ok' && response.model_loaded) {
        console.log('✓ 后端服务已完全准备好！');
        console.log(`  模型: ${response.model_name}`);
        console.log(`  设备: ${response.device}`);
        return true;
      } else if (response.status === 'ok') {
        console.log('后端服务运行中，但模型仍在加载...');
      }
    } catch (error) {
      // 忽略连接错误，继续等待
    }
    
    // 等待2秒后重试
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.warn('⚠ 后端服务等待超时，但仍会继续启动前端');
  return false;
}

// 启动 Python 后端服务
async function startPythonBackend() {
  const pythonPath = 'python'; // 或 'python3' 根据系统
  const scriptPath = path.join(__dirname, '..', 'python_backend', 'model_server.py');
  
  console.log('正在启动 Python 后端服务...');
  console.log('脚本路径:', scriptPath);
  
  // 检查端口是否已被占用
  const isAvailable = await checkPortAvailable(PYTHON_PORT);
  if (!isAvailable) {
    console.log(`端口 ${PYTHON_PORT} 已被占用，检查现有服务...`);
    // 检查现有服务是否可用
    const isReady = await waitForBackendReady(5000);
    return isReady;
  }
  
  return new Promise((resolve) => {
    pythonProcess = spawn(pythonPath, [scriptPath, PYTHON_PORT.toString()]);
    
    let processStarted = false;
    
    pythonProcess.stdout.on('data', (data) => {
      console.log(`Python: ${data.toString()}`);
      
      // 检测服务器启动成功的标志
      if (data.toString().includes('Running on') && !processStarted) {
        processStarted = true;
        console.log('Python 后端进程已启动，等待完全准备...');
        
        // 等待后端真正准备好（模型加载完成）
        waitForBackendReady().then((ready) => {
          resolve(ready);
        });
      }
    });
    
    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python Error: ${data.toString()}`);
    });
    
    pythonProcess.on('close', (code) => {
      console.log(`Python 进程退出，退出码: ${code}`);
      pythonProcess = null;
      if (!processStarted) {
        resolve(false);
      }
    });
    
    pythonProcess.on('error', (err) => {
      console.error('启动 Python 进程失败:', err);
      resolve(false);
    });
    
    // 30秒后如果还没看到启动日志，认为启动失败
    setTimeout(() => {
      if (!processStarted && pythonProcess) {
        console.log('⚠ Python 进程启动超时，尝试继续等待...');
        waitForBackendReady(30000).then((ready) => {
          resolve(ready);
        });
      }
    }, 30000);
  });
}

// 停止 Python 后端
function stopPythonBackend() {
  if (pythonProcess) {
    console.log('正在停止 Python 后端服务...');
    pythonProcess.kill();
    pythonProcess = null;
  }
}

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#1a1a2e',
    autoHideMenuBar: true,
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
};

// IPC 处理程序 - 下载模型
ipcMain.handle('download-model', async () => {
  const pythonPath = 'python';
  const scriptPath = path.join(__dirname, '..', 'python_backend', 'download_model.py');
  
  return new Promise((resolve, reject) => {
    const downloadProcess = spawn(pythonPath, [scriptPath]);
    
    downloadProcess.stdout.on('data', (data) => {
      console.log(`下载: ${data.toString()}`);
    });
    
    downloadProcess.stderr.on('data', (data) => {
      console.error(`下载错误: ${data.toString()}`);
    });
    
    downloadProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        reject(new Error(`下载失败，退出码: ${code}`));
      }
    });
    
    downloadProcess.on('error', (err) => {
      reject(err);
    });
  });
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  console.log('========================================');
  console.log('       MikuChat 正在启动');
  console.log('========================================');
  console.log('');
  
  // 先启动 Python 后端
  console.log('[步骤 1/2] 启动后端服务并加载模型...');
  console.log('提示: 首次启动或模型加载可能需要较长时间，请耐心等待');
  console.log('');
  
  const backendStarted = await startPythonBackend();
  
  if (!backendStarted) {
    console.warn('⚠ Python 后端启动失败或超时，但应用将继续运行');
    console.warn('  您可能无法使用AI对话功能，但可以查看界面');
  } else {
    console.log('✓ 后端服务已准备就绪');
  }
  
  console.log('');
  console.log('[步骤 2/2] 启动前端界面...');
  
  // 创建窗口
  createWindow();
  
  console.log('✓ 应用启动完成！');
  console.log('');
  console.log('========================================');

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  stopPythonBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用退出时清理
app.on('will-quit', () => {
  stopPythonBackend();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
