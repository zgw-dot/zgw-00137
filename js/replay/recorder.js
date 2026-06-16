const ReplaySystem = (function() {
    const { GAME_STATUS, Position, Level, Operation } = GameModels;

    class ReplayPlayer {
        constructor() {
            this.engine = null;
            this.operations = [];
            this.currentOperationIndex = 0;
            this.isPlaying = false;
            this.isPaused = false;
            this.playbackSpeed = 1;
            this.lastTimestamp = 0;
            this.accumulatedTime = 0;
            this.listeners = {};
            this.replayData = null;
            this.renderer = null;
            this.infoPanel = null;
            this.animationFrameId = null;
            this.logContainer = null;
            this.infoContainer = null;
        }

        loadReplay(replayData) {
            this.replayData = replayData;
            this.operations = replayData.operations || [];
            this.currentOperationIndex = 0;
            this.accumulatedTime = 0;
            this.isPlaying = false;
            this.isPaused = false;

            this.engine = new GameEngine.Engine();
            this.engine.initLevel(replayData.levelConfig);
            this.engine.setGameSpeed(this.playbackSpeed);

            this.engine.on('tick', (data) => {
                this._render();
                this.emit('tick', data);
            });

            this.engine.on('workerDispatched', (data) => {
                this._addLogEntry(`派遣 ${data.worker.name} 处理订单 ${data.order.id}`, 'info');
            });

            this.engine.on('orderCompleted', (data) => {
                this._addLogEntry(`订单 ${data.order.id} 完成，得分 ${data.score}`, 'success');
            });

            this.engine.on('orderTimeout', (data) => {
                this._addLogEntry(`订单 ${data.order.id} 超时`, 'error');
            });

            this.engine.on('gameEnded', (data) => {
                this.stop();
                this._addLogEntry(`游戏结束: ${data.reason}，最终得分 ${data.totalScore}`, data.won ? 'success' : 'error');
                this.emit('replayEnded', data);
            });

            this.emit('replayLoaded', { levelId: replayData.levelId });
        }

        setRenderer(renderer) {
            this.renderer = renderer;
        }

        setInfoPanel(infoPanel) {
            this.infoPanel = infoPanel;
        }

        setLogContainer(container) {
            this.logContainer = container;
        }

        setInfoContainer(container) {
            this.infoContainer = container;
        }

        play() {
            if (!this.replayData) {
                throw new Error('没有加载回放数据');
            }

            if (this.isPaused) {
                this.isPaused = false;
                this.lastTimestamp = Date.now();
                this._gameLoop();
                this.emit('resumed');
                return;
            }

            this.currentOperationIndex = 0;
            this.accumulatedTime = 0;
            this.isPlaying = true;
            this.isPaused = false;
            this.lastTimestamp = Date.now();

            if (this.logContainer) {
                this.logContainer.innerHTML = '';
            }

            this.engine = new GameEngine.Engine();
            this.engine.initLevel(this.replayData.levelConfig);
            this.engine.setGameSpeed(this.playbackSpeed);
            this.engine.start();

            this._addLogEntry(`开始回放关卡: ${this.replayData.levelConfig.name}`, 'info');
            this._updateInfo();

            this._gameLoop();
            this.emit('started');
        }

        pause() {
            this.isPaused = true;
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
            this.emit('paused');
        }

        stop() {
            this.isPlaying = false;
            this.isPaused = false;
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
            this.emit('stopped');
        }

        setSpeed(speed) {
            this.playbackSpeed = Math.max(0.5, Math.min(4, speed));
            if (this.engine) {
                this.engine.setGameSpeed(this.playbackSpeed);
            }
            this.emit('speedChanged', { speed: this.playbackSpeed });
        }

        _gameLoop() {
            if (!this.isPlaying || this.isPaused) return;

            const now = Date.now();
            const delta = (now - this.lastTimestamp) / 1000;
            this.lastTimestamp = now;

            this.accumulatedTime += delta * this.playbackSpeed;

            while (this.currentOperationIndex < this.operations.length) {
                const op = this.operations[this.currentOperationIndex];
                if (op.timestamp <= this.accumulatedTime) {
                    this._executeOperation(op);
                    this.currentOperationIndex++;
                } else {
                    break;
                }
            }

            this.engine.update();
            this._updateInfo();

            if (this.engine.status !== GAME_STATUS.WON && 
                this.engine.status !== GAME_STATUS.LOST &&
                this.isPlaying && !this.isPaused) {
                this.animationFrameId = requestAnimationFrame(() => this._gameLoop());
            }
        }

        _executeOperation(operation) {
            switch (operation.type) {
                case 'DISPATCH':
                    this.engine.dispatchWorker(
                        operation.data.workerId,
                        operation.data.orderId,
                        operation.data.useCart
                    );
                    break;
                case 'ERROR':
                    this._addLogEntry(`错误: ${operation.data.message}`, 'error');
                    break;
            }
        }

        _render() {
            if (this.renderer && this.engine) {
                this.renderer.render(this.engine.getGameState());
            }
        }

        _updateInfo() {
            if (!this.infoContainer || !this.engine) return;

            const state = this.engine.getGameState();
            const timeRemaining = Math.max(0, state.level.timeLimit - state.currentTime);
            
            this.infoContainer.innerHTML = `
                <div class="info-row"><span>当前时间：</span><span class="highlight">${ScoringSystem.formatTime(state.currentTime)}</span></div>
                <div class="info-row"><span>剩余时间：</span><span class="highlight">${ScoringSystem.formatTime(timeRemaining)}</span></div>
                <div class="info-row"><span>当前得分：</span><span class="highlight">${ScoringSystem.formatScore(state.totalScore)}</span></div>
                <div class="info-row"><span>操作进度：</span><span class="highlight">${this.currentOperationIndex} / ${this.operations.length}</span></div>
            `;
        }

        _addLogEntry(message, type = 'info') {
            if (!this.logContainer) return;

            const entry = document.createElement('div');
            entry.className = `log-entry ${type}`;
            const time = this.accumulatedTime.toFixed(1);
            entry.textContent = `[${time}s] ${message}`;
            this.logContainer.appendChild(entry);
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }

        hasReplayData() {
            return this.replayData !== null;
        }

        getReplayInfo() {
            if (!this.replayData) return null;
            return {
                levelId: this.replayData.levelId,
                levelName: this.replayData.levelConfig?.name,
                reason: this.replayData.reason,
                finalScore: this.replayData.finalStats?.totalScore,
                timestamp: this.replayData.timestamp,
                operationCount: this.operations.length
            };
        }

        on(event, callback) {
            if (!this.listeners[event]) {
                this.listeners[event] = [];
            }
            this.listeners[event].push(callback);
        }

        off(event, callback) {
            if (this.listeners[event]) {
                this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
            }
        }

        emit(event, data) {
            if (this.listeners[event]) {
                this.listeners[event].forEach(callback => callback(data));
            }
        }

        destroy() {
            this.stop();
            this.listeners = {};
            this.engine = null;
            this.replayData = null;
        }
    }

    return {
        ReplayPlayer
    };
})();
