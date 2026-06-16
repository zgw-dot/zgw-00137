const Storage = (function() {
    const KEYS = {
        PROGRESS: 'warehouse_game_progress',
        SETTINGS: 'warehouse_game_settings',
        LAST_REPLAY: 'warehouse_game_last_replay',
        CUSTOM_LEVELS: 'warehouse_game_custom_levels',
        OPERATION_HISTORY: 'warehouse_game_operation_history',
        LAST_OPERATION: 'warehouse_game_last_operation',
        UNDO_SNAPSHOT: 'warehouse_game_undo_snapshot',
        BATCH_RESTORE_SNAPSHOT: 'warehouse_game_batch_restore_snapshot',
        LAST_BATCH_RESTORE: 'warehouse_game_last_batch_restore'
    };

    const BACKUP_FORMAT_VERSION = 1;

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

    function createFullBackup() {
        try {
            const customLevels = loadCustomLevels();
            const progress = loadProgress();
            const operationHistory = loadAllOperationHistory();

            const levels = [];
            for (const levelId in customLevels) {
                const levelEntry = customLevels[levelId];
                const levelData = { ...levelEntry };
                delete levelData._meta;

                levels.push({
                    id: levelId,
                    levelData: levelData,
                    highScore: progress.highScores[levelId] || 0,
                    completed: progress.completedLevels.includes(levelId),
                    _meta: levelEntry._meta || null,
                    operations: operationHistory[levelId] || null
                });
            }

            const backup = {
                version: BACKUP_FORMAT_VERSION,
                exportedAt: Date.now(),
                levelCount: levels.length,
                levels: levels
            };

            return {
                success: true,
                data: backup,
                json: JSON.stringify(backup, null, 2),
                levelCount: levels.length
            };
        } catch (e) {
            console.error('Failed to create full backup:', e);
            return { success: false, error: e.message };
        }
    }

    function validateAndParseBackup(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            if (!data || typeof data !== 'object') {
                return { success: false, error: '备份数据格式错误' };
            }

            if (data.version !== BACKUP_FORMAT_VERSION) {
                return { success: false, error: `不支持的备份版本: ${data.version}` };
            }

            if (!Array.isArray(data.levels)) {
                return { success: false, error: '备份数据中缺少关卡列表' };
            }

            return { success: true, data: data };
        } catch (e) {
            return { success: false, error: 'JSON 解析失败: ' + e.message };
        }
    }

    function precheckBackup(backupData) {
        const result = {
            newLevels: [],
            conflictLevels: [],
            builtinConflict: [],
            badEntries: [],
            totalCount: 0,
            validCount: 0
        };

        if (!backupData || !Array.isArray(backupData.levels)) {
            return result;
        }

        result.totalCount = backupData.levels.length;
        const existingLevels = loadCustomLevels();

        for (let i = 0; i < backupData.levels.length; i++) {
            const entry = backupData.levels[i];

            if (!entry || !entry.id || !entry.levelData || typeof entry.levelData !== 'object') {
                result.badEntries.push({
                    index: i,
                    id: entry?.id || `#${i}`,
                    reason: '关卡数据格式无效',
                    rawData: entry
                });
                continue;
            }

            if (isBuiltinLevelId(entry.id)) {
                result.validCount++;
                result.builtinConflict.push({
                    index: i,
                    id: entry.id,
                    name: entry.levelData?.name || entry.id,
                    reason: '与内置关卡ID冲突'
                });
                continue;
            }

            let validationErrors = null;
            try {
                if (typeof GameModels !== 'undefined' && GameModels.Level && GameModels.Level.fromJSON) {
                    const level = GameModels.Level.fromJSON(entry.levelData);
                    validationErrors = level.validate();
                }
            } catch (e) {
                validationErrors = ['关卡数据结构错误: ' + e.message];
            }

            if (validationErrors && validationErrors.length > 0) {
                result.badEntries.push({
                    index: i,
                    id: entry.id,
                    name: entry.levelData?.name || entry.id,
                    reason: '关卡验证失败: ' + validationErrors.join('; '),
                    rawData: entry
                });
                continue;
            }

            result.validCount++;

            const levelEntry = {
                id: entry.id,
                name: entry.levelData?.name || entry.id,
                highScore: entry.highScore || 0,
                completed: entry.completed || false,
                _meta: entry._meta || null,
                levelData: entry.levelData,
                operations: entry.operations || null,
                index: i
            };

            if (existingLevels[entry.id]) {
                levelEntry.existingName = existingLevels[entry.id]?.name || entry.id;
                result.conflictLevels.push(levelEntry);
            } else {
                result.newLevels.push(levelEntry);
            }
        }

        return result;
    }

    function executeBatchRestore(backupData, decisions) {
        try {
            const snapshot = {
                beforeLevels: loadCustomLevels(),
                beforeProgress: loadProgress(),
                beforeOperations: loadAllOperationHistory(),
                restoreTime: Date.now(),
                decisions: decisions
            };

            const currentLevels = loadCustomLevels();
            const progress = loadProgress();
            const allOperations = loadAllOperationHistory();

            const results = {
                imported: [],
                skipped: [],
                failed: [],
                overwrite: [],
                saveAsNew: []
            };

            if (!backupData || !Array.isArray(backupData.levels)) {
                return { success: false, error: '备份数据无效', results };
            }

            for (let i = 0; i < backupData.levels.length; i++) {
                const entry = backupData.levels[i];
                const decision = decisions?.[i] || { action: 'skip' };

                if (!entry || !entry.id || !entry.levelData) {
                    results.failed.push({
                        id: entry?.id || `#${i}`,
                        reason: '无效的关卡数据'
                    });
                    continue;
                }

                if (isBuiltinLevelId(entry.id) && decision.action !== 'save_as_new') {
                    results.failed.push({
                        id: entry.id,
                        name: entry.levelData?.name,
                        reason: '与内置关卡ID冲突，无法导入'
                    });
                    continue;
                }

                let semanticErrors = null;
                try {
                    if (typeof GameModels !== 'undefined' && GameModels.Level && GameModels.Level.fromJSON) {
                        const level = GameModels.Level.fromJSON(entry.levelData);
                        semanticErrors = level.validate();
                    }
                } catch (e) {
                    semanticErrors = ['关卡数据结构错误: ' + e.message];
                }

                if (semanticErrors && semanticErrors.length > 0) {
                    results.skipped.push({
                        id: entry.id,
                        name: entry.levelData?.name || entry.id,
                        reason: '校验失败: ' + semanticErrors.join('; ')
                    });
                    continue;
                }

                switch (decision.action) {
                    case 'skip':
                        results.skipped.push({
                            id: entry.id,
                            name: entry.levelData?.name
                        });
                        break;

                    case 'overwrite':
                        try {
                            const overwriteLevelData = { ...entry.levelData, id: entry.id };
                            saveCustomLevel(overwriteLevelData,
                                entry._meta?.sourceType || 'import',
                                'batch_restore_overwrite');

                            if (entry.highScore && entry.highScore > 0) {
                                if (!progress.highScores[entry.id] || entry.highScore > progress.highScores[entry.id]) {
                                    progress.highScores[entry.id] = entry.highScore;
                                }
                            }
                            if (entry.completed && !progress.completedLevels.includes(entry.id)) {
                                progress.completedLevels.push(entry.id);
                            }

                            if (entry.operations) {
                                allOperations[entry.id] = entry.operations;
                            }

                            results.overwrite.push({
                                id: entry.id,
                                name: entry.levelData?.name
                            });
                            results.imported.push({
                                id: entry.id,
                                name: entry.levelData?.name,
                                action: 'overwrite'
                            });
                        } catch (e) {
                            results.failed.push({
                                id: entry.id,
                                name: entry.levelData?.name,
                                reason: e.message
                            });
                        }
                        break;

                    case 'save_as_new': {
                        let newId = entry.id + '-copy';
                        let counter = 1;
                        while (currentLevels[newId] || isBuiltinLevelId(newId)) {
                            newId = entry.id + '-copy-' + counter;
                            counter++;
                        }

                        try {
                            const newLevelData = { ...entry.levelData, id: newId };
                            if (entry.levelData?.name) {
                                newLevelData.name = entry.levelData.name + ' (副本)';
                            }

                            saveCustomLevel(newLevelData,
                                entry._meta?.sourceType || 'import',
                                'batch_restore_save_as_new');

                            if (entry.highScore && entry.highScore > 0) {
                                progress.highScores[newId] = entry.highScore;
                            }
                            if (entry.completed) {
                                progress.completedLevels.push(newId);
                            }

                            if (entry.operations) {
                                allOperations[newId] = entry.operations;
                            }

                            results.saveAsNew.push({
                                id: newId,
                                originalId: entry.id,
                                name: newLevelData.name
                            });
                            results.imported.push({
                                id: newId,
                                name: newLevelData.name,
                                action: 'save_as_new',
                                originalId: entry.id
                            });
                        } catch (e) {
                            results.failed.push({
                                id: entry.id,
                                name: entry.levelData?.name,
                                reason: e.message
                            });
                        }
                        break;
                    }

                    case 'import':
                    default:
                        try {
                            const importLevelData = { ...entry.levelData, id: entry.id };
                            saveCustomLevel(importLevelData,
                                entry._meta?.sourceType || 'import',
                                'batch_restore_import');

                            if (entry.highScore && entry.highScore > 0) {
                                progress.highScores[entry.id] = entry.highScore;
                            }
                            if (entry.completed) {
                                if (!progress.completedLevels.includes(entry.id)) {
                                    progress.completedLevels.push(entry.id);
                                }
                            }

                            if (entry.operations) {
                                allOperations[entry.id] = entry.operations;
                            }

                            results.imported.push({
                                id: entry.id,
                                name: entry.levelData?.name,
                                action: 'import'
                            });
                        } catch (e) {
                            results.failed.push({
                                id: entry.id,
                                name: entry.levelData?.name,
                                reason: e.message
                            });
                        }
                        break;
                }
            }

            saveProgress(progress);
            localStorage.setItem(KEYS.OPERATION_HISTORY, JSON.stringify(allOperations));

            localStorage.setItem(KEYS.BATCH_RESTORE_SNAPSHOT, JSON.stringify(snapshot));

            const batchRestoreInfo = {
                timestamp: Date.now(),
                total: backupData.levels.length,
                imported: results.imported.length,
                skipped: results.skipped.length,
                failed: results.failed.length,
                overwrite: results.overwrite.length,
                saveAsNew: results.saveAsNew.length,
                results: results
            };
            localStorage.setItem(KEYS.LAST_BATCH_RESTORE, JSON.stringify(batchRestoreInfo));

            saveLastOperation({
                type: 'batch_restore',
                levelCount: results.imported.length,
                timestamp: Date.now(),
                success: true
            });

            return {
                success: true,
                importedCount: results.imported.length,
                skippedCount: results.skipped.length,
                failedCount: results.failed.length,
                results: results,
                undoable: true
            };
        } catch (e) {
            console.error('Batch restore failed:', e);
            return {
                success: false,
                error: e.message,
                results: { imported: [], skipped: [], failed: [], overwrite: [], saveAsNew: [] }
            };
        }
    }

    function undoBatchRestore() {
        try {
            const snapshotData = localStorage.getItem(KEYS.BATCH_RESTORE_SNAPSHOT);
            if (!snapshotData) {
                return { success: false, reason: 'no_undo_snapshot' };
            }

            const snapshot = JSON.parse(snapshotData);
            if (!snapshot.beforeLevels) {
                return { success: false, reason: 'invalid_snapshot' };
            }

            localStorage.setItem(KEYS.CUSTOM_LEVELS, JSON.stringify(snapshot.beforeLevels));
            saveProgress(snapshot.beforeProgress);
            localStorage.setItem(KEYS.OPERATION_HISTORY, JSON.stringify(snapshot.beforeOperations || {}));

            localStorage.removeItem(KEYS.BATCH_RESTORE_SNAPSHOT);

            saveLastOperation({
                type: 'undo_batch_restore',
                timestamp: Date.now(),
                success: true
            });

            return { success: true };
        } catch (e) {
            console.error('Failed to undo batch restore:', e);
            return { success: false, reason: 'error', error: e.message };
        }
    }

    function getBatchRestoreUndoSnapshot() {
        try {
            const data = localStorage.getItem(KEYS.BATCH_RESTORE_SNAPSHOT);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }

    function clearBatchRestoreUndoSnapshot() {
        localStorage.removeItem(KEYS.BATCH_RESTORE_SNAPSHOT);
    }

    function getLastBatchRestoreInfo() {
        try {
            const data = localStorage.getItem(KEYS.LAST_BATCH_RESTORE);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }

    function clearLastBatchRestoreInfo() {
        localStorage.removeItem(KEYS.LAST_BATCH_RESTORE);
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
        BUILTIN_LEVEL_IDS,
        createFullBackup,
        validateAndParseBackup,
        precheckBackup,
        executeBatchRestore,
        undoBatchRestore,
        getBatchRestoreUndoSnapshot,
        clearBatchRestoreUndoSnapshot,
        getLastBatchRestoreInfo,
        clearLastBatchRestoreInfo
    };
})();
