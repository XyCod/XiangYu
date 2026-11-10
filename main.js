const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let db;

// 初始化 Lowdb v7
async function initDB() {
    const { JSONFilePreset } = await import('lowdb/node');
    // 数据库保存在用户数据目录下，避免打包后无法写入
    const dbPath = path.join(app.getPath('userData'), 'vocab-db.json');
    
    // 默认数据结构
    const defaultData = {
        config: {
            dailyNewWords: 20,
            dailyReviewLimit: 100
        },
        words: {}, // 存储单词学习状态，如 { "ability": { ef: 2.5, interval: 1, ... } }
        stats: {
            lastStudyDate: "", // 格式 YYYY-MM-DD
            newWordsToday: 0,
            learnedTotal: 0
        }
    };

    db = await JSONFilePreset(dbPath, defaultData);
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
    await initDB();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
}).catch((error) => {
    console.error('应用启动失败:', error);
    app.quit();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC 通信处理 ---

// 获取词库数据
ipcMain.handle('load-vocab', (event, level) => {
    try {
        const filePath = path.join(__dirname, 'data', `${level}.json`);
        const rawData = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(rawData);
    } catch (error) {
        console.error('加载词库失败:', error);
        return [];
    }
});

// 获取用户学习数据
ipcMain.handle('get-db-data', () => {
    return db.data;
});

// 更新并保存用户数据
ipcMain.handle('save-db-data', async (event, newData) => {
    db.data = newData;
    await db.write();
    return true;
});