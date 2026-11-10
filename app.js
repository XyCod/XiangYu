// DOM 元素
const els = {
    wordText: document.getElementById('word-text'),
    wordContent: document.getElementById('word-content'),
    translations: document.getElementById('translations-list'),
    phrases: document.getElementById('phrases-list'),
    prompt: document.getElementById('prompt'),
    actionButtons: document.getElementById('action-buttons'),
    speakBtn: document.getElementById('btn-speak'),
    card: document.getElementById('word-card'),
    levelSelect: document.getElementById('level-select'),
    todayProgress: document.getElementById('today-progress'),
    totalLearned: document.getElementById('total-learned'),
    settingsModal: document.getElementById('settings-modal'),
    inputDaily: document.getElementById('input-daily')
};

// 全局状态
let dbData = null;
let currentVocabulary = [];
let currentWord = null;
let isFlipped = false;
let studyQueue = [];

// 工具函数：获取今天的日期字符串 YYYY-MM-DD
const getTodayStr = () => new Date().toISOString().split('T')[0];

// 初始化
async function init() {
    dbData = await window.api.getDbData();
    checkNewDay();
    updateStatsUI();
    els.inputDaily.value = dbData.config.dailyNewWords;
    
    await loadVocabulary(els.levelSelect.value);
    buildStudyQueue();
    showNextWord();
}

// 检查是否是新的一天，如果是则重置今日进度
function checkNewDay() {
    const today = getTodayStr();
    if (dbData.stats.lastStudyDate !== today) {
        dbData.stats.lastStudyDate = today;
        dbData.stats.newWordsToday = 0;
        window.api.saveDbData(dbData);
    }
}

// 加载词库
async function loadVocabulary(level) {
    const rawVocab = await window.api.loadVocab(level);
    if (!rawVocab || rawVocab.length === 0) {
        alert(`未找到 data/${level}.json 文件，请确保已放入词库文件。`);
        return;
    }
    // 格式化数据，拼接翻译
    currentVocabulary = rawVocab.map(item => {
        let transText = item.translations.map(t => `${t.type ? t.type + '. ' : ''}${t.translation}`).join('；');
        return {
            word: item.word,
            translation: transText,
            phrases: item.phrases || []
        };
    });
}

// 生成今日学习队列 (SM-2 到期复习 + 新词)
function buildStudyQueue() {
    studyQueue = [];
    const today = getTodayStr();
    const { dailyNewWords } = dbData.config;
    
    // 1. 挑选需要复习的单词
    const reviewWords = [];
    // 2. 挑选新词
    const newWords = [];

    for (let vocab of currentVocabulary) {
        const record = dbData.words[vocab.word];
        if (record) {
            // 已学过的词，检查是否到期
            if (record.nextReview <= today) {
                reviewWords.push({ ...vocab, record });
            }
        } else {
            // 没学过的词
            if (newWords.length < (dailyNewWords - dbData.stats.newWordsToday)) {
                newWords.push(vocab);
            }
        }
    }

    // 队列 = 复习词 + 新词
    studyQueue = [...reviewWords, ...newWords];
    
    // 打乱队列 (可选)
    studyQueue.sort(() => Math.random() - 0.5);
}

// 展示下一个单词
function showNextWord() {
    if (studyQueue.length === 0) {
        els.wordText.innerText = "今日任务已完成！🎉";
        els.wordContent.classList.add('hidden');
        els.prompt.classList.add('hidden');
        els.actionButtons.classList.add('hidden');
        return;
    }

    currentWord = studyQueue[0];
    isFlipped = false;
    
    els.wordText.innerText = currentWord.word;
    els.translations.innerText = currentWord.translation;
    
    // 渲染词组
    if (currentWord.phrases && currentWord.phrases.length > 0) {
        els.phrases.innerHTML = '<h4>常用词组:</h4>' + currentWord.phrases.slice(0, 3).map(p => `<p><strong>${p.phrase}</strong>: ${p.translation}</p>`).join('');
    } else {
        els.phrases.innerHTML = '';
    }

    els.wordContent.classList.add('hidden');
    els.prompt.classList.remove('hidden');
    els.actionButtons.classList.add('hidden');
}

// 翻转卡片
function flipCard() {
    if (isFlipped || !currentWord) return;
    isFlipped = true;
    els.wordContent.classList.remove('hidden');
    els.prompt.classList.add('hidden');
    els.actionButtons.classList.remove('hidden');
}

// TTS 发音
function speakWord() {
    if (!currentWord) return;
    const utterance = new SpeechSynthesisUtterance(currentWord.word);
    utterance.lang = 'en-US';
    utterance.rate = 0.9; // 稍慢一点
    window.speechSynthesis.speak(utterance);
}

// SM-2 算法计算
function calculateSM2(quality, ef, interval, repetitions) {
    let nextEf = ef;
    let nextInterval = interval;
    let nextRepetitions = repetitions;

    // 如果质量 >= 3，表示记住了
    if (quality >= 3) {
        if (nextRepetitions === 0) nextInterval = 1;
        else if (nextRepetitions === 1) nextInterval = 6;
        else nextInterval = Math.round(nextInterval * nextEf);
        nextRepetitions++;
    } else {
        // 忘记了，重置
        nextRepetitions = 0;
        nextInterval = 1;
    }

    // 更新 EF (最低1.3)
    nextEf = nextEf + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (nextEf < 1.3) nextEf = 1.3;

    return { nextEf, nextInterval, nextRepetitions };
}

// 处理评分
async function handleRate(quality) {
    if (!currentWord || !isFlipped) return;

    const wordStr = currentWord.word;
    let record = dbData.words[wordStr];

    if (!record) {
        // 新词第一次学
        record = { ef: 2.5, interval: 0, repetitions: 0 };
        dbData.stats.newWordsToday++;
        dbData.stats.learnedTotal++;
    }

    // 计算 SM-2
    const { nextEf, nextInterval, nextRepetitions } = calculateSM2(quality, record.ef, record.interval, record.repetitions);
    
    // 计算下一次复习日期
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + nextInterval);
    
    dbData.words[wordStr] = {
        ef: nextEf,
        interval: nextInterval,
        repetitions: nextRepetitions,
        nextReview: nextDate.toISOString().split('T')[0]
    };

    // 保存数据库
    await window.api.saveDbData(dbData);
    updateStatsUI();

    // 出队，展示下一个
    studyQueue.shift();
    showNextWord();
}

// 更新顶部统计 UI
function updateStatsUI() {
    const today = getTodayStr();
    if (dbData.stats.lastStudyDate === today) {
        els.todayProgress.innerText = `${dbData.stats.newWordsToday} / ${dbData.config.dailyNewWords}`;
    } else {
        els.todayProgress.innerText = `0 / ${dbData.config.dailyNewWords}`;
    }
    els.totalLearned.innerText = dbData.stats.learnedTotal;
}

// --- 事件绑定 ---
els.card.addEventListener('click', (e) => {
    // 点击喇叭时不翻转
    if (e.target.id === 'btn-speak') return;
    flipCard();
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (!isFlipped) flipCard();
    } else if (isFlipped) {
        if (e.key === '1') handleRate(1);
        if (e.key === '2') handleRate(3);
        if (e.key === '3') handleRate(5);
    }
});

els.speakBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    speakWord();
});

els.actionButtons.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') {
        const q = parseInt(e.target.dataset.q);
        handleRate(q);
    }
});

els.levelSelect.addEventListener('change', async (e) => {
    await loadVocabulary(e.target.value);
    buildStudyQueue();
    showNextWord();
});

els.levelSelect.addEventListener('click', (e) => e.stopPropagation());

// 设置弹窗逻辑
document.getElementById('btn-settings').addEventListener('click', () => {
    els.settingsModal.classList.remove('hidden');
});

document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const val = parseInt(els.inputDaily.value);
    if (val >= 5 && val <= 100) {
        dbData.config.dailyNewWords = val;
        await window.api.saveDbData(dbData);
        els.settingsModal.classList.add('hidden');
        updateStatsUI();
        buildStudyQueue();
        showNextWord();
    } else {
        alert("请输入 5 到 100 之间的数字");
    }
});

// 启动
init();