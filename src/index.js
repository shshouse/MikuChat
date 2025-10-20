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

// 启动 Python 后端服务
async function startPythonBackend() {
  const pythonPath = 'python'; // 或 'python3' 根据系统
  const scriptPath = path.join(__dirname, '..', 'python_backend', 'model_server.py');
  
  console.log('正在启动 Python 后端服务...');
  console.log('脚本路径:', scriptPath);
  
  // 检查端口是否已被占用
  const isAvailable = await checkPortAvailable(PYTHON_PORT);
  if (!isAvailable) {
    console.log(`端口 ${PYTHON_PORT} 已被占用，尝试连接现有服务...`);
    return true;
  }
  
  return new Promise((resolve) => {
    pythonProcess = spawn(pythonPath, [scriptPath, PYTHON_PORT.toString()]);
    
    pythonProcess.stdout.on('data', (data) => {
      console.log(`Python: ${data.toString()}`);
      
      // 检测服务器启动成功的标志
      if (data.toString().includes('Running on')) {
        console.log('Python 后端服务启动成功！');
        resolve(true);
      }
    });
    
    pythonProcess.stderr.on('data', (data) => {
      console.error(`Python Error: ${data.toString()}`);
    });
    
    pythonProcess.on('close', (code) => {
      console.log(`Python 进程退出，退出码: ${code}`);
      pythonProcess = null;
    });
    
    pythonProcess.on('error', (err) => {
      console.error('启动 Python 进程失败:', err);
      resolve(false);
    });
    
    // 5秒后如果还没启动成功，也继续（可能模型加载需要时间）
    setTimeout(() => {
      if (pythonProcess) {
        console.log('Python 进程已启动，等待模型加载...');
        resolve(true);
      }
    }, 5000);
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
  // 先启动 Python 后端
  const backendStarted = await startPythonBackend();
  
  if (!backendStarted) {
    console.warn('Python 后端启动失败，但应用将继续运行');
  }
  
  // 创建窗口
  createWindow();

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
