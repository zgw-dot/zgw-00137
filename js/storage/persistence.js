const Storage = (function() {
    const KEYS = {
        PROGRESS: 'warehouse_game_progress',
        SETTINGS: 'warehouse_game_settings',
        LAST_REPLAY: 'warehouse_game_last_replay',
        CUSTOM_LEVELS: 'warehouse_game_custom_levels',
        OPERATION_HISTORY: 'warehouse_game_operation_history'
    };

    const DEFAULT_SETTINGS = {
        gameSpeed: 1.0,
        soundEnabled: true,
        autoPause: true,
        showGrid: true
    };

    function saveProgress(progress) {
        try {
            localStorage.setItem(KEYS.PROGRESS, JSON.stringify(progress));
            return true;
        } catch (e) {
            console.error('Failed to save progress:', e);
            return false;
        }
    }

    function loadProgress() {
        try {
            const data = localStorage.getItem(KEYS.PROGRESS);
            return data ? JSON.parse(data) : {
                completedLevels: [],
                highScores: {},
                currentLevel: null
            };
        } catch (e) {
            console.error('Failed to load progress:', e);
            return {
                completedLevels: [],
                highScores: {},
                currentLevel: null
            };
        }
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.error('Failed to save settings:', e);
            return false;
        }
    }

    function loadSettings() {
        try {
            const data = localStorage.getItem(KEYS.SETTINGS);
            return data ? JSON.parse(data) : { ...DEFAULT_SETTINGS };
        } catch (e) {
            console.error('Failed to load settings:', e);
            return { ...DEFAULT_SETTINGS };
        }
    }

    function saveLastReplay(replayData) {
        try {
            localStorage.setItem(KEYS.LAST_REPLAY, JSON.stringify(replayData));
            return true;
        } catch (e) {
            console.error('Failed to save replay:', e);
            return false;
        }
    }

    function loadLastReplay() {
        try {
            const data = localStorage.getItem(KEYS.LAST_REPLAY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Failed to load replay:', e);
            return null;
        }
    }

    function saveOperationHistory(levelId, operations) {
        try {
            const allHistory = loadAllOperationHistory();
            allHistory[levelId] = {
                operations,
                timestamp: Date.now()
            };
            localStorage.setItem(KEYS.OPERATION_HISTORY, JSON.stringify(allHistory));
            return true;
        } catch (e) {
            console.error('Failed to save operation history:', e);
            return false;
        }
    }

    function loadOperationHistory(levelId) {
        try {
            const allHistory = loadAllOperationHistory();
            return allHistory[levelId] || null;
        } catch (e) {
            console.error('Failed to load operation history:', e);
            return null;
        }
    }

    function loadAllOperationHistory() {
        try {
            const data = localStorage.getItem(KEYS.OPERATION_HISTORY);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error('Failed to load all operation history:', e);
            return {};
        }
    }

    function saveCustomLevel(level) {
        try {
            const levels = loadCustomLevels();
            levels[level.id] = level;
            localStorage.setItem(KEYS.CUSTOM_LEVELS, JSON.stringify(levels));
            return true;
        } catch (e) {
            console.error('Failed to save custom level:', e);
            return false;
        }
    }

    function loadCustomLevels() {
        try {
            const data = localStorage.getItem(KEYS.CUSTOM_LEVELS);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            console.error('Failed to load custom levels:', e);
            return {};
        }
    }

    function deleteCustomLevel(levelId) {
        try {
            const levels = loadCustomLevels();
            delete levels[levelId];
            localStorage.setItem(KEYS.CUSTOM_LEVELS, JSON.stringify(levels));
            return true;
        } catch (e) {
            console.error('Failed to delete custom level:', e);
            return false;
        }
    }

    function clearAll() {
        Object.values(KEYS).forEach(key => localStorage.removeItem(key));
    }

    function getDefaultSettings() {
        return { ...DEFAULT_SETTINGS };
    }

    return {
        saveProgress,
        loadProgress,
        saveSettings,
        loadSettings,
        saveLastReplay,
        loadLastReplay,
        saveOperationHistory,
        loadOperationHistory,
        loadAllOperationHistory,
        saveCustomLevel,
        loadCustomLevels,
        deleteCustomLevel,
        clearAll,
        getDefaultSettings
    };
})();
