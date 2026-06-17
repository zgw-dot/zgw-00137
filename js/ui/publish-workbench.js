const PublishWorkbench = (function() {
    'use strict';

    function formatTimestamp(ts) {
        if (!ts) return '-';
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    const PUBLISH_TYPES = {
        publish_new: { label: '新发布', icon: '🚀', class: 'success' },
        publish_overwrite: { label: '覆盖发布', icon: '🔄', class: 'warning' },
        publish_save_as_new: { label: '另存发布', icon: '📝', class: 'primary' },
        publish_rename: { label: '改名发布', icon: '✏️', class: 'info' },
        conflict_back_to_draft: { label: '退回草稿', icon: '↩️', class: 'secondary' },
        conflict_cancel: { label: '取消发布', icon: '❌', class: 'danger' },
        undo_publish: { label: '撤销发布', icon: '↩️', class: 'danger' }
    };

    const CONFLICT_TYPES = {
        id_conflict: 'ID 冲突',
        name_conflict: '名称冲突',
        both_conflict: 'ID 和名称都冲突',
        builtin_conflict: '内置关卡冲突',
        no_conflict: '无冲突'
    };

    class Workbench {
        constructor(uiController) {
            this.ui = uiController;
            this._currentConflict = null;
            this._pendingPublish = null;
            this._currentRecordId = null;
            this._conflictCheckResult = null;
        }

        checkAndPublish(draftId, levelConfig, sourceType) {
            const check = Storage.checkLevelConflict(levelConfig.id, levelConfig.name);
            this._conflictCheckResult = check;

            if (check.hasConflict) {
                this._currentConflict = {
                    type: check.conflictType,
                    levelConfig: JSON.parse(JSON.stringify(levelConfig)),
                    draftId: draftId,
                    existingLevel: check.existingLevel,
                    nameConflicts: check.conflictType === 'name_conflict' || check.conflictType === 'both_conflict'
                        ? [{ levelData: check.existingLevel, id: check.existingLevel?.id }]
                        : [],
                    conflictDetails: check.conflictDetails || [],
                    isBuiltin: check.isBuiltin || false,
                    startTime: Date.now()
                };

                if (this.ui && this.ui.showPublishConflict && typeof this.ui.showPublishConflict === 'function') {
                    try { this.ui.showPublishConflict(this._currentConflict); } catch (_) {}
                }
                this._tryRenderConflictModal();

                return {
                    success: false,
                    conflict: true,
                    conflictType: check.conflictType,
                    conflictDetails: check.conflictDetails || [],
                    existingLevel: check.existingLevel
                };
            }

            return this._executePublish(draftId, levelConfig, 'publish_new', {
                conflictType: 'no_conflict',
                decision: 'publish',
                reason: '无冲突，直接发布',
                conflictDetails: []
            });
        }

        _tryRenderConflictModal() {
            try {
                const modal = document.getElementById('publish-conflict-modal');
                if (!modal || !this._currentConflict) return;

                const data = this._currentConflict;
                const levelConfig = data.levelConfig;

                const builtinEl = document.getElementById('publish-conflict-builtin');
                const diffEl = document.getElementById('publish-conflict-diff');
                const renameEl = document.getElementById('publish-conflict-rename');
                const titleEl = modal.querySelector('h2');
                const btnOverwrite = document.getElementById('btn-publish-overwrite');

                if (builtinEl) builtinEl.classList.add('hidden');
                if (diffEl) diffEl.classList.add('hidden');
                if (renameEl) renameEl.classList.add('hidden');

                if (data.type === 'builtin_conflict') {
                    if (titleEl) titleEl.textContent = '⚠️ 内置关卡冲突';
                    if (builtinEl) builtinEl.classList.remove('hidden');
                    if (btnOverwrite) btnOverwrite.style.display = 'none';
                } else {
                    if (titleEl) titleEl.textContent = '⚠️ 发布冲突检测';
                    if (btnOverwrite) btnOverwrite.style.display = '';
                    if (diffEl) {
                        this._renderConflictDiffTo(data, diffEl);
                        diffEl.classList.remove('hidden');
                    }
                }

                const idInput = document.getElementById('publish-new-id');
                const nameInput = document.getElementById('publish-new-name');
                if (idInput) idInput.value = levelConfig.id + '-new';
                if (nameInput) nameInput.value = levelConfig.name + ' (新版)';

                modal.classList.add('active');
            } catch (e) {}
        }

        _renderConflictDiffTo(data, diffEl) {
            const diffBody = document.getElementById('publish-diff-body');
            if (!diffBody) return;
            diffBody.innerHTML = '';

            const levelConfig = data.levelConfig;
            let existingLevel = data.existingLevel;

            if (!existingLevel && data.nameConflicts && data.nameConflicts.length > 0) {
                existingLevel = data.nameConflicts[0].levelData;
            }

            if (!existingLevel) return;

            const existingData = { ...existingLevel };
            delete existingData._meta;

            const fields = [
                { key: 'id', label: '关卡 ID' },
                { key: 'name', label: '关卡名称' },
                { key: 'difficulty', label: '难度' },
                { key: 'timeLimit', label: '时间限制' },
                { key: 'workerCount', label: '拣货员数' },
                { key: 'cartCount', label: '推车数' },
                { key: 'targetScore', label: '目标分数' }
            ];

            fields.forEach(f => {
                const oldVal = existingData[f.key];
                const newVal = levelConfig[f.key];
                const changed = String(oldVal) !== String(newVal);
                const row = document.createElement('tr');
                row.innerHTML = `<td>${f.label}</td><td class="${changed ? 'changed' : ''}">${oldVal !== undefined ? oldVal : '-'}</td><td class="${changed ? 'changed' : ''}">${newVal !== undefined ? newVal : '-'}</td>`;
                diffBody.appendChild(row);
            });

            const oldCount = (existingData.orders || []).length;
            const newCount = (levelConfig.orders || []).length;
            const changed = oldCount !== newCount;
            const row = document.createElement('tr');
            row.innerHTML = `<td>订单数</td><td class="${changed ? 'changed' : ''}">${oldCount}</td><td class="${changed ? 'changed' : ''}">${newCount}</td>`;
            diffBody.appendChild(row);

            if (data.nameConflicts && data.nameConflicts.length > 1) {
                const conflictRow = document.createElement('tr');
                conflictRow.innerHTML = `<td colspan="3" style="color:#e53e3e;font-weight:bold;">⚠️ 有 ${data.nameConflicts.length} 个关卡使用了相同名称</td>`;
                diffBody.appendChild(conflictRow);
            }
        }

        handleOverwrite() {
            if (!this._currentConflict) return { success: false, reason: 'no_conflict' };

            const data = this._currentConflict;
            if (data.type === 'builtin_conflict') {
                return { success: false, reason: 'builtin_conflict', type: 'publish_overwrite' };
            }
            const config = JSON.parse(JSON.stringify(data.levelConfig));

            const result = this._executePublish(data.draftId, config, 'publish_overwrite', {
                conflictType: data.type,
                decision: 'overwrite',
                reason: '选择覆盖现有关卡',
                conflictDetails: data.conflictDetails || []
            });

            this._closeConflictPanel();

            if (this.ui && this.ui.refreshLevelList && typeof this.ui.refreshLevelList === 'function') {
                try { this.ui.refreshLevelList(); } catch (_) {}
            }
            if (this.ui && this.ui._afterPublish && typeof this.ui._afterPublish === 'function') {
                try { this.ui._afterPublish(); } catch (_) {}
            }

            return {
                ...result,
                type: 'publish_overwrite'
            };
        }

        handleSaveAsNew(newName, newId) {
            if (!this._currentConflict) return { success: false, reason: 'no_conflict' };

            const data = this._currentConflict;
            let finalName = newName;
            let finalId = newId;

            if (finalName === undefined && finalId === undefined) {
                const idInput = document.getElementById('publish-new-id');
                const nameInput = document.getElementById('publish-new-name');
                if (idInput) finalId = idInput.value.trim();
                if (nameInput) finalName = nameInput.value.trim();
            }

            if (!finalId) {
                if (this.ui && this.ui.showNotification) {
                    try { this.ui.showNotification('请输入新的关卡 ID', 'warning'); } catch (_) {}
                }
                return { success: false, reason: 'missing_id' };
            }
            if (!finalName) {
                if (this.ui && this.ui.showNotification) {
                    try { this.ui.showNotification('请输入新的关卡名称', 'warning'); } catch (_) {}
                }
                return { success: false, reason: 'missing_name' };
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(finalId)) {
                if (this.ui && this.ui.showNotification) {
                    try { this.ui.showNotification('关卡 ID 只能包含字母、数字、下划线和连字符', 'error'); } catch (_) {}
                }
                return { success: false, reason: 'invalid_id' };
            }
            if (Storage.isBuiltinLevelId(finalId)) {
                if (this.ui && this.ui.showNotification) {
                    try { this.ui.showNotification('该 ID 与内置关卡冲突，请换一个', 'error'); } catch (_) {}
                }
                return { success: false, reason: 'builtin_conflict' };
            }
            const existing = Storage.loadCustomLevels();
            if (existing[finalId]) {
                if (this.ui && this.ui.showNotification) {
                    try { this.ui.showNotification('该 ID 已被占用，请换一个', 'error'); } catch (_) {}
                }
                return { success: false, reason: 'id_exists' };
            }

            const config = JSON.parse(JSON.stringify(data.levelConfig));
            config.id = finalId;
            config.name = finalName;

            const result = this._executePublish(data.draftId, config, 'publish_save_as_new', {
                conflictType: data.type,
                decision: 'save_as_new',
                reason: `改名另存为新关卡 (原ID: ${data.levelConfig.id}, 原名称: ${data.levelConfig.name})`,
                originalId: data.levelConfig.id,
                originalName: data.levelConfig.name,
                newLevelId: finalId,
                newLevelName: finalName,
                conflictDetails: data.conflictDetails || []
            });

            this._closeConflictPanel();

            if (this.ui && this.ui.refreshLevelList && typeof this.ui.refreshLevelList === 'function') {
                try { this.ui.refreshLevelList(); } catch (_) {}
            }
            if (this.ui && this.ui._afterPublish && typeof this.ui._afterPublish === 'function') {
                try { this.ui._afterPublish(); } catch (_) {}
            }

            return {
                ...result,
                type: 'publish_save_as_new',
                newLevelId: finalId,
                newLevelName: finalName
            };
        }

        handleBackToDraft(reason) {
            if (!this._currentConflict) return { success: false, reason: 'no_conflict' };

            const data = this._currentConflict;
            const backReason = reason || '选择退回草稿继续修改';

            Storage.savePublishRecord({
                type: 'conflict_back_to_draft',
                levelId: data.levelConfig.id,
                levelName: data.levelConfig.name,
                draftId: data.draftId,
                sourceType: data.draftId ? 'draft' : 'unknown',
                conflictType: data.type,
                decision: 'back_to_draft',
                reason: backReason,
                result: '退回草稿，未发布',
                success: false,
                undone: false,
                undoable: false,
                conflictDetails: data.conflictDetails || []
            });

            this._closeConflictPanel();

            if (this.ui && this.ui.showNotification && typeof this.ui.showNotification === 'function') {
                try { this.ui.showNotification('已退回草稿，可继续修改后再发布', 'info'); } catch (_) {}
            }
            if (this.ui && this.ui.getDraftEditor && typeof this.ui.getDraftEditor === 'function') {
                try {
                    const de = this.ui.getDraftEditor();
                    if (de && de.close && typeof de.close === 'function') de.close();
                } catch (_) {}
            }

            return {
                success: false,
                type: 'conflict_back_to_draft',
                reason: backReason,
                levelId: data.levelConfig.id,
                levelName: data.levelConfig.name
            };
        }

        handleCancel() {
            if (!this._currentConflict) return { success: false, reason: 'no_conflict' };

            const data = this._currentConflict;

            Storage.savePublishRecord({
                type: 'conflict_cancel',
                levelId: data.levelConfig.id,
                levelName: data.levelConfig.name,
                draftId: data.draftId,
                sourceType: data.draftId ? 'draft' : 'unknown',
                conflictType: data.type,
                decision: 'cancel',
                reason: '用户取消发布',
                result: '发布已取消',
                success: false,
                undone: false,
                undoable: false,
                conflictDetails: data.conflictDetails || []
            });

            this._closeConflictPanel();

            return {
                success: false,
                type: 'conflict_cancel',
                levelId: data.levelConfig.id,
                levelName: data.levelConfig.name
            };
        }

        showRenameSection() {
            try {
                const renameDiv = document.getElementById('publish-conflict-rename');
                if (renameDiv) renameDiv.classList.remove('hidden');
                const btn = document.getElementById('btn-publish-save-as-new');
                if (btn) btn.textContent = '✅ 确认另存';
                if (this.ui && this.ui.showPublishRenameSection && typeof this.ui.showPublishRenameSection === 'function') {
                    try { this.ui.showPublishRenameSection(); } catch (_) {}
                }
            } catch (_) {}
        }

        _closeConflictPanel() {
            try {
                const modal = document.getElementById('publish-conflict-modal');
                if (modal) modal.classList.remove('active');
                const renameDiv = document.getElementById('publish-conflict-rename');
                if (renameDiv) renameDiv.classList.add('hidden');
                const btn = document.getElementById('btn-publish-save-as-new');
                if (btn) btn.textContent = '📝 改名另存';
                if (this.ui && this.ui.closePublishConflict && typeof this.ui.closePublishConflict === 'function') {
                    try { this.ui.closePublishConflict(); } catch (_) {}
                }
            } catch (_) {}
            this._currentConflict = null;
        }

        _executePublish(draftId, levelConfig, publishType, metadata) {
            const existing = Storage.loadCustomLevels()[levelConfig.id];
            const existingForUndo = existing ? JSON.parse(JSON.stringify(existing)) : null;

            const snapshot = {
                levelId: levelConfig.id,
                levelName: levelConfig.name,
                newLevelData: JSON.parse(JSON.stringify(levelConfig)),
                previousLevelData: existingForUndo,
                previousProgress: Storage.loadProgress(),
                publishedAt: Date.now(),
                publishType: publishType,
                draftId: draftId,
                metadata: metadata
            };
            Storage.savePublishUndoSnapshot(levelConfig, existingForUndo);
            Storage.saveExtendedPublishSnapshot(snapshot);

            const wasOverwrite = !!existingForUndo;
            Storage.saveCustomLevel(levelConfig, 'draft_publish', publishType);

            const recordResult = Storage.savePublishRecord({
                type: publishType,
                levelId: levelConfig.id,
                levelName: levelConfig.name,
                draftId: draftId,
                sourceType: draftId ? 'draft' : 'unknown',
                wasOverwrite: wasOverwrite,
                conflictType: metadata?.conflictType || 'no_conflict',
                decision: metadata?.decision || 'publish',
                reason: metadata?.reason || '直接发布',
                result: '发布成功',
                success: true,
                undoable: true,
                undone: false,
                previousLevelData: existingForUndo,
                newLevelData: JSON.parse(JSON.stringify(levelConfig)),
                originalId: metadata?.originalId || null,
                originalName: metadata?.originalName || null,
                newLevelId: metadata?.newLevelId || null,
                newLevelName: metadata?.newLevelName || null,
                conflictDetails: metadata?.conflictDetails || []
            });

            this._currentRecordId = recordResult.success ? recordResult.record.recordId : null;

            try { Storage.deleteDraft(draftId); } catch (_) {}

            if (this.ui && this.ui.refreshLevelList && typeof this.ui.refreshLevelList === 'function') {
                try { this.ui.refreshLevelList(); } catch (_) {}
            }
            if (this.ui && this.ui.updateLastOpHint && typeof this.ui.updateLastOpHint === 'function') {
                try { this.ui.updateLastOpHint(); } catch (_) {}
            }

            return {
                success: true,
                levelId: levelConfig.id,
                levelName: levelConfig.name,
                wasOverwrite: wasOverwrite,
                publishType: publishType,
                type: publishType,
                recordId: this._currentRecordId,
                conflict: false,
                conflictType: metadata?.conflictType || 'no_conflict'
            };
        }

        undoLastPublish() {
            const snapshot = Storage.getExtendedPublishSnapshot();
            if (!snapshot) {
                return { success: false, reason: 'no_undo_snapshot' };
            }

            const result = Storage.undoPublish();
            if (!result.success) {
                return result;
            }

            const lastPublish = Storage.getLastPublishInfo();
            let undoneRecordId = null;

            if (lastPublish?.recordId) {
                const markRes = Storage.markPublishUndone(lastPublish.recordId);
                if (markRes.success) undoneRecordId = lastPublish.recordId;
            }

            const undoRecordResult = Storage.savePublishRecord({
                type: 'undo_publish',
                levelId: snapshot.levelId,
                levelName: snapshot.levelName,
                draftId: snapshot.draftId || null,
                sourceType: snapshot.draftId ? 'draft' : 'unknown',
                wasOverwrite: !!snapshot.previousLevelData,
                conflictType: null,
                decision: 'undo',
                reason: '用户撤销发布',
                result: snapshot.previousLevelData ? '已恢复到之前版本' : '已移除新发布的关卡',
                success: true,
                undoable: false,
                undone: false,
                previousLevelData: snapshot.newLevelData,
                restoredLevelData: snapshot.previousLevelData,
                undoneRecordId: undoneRecordId,
                conflictDetails: []
            });

            Storage.clearExtendedPublishSnapshot();

            if (this.ui && this.ui.refreshLevelList && typeof this.ui.refreshLevelList === 'function') {
                try { this.ui.refreshLevelList(); } catch (_) {}
            }
            if (this.ui && this.ui.updateLastOpHint && typeof this.ui.updateLastOpHint === 'function') {
                try { this.ui.updateLastOpHint(); } catch (_) {}
            }

            return {
                success: true,
                levelId: result.levelId,
                levelName: result.levelName,
                wasOverwrite: result.wasOverwrite,
                type: 'undo_publish',
                undoneRecordId: undoneRecordId,
                recordId: undoRecordResult.success ? undoRecordResult.record.recordId : null
            };
        }

        renderPublishHistory(container) {
            const history = Storage.loadPublishHistory();

            if (!container) return;

            if (history.length === 0) {
                container.innerHTML = '<div class="history-empty">暂无发布记录 — 发布关卡后会在这里显示</div>';
                return;
            }

            container.innerHTML = history.map(record => {
                const typeInfo = PUBLISH_TYPES[record.type] || { label: record.type, icon: '📋', class: 'secondary' };
                const statusClass = record.success ? 'success' : 'failed';
                const undoneBadge = record.undone ? '<span class="record-badge undone">已撤销</span>' : '';
                const undoableBadge = record.undoable && !record.undone ? '<span class="record-badge undoable">可撤销</span>' : '';

                let conflictInfo = '';
                if (record.conflictType && record.conflictType !== 'no_conflict') {
                    const conflictLabel = CONFLICT_TYPES[record.conflictType] || record.conflictType;
                    conflictInfo = `<div class="record-conflict">⚠️ 冲突类型: ${conflictLabel}</div>`;
                }

                let decisionInfo = '';
                if (record.decision) {
                    decisionInfo = `<div class="record-decision">📌 处理方式: ${record.reason || record.decision}</div>`;
                }

                return `
                    <div class="publish-record record-${statusClass}${record.undone ? ' record-undone' : ''}" data-record-id="${record.recordId}">
                        <div class="record-header">
                            <div class="record-type-icon ${typeInfo.class}">${typeInfo.icon}</div>
                            <div class="record-main-info">
                                <div class="record-title">
                                    <span class="record-level-name">${record.levelName || '未命名'}</span>
                                    <span class="record-type-label">${typeInfo.label}</span>
                                    ${undoneBadge}
                                    ${undoableBadge}
                                </div>
                                <div class="record-meta">
                                    <span>🆔 ${record.levelId || '-'}</span>
                                    <span>🕐 ${formatTimestamp(record.timestamp)}</span>
                                </div>
                            </div>
                            <div class="record-result-badge ${record.success ? 'badge-success' : 'badge-failed'}">
                                ${record.success ? '成功' : '失败'}
                            </div>
                        </div>
                        ${conflictInfo}
                        ${decisionInfo}
                        ${record.result ? `<div class="record-result">📄 结果: ${record.result}</div>` : ''}
                    </div>
                `;
            }).join('');
        }

        openPublishHistoryModal() {
            const container = document.getElementById('publish-history-list');
            if (container) {
                this.renderPublishHistory(container);
            }
            this._updatePublishStats();
            const modal = document.getElementById('publish-history-modal');
            if (modal) {
                modal.classList.add('active');
            }
        }

        _updatePublishStats() {
            const history = Storage.loadPublishHistory();
            const totalEl = document.getElementById('publish-stat-total');
            const successEl = document.getElementById('publish-stat-success');
            const undoneEl = document.getElementById('publish-stat-undone');

            if (!totalEl || !successEl || !undoneEl) return;

            let successCount = 0;
            let undoneCount = 0;

            for (const record of history) {
                if (record.success && !record.undone) {
                    successCount++;
                }
                if (record.undone) {
                    undoneCount++;
                }
            }

            totalEl.textContent = history.length;
            successEl.textContent = successCount;
            undoneEl.textContent = undoneCount;
        }

        closePublishHistoryModal() {
            const modal = document.getElementById('publish-history-modal');
            if (modal) {
                modal.classList.remove('active');
            }
        }

        bindEvents() {
            const self = this;

            const btnPublishHistory = document.getElementById('btn-publish-history');
            if (btnPublishHistory) {
                btnPublishHistory.addEventListener('click', () => {
                    self.openPublishHistoryModal();
                });
            }

            const btnCloseHistory = document.getElementById('btn-close-publish-history');
            if (btnCloseHistory) {
                btnCloseHistory.addEventListener('click', () => {
                    self.closePublishHistoryModal();
                });
            }
        }
    }

    return {
        Workbench,
        PUBLISH_TYPES,
        CONFLICT_TYPES,
        formatTimestamp
    };
})();
