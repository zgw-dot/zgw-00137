const Storage = (function() {
    const KEYS = {
        PROGRESS: 'warehouse_game_progress',
        SETTINGS: 'warehouse_game_settings',
        LAST_REPLAY: 'warehouse_game_last_replay',
        CUSTOM_LEVELS: 'warehouse_game_custom_levels',
        OPERATION_HISTORY: 'warehouse_game_operation_history',
        LAST_OPERATION: 'warehouse_game_last_operation',
        UNDO_SNAPSHOT: 'warehouse_game_undo_snapshot'
    };

    const BUILTIN_LEVEL_IDS = ['level-1', 'level-2'];

    const DEFAULT_SETTINGS = {
        gameSpeed: 1.0,
        soundEnabled: true,
        autoPause: true,
        showGrid: true
    };

    function registerBuiltinIds(ids) {
        ids.forEach(id => {
            if (!BUILTIN_LEVEL_IDS.includes(id)) {
                BUILTIN_LEVEL_IDS.push(id);
            }
        });
    }

    function isBuiltinLevelId(levelId) {
        return BUILTIN_LEVEL_IDS.includes(levelId);
    }

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

    function saveCustomLevel(level, sourceType, operationType) {
        try {
            const levels = loadCustomLevels();
            const now = Date.now();
            const existing = levels[level.id];
            levels[level.id] = {
                ...level,
                _meta: {
                    sourceType: sourceType || (existing?._meta?.sourceType) || 'import',
                    importTime: existing?._meta?.importTime || now,
                    lastModifiedTime: now,
                    lastOperation: operationType || 'import',
                    lastOperationTime: now
                }
            };
            localStorage.setItem(KEYS.CUSTOM_LEVELS, JSON.stringify(levels));
            saveLastOperation({
                type: operationType || 'import',
                levelId: level.id,
                levelName: level.name,
                timestamp: now,
                success: true
            });
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
            const deletedLevel = levels[levelId];
            if (!deletedLevel) return false;

            localStorage.setItem(KEYS.UNDO_SNAPSHOT, JSON.stringify({
                levelId: levelId,
                levelData: deletedLevel,
                deletedAt: Date.now()
            }));

            delete levels[levelId];
            localStorage.setItem(KEYS.CUSTOM_LEVELS, JSON.stringify(levels));

            saveLastOperation({
                type: 'delete',
                levelId: levelId,
                levelName: deletedLevel.name,
                timestamp: Date.now(),
                success: true,
                undoable: true
            });

            return true;
        } catch (e) {
            console.error('Failed to delete custom level:', e);
            return false;
        }
    }

    function undoDelete() {
        try {
            const snapshotData = localStorage.getItem(KEYS.UNDO_SNAPSHOT);
            if (!snapshotData) return { success: false, reason: 'no_undo_snapshot' };

            const snapshot = JSON.parse(snapshotData);
            if (!snapshot.levelData) return { success: false, reason: 'invalid_snapshot' };

            const levels = loadCustomLevels();
            if (levels[snapshot.levelId]) {
                return { success: false, reason: 'level_id_exists' };
            }

            levels[snapshot.levelId] = snapshot.levelData;
            localStorage.setItem(KEYS.CUSTOM_LEVELS, JSON.stringify(levels));
            localStorage.removeItem(KEYS.UNDO_SNAPSHOT);

            saveLastOperation({
                type: 'undo_delete',
                levelId: snapshot.levelId,
                levelName: snapshot.levelData.name,
                timestamp: Date.now(),
                success: true
            });

            return { success: true, levelId: snapshot.levelId, levelName: snapshot.levelData.name };
        } catch (e) {
            console.error('Failed to undo delete:', e);
            return { success: false, reason: 'error' };
        }
    }

    function getUndoSnapshot() {
        try {
            const data = localStorage.getItem(KEYS.UNDO_SNAPSHOT);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }

    function clearUndoSnapshot() {
        localStorage.removeItem(KEYS.UNDO_SNAPSHOT);
    }

    function saveLastOperation(operation) {
        try {
            localStorage.setItem(KEYS.LAST_OPERATION, JSON.stringify(operation));
        } catch (e) {
            console.error('Failed to save last operation:', e);
        }
    }

    function loadLastOperation() {
        try {
            const data = localStorage.getItem(KEYS.LAST_OPERATION);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
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
        undoDelete,
        getUndoSnapshot,
        clearUndoSnapshot,
        saveLastOperation,
        loadLastOperation,
        clearAll,
        getDefaultSettings,
        registerBuiltinIds,
        isBuiltinLevelId,
        BUILTIN_LEVEL_IDS
    };
})();
