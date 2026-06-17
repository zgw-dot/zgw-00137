const UIController = (function() {
    function formatTimestamp(ts) {
        if (!ts) return '-';
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    class Controller {
        constructor(game, infoPanel, renderer, replayPlayer) {
            this.game = game;
            this.infoPanel = infoPanel;
            this.renderer = renderer;
            this.replayPlayer = replayPlayer;
            this.currentLevelId = null;
            this.availableLevels = [];
            this.isPaused = false;
            this.animationFrameId = null;
            this.replaySpeed = 1;
            this._pendingImportLevel = null;
            this._pendingDeleteLevelId = null;
            this._builtinLevelIds = [];
            this._pendingRestoreData = null;
            this._restoreDecisions = {};
            this._precheckResult = null;
            this._currentDetailRecordId = null;
            this._currentDetailTab = 'new';
            this.draftEditor = null;
            this._pendingPublishConfig = null;
            this.publishWorkbench = null;
        }

        init() {
            this._loadLevels();
            this._bindEvents();
            this._renderMainMenu();
            this._renderDraftList();
            this._restoreLastOperation();
            this._restoreUndoBar();
            this._restoreBatchUndoBar();
            this._restorePublishUndoBar();
            this._renderLastRestoreCard();

            this.draftEditor = new DraftEditor.Editor(this);
            this.draftEditor.bindEvents();

            this.publishWorkbench = new PublishWorkbench.Workbench(this);
            this.publishWorkbench.bindEvents();

            const settings = Storage.loadSettings();
            this.infoPanel.updateSettingsUI();
            this.infoPanel.applySettings(this.game, this.renderer);
        }

        _loadLevels() {
            const builtinLevels = [LEVEL_1, LEVEL_2];
            this._builtinLevelIds = builtinLevels.map(l => l.id);
            Storage.registerBuiltinIds(this._builtinLevelIds);

            this.availableLevels = [...builtinLevels];

            const customLevels = Storage.loadCustomLevels();
            for (const levelId in customLevels) {
                const entry = customLevels[levelId];
                const levelData = { ...entry };
                delete levelData._meta;
                this.availableLevels.push(levelData);
            }

            this.availableLevels.sort((a, b) => a.difficulty - b.difficulty);
        }

        _isBuiltinLevel(levelId) {
            return this._builtinLevelIds.includes(levelId);
        }

        _isCustomLevel(levelId) {
            const customLevels = Storage.loadCustomLevels();
            return !!customLevels[levelId];
        }

        _bindEvents() {
            document.getElementById('btn-settings').addEventListener('click', () => this._openSettings());
            document.getElementById('btn-close-settings').addEventListener('click', () => this._closeSettings());
            document.getElementById('btn-save-settings').addEventListener('click', () => this._saveSettings());

            document.getElementById('setting-speed').addEventListener('input', (e) => {
                document.getElementById('speed-value').textContent = `${parseFloat(e.target.value).toFixed(1)}x`;
            });

            document.getElementById('btn-import').addEventListener('click', () => this._openImport());
            document.getElementById('btn-cancel-import').addEventListener('click', () => this._closeImport());
            document.getElementById('btn-do-import').addEventListener('click', () => this._doImport());

            document.getElementById('btn-import-overwrite').addEventListener('click', () => this._importOverwrite());
            document.getElementById('btn-import-save-as-new').addEventListener('click', () => this._importSaveAsNew());
            document.getElementById('btn-import-cancel-conflict').addEventListener('click', () => this._closeImportConflict());

            document.getElementById('btn-export').addEventListener('click', () => this._openExport());
            document.getElementById('btn-close-export').addEventListener('click', () => this._closeExport());
            document.getElementById('btn-copy-export').addEventListener('click', () => this._copyExport());
            document.getElementById('export-level-select').addEventListener('change', (e) => this._updateExportText(e.target.value));

            document.getElementById('btn-confirm-delete').addEventListener('click', () => this._confirmDeleteLevel());
            document.getElementById('btn-cancel-delete').addEventListener('click', () => this._closeDeleteConfirm());

            document.getElementById('btn-undo-delete').addEventListener('click', () => this._undoDelete());
            document.getElementById('btn-undo-batch-restore').addEventListener('click', () => this._undoBatchRestore());

            document.getElementById('btn-backup-all').addEventListener('click', () => this._openBackupAll());
            document.getElementById('btn-close-backup').addEventListener('click', () => this._closeBackupAll());
            document.getElementById('btn-copy-backup').addEventListener('click', () => this._copyBackup());
            document.getElementById('btn-download-backup').addEventListener('click', () => this._downloadBackup());

            document.getElementById('btn-restore-all').addEventListener('click', () => this._openRestoreAll());
            document.getElementById('btn-cancel-restore').addEventListener('click', () => this._closeRestoreAll());
            document.getElementById('btn-do-restore-precheck').addEventListener('click', () => this._doRestorePrecheck());
            document.getElementById('btn-confirm-restore').addEventListener('click', () => this._confirmRestore());
            document.getElementById('btn-close-restore-result').addEventListener('click', () => this._closeRestoreResult());
            document.getElementById('btn-export-restore-result').addEventListener('click', () => this._exportCurrentRestoreResult());

            document.getElementById('btn-batch-overwrite').addEventListener('click', () => this._batchSetDecision('overwrite'));
            document.getElementById('btn-batch-skip').addEventListener('click', () => this._batchSetDecision('skip'));
            document.getElementById('btn-batch-saveas').addEventListener('click', () => this._batchSetDecision('save_as_new'));

            document.getElementById('btn-view-restore-history').addEventListener('click', () => this._openRestoreHistory());
            document.getElementById('btn-close-restore-history').addEventListener('click', () => this._closeRestoreHistory());
            document.getElementById('btn-open-last-restore-detail').addEventListener('click', () => this._openLastRestoreDetail());

            document.getElementById('btn-close-restore-detail').addEventListener('click', () => this._closeRestoreDetail());
            document.getElementById('btn-export-restore-detail').addEventListener('click', () => this._exportDetailRecord());

            document.querySelectorAll('.detail-tab').forEach(tab => {
                tab.addEventListener('click', (e) => {
                    const tabName = e.currentTarget.dataset.tab;
                    this._switchDetailTab(tabName);
                });
            });

            document.getElementById('btn-replay').addEventListener('click', () => this._openReplay());

            document.getElementById('btn-pause').addEventListener('click', () => this._togglePause());
            document.getElementById('btn-reset').addEventListener('click', () => this._resetLevel());
            document.getElementById('btn-quit').addEventListener('click', () => this._quitToMenu());

            document.getElementById('btn-dispatch').addEventListener('click', () => this._dispatchWorker());

            document.getElementById('btn-next-level').addEventListener('click', () => this._nextLevel());
            document.getElementById('btn-retry').addEventListener('click', () => this._retryLevel());
            document.getElementById('btn-back-menu').addEventListener('click', () => this._quitToMenu());

            document.getElementById('btn-replay-play').addEventListener('click', () => this._playReplay());
            document.getElementById('btn-replay-pause').addEventListener('click', () => this._pauseReplay());
            document.getElementById('btn-replay-speed').addEventListener('click', () => this._toggleReplaySpeed());
            document.getElementById('btn-replay-exit').addEventListener('click', () => this._exitReplay());

            document.getElementById('btn-drafts').addEventListener('click', () => {
                const el = document.getElementById('drafts-section');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            document.getElementById('btn-new-draft').addEventListener('click', () => this.draftEditor.openNew());
            document.getElementById('btn-new-draft-inline').addEventListener('click', () => this.draftEditor.openNew());
            document.getElementById('btn-load-from-template').addEventListener('click', () => this._openTemplateSelect());
            document.getElementById('btn-cancel-template').addEventListener('click', () => this._closeTemplateSelect());
            document.getElementById('btn-undo-publish').addEventListener('click', () => this._undoPublish());
            document.getElementById('btn-publish-overwrite').addEventListener('click', () => this._publishOverwrite());
            document.getElementById('btn-publish-save-as-new').addEventListener('click', () => this._publishShowRename());
            document.getElementById('btn-publish-back-draft').addEventListener('click', () => this._publishBackToDraft());
            document.getElementById('btn-cancel-publish-conflict').addEventListener('click', () => this._publishCancel());

            document.querySelectorAll('.modal').forEach(modal => {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) {
                        modal.classList.remove('active');
                    }
                });
            });
        }

        _renderMainMenu() {
            const levelList = document.getElementById('level-list');
            levelList.innerHTML = '';

            const progress = Storage.loadProgress();

            for (const level of this.availableLevels) {
                const card = document.createElement('div');
                card.className = 'level-card';

                const isBuiltin = this._isBuiltinLevel(level.id);
                const isCustom = this._isCustomLevel(level.id);

                const isCompleted = progress.completedLevels.includes(level.id);
                const isLocked = !isBuiltin && level.difficulty > 1 && !progress.completedLevels.some(id => {
                    const prevLevel = this.availableLevels.find(l => l.id === id);
                    return prevLevel && prevLevel.difficulty === level.difficulty - 1;
                });

                if (isCompleted) card.classList.add('completed');
                if (isLocked) card.classList.add('locked');

                const highScore = progress.highScores[level.id] || 0;
                const stars = highScore > 0 ? ScoringSystem.getStarRating(highScore, level.targetScore, 1) : 0;
                const starDisplay = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);

                const badgeHtml = isBuiltin
                    ? '<span class="level-badge builtin">内置</span>'
                    : isCustom
                    ? '<span class="level-badge custom">自定义</span>'
                    : '';

                let metaHtml = '';
                if (isCustom) {
                    const customLevels = Storage.loadCustomLevels();
                    const meta = customLevels[level.id]?._meta;
                    if (meta) {
                        metaHtml = '<div class="level-meta">';
                        if (meta.importTime) {
                            metaHtml += `<span>📥 导入: ${formatTimestamp(meta.importTime)}</span>`;
                        }
                        if (meta.lastOperation) {
                            const opLabels = {
                                import: '导入',
                                overwrite: '覆盖',
                                save_as_new: '另存为新关卡',
                                undo_delete: '撤销删除'
                            };
                            metaHtml += `<span>📋 ${opLabels[meta.lastOperation] || meta.lastOperation}</span>`;
                        }
                        metaHtml += '</div>';
                    }
                }

                let deleteHtml = '';
                if (isCustom && !isLocked) {
                    deleteHtml = '<div class="card-actions"><button class="btn-delete-level" data-level-id="' + level.id + '">🗑️ 删除</button></div>';
                }

                card.innerHTML = `
                    <div class="level-card-header">
                        <h3>${level.name} ${isLocked ? '🔒' : ''} ${badgeHtml}</h3>
                    </div>
                    <div class="level-desc">${level.description}</div>
                    <div class="level-stats">
                        <span>难度: ${level.difficulty}</span>
                        <span>⏱ ${ScoringSystem.formatTime(level.timeLimit)}</span>
                        <span>📦 ${level.orders ? level.orders.length : 0} 订单</span>
                        ${highScore > 0 ? `<span class="high-score">🏆 ${ScoringSystem.formatScore(highScore)}</span>` : ''}
                    </div>
                    <div style="margin-top: 10px; font-size: 18px;">${starDisplay}</div>
                    ${metaHtml}
                    ${deleteHtml}
                `;

                if (!isLocked) {
                    card.addEventListener('click', (e) => {
                        if (e.target.closest('.btn-delete-level')) return;
                        this._startLevel(level.id);
                    });
                } else {
                    card.title = '完成前一关后解锁';
                }

                const deleteBtn = card.querySelector('.btn-delete-level');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this._openDeleteConfirm(level.id);
                    });
                }

                levelList.appendChild(card);
            }
        }

        _openDeleteConfirm(levelId) {
            const level = this.availableLevels.find(l => l.id === levelId);
            if (!level) return;
            this._pendingDeleteLevelId = levelId;
            document.getElementById('delete-level-name').textContent = level.name;
            document.getElementById('delete-confirm-modal').classList.add('active');
        }

        _closeDeleteConfirm() {
            document.getElementById('delete-confirm-modal').classList.remove('active');
            this._pendingDeleteLevelId = null;
        }

        _confirmDeleteLevel() {
            if (!this._pendingDeleteLevelId) return;

            const result = Storage.deleteCustomLevel(this._pendingDeleteLevelId);
            if (result) {
                this._closeDeleteConfirm();
                this._loadLevels();
                this._renderMainMenu();
                this._restoreUndoBar();
                this._restoreBatchUndoBar();
                this._restoreLastOperation();
                this.infoPanel.showNotification('自定义关卡已删除', 'warning');
            } else {
                this.infoPanel.showNotification('删除失败', 'error');
            }
        }

        _undoDelete() {
            const result = Storage.undoDelete();
            if (result.success) {
                this._loadLevels();
                this._renderMainMenu();
                this._restoreUndoBar();
                this._restoreBatchUndoBar();
                this._restoreLastOperation();
                this.infoPanel.showNotification(`已恢复关卡 "${result.levelName}"`, 'success');
            } else {
                const reasons = {
                    no_undo_snapshot: '没有可撤销的删除',
                    level_id_exists: '关卡ID已存在，无法恢复',
                    invalid_snapshot: '撤销数据无效',
                    error: '撤销失败'
                };
                this.infoPanel.showNotification(reasons[result.reason] || '撤销失败', 'error');
            }
        }

        _restoreLastOperation() {
            const bar = document.getElementById('last-operation-bar');
            const op = Storage.loadLastOperation();
            if (!op) {
                bar.classList.add('hidden');
                return;
            }

            const opLabels = {
                import: '📥 导入',
                overwrite: '🔄 覆盖',
                save_as_new: '📝 另存为新关卡',
                delete: '🗑️ 删除',
                undo_delete: '↩️ 撤销删除',
                publish: '🚀 发布',
                publish_overwrite: '🔄 覆盖发布',
                publish_save_as_new: '📝 发布为新关卡',
                undo_publish: '↩️ 撤销发布',
                batch_restore: '📥 批量恢复',
                undo_batch_restore: '↩️ 撤销批量恢复'
            };
            const icon = opLabels[op.type] || '📋';
            const statusLabel = op.success ? '成功' : '失败';

            bar.innerHTML = `
                <span class="op-icon">${icon}</span>
                <span class="op-text">上次操作: ${op.levelName || ''} - ${op.type === 'delete' ? '已删除' : statusLabel}</span>
                <span class="op-time">${formatTimestamp(op.timestamp)}</span>
            `;
            bar.classList.remove('hidden');
        }

        _restoreUndoBar() {
            const undoBar = document.getElementById('undo-bar');
            const snapshot = Storage.getUndoSnapshot();
            if (!snapshot) {
                undoBar.classList.add('hidden');
                return;
            }

            const name = snapshot.levelData?.name || snapshot.levelId;
            document.getElementById('undo-bar-text').textContent =
                `已删除关卡 "${name}"，可撤销恢复`;
            undoBar.classList.remove('hidden');
        }

        _startLevel(levelId) {
            const levelConfig = this.availableLevels.find(l => l.id === levelId);
            if (!levelConfig) {
                this.infoPanel.showNotification('找不到该关卡', 'error');
                return;
            }

            try {
                this.game.initLevel(levelConfig);
                this.currentLevelId = levelId;
                this.isPaused = false;

                this.game.on('tick', () => this._updateUI());
                this.game.on('workerDispatched', (data) => {
                    this.infoPanel.showNotification(`${data.worker.name} 出发处理订单 ${data.order.id}`, 'info');
                });
                this.game.on('orderCompleted', (data) => {
                    this.infoPanel.showNotification(`订单 ${data.order.id} 完成！+${data.score}分`, 'success');
                });
                this.game.on('orderTimeout', (data) => {
                    this.infoPanel.showNotification(`订单 ${data.order.id} 超时！`, 'error');
                });
                this.game.on('gameEnded', (result) => this._handleGameEnd(result));

                this._showScreen('game-screen');
                this._updateUI();
                this.game.start();
                this._gameLoop();

                const progress = Storage.loadProgress();
                progress.currentLevel = levelId;
                Storage.saveProgress(progress);

            } catch (e) {
                this.infoPanel.showNotification('关卡加载失败: ' + e.message, 'error');
                console.error(e);
            }
        }

        _gameLoop() {
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }

            const loop = () => {
                if (!this.isPaused) {
                    this.game.update();
                }
                this.animationFrameId = requestAnimationFrame(loop);
            };

            this.animationFrameId = requestAnimationFrame(loop);
        }

        _updateUI() {
            const state = this.game.getGameState();

            const maxCombo = Math.max(...state.workers.map(w => w.consecutiveOrders), 0);

            this.infoPanel.updateLevelInfo(state.level, state.currentTime, state.totalScore, maxCombo);
            this.infoPanel.updateResourceStatus(state.workers, state.carts);
            this.infoPanel.updateOrdersList(state.level.orders, state.currentTime);
            this.infoPanel.updateOccupiedRoutes(this.game.getOccupiedRoutes());
            this.infoPanel.updateWorkerSelect(state.workers);
            this.infoPanel.updateOrderSelect(state.level.orders, state.currentTime);

            this.renderer.render(state);
        }

        _togglePause() {
            if (this.isPaused) {
                this.game.resume();
                this.isPaused = false;
            } else {
                this.game.pause();
                this.isPaused = true;
            }
            this.infoPanel.updatePauseButton(this.isPaused);
        }

        _resetLevel() {
            if (confirm('确定要重置当前关卡吗？所有进度将丢失。')) {
                this.game.reset();
                this.isPaused = false;
                this.infoPanel.updatePauseButton(false);
                this.game.start();
                this._updateUI();
            }
        }

        _quitToMenu() {
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }

            this.game = new GameEngine.Engine();
            this._showScreen('main-menu');
            this._loadLevels();
            this._renderMainMenu();
            this._renderDraftList();
            this._restoreLastOperation();
            this._restoreUndoBar();
            this._restoreBatchUndoBar();
            this._restorePublishUndoBar();
            this._renderLastRestoreCard();
        }

        _dispatchWorker() {
            const workerSelect = document.getElementById('worker-select');
            const orderSelect = document.getElementById('order-select');
            const useCart = document.getElementById('use-cart').checked;

            const workerId = workerSelect.value;
            const orderId = orderSelect.value;

            if (!workerId || !orderId) {
                this.infoPanel.showNotification('请选择拣货员和订单', 'warning');
                return;
            }

            const result = this.game.dispatchWorker(workerId, orderId, useCart);

            if (!result.success) {
                this.infoPanel.showErrors(result.errors);
            }
        }

        _handleGameEnd(result) {
            this.isPaused = true;

            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }

            const state = this.game.getGameState();
            this.infoPanel.updateResult(result, state.level);

            if (result.won) {
                const progress = Storage.loadProgress();
                if (!progress.completedLevels.includes(state.level.id)) {
                    progress.completedLevels.push(state.level.id);
                }
                if (!progress.highScores[state.level.id] || result.totalScore > progress.highScores[state.level.id]) {
                    progress.highScores[state.level.id] = result.totalScore;
                }
                Storage.saveProgress(progress);
            }

            const progress = Storage.loadProgress();
            progress.currentLevel = null;
            Storage.saveProgress(progress);

            this._showScreen('result-screen');
        }

        _nextLevel() {
            const currentLevel = this.availableLevels.find(l => l.id === this.currentLevelId);
            const nextLevel = this.availableLevels.find(l => l.difficulty === currentLevel.difficulty + 1);

            if (nextLevel) {
                this._startLevel(nextLevel.id);
            } else {
                this.infoPanel.showNotification('恭喜！你已完成所有关卡！', 'success');
                this._quitToMenu();
            }
        }

        _retryLevel() {
            if (this.currentLevelId) {
                this._startLevel(this.currentLevelId);
            }
        }

        _openSettings() {
            this.infoPanel.updateSettingsUI();
            document.getElementById('settings-modal').classList.add('active');
        }

        _closeSettings() {
            document.getElementById('settings-modal').classList.remove('active');
        }

        _saveSettings() {
            const settings = this.infoPanel.getSettingsFromUI();
            this.infoPanel.saveSettings(settings);
            this.infoPanel.applySettings(this.game, this.renderer);
            this._closeSettings();
            this.infoPanel.showNotification('设置已保存', 'success');
        }

        _openImport() {
            document.getElementById('import-textarea').value = '';
            document.getElementById('import-modal').classList.add('active');
        }

        _closeImport() {
            document.getElementById('import-modal').classList.remove('active');
        }

        _doImport() {
            const textarea = document.getElementById('import-textarea');
            let levelData;
            try {
                levelData = JSON.parse(textarea.value);
            } catch (e) {
                this.infoPanel.showNotification('JSON 格式错误: ' + e.message, 'error');
                return;
            }

            let level;
            try {
                level = GameModels.Level.fromJSON(levelData);
            } catch (e) {
                this.infoPanel.showNotification('关卡数据结构错误: ' + e.message, 'error');
                return;
            }

            const errors = level.validate();
            if (errors.length > 0) {
                this.infoPanel.showNotification('关卡验证失败: ' + errors.join('; '), 'error');
                return;
            }

            if (Storage.isBuiltinLevelId(level.id)) {
                this._showBuiltinConflict(level);
                return;
            }

            const customLevels = Storage.loadCustomLevels();
            if (customLevels[level.id]) {
                this._showImportConflict(level, customLevels[level.id]);
                return;
            }

            this._finalizeImport(level, 'import');
        }

        _showBuiltinConflict(level) {
            document.getElementById('import-conflict-builtin').classList.remove('hidden');
            document.getElementById('import-conflict-diff').classList.add('hidden');
            document.getElementById('import-conflict-actions').classList.add('hidden');
            document.getElementById('import-conflict-modal').classList.add('active');
        }

        _showImportConflict(newLevel, existingData) {
            document.getElementById('import-conflict-builtin').classList.add('hidden');
            document.getElementById('import-conflict-diff').classList.remove('hidden');
            document.getElementById('import-conflict-actions').classList.remove('hidden');

            this._pendingImportLevel = newLevel;

            const diffBody = document.getElementById('import-diff-body');
            diffBody.innerHTML = '';

            const fields = [
                { key: 'name', label: '名称' },
                { key: 'difficulty', label: '难度' },
                { key: 'timeLimit', label: '时间限制' },
                { key: 'workerCount', label: '拣货员数' },
                { key: 'cartCount', label: '推车数' },
                { key: 'targetScore', label: '目标分数' }
            ];

            const existingLevelData = { ...existingData };
            delete existingLevelData._meta;
            const existingLevel = GameModels.Level.fromJSON(existingLevelData);

            const newJson = newLevel.toJSON();
            const existingJson = existingLevel.toJSON();

            fields.forEach(f => {
                const oldVal = existingJson[f.key];
                const newVal = newJson[f.key];
                const changed = String(oldVal) !== String(newVal);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${f.label}</td>
                    <td class="${changed ? 'changed' : ''}">${oldVal}</td>
                    <td class="${changed ? 'changed' : ''}">${newVal}</td>
                `;
                diffBody.appendChild(row);
            });

            const oldOrderCount = existingLevel.orders ? existingLevel.orders.length : 0;
            const newOrderCount = newLevel.orders ? newLevel.orders.length : 0;
            const orderChanged = oldOrderCount !== newOrderCount;
            const orderRow = document.createElement('tr');
            orderRow.innerHTML = `
                <td>订单数</td>
                <td class="${orderChanged ? 'changed' : ''}">${oldOrderCount}</td>
                <td class="${orderChanged ? 'changed' : ''}">${newOrderCount}</td>
            `;
            diffBody.appendChild(orderRow);

            document.getElementById('import-conflict-modal').classList.add('active');
        }

        _closeImportConflict() {
            document.getElementById('import-conflict-modal').classList.remove('active');
            this._pendingImportLevel = null;
        }

        _importOverwrite() {
            if (!this._pendingImportLevel) return;
            const level = this._pendingImportLevel;
            this._closeImportConflict();
            this._closeImport();
            this._finalizeImport(level, 'overwrite');
        }

        _importSaveAsNew() {
            if (!this._pendingImportLevel) return;
            const level = this._pendingImportLevel;
            let newId = level.id + '-copy';
            let counter = 1;
            const customLevels = Storage.loadCustomLevels();
            while (customLevels[newId] || Storage.isBuiltinLevelId(newId)) {
                newId = level.id + '-copy-' + counter;
                counter++;
            }
            level.id = newId;
            level.name = level.name + ' (副本)';
            this._closeImportConflict();
            this._closeImport();
            this._finalizeImport(level, 'save_as_new');
        }

        _finalizeImport(level, operationType) {
            const levelJson = level.toJSON();
            Storage.saveCustomLevel(levelJson, 'import', operationType);
            this._loadLevels();
            this._renderMainMenu();
            this._restoreLastOperation();
            this._restoreUndoBar();
            this._restoreBatchUndoBar();
            this.infoPanel.showNotification(`关卡 "${level.name}" ${operationType === 'overwrite' ? '覆盖' : operationType === 'save_as_new' ? '另存为新关卡' : '导入'}成功！`, 'success');
        }

        _openExport() {
            const select = document.getElementById('export-level-select');
            select.innerHTML = '';

            for (const level of this.availableLevels) {
                const option = document.createElement('option');
                option.value = level.id;
                const isBuiltin = this._isBuiltinLevel(level.id);
                option.textContent = `${level.name} (${isBuiltin ? '内置' : '自定义'} | ${level.id})`;
                select.appendChild(option);
            }

            if (this.availableLevels.length > 0) {
                this._updateExportText(this.availableLevels[0].id);
            }

            document.getElementById('export-modal').classList.add('active');
        }

        _closeExport() {
            document.getElementById('export-modal').classList.remove('active');
        }

        _updateExportText(levelId) {
            const level = this.availableLevels.find(l => l.id === levelId);
            if (!level) return;

            const levelObj = GameModels.Level.fromJSON(level);
            document.getElementById('export-textarea').value = JSON.stringify(levelObj.toJSON(), null, 2);

            const metaDiv = document.getElementById('export-level-meta');
            const isCustom = this._isCustomLevel(levelId);
            const progress = Storage.loadProgress();

            if (isCustom) {
                const customLevels = Storage.loadCustomLevels();
                const meta = customLevels[levelId]?._meta;
                document.getElementById('export-meta-source').textContent =
                    meta?.sourceType === 'import' ? '导入' : meta?.sourceType || '导入';
                document.getElementById('export-meta-import-time').textContent =
                    meta?.importTime ? formatTimestamp(meta.importTime) : '-';
                metaDiv.classList.remove('hidden');
            } else {
                document.getElementById('export-meta-source').textContent = '内置';
                document.getElementById('export-meta-import-time').textContent = '-';
                metaDiv.classList.remove('hidden');
            }

            const highScore = progress.highScores[levelId] || 0;
            document.getElementById('export-meta-high-score').textContent =
                highScore > 0 ? ScoringSystem.formatScore(highScore) : '暂无';
        }

        _copyExport() {
            const textarea = document.getElementById('export-textarea');
            textarea.select();
            document.execCommand('copy');
            this.infoPanel.showNotification('已复制到剪贴板', 'success');
        }

        _openReplay() {
            const replayData = Storage.loadLastReplay();
            if (!replayData) {
                this.infoPanel.showNotification('没有可回放的失败记录', 'warning');
                return;
            }

            try {
                this.replayPlayer.loadReplay(replayData);

                const replayRenderer = new Renderer.WarehouseRenderer(
                    document.getElementById('replay-screen'),
                    document.getElementById('replay-map')
                );

                this.replayPlayer.setRenderer(replayRenderer);
                this.replayPlayer.setInfoContainer(document.getElementById('replay-info'));
                this.replayPlayer.setLogContainer(document.getElementById('replay-log'));

                this.replaySpeed = 1;
                document.getElementById('btn-replay-speed').textContent = `⏩ ${this.replaySpeed}x`;

                this._showScreen('replay-screen');

            } catch (e) {
                this.infoPanel.showNotification('回放加载失败: ' + e.message, 'error');
            }
        }

        _playReplay() {
            try {
                this.replayPlayer.play();
            } catch (e) {
                this.infoPanel.showNotification(e.message, 'error');
            }
        }

        _pauseReplay() {
            this.replayPlayer.pause();
        }

        _toggleReplaySpeed() {
            const speeds = [1, 2, 3, 4];
            const currentIndex = speeds.indexOf(this.replaySpeed);
            this.replaySpeed = speeds[(currentIndex + 1) % speeds.length];
            this.replayPlayer.setSpeed(this.replaySpeed);
            document.getElementById('btn-replay-speed').textContent = `⏩ ${this.replaySpeed}x`;
        }

        _exitReplay() {
            this.replayPlayer.destroy();
            this._showScreen('main-menu');
            this._renderMainMenu();
        }

        _showScreen(screenId) {
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            document.getElementById(screenId).classList.add('active');
        }

        _restoreBatchUndoBar() {
            const undoBar = document.getElementById('batch-undo-bar');
            const snapshot = Storage.getBatchRestoreUndoSnapshot();
            if (!snapshot) {
                undoBar.classList.add('hidden');
                return;
            }

            const lastRestore = Storage.getLastBatchRestoreInfo();
            const count = lastRestore?.imported || 0;
            document.getElementById('batch-undo-bar-text').textContent =
                `刚恢复了 ${count} 个关卡，可撤销本次批量恢复`;
            undoBar.classList.remove('hidden');
        }

        _undoBatchRestore() {
            const result = Storage.undoBatchRestore();
            if (result.success) {
                this._loadLevels();
                this._renderMainMenu();
                this._renderDraftList();
                this._restoreUndoBar();
                this._restoreBatchUndoBar();
                this._restorePublishUndoBar();
                this._restoreLastOperation();
                this._renderLastRestoreCard();
                this.infoPanel.showNotification('已撤销批量恢复，记录已同步更新', 'success');
            } else {
                const reasons = {
                    no_undo_snapshot: '没有可撤销的批量恢复',
                    invalid_snapshot: '撤销数据无效',
                    error: '撤销失败'
                };
                this.infoPanel.showNotification(reasons[result.reason] || '撤销失败', 'error');
            }
        }

        _renderDraftList() {
            const list = document.getElementById('draft-list');
            const drafts = Storage.loadDrafts();
            const ids = Object.keys(drafts);

            if (ids.length === 0) {
                list.innerHTML = '<div class="draft-card-empty">暂无草稿 — 点击顶部「➕ 新建草稿」或「以现有关卡为模板」开始创建</div>';
                return;
            }

            ids.sort((a, b) => {
                const ta = drafts[a]._meta?.lastModifiedTime || 0;
                const tb = drafts[b]._meta?.lastModifiedTime || 0;
                return tb - ta;
            });

            const self = this;
            list.innerHTML = ids.map(id => {
                const d = drafts[id];
                const meta = d._meta || {};
                const v = meta.version || '?';
                const mod = meta.lastModifiedTime ? formatTimestamp(meta.lastModifiedTime) : '-';
                const created = meta.createdTime ? formatTimestamp(meta.createdTime) : '-';
                const mapSize = `${d.mapWidth || '?'}×${d.mapHeight || '?'}`;
                const orderCount = (d.orders || []).length;
                return `
                    <div class="draft-card" data-draft-id="${id}">
                        <div class="draft-card-title">
                            <h4 title="${d.name || '未命名'}">${d.name || '未命名草稿'}</h4>
                            <span class="draft-badge">v${v}</span>
                        </div>
                        <div class="draft-card-meta">
                            <span>📝 ID: ${d.id || '(未设置)'}</span>
                            <span>🕐 创建: ${created}</span>
                            <span>✏️ 修改: ${mod}</span>
                        </div>
                        <div class="draft-card-stats">
                            <span>🗺️ ${mapSize}</span>
                            <span>📦 ${orderCount} 订单</span>
                            <span>🧑 ${d.workerCount || 0} 人</span>
                            <span>⏱ ${d.timeLimit || 0}s</span>
                        </div>
                        <div class="draft-card-actions">
                            <button class="btn btn-primary btn-small btn-edit-draft" data-draft-id="${id}">✏️ 编辑</button>
                            <button class="btn btn-secondary btn-small btn-duplicate-draft" data-draft-id="${id}">📄 复制</button>
                            <button class="btn btn-danger btn-small btn-delete-draft" data-draft-id="${id}">🗑️ 删除</button>
                        </div>
                    </div>
                `;
            }).join('');

            list.querySelectorAll('.btn-edit-draft').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    self.draftEditor.openEdit(btn.dataset.draftId);
                });
            });

            list.querySelectorAll('.btn-duplicate-draft').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const src = Storage.loadDraft(btn.dataset.draftId);
                    if (src) {
                        const newId = Storage.generateDraftId();
                        const copy = { ...src };
                        delete copy._meta;
                        copy.name = (copy.name || '未命名') + ' (副本)';
                        Storage.saveDraft(newId, copy);
                        self._renderDraftList();
                        self.infoPanel.showNotification('草稿已复制', 'success');
                    }
                });
            });

            list.querySelectorAll('.btn-delete-draft').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.draftId;
                    const d = Storage.loadDraft(id);
                    if (!d) return;
                    if (confirm(`确定删除草稿 "${d.name || '未命名'}" 吗？此操作不可撤销。`)) {
                        const r = Storage.deleteDraft(id);
                        if (r.success) {
                            self._renderDraftList();
                            self.infoPanel.showNotification('草稿已删除', 'success');
                        } else {
                            self.infoPanel.showNotification('删除失败', 'error');
                        }
                    }
                });
            });
        }

        _restorePublishUndoBar() {
            const undoBar = document.getElementById('publish-undo-bar');
            const snapshot = Storage.getPublishUndoSnapshot();
            if (!snapshot) {
                undoBar.classList.add('hidden');
                return;
            }
            const last = Storage.getLastPublishInfo();
            const name = snapshot.levelName || snapshot.levelId;
            const wasOverwrite = last?.wasOverwrite;
            document.getElementById('publish-undo-bar-text').textContent =
                `刚${wasOverwrite ? '覆盖发布' : '新发布'}关卡 "${name}"，可撤销本次发布`;
            undoBar.classList.remove('hidden');
        }

        _undoPublish() {
            if (!this.publishWorkbench) {
                this.publishWorkbench = new PublishWorkbench.Workbench(this);
            }

            const result = this.publishWorkbench.undoLastPublish();

            if (result.needUIRefresh) {
                this._syncAfterPublish(result);
            } else {
                const reasons = {
                    no_undo_snapshot: '没有可撤销的发布',
                    invalid_snapshot: '撤销数据无效',
                    error: '撤销失败'
                };
                this.infoPanel.showNotification(reasons[result.reason] || '撤销失败', 'error');
            }
        }

        _openTemplateSelect() {
            const list = document.getElementById('template-level-list');
            list.innerHTML = this.availableLevels.map(lv => {
                const isBuiltin = this._isBuiltinLevel(lv.id);
                const tag = isBuiltin ? '内置' : '自定义';
                return `
                    <div class="template-item" data-level-id="${lv.id}">
                        <div class="template-item-name">${tag} · ${lv.name}</div>
                        <div class="template-item-meta">
                            <span>🆔 ${lv.id}</span>
                            <span>🗺️ ${lv.mapWidth || '?'}×${lv.mapHeight || '?'}</span>
                            <span>📦 ${(lv.orders || []).length} 订单</span>
                            <span>🧑 ${lv.workerCount || 0} 人</span>
                        </div>
                    </div>
                `;
            }).join('');

            const self = this;
            list.querySelectorAll('.template-item').forEach(el => {
                el.addEventListener('click', () => {
                    const lvId = el.dataset.levelId;
                    const lv = self.availableLevels.find(l => l.id === lvId);
                    if (lv) {
                        self._closeTemplateSelect();
                        self.draftEditor.openFromTemplate(lv);
                    }
                });
            });

            document.getElementById('template-select-modal').classList.add('active');
        }

        _closeTemplateSelect() {
            document.getElementById('template-select-modal').classList.remove('active');
        }

        _publishOverwrite() {
            if (!this.publishWorkbench) {
                this.publishWorkbench = new PublishWorkbench.Workbench(this);
            }

            const result = this.publishWorkbench.handleOverwrite();

            if (!result || !result.needUIRefresh) return;

            this._syncAfterPublish(result);
        }

        _publishShowRename() {
            if (!this.publishWorkbench) {
                this.publishWorkbench = new PublishWorkbench.Workbench(this);
            }

            const renameDiv = document.getElementById('publish-conflict-rename');
            if (renameDiv.classList.contains('hidden')) {
                this.publishWorkbench.showRenameSection();
            } else {
                const result = this.publishWorkbench.handleSaveAsNew();
                if (result && result.needUIRefresh) {
                    this._syncAfterPublish(result);
                }
            }
        }

        _publishBackToDraft() {
            if (!this.publishWorkbench) {
                this.publishWorkbench = new PublishWorkbench.Workbench(this);
            }
            const result = this.publishWorkbench.handleBackToDraft();
            if (result && result.needUIRefresh) {
                this._syncAfterPublish(result);
            }
        }

        _publishCancel() {
            if (!this.publishWorkbench) {
                this.publishWorkbench = new PublishWorkbench.Workbench(this);
            }
            const result = this.publishWorkbench.handleCancel();
            if (result && result.needUIRefresh) {
                this._syncAfterPublish(result);
            }
        }

        _closePublishConflict() {
            if (this.publishWorkbench) {
                this.publishWorkbench._closeConflictPanel();
            }
        }

        _syncAfterPublish(result) {
            this._loadLevels();
            this._renderMainMenu();
            this._renderDraftList();
            this._restoreLastOperation();
            this._restoreUndoBar();
            this._restoreBatchUndoBar();
            this._restorePublishUndoBar();
            this._renderLastRestoreCard();

            if (result.success && this.draftEditor && this.draftEditor.isEditing) {
                this.draftEditor.close();
            }

            const notificationMap = {
                publish_new: `🎉 关卡 "${result.levelName}" 发布成功！`,
                publish_overwrite: `🔄 关卡 "${result.levelName}" 覆盖发布成功！`,
                publish_save_as_new: `📝 关卡 "${result.newLevelName}" 另存发布成功！`,
                conflict_back_to_draft: '已退回草稿，可继续修改后再发布',
                conflict_cancel: '发布已取消',
                undo_publish: result.wasOverwrite
                    ? `已撤销覆盖发布，"${result.levelName}" 已恢复到之前版本`
                    : `已撤销发布，新关卡 "${result.levelName}" 已被移除`
            };

            const msg = notificationMap[result.type];
            const type = result.success ? 'success' : 'info';
            if (msg) {
                this.infoPanel.showNotification(msg, type);
            }
        }

        _openBackupAll() {
            const backup = Storage.createFullBackup();
            if (!backup.success) {
                this.infoPanel.showNotification('备份失败: ' + backup.error, 'error');
                return;
            }

            const customLevels = Storage.loadCustomLevels();
            const count = Object.keys(customLevels).length;
            const summary = document.getElementById('backup-summary');
            summary.innerHTML = `
                <div class="backup-summary-item">
                    <span class="summary-label">关卡数量：</span>
                    <span class="summary-value">${backup.levelCount} 个</span>
                </div>
                <div class="backup-summary-item">
                    <span class="summary-label">备份时间：</span>
                    <span class="summary-value">${formatTimestamp(Date.now())}</span>
                </div>
            `;

            document.getElementById('backup-textarea').value = backup.json;
            document.getElementById('backup-all-modal').classList.add('active');
        }

        _closeBackupAll() {
            document.getElementById('backup-all-modal').classList.remove('active');
        }

        _copyBackup() {
            const textarea = document.getElementById('backup-textarea');
            textarea.select();
            document.execCommand('copy');
            this.infoPanel.showNotification('备份已复制到剪贴板', 'success');
        }

        _downloadBackup() {
            const backup = Storage.createFullBackup();
            if (!backup.success) {
                this.infoPanel.showNotification('备份失败: ' + backup.error, 'error');
                return;
            }

            try {
                const blob = new Blob([backup.json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `custom-levels-backup-${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.infoPanel.showNotification('备份文件已下载', 'success');
            } catch (e) {
                this.infoPanel.showNotification('下载失败: ' + e.message, 'error');
            }
        }

        _openRestoreAll() {
            document.getElementById('restore-textarea').value = '';
            document.getElementById('restore-precheck-result').classList.add('hidden');
            this._pendingRestoreData = null;
            this._restoreDecisions = {};
            this._precheckResult = null;
            document.getElementById('restore-all-modal').classList.add('active');
        }

        _closeRestoreAll() {
            document.getElementById('restore-all-modal').classList.remove('active');
            this._pendingRestoreData = null;
            this._restoreDecisions = {};
            this._precheckResult = null;
        }

        _doRestorePrecheck() {
            const textarea = document.getElementById('restore-textarea');
            const jsonStr = textarea.value.trim();

            if (!jsonStr) {
                this.infoPanel.showNotification('请粘贴备份 JSON 内容', 'warning');
                return;
            }

            const parseResult = Storage.validateAndParseBackup(jsonStr);
            if (!parseResult.success) {
                this.infoPanel.showNotification('备份解析失败: ' + parseResult.error, 'error');
                return;
            }

            this._pendingRestoreData = parseResult.data;
            this._precheckResult = Storage.precheckBackup(parseResult.data);
            this._restoreDecisions = {};

            const allLevels = parseResult.data.levels;
            const precheck = this._precheckResult;

            for (let i = 0; i < allLevels.length; i++) {
                const entry = allLevels[i];
                if (!entry || !entry.id) continue;

                const isBad = precheck.badEntries.some(b => b.index === i);
                const isBuiltin = precheck.builtinConflict.some(b => b.index === i);

                if (isBad) {
                    this._restoreDecisions[i] = { action: 'skip' };
                    continue;
                }

                if (isBuiltin || Storage.isBuiltinLevelId(entry.id)) {
                    this._restoreDecisions[i] = { action: 'skip' };
                    continue;
                }

                const existingLevels = Storage.loadCustomLevels();
                if (existingLevels[entry.id]) {
                    this._restoreDecisions[i] = { action: 'skip' };
                } else {
                    this._restoreDecisions[i] = { action: 'import' };
                }
            }

            this._renderPrecheckResult();
            document.getElementById('restore-precheck-result').classList.remove('hidden');
        }

        _generateCopyPreview(originalId, originalName) {
            const existingLevels = Storage.loadCustomLevels();
            let newId = originalId + '-copy';
            let counter = 1;
            while (existingLevels[newId] || Storage.isBuiltinLevelId(newId)) {
                newId = originalId + '-copy-' + counter;
                counter++;
            }
            const newName = (originalName || originalId) + ' (副本)';
            return { newId, newName };
        }

        _renderPrecheckResult() {
            const result = this._precheckResult;
            if (!result) return;

            document.getElementById('precheck-stat-total').textContent = `总计: ${result.totalCount}`;
            document.getElementById('precheck-stat-new').textContent = `新增: ${result.newLevels.length}`;
            document.getElementById('precheck-stat-conflict').textContent = `冲突: ${result.conflictLevels.length}`;
            document.getElementById('precheck-stat-builtin').textContent = `内置冲突: ${result.builtinConflict.length}`;
            document.getElementById('precheck-stat-bad').textContent = `坏条目: ${result.badEntries.length}`;

            const newSection = document.getElementById('precheck-new-section');
            const newList = document.getElementById('precheck-new-list');
            if (result.newLevels.length > 0) {
                newSection.classList.remove('hidden');
                newList.innerHTML = result.newLevels.map(item => `
                    <div class="precheck-item precheck-item-new">
                        <div class="precheck-item-info">
                            <span class="precheck-item-name">✨ ${item.name}</span>
                            <span class="precheck-item-id">(${item.id})</span>
                            ${item.highScore > 0 ? `<span class="precheck-item-score">🏆 ${item.highScore}分</span>` : ''}
                        </div>
                        <div class="precheck-item-action">
                            <span class="action-label">将新增</span>
                        </div>
                    </div>
                `).join('');
            } else {
                newSection.classList.add('hidden');
            }

            const conflictSection = document.getElementById('precheck-conflict-section');
            const conflictList = document.getElementById('precheck-conflict-list');
            if (result.conflictLevels.length > 0) {
                conflictSection.classList.remove('hidden');
                conflictList.innerHTML = result.conflictLevels.map(item => {
                    const decision = this._restoreDecisions[item.index]?.action || 'skip';
                    return `
                        <div class="precheck-item precheck-item-conflict">
                            <div class="precheck-item-info">
                                <span class="precheck-item-name">⚠️ ${item.name}</span>
                                <span class="precheck-item-id">(${item.id})</span>
                                <span class="precheck-item-existing">现有: ${item.existingName}</span>
                            </div>
                            <div class="precheck-item-action">
                                <select class="decision-select" data-index="${item.index}">
                                    <option value="skip" ${decision === 'skip' ? 'selected' : ''}>跳过</option>
                                    <option value="overwrite" ${decision === 'overwrite' ? 'selected' : ''}>覆盖</option>
                                    <option value="save_as_new" ${decision === 'save_as_new' ? 'selected' : ''}>另存为副本</option>
                                </select>
                            </div>
                        </div>
                    `;
                }).join('');

                conflictList.querySelectorAll('.decision-select').forEach(select => {
                    select.addEventListener('change', (e) => {
                        const idx = parseInt(e.target.dataset.index);
                        this._restoreDecisions[idx] = { action: e.target.value };
                    });
                });
            } else {
                conflictSection.classList.add('hidden');
            }

            const builtinSection = document.getElementById('precheck-builtin-section');
            const builtinList = document.getElementById('precheck-builtin-list');
            if (result.builtinConflict.length > 0) {
                builtinSection.classList.remove('hidden');
                builtinList.innerHTML = result.builtinConflict.map(item => {
                    const decision = this._restoreDecisions[item.index]?.action || 'skip';
                    const preview = this._generateCopyPreview(item.id, item.name);
                    return `
                        <div class="precheck-item precheck-item-builtin" data-index="${item.index}">
                            <div class="precheck-item-info">
                                <span class="precheck-item-name">🚫 ${item.name}</span>
                                <span class="precheck-item-id">(${item.id})</span>
                            </div>
                            <div class="precheck-item-action">
                                <select class="decision-select builtin-decision-select" data-index="${item.index}">
                                    <option value="skip" ${decision === 'skip' ? 'selected' : ''}>跳过</option>
                                    <option value="save_as_new" ${decision === 'save_as_new' ? 'selected' : ''}>另存为副本</option>
                                </select>
                                <div class="builtin-preview ${decision === 'save_as_new' ? '' : 'hidden'}" data-preview-index="${item.index}">
                                    <div class="preview-label">→ 新 ID: <span class="preview-id">${preview.newId}</span></div>
                                    <div class="preview-label">→ 新名称: <span class="preview-name">${preview.newName}</span></div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                builtinList.querySelectorAll('.builtin-decision-select').forEach(select => {
                    select.addEventListener('change', (e) => {
                        const idx = parseInt(e.target.dataset.index);
                        this._restoreDecisions[idx] = { action: e.target.value };
                        const previewEl = builtinList.querySelector(`[data-preview-index="${idx}"]`);
                        if (e.target.value === 'save_as_new') {
                            previewEl.classList.remove('hidden');
                        } else {
                            previewEl.classList.add('hidden');
                        }
                    });
                });
            } else {
                builtinSection.classList.add('hidden');
            }

            const badSection = document.getElementById('precheck-bad-section');
            const badList = document.getElementById('precheck-bad-list');
            if (result.badEntries.length > 0) {
                badSection.classList.remove('hidden');
                badList.innerHTML = result.badEntries.map(item => `
                    <div class="precheck-item precheck-item-bad">
                        <div class="precheck-item-info">
                            <span class="precheck-item-name">❌ ${item.id}</span>
                            <span class="precheck-item-reason">${item.reason}</span>
                        </div>
                        <div class="precheck-item-action">
                            <span class="action-label action-disabled">已跳过</span>
                        </div>
                    </div>
                `).join('');
            } else {
                badSection.classList.add('hidden');
            }
        }

        _batchSetDecision(action) {
            if (!this._precheckResult) return;

            for (const item of this._precheckResult.conflictLevels) {
                this._restoreDecisions[item.index] = { action: action };
            }

            if (action === 'save_as_new' || action === 'skip') {
                for (const item of this._precheckResult.builtinConflict) {
                    this._restoreDecisions[item.index] = { action: action };
                }
            }

            this._renderPrecheckResult();
        }

        _confirmRestore() {
            if (!this._pendingRestoreData || !this._precheckResult) {
                this.infoPanel.showNotification('请先执行预检', 'warning');
                return;
            }

            const decisions = [];
            const allLevels = this._pendingRestoreData.levels;
            for (let i = 0; i < allLevels.length; i++) {
                const entry = allLevels[i];
                if (!entry || !entry.id) {
                    decisions[i] = { action: 'skip' };
                    continue;
                }

                const isBad = this._precheckResult.badEntries.some(b => b.index === i);
                if (isBad) {
                    decisions[i] = { action: 'skip' };
                    continue;
                }

                if (Storage.isBuiltinLevelId(entry.id)) {
                    const decision = this._restoreDecisions[i];
                    if (decision && (decision.action === 'save_as_new' || decision.action === 'skip')) {
                        decisions[i] = decision;
                    } else {
                        decisions[i] = { action: 'skip' };
                    }
                    continue;
                }

                const existingLevels = Storage.loadCustomLevels();
                if (existingLevels[entry.id]) {
                    decisions[i] = this._restoreDecisions[i] || { action: 'skip' };
                } else {
                    decisions[i] = this._restoreDecisions[i] || { action: 'import' };
                }
            }

            const result = Storage.executeBatchRestore(this._pendingRestoreData, decisions);

            if (!result.success) {
                this.infoPanel.showNotification('恢复失败: ' + result.error, 'error');
                return;
            }

            this._closeRestoreAll();
            this._loadLevels();
            this._renderMainMenu();
            this._restoreLastOperation();
            this._restoreUndoBar();
            this._restoreBatchUndoBar();
            this._renderLastRestoreCard();

            this._showRestoreResult(result);
        }

        _showRestoreResult(result) {
            const summary = document.getElementById('restore-result-summary');
            const counts = result.counts || {
                total: result.importedCount + result.skippedCount + result.failedCount,
                new: 0,
                overwrite: 0,
                saveAsNew: 0,
                builtinConflict: 0,
                badEntries: 0
            };

            summary.innerHTML = `
                <div class="result-stat-row">
                    <span class="result-stat-label">处理总数：</span>
                    <span class="result-stat-value">${counts.total} 个</span>
                </div>
                <div class="result-stat-row">
                    <span class="result-stat-label">✨ 新增：</span>
                    <span class="result-stat-value result-success">${counts.new} 个</span>
                </div>
                <div class="result-stat-row">
                    <span class="result-stat-label">🔄 覆盖：</span>
                    <span class="result-stat-value result-success">${counts.overwrite} 个</span>
                </div>
                <div class="result-stat-row">
                    <span class="result-stat-label">📝 另存为副本：</span>
                    <span class="result-stat-value result-success">${counts.saveAsNew} 个</span>
                </div>
                <div class="result-stat-row">
                    <span class="result-stat-label">⏭️ 跳过：</span>
                    <span class="result-stat-value result-skip">${result.skippedCount} 个</span>
                </div>
                <div class="result-stat-row">
                    <span class="result-stat-label">🚫 内置冲突：</span>
                    <span class="result-stat-value result-skip">${counts.builtinConflict} 个</span>
                </div>
                <div class="result-stat-row">
                    <span class="result-stat-label">❌ 坏条目：</span>
                    <span class="result-stat-value result-skip">${counts.badEntries} 个</span>
                </div>
                <div class="result-stat-row">
                    <span class="result-stat-label">⚠️ 失败：</span>
                    <span class="result-stat-value result-fail">${result.failedCount} 个</span>
                </div>
            `;

            const details = document.getElementById('restore-result-details');
            details.innerHTML = '';

            const detailed = result.detailed;
            if (detailed) {
                if (detailed.new && detailed.new.length > 0) {
                    details.innerHTML += '<h4>✨ 新增关卡</h4>';
                    details.innerHTML += detailed.new.map(item =>
                        `<div class="result-detail-item"><strong>${item.name}</strong> (${item.id})${item.highScore > 0 ? ` - 🏆 ${item.highScore}分` : ''}${item.completed ? ' - ✅已完成' : ''}<br><span class="result-reason">${item.reason}</span></div>`
                    ).join('');
                }

                if (detailed.overwrite && detailed.overwrite.length > 0) {
                    details.innerHTML += '<h4>🔄 覆盖关卡</h4>';
                    details.innerHTML += detailed.overwrite.map(item =>
                        `<div class="result-detail-item"><strong>${item.name}</strong> (${item.id}) - 原"${item.originalName}"<br><span class="result-reason">${item.reason}</span></div>`
                    ).join('');
                }

                if (detailed.saveAsNew && detailed.saveAsNew.length > 0) {
                    details.innerHTML += '<h4>📝 另存为副本</h4>';
                    details.innerHTML += detailed.saveAsNew.map(item =>
                        `<div class="result-detail-item"><strong>${item.name}</strong> (${item.id}) - 原ID: ${item.originalId}<br><span class="result-reason">${item.reason}</span></div>`
                    ).join('');
                }

                if (detailed.skipped && detailed.skipped.length > 0) {
                    details.innerHTML += '<h4>⏭️ 跳过关卡</h4>';
                    details.innerHTML += detailed.skipped.map(item =>
                        `<div class="result-detail-item"><strong>${item.name}</strong> (${item.id})<br><span class="result-reason">${item.reason}</span></div>`
                    ).join('');
                }

                if (detailed.builtinConflict && detailed.builtinConflict.length > 0) {
                    details.innerHTML += '<h4>🚫 内置关卡冲突</h4>';
                    details.innerHTML += detailed.builtinConflict.map(item =>
                        `<div class="result-detail-item"><strong>${item.name}</strong> (${item.id})<br><span class="result-reason">${item.reason}</span></div>`
                    ).join('');
                }

                if (detailed.badEntries && detailed.badEntries.length > 0) {
                    details.innerHTML += '<h4>❌ 损坏条目</h4>';
                    details.innerHTML += detailed.badEntries.map(item =>
                        `<div class="result-detail-item"><strong>${item.name}</strong> (${item.id})<br><span class="result-reason">${item.reason}</span></div>`
                    ).join('');
                }

                if (detailed.failed && detailed.failed.length > 0) {
                    details.innerHTML += '<h4>⚠️ 处理失败</h4>';
                    details.innerHTML += detailed.failed.map(item =>
                        `<div class="result-detail-item"><strong>${item.name}</strong> (${item.id})<br><span class="result-reason">${item.reason}</span></div>`
                    ).join('');
                }
            } else {
                const imported = result.results.imported || [];
                if (imported.length > 0) {
                    details.innerHTML += '<h4>✅ 成功导入的关卡</h4>';
                    details.innerHTML += imported.map(item =>
                        `<div class="result-detail-item">${item.name} (${item.id}) - ${item.action === 'overwrite' ? '覆盖' : item.action === 'save_as_new' ? '另存为副本' : '新增'}</div>`
                    ).join('');
                }

                const failed = result.results.failed || [];
                if (failed.length > 0) {
                    details.innerHTML += '<h4>❌ 导入失败的关卡</h4>';
                    details.innerHTML += failed.map(item =>
                        `<div class="result-detail-item">${item.name || item.id} - ${item.reason}</div>`
                    ).join('');
                }
            }

            details.innerHTML += '<p class="restore-hint">💡 本次批量恢复可在主菜单撤销一次。记录已保存，可随时在主菜单"恢复记录"中查看详情或导出JSON。</p>';

            document.getElementById('restore-result-modal').classList.add('active');
        }

        _closeRestoreResult() {
            document.getElementById('restore-result-modal').classList.remove('active');
        }

        _exportCurrentRestoreResult() {
            const lastRestore = Storage.getLastBatchRestoreInfo();
            if (!lastRestore) {
                this.infoPanel.showNotification('没有可导出的恢复结果', 'warning');
                return;
            }
            this._downloadRestoreRecord(lastRestore.recordId);
        }

        _downloadRestoreRecord(recordId) {
            const exportResult = Storage.exportBatchRestoreRecordAsJson(recordId);
            if (!exportResult.success) {
                this.infoPanel.showNotification('导出失败: ' + exportResult.error, 'error');
                return;
            }

            try {
                const blob = new Blob([exportResult.json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const record = recordId ? Storage.getBatchRestoreRecord(recordId) : Storage.getLastBatchRestoreInfo();
                const dateStr = record?.timestamp ? new Date(record.timestamp).toISOString().slice(0, 10) : 'report';
                a.download = `restore-report-${dateStr}-${(record?.recordId || 'report').slice(0, 8)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.infoPanel.showNotification('恢复结果JSON已下载', 'success');
            } catch (e) {
                this.infoPanel.showNotification('下载失败: ' + e.message, 'error');
            }
        }

        _renderLastRestoreCard() {
            const card = document.getElementById('last-restore-card');
            const content = document.getElementById('last-restore-card-content');
            const lastRestore = Storage.getLastBatchRestoreInfo();

            if (!lastRestore) {
                card.classList.add('hidden');
                return;
            }

            const counts = lastRestore.counts || lastRestore.summary || {
                total: lastRestore.total,
                new: 0,
                overwrite: lastRestore.overwrite,
                saveAsNew: lastRestore.saveAsNew,
                imported: lastRestore.imported,
                skipped: lastRestore.skipped,
                failed: lastRestore.failed
            };

            const isUndone = lastRestore.undone;
            const undoable = lastRestore.undoable;

            let statusBadge = '';
            if (isUndone) {
                statusBadge = '<span class="restore-status-badge status-undone">已撤销</span>';
            } else if (undoable) {
                statusBadge = '<span class="restore-status-badge status-undoable">可撤销</span>';
            } else {
                statusBadge = '<span class="restore-status-badge status-done">已完成</span>';
            }

            content.innerHTML = `
                <div class="restore-meta-row">
                    <span class="restore-time">🕐 ${formatTimestamp(lastRestore.timestamp)}</span>
                    ${statusBadge}
                </div>
                <div class="restore-stats-row">
                    <span class="restore-stat-chip chip-new">✨ 新增 ${counts.new}</span>
                    <span class="restore-stat-chip chip-overwrite">🔄 覆盖 ${counts.overwrite}</span>
                    <span class="restore-stat-chip chip-saveas">📝 副本 ${counts.saveAsNew}</span>
                    <span class="restore-stat-chip chip-skip">⏭️ 跳过 ${(counts.skipped || 0) + (counts.builtinConflict || 0) + (counts.badEntries || 0)}</span>
                    <span class="restore-stat-chip chip-fail">⚠️ 失败 ${counts.failed}</span>
                </div>
                ${isUndone ? '<div class="restore-undone-note">ℹ️ 此恢复已被撤销，关卡数据已回退</div>' : ''}
            `;

            card.classList.remove('hidden');
        }

        _openRestoreHistory() {
            const history = Storage.loadBatchRestoreHistory();
            const list = document.getElementById('restore-history-list');

            if (!history || history.length === 0) {
                list.innerHTML = '<div class="empty-history">暂无批量恢复记录</div>';
            } else {
                list.innerHTML = history.map(record => {
                    const counts = record.counts || record.summary || {};
                    const isUndone = record.undone;
                    const undoable = record.undoable;
                    const statusClass = isUndone ? 'status-undone' : (undoable ? 'status-undoable' : 'status-done');
                    const statusText = isUndone ? '已撤销' : (undoable ? '可撤销' : '已完成');

                    return `
                        <div class="history-item ${isUndone ? 'history-item-undone' : ''}" data-record-id="${record.recordId}">
                            <div class="history-item-header">
                                <span class="history-item-title">
                                    <span class="history-item-time">🕐 ${formatTimestamp(record.timestamp)}</span>
                                    <span class="history-item-status ${statusClass}">${statusText}</span>
                                </span>
                                <button class="btn btn-secondary btn-small view-detail-btn" data-id="${record.recordId}">查看详情</button>
                            </div>
                            <div class="history-item-stats">
                                <span class="restore-stat-chip chip-new">✨ ${counts.new || 0}</span>
                                <span class="restore-stat-chip chip-overwrite">🔄 ${counts.overwrite || 0}</span>
                                <span class="restore-stat-chip chip-saveas">📝 ${counts.saveAsNew || 0}</span>
                                <span class="restore-stat-chip chip-skip">⏭️ ${(counts.skipped || 0) + (counts.builtinConflict || 0) + (counts.badEntries || 0)}</span>
                                <span class="restore-stat-chip chip-fail">⚠️ ${counts.failed || 0}</span>
                            </div>
                            ${isUndone ? '<div class="history-item-undone-label">已撤销</div>' : ''}
                        </div>
                    `;
                }).join('');

                list.querySelectorAll('.view-detail-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const id = btn.dataset.id;
                        this._openRestoreDetail(id);
                    });
                });
            }

            document.getElementById('restore-history-modal').classList.add('active');
        }

        _closeRestoreHistory() {
            document.getElementById('restore-history-modal').classList.remove('active');
        }

        _openLastRestoreDetail() {
            const last = Storage.getLastBatchRestoreInfo();
            if (!last) {
                this.infoPanel.showNotification('暂无恢复记录', 'warning');
                return;
            }
            this._openRestoreDetail(last.recordId);
        }

        _openRestoreDetail(recordId) {
            const record = Storage.getBatchRestoreRecord(recordId);
            if (!record) {
                this.infoPanel.showNotification('找不到该恢复记录', 'error');
                return;
            }

            this._currentDetailRecordId = recordId;

            const isUndone = record.undone;
            const undoable = record.undoable;
            const statusBar = document.getElementById('restore-detail-status-bar');
            if (isUndone) {
                statusBar.innerHTML = '<span class="detail-status status-undone">⚠️ 该记录已被撤销，关卡数据已回退</span>';
                statusBar.className = 'restore-detail-status-bar status-bar-undone';
            } else if (undoable) {
                statusBar.innerHTML = '<span class="detail-status status-undoable">↩️ 该记录可在主菜单撤销</span>';
                statusBar.className = 'restore-detail-status-bar status-bar-undoable';
            } else {
                statusBar.innerHTML = '<span class="detail-status status-done">✅ 已完成</span>';
                statusBar.className = 'restore-detail-status-bar status-bar-done';
            }

            document.getElementById('restore-detail-title').textContent =
                `📊 恢复记录详情 - ${formatTimestamp(record.timestamp)}`;

            const counts = record.counts || record.summary || {};
            const summary = document.getElementById('restore-detail-summary');
            summary.innerHTML = `
                <div class="detail-summary-item">
                    <span class="detail-summary-label">处理总数</span>
                    <span class="detail-summary-value">${counts.total || 0}</span>
                </div>
                <div class="detail-summary-item item-success">
                    <span class="detail-summary-label">成功导入</span>
                    <span class="detail-summary-value">${counts.imported || 0}</span>
                </div>
                <div class="detail-summary-item item-new">
                    <span class="detail-summary-label">新增</span>
                    <span class="detail-summary-value">${counts.new || 0}</span>
                </div>
                <div class="detail-summary-item item-overwrite">
                    <span class="detail-summary-label">覆盖</span>
                    <span class="detail-summary-value">${counts.overwrite || 0}</span>
                </div>
                <div class="detail-summary-item item-saveas">
                    <span class="detail-summary-label">另存为</span>
                    <span class="detail-summary-value">${counts.saveAsNew || 0}</span>
                </div>
                <div class="detail-summary-item item-skip">
                    <span class="detail-summary-label">跳过</span>
                    <span class="detail-summary-value">${(counts.skipped || 0) + (counts.builtinConflict || 0) + (counts.badEntries || 0)}</span>
                </div>
                <div class="detail-summary-item item-fail">
                    <span class="detail-summary-label">失败</span>
                    <span class="detail-summary-value">${counts.failed || 0}</span>
                </div>
            `;

            document.getElementById('tab-count-new').textContent = counts.new || 0;
            document.getElementById('tab-count-overwrite').textContent = counts.overwrite || 0;
            document.getElementById('tab-count-saveAsNew').textContent = counts.saveAsNew || 0;
            document.getElementById('tab-count-skipped').textContent = counts.skipped || 0;
            document.getElementById('tab-count-builtinConflict').textContent = counts.builtinConflict || 0;
            document.getElementById('tab-count-badEntries').textContent = counts.badEntries || 0;
            document.getElementById('tab-count-failed').textContent = counts.failed || 0;

            this._switchDetailTab('new');

            document.getElementById('restore-detail-modal').classList.add('active');
        }

        _closeRestoreDetail() {
            document.getElementById('restore-detail-modal').classList.remove('active');
            this._currentDetailRecordId = null;
        }

        _switchDetailTab(tabName) {
            this._currentDetailTab = tabName;

            document.querySelectorAll('.detail-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.tab === tabName);
            });

            const record = Storage.getBatchRestoreRecord(this._currentDetailRecordId);
            const detailed = record?.detailed || {};
            const content = document.getElementById('restore-detail-tab-content');

            const items = detailed[tabName] || [];

            if (items.length === 0) {
                content.innerHTML = `<div class="tab-empty">此分类无条目</div>`;
                return;
            }

            const tabLabels = {
                new: { icon: '✨', label: '新增关卡' },
                overwrite: { icon: '🔄', label: '覆盖关卡' },
                saveAsNew: { icon: '📝', label: '另存为副本' },
                skipped: { icon: '⏭️', label: '跳过关卡' },
                builtinConflict: { icon: '🚫', label: '内置关卡冲突' },
                badEntries: { icon: '❌', label: '损坏条目' },
                failed: { icon: '⚠️', label: '处理失败' }
            };

            const renderItem = (item, tab) => {
                let extra = '';
                if (tab === 'overwrite' && item.originalName) {
                    extra = `<div class="detail-item-extra">原名称: ${item.originalName}</div>`;
                }
                if (tab === 'saveAsNew') {
                    extra = `<div class="detail-item-extra">原ID: ${item.originalId || item.id}${item.originalName ? ` | 原名: ${item.originalName}` : ''}</div>`;
                }
                if (item.highScore > 0) {
                    extra += `<div class="detail-item-extra">🏆 最高分: ${item.highScore}${item.completed ? ' | ✅ 已完成' : ''}</div>`;
                }
                const decisionLabels = {
                    import: '新增导入',
                    overwrite: '覆盖',
                    save_as_new: '另存为副本',
                    skip: '跳过'
                };
                return `
                    <div class="detail-item">
                        <div class="detail-item-header">
                            <span class="detail-item-name">${item.name || item.id}</span>
                            <span class="detail-item-id">${item.id}</span>
                            ${item.decision ? `<span class="detail-item-decision">决策: ${decisionLabels[item.decision] || item.decision}</span>` : ''}
                        </div>
                        ${extra}
                        <div class="detail-item-reason">${item.reason || ''}</div>
                    </div>
                `;
            };

            content.innerHTML = `
                <h4 class="tab-section-title">${tabLabels[tabName]?.icon || ''} ${tabLabels[tabName]?.label || tabName} (${items.length})</h4>
                ${items.map(item => renderItem(item, tabName)).join('')}
            `;
        }

        _exportDetailRecord() {
            if (!this._currentDetailRecordId) {
                this.infoPanel.showNotification('没有选中的记录', 'warning');
                return;
            }
            this._downloadRestoreRecord(this._currentDetailRecordId);
        }

        refreshLevelList() {
            this._loadLevels();
            this._renderMainMenu();
            this._renderDraftList();
        }

        updateLastOpHint() {
            this._restoreLastOperation();
            this._restoreUndoBar();
            this._restoreBatchUndoBar();
            this._restorePublishUndoBar();
            this._renderLastRestoreCard();
        }

        getDraftEditor() {
            return this.draftEditor;
        }

        showNotification(message, type) {
            if (this.infoPanel && this.infoPanel.showNotification) {
                this.infoPanel.showNotification(message, type);
            }
        }

        showError(message) {
            this.showNotification(message, 'error');
        }

        showPublishConflict(conflictData) {
        }

        closePublishConflict() {
        }

        showPublishRenameSection() {
        }

        destroy() {
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
            if (this.replayPlayer) {
                this.replayPlayer.destroy();
            }
            if (this.renderer) {
                this.renderer.destroy();
            }
        }
    }

    return {
        Controller
    };
})();
