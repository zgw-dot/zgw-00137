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
        }

        init() {
            this._loadLevels();
            this._bindEvents();
            this._renderMainMenu();
            this._restoreLastOperation();
            this._restoreUndoBar();
            this._restoreBatchUndoBar();

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

            document.getElementById('btn-batch-overwrite').addEventListener('click', () => this._batchSetDecision('overwrite'));
            document.getElementById('btn-batch-skip').addEventListener('click', () => this._batchSetDecision('skip'));
            document.getElementById('btn-batch-saveas').addEventListener('click', () => this._batchSetDecision('save_as_new'));

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
                undo_delete: '↩️ 撤销删除'
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
            this._restoreLastOperation();
            this._restoreUndoBar();
            this._restoreBatchUndoBar();
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
                this._restoreUndoBar();
                this._restoreBatchUndoBar();
                this._restoreLastOperation();
                this.infoPanel.showNotification('已撤销批量恢复', 'success');
            } else {
                const reasons = {
                    no_undo_snapshot: '没有可撤销的批量恢复',
                    invalid_snapshot: '撤销数据无效',
                    error: '撤销失败'
                };
                this.infoPanel.showNotification(reasons[result.reason] || '撤销失败', 'error');
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
            for (let i = 0; i < allLevels.length; i++) {
                const entry = allLevels[i];
                if (entry && entry.id && !Storage.isBuiltinLevelId(entry.id)) {
                    const existingLevels = Storage.loadCustomLevels();
                    if (existingLevels[entry.id]) {
                        this._restoreDecisions[i] = { action: 'skip' };
                    } else {
                        this._restoreDecisions[i] = { action: 'import' };
                    }
                }
            }

            this._renderPrecheckResult();
            document.getElementById('restore-precheck-result').classList.remove('hidden');
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
                builtinList.innerHTML = result.builtinConflict.map(item => `
                    <div class="precheck-item precheck-item-builtin">
                        <div class="precheck-item-info">
                            <span class="precheck-item-name">🚫 ${item.name}</span>
                            <span class="precheck-item-id">(${item.id})</span>
                        </div>
                        <div class="precheck-item-action">
                            <span class="action-label action-disabled">无法导入（内置ID）</span>
                        </div>
                    </div>
                `).join('');
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
                if (entry && entry.id && !Storage.isBuiltinLevelId(entry.id)) {
                    const existingLevels = Storage.loadCustomLevels();
                    if (existingLevels[entry.id]) {
                        decisions[i] = this._restoreDecisions[i] || { action: 'skip' };
                    } else {
                        decisions[i] = this._restoreDecisions[i] || { action: 'import' };
                    }
                } else {
                    decisions[i] = { action: 'skip' };
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

            this._showRestoreResult(result);
        }

        _showRestoreResult(result) {
            const summary = document.getElementById('restore-result-summary');
            summary.innerHTML = `
                <div class="result-stat-row">
                    <span class="result-stat-label">处理总数：</span>
                    <span class="result-stat-value">${result.importedCount + result.skippedCount + result.failedCount} 个</span>
                </div>
                <div class="result-stat-row">
                    <span class="result-stat-label">成功导入：</span>
                    <span class="result-stat-value result-success">${result.importedCount} 个</span>
                </div>
                <div class="result-stat-row">
                    <span class="result-stat-label">跳过：</span>
                    <span class="result-stat-value result-skip">${result.skippedCount} 个</span>
                </div>
                <div class="result-stat-row">
                    <span class="result-stat-label">失败：</span>
                    <span class="result-stat-value result-fail">${result.failedCount} 个</span>
                </div>
            `;

            const details = document.getElementById('restore-result-details');
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

            details.innerHTML += '<p class="restore-hint">💡 本次批量恢复可在主菜单撤销一次。</p>';

            document.getElementById('restore-result-modal').classList.add('active');
        }

        _closeRestoreResult() {
            document.getElementById('restore-result-modal').classList.remove('active');
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
