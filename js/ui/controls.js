const UIController = (function() {
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
        }

        init() {
            this._loadLevels();
            this._bindEvents();
            this._renderMainMenu();
            
            const settings = Storage.loadSettings();
            this.infoPanel.updateSettingsUI();
            this.infoPanel.applySettings(this.game, this.renderer);
        }

        _loadLevels() {
            this.availableLevels = [
                LEVEL_1,
                LEVEL_2
            ];

            const customLevels = Storage.loadCustomLevels();
            for (const levelId in customLevels) {
                this.availableLevels.push(customLevels[levelId]);
            }

            this.availableLevels.sort((a, b) => a.difficulty - b.difficulty);
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

            document.getElementById('btn-export').addEventListener('click', () => this._openExport());
            document.getElementById('btn-close-export').addEventListener('click', () => this._closeExport());
            document.getElementById('btn-copy-export').addEventListener('click', () => this._copyExport());
            document.getElementById('export-level-select').addEventListener('change', (e) => this._updateExportText(e.target.value));

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
                
                const isCompleted = progress.completedLevels.includes(level.id);
                const isLocked = level.difficulty > 1 && !progress.completedLevels.some(id => {
                    const prevLevel = this.availableLevels.find(l => l.id === id);
                    return prevLevel && prevLevel.difficulty === level.difficulty - 1;
                });

                if (isCompleted) card.classList.add('completed');
                if (isLocked) card.classList.add('locked');

                const highScore = progress.highScores[level.id] || 0;
                const stars = highScore > 0 ? ScoringSystem.getStarRating(highScore, level.targetScore, 1) : 0;
                const starDisplay = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);

                card.innerHTML = `
                    <h3>${level.name} ${isLocked ? '🔒' : ''}</h3>
                    <div class="level-desc">${level.description}</div>
                    <div class="level-stats">
                        <span>难度: ${level.difficulty}</span>
                        <span>⏱ ${ScoringSystem.formatTime(level.timeLimit)}</span>
                        ${highScore > 0 ? `<span class="high-score">🏆 ${ScoringSystem.formatScore(highScore)}</span>` : ''}
                    </div>
                    <div style="margin-top: 10px; font-size: 18px;">${starDisplay}</div>
                `;

                if (!isLocked) {
                    card.addEventListener('click', () => this._startLevel(level.id));
                } else {
                    card.title = '完成前一关后解锁';
                }

                levelList.appendChild(card);
            }
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
            this._renderMainMenu();
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
            try {
                const levelData = JSON.parse(textarea.value);
                const level = GameModels.Level.fromJSON(levelData);
                
                const errors = level.validate();
                if (errors.length > 0) {
                    throw new Error(errors.join('; '));
                }

                if (this.availableLevels.some(l => l.id === level.id)) {
                    if (!confirm('该关卡ID已存在，是否覆盖？')) {
                        return;
                    }
                }

                Storage.saveCustomLevel(level.toJSON());
                this._loadLevels();
                this._renderMainMenu();
                this._closeImport();
                this.infoPanel.showNotification(`关卡 "${level.name}" 导入成功！`, 'success');

            } catch (e) {
                this.infoPanel.showNotification('导入失败: ' + e.message, 'error');
            }
        }

        _openExport() {
            const select = document.getElementById('export-level-select');
            select.innerHTML = '';

            for (const level of this.availableLevels) {
                const option = document.createElement('option');
                option.value = level.id;
                option.textContent = `${level.name} (${level.id})`;
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
            if (level) {
                const levelObj = GameModels.Level.fromJSON(level);
                document.getElementById('export-textarea').value = JSON.stringify(levelObj.toJSON(), null, 2);
            }
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
