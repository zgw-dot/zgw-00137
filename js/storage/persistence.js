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
        LAST_BATCH_RESTORE: 'warehouse_game_last_batch_restore',
        BATCH_RESTORE_HISTORY: 'warehouse_game_batch_restore_history'
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
                saveAsNew: [],
                new: [],
                builtinConflict: [],
                badEntries: []
            };

            const detailedResults = {
                new: [],
                overwrite: [],
                saveAsNew: [],
                skipped: [],
                builtinConflict: [],
                badEntries: [],
                failed: []
            };

            if (!backupData || !Array.isArray(backupData.levels)) {
                return { success: false, error: '备份数据无效', results };
            }

            for (let i = 0; i < backupData.levels.length; i++) {
                const entry = backupData.levels[i];
                const decision = decisions?.[i] || { action: 'skip' };

                if (!entry || !entry.id || !entry.levelData || typeof entry.levelData !== 'object') {
                    const badItem = {
                        index: i,
                        id: entry?.id || `#${i}`,
                        name: entry?.levelData?.name || `条目#${i}`,
                        reason: '无效的关卡数据（缺少id或levelData）',
                        decision: decision.action,
                        conflictType: 'bad_entry'
                    };
                    results.badEntries.push(badItem);
                    results.failed.push({
                        id: badItem.id,
                        name: badItem.name,
                        reason: badItem.reason
                    });
                    detailedResults.badEntries.push(badItem);
                    detailedResults.failed.push(badItem);
                    continue;
                }

                if (isBuiltinLevelId(entry.id) && decision.action !== 'save_as_new') {
                    const builtinItem = {
                        index: i,
                        id: entry.id,
                        name: entry.levelData?.name || entry.id,
                        reason: '与内置关卡ID冲突，无法导入（选择"另存为副本"可绕过）',
                        decision: decision.action,
                        conflictType: 'builtin_conflict'
                    };
                    results.builtinConflict.push(builtinItem);
                    results.failed.push({
                        id: entry.id,
                        name: entry.levelData?.name,
                        reason: builtinItem.reason
                    });
                    detailedResults.builtinConflict.push(builtinItem);
                    detailedResults.failed.push(builtinItem);
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
                    const skipItem = {
                        index: i,
                        id: entry.id,
                        name: entry.levelData?.name || entry.id,
                        reason: '校验失败: ' + semanticErrors.join('; '),
                        decision: decision.action,
                        conflictType: 'validation_error'
                    };
                    results.skipped.push({
                        id: entry.id,
                        name: entry.levelData?.name || entry.id,
                        reason: skipItem.reason
                    });
                    detailedResults.skipped.push(skipItem);
                    continue;
                }

                switch (decision.action) {
                    case 'skip': {
                        const skipItem = {
                            index: i,
                            id: entry.id,
                            name: entry.levelData?.name || entry.id,
                            reason: isBuiltinLevelId(entry.id)
                                ? '与内置关卡ID冲突，用户选择跳过'
                                : (currentLevels[entry.id]
                                    ? '同ID关卡已存在，用户选择跳过'
                                    : '用户选择跳过'),
                            decision: 'skip',
                            conflictType: isBuiltinLevelId(entry.id) ? 'builtin_conflict' :
                                (currentLevels[entry.id] ? 'id_conflict' : 'user_skip')
                        };
                        results.skipped.push({
                            id: entry.id,
                            name: entry.levelData?.name,
                            reason: skipItem.reason
                        });
                        detailedResults.skipped.push(skipItem);
                        break;
                    }

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

                            const overwriteItem = {
                                index: i,
                                id: entry.id,
                                name: entry.levelData?.name || entry.id,
                                originalName: currentLevels[entry.id]?.name,
                                highScore: entry.highScore || 0,
                                completed: entry.completed || false,
                                reason: '同ID关卡已存在，用户选择覆盖',
                                decision: 'overwrite',
                                conflictType: 'id_conflict'
                            };
                            results.overwrite.push(overwriteItem);
                            results.imported.push({
                                id: entry.id,
                                name: entry.levelData?.name,
                                action: 'overwrite'
                            });
                            detailedResults.overwrite.push(overwriteItem);
                        } catch (e) {
                            const failItem = {
                                index: i,
                                id: entry.id,
                                name: entry.levelData?.name || entry.id,
                                reason: '覆盖时出错: ' + e.message,
                                decision: 'overwrite',
                                conflictType: 'id_conflict'
                            };
                            results.failed.push({
                                id: entry.id,
                                name: entry.levelData?.name,
                                reason: failItem.reason
                            });
                            detailedResults.failed.push(failItem);
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

                            const hasIdConflict = !isBuiltinLevelId(entry.id) && currentLevels[entry.id];
                            const saveAsItem = {
                                index: i,
                                id: newId,
                                originalId: entry.id,
                                name: newLevelData.name,
                                originalName: hasIdConflict
                                    ? currentLevels[entry.id].name
                                    : entry.levelData?.name,
                                highScore: entry.highScore || 0,
                                completed: entry.completed || false,
                                reason: isBuiltinLevelId(entry.id)
                                    ? '与内置关卡ID冲突，用户选择另存为副本'
                                    : (hasIdConflict
                                        ? '同ID关卡已存在，用户选择另存为副本'
                                        : '用户选择另存为副本'),
                                decision: 'save_as_new',
                                conflictType: isBuiltinLevelId(entry.id) ? 'builtin_conflict' :
                                    (hasIdConflict ? 'id_conflict' : 'no_conflict')
                            };
                            results.saveAsNew.push(saveAsItem);
                            results.imported.push({
                                id: newId,
                                name: newLevelData.name,
                                action: 'save_as_new',
                                originalId: entry.id
                            });
                            detailedResults.saveAsNew.push(saveAsItem);
                        } catch (e) {
                            const failItem = {
                                index: i,
                                id: entry.id,
                                name: entry.levelData?.name || entry.id,
                                reason: '另存为副本时出错: ' + e.message,
                                decision: 'save_as_new',
                                conflictType: 'id_conflict'
                            };
                            results.failed.push({
                                id: entry.id,
                                name: entry.levelData?.name,
                                reason: failItem.reason
                            });
                            detailedResults.failed.push(failItem);
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

                            const newItem = {
                                index: i,
                                id: entry.id,
                                name: entry.levelData?.name || entry.id,
                                highScore: entry.highScore || 0,
                                completed: entry.completed || false,
                                reason: '全新关卡，新增导入',
                                decision: 'import',
                                conflictType: 'no_conflict'
                            };
                            results.new.push(newItem);
                            results.imported.push({
                                id: entry.id,
                                name: entry.levelData?.name,
                                action: 'import'
                            });
                            detailedResults.new.push(newItem);
                        } catch (e) {
                            const failItem = {
                                index: i,
                                id: entry.id,
                                name: entry.levelData?.name || entry.id,
                                reason: '新增导入时出错: ' + e.message,
                                decision: 'import',
                                conflictType: 'no_conflict'
                            };
                            results.failed.push({
                                id: entry.id,
                                name: entry.levelData?.name,
                                reason: failItem.reason
                            });
                            detailedResults.failed.push(failItem);
                        }
                        break;
                }
            }

            saveProgress(progress);
            localStorage.setItem(KEYS.OPERATION_HISTORY, JSON.stringify(allOperations));

            localStorage.setItem(KEYS.BATCH_RESTORE_SNAPSHOT, JSON.stringify(snapshot));

            const counts = {
                total: backupData.levels.length,
                new: detailedResults.new.length,
                overwrite: detailedResults.overwrite.length,
                saveAsNew: detailedResults.saveAsNew.length,
                imported: results.imported.length,
                skipped: detailedResults.skipped.length,
                builtinConflict: detailedResults.builtinConflict.length,
                badEntries: detailedResults.badEntries.length,
                failed: detailedResults.failed.length
            };

            const batchRestoreInfo = {
                recordId: 'restore-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                timestamp: Date.now(),
                undoable: true,
                undone: false,
                decisions: decisions || {},
                counts: counts,
                summary: {
                    total: counts.total,
                    imported: counts.imported,
                    skipped: counts.skipped + counts.builtinConflict + counts.badEntries,
                    failed: counts.failed
                },
                detailed: detailedResults,
                results: results
            };
            localStorage.setItem(KEYS.LAST_BATCH_RESTORE, JSON.stringify(batchRestoreInfo));

            const history = loadBatchRestoreHistory();
            history.unshift(batchRestoreInfo);
            if (history.length > 10) history.length = 10;
            localStorage.setItem(KEYS.BATCH_RESTORE_HISTORY, JSON.stringify(history));

            saveLastOperation({
                type: 'batch_restore',
                levelCount: results.imported.length,
                timestamp: Date.now(),
                success: true
            });

            return {
                success: true,
                recordId: batchRestoreInfo.recordId,
                importedCount: results.imported.length,
                skippedCount: counts.skipped + counts.builtinConflict + counts.badEntries,
                failedCount: counts.failed,
                counts: counts,
                results: results,
                detailed: detailedResults,
                undoable: true
            };
        } catch (e) {
            console.error('Batch restore failed:', e);
            return {
                success: false,
                error: e.message,
                results: { imported: [], skipped: [], failed: [], overwrite: [], saveAsNew: [], new: [], builtinConflict: [], badEntries: [] },
                detailed: { new: [], overwrite: [], saveAsNew: [], skipped: [], builtinConflict: [], badEntries: [], failed: [] }
            };
        }
    }

    function loadBatchRestoreHistory() {
        try {
            const data = localStorage.getItem(KEYS.BATCH_RESTORE_HISTORY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    function getBatchRestoreRecord(recordId) {
        const history = loadBatchRestoreHistory();
        return history.find(r => r.recordId === recordId) || null;
    }

    function exportBatchRestoreRecordAsJson(recordId) {
        const record = recordId ? getBatchRestoreRecord(recordId) : getLastBatchRestoreInfo();
        if (!record) {
            return { success: false, error: '找不到恢复记录' };
        }

        const exportData = {
            exportType: 'batch_restore_report',
            exportedAt: Date.now(),
            record: {
                recordId: record.recordId,
                restoreTime: record.timestamp,
                undoable: record.undoable,
                undone: record.undone,
                decisions: record.decisions || {}
            },
            counts: record.counts || record.summary || {
                total: record.total,
                imported: record.imported,
                skipped: record.skipped,
                failed: record.failed,
                overwrite: record.overwrite,
                saveAsNew: record.saveAsNew
            },
            categories: {
                new: (record.detailed?.new || []).map(i => ({
                    id: i.id,
                    name: i.name,
                    reason: i.reason,
                    decision: i.decision,
                    conflictType: i.conflictType,
                    highScore: i.highScore,
                    completed: i.completed
                })),
                overwrite: (record.detailed?.overwrite || []).map(i => ({
                    id: i.id,
                    name: i.name,
                    originalName: i.originalName,
                    reason: i.reason,
                    decision: i.decision,
                    conflictType: i.conflictType,
                    highScore: i.highScore,
                    completed: i.completed
                })),
                saveAsNew: (record.detailed?.saveAsNew || []).map(i => ({
                    id: i.id,
                    originalId: i.originalId,
                    name: i.name,
                    originalName: i.originalName,
                    reason: i.reason,
                    decision: i.decision,
                    conflictType: i.conflictType,
                    highScore: i.highScore,
                    completed: i.completed
                })),
                skipped: (record.detailed?.skipped || []).map(i => ({
                    id: i.id,
                    name: i.name,
                    reason: i.reason,
                    decision: i.decision,
                    conflictType: i.conflictType
                })),
                builtinConflict: (record.detailed?.builtinConflict || []).map(i => ({
                    id: i.id,
                    name: i.name,
                    reason: i.reason,
                    decision: i.decision,
                    conflictType: i.conflictType
                })),
                badEntries: (record.detailed?.badEntries || []).map(i => ({
                    id: i.id,
                    name: i.name,
                    reason: i.reason,
                    decision: i.decision,
                    conflictType: i.conflictType
                })),
                failed: (record.detailed?.failed || []).map(i => ({
                    id: i.id,
                    name: i.name,
                    reason: i.reason,
                    decision: i.decision,
                    conflictType: i.conflictType
                }))
            }
        };

        return {
            success: true,
            json: JSON.stringify(exportData, null, 2),
            data: exportData
        };
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

            const lastRestore = getLastBatchRestoreInfo();
            if (lastRestore && lastRestore.recordId) {
                lastRestore.undoable = false;
                lastRestore.undone = true;
                lastRestore.undoneAt = Date.now();

                if (lastRestore.counts) {
                    lastRestore.counts._originalCounts = JSON.parse(JSON.stringify(lastRestore.counts));
                    lastRestore.counts.new = 0;
                    lastRestore.counts.overwrite = 0;
                    lastRestore.counts.saveAsNew = 0;
                    lastRestore.counts.imported = 0;
                }
                if (lastRestore.summary) {
                    lastRestore.summary._originalSummary = JSON.parse(JSON.stringify(lastRestore.summary));
                    lastRestore.summary.imported = 0;
                }
                if (lastRestore.detailed) {
                    lastRestore.detailed._originalDetailed = JSON.parse(JSON.stringify(lastRestore.detailed));
                    lastRestore.detailed.new = [];
                    lastRestore.detailed.overwrite = [];
                    lastRestore.detailed.saveAsNew = [];
                }
                if (lastRestore.results) {
                    lastRestore.results._originalResults = JSON.parse(JSON.stringify(lastRestore.results));
                    lastRestore.results.new = [];
                    lastRestore.results.overwrite = [];
                    lastRestore.results.saveAsNew = [];
                    lastRestore.results.imported = [];
                }

                localStorage.setItem(KEYS.LAST_BATCH_RESTORE, JSON.stringify(lastRestore));

                const history = loadBatchRestoreHistory();
                const idx = history.findIndex(r => r.recordId === lastRestore.recordId);
                if (idx !== -1) {
                    history[idx] = lastRestore;
                    localStorage.setItem(KEYS.BATCH_RESTORE_HISTORY, JSON.stringify(history));
                }
            }

            saveLastOperation({
                type: 'undo_batch_restore',
                timestamp: Date.now(),
                success: true
            });

            return { success: true, recordId: lastRestore?.recordId };
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
        clearLastBatchRestoreInfo,
        loadBatchRestoreHistory,
        getBatchRestoreRecord,
        exportBatchRestoreRecordAsJson
    };
})();
