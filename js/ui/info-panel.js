const InfoPanel = (function() {
    const { ORDER_STATUS, GAME_STATUS } = GameModels;

    class Panel {
        constructor(elements) {
            this.elements = elements;
            this.settings = Storage.loadSettings();
        }

        updateLevelInfo(level, currentTime, totalScore, maxCombo) {
            const timeRemaining = Math.max(0, level.timeLimit - currentTime);
            
            this.elements.currentLevel.textContent = `${level.name} (难度 ${level.difficulty})`;
            this.elements.timeRemaining.textContent = ScoringSystem.formatTime(timeRemaining);
            this.elements.currentScore.textContent = ScoringSystem.formatScore(totalScore);
            
            const comboMultiplier = 1 + Math.min(maxCombo, 5) * 0.2;
            this.elements.comboBonus.textContent = `x${comboMultiplier.toFixed(1)}`;

            if (timeRemaining < 30) {
                this.elements.timeRemaining.style.color = '#e53e3e';
            } else if (timeRemaining < 60) {
                this.elements.timeRemaining.style.color = '#ed8936';
            } else {
                this.elements.timeRemaining.style.color = '#667eea';
            }
        }

        updateResourceStatus(workers, carts) {
            const availableWorkers = workers.filter(w => w.status === 'IDLE').length;
            const busyWorkers = workers.filter(w => w.status !== 'IDLE').length;
            const usedCarts = carts.filter(c => c.inUse).length;
            const availableCarts = carts.length - usedCarts;

            this.elements.workersAvailable.textContent = availableWorkers;
            this.elements.workersBusy.textContent = busyWorkers;
            this.elements.cartsAvailable.textContent = availableCarts;
            this.elements.cartsUsed.textContent = usedCarts;

            this.elements.cartsAvailable.style.color = availableCarts > 0 ? '#48bb78' : '#e53e3e';
            this.elements.workersAvailable.style.color = availableWorkers > 0 ? '#48bb78' : '#e53e3e';
        }

        updateOrdersList(orders, currentTime) {
            const container = this.elements.ordersList;
            container.innerHTML = '';

            const sortedOrders = [...orders].sort((a, b) => {
                const statusOrder = {
                    [ORDER_STATUS.PENDING]: 0,
                    [ORDER_STATUS.IN_PROGRESS]: 1,
                    [ORDER_STATUS.COMPLETED]: 2,
                    [ORDER_STATUS.TIMEOUT]: 3
                };
                
                if (statusOrder[a.status] !== statusOrder[b.status]) {
                    return statusOrder[a.status] - statusOrder[b.status];
                }
                
                return a.deadline - b.deadline;
            });

            for (const order of sortedOrders) {
                const item = document.createElement('div');
                item.className = 'order-item';
                
                const isUrgent = order.isUrgent(currentTime);
                if (isUrgent) item.classList.add('urgent');
                if (order.status === ORDER_STATUS.IN_PROGRESS) item.classList.add('in-progress');
                if (order.status === ORDER_STATUS.COMPLETED || order.status === ORDER_STATUS.TIMEOUT) {
                    item.classList.add('completed');
                }

                const statusText = {
                    [ORDER_STATUS.PENDING]: '待处理',
                    [ORDER_STATUS.IN_PROGRESS]: '进行中',
                    [ORDER_STATUS.COMPLETED]: '已完成',
                    [ORDER_STATUS.TIMEOUT]: '已超时'
                };

                const deadlineDisplay = order.status === ORDER_STATUS.COMPLETED 
                    ? `✓ 已完成`
                    : order.status === ORDER_STATUS.TIMEOUT
                    ? `✗ 已超时`
                    : `⏱ ${ScoringSystem.formatTime(order.getRemainingTime(currentTime))}`;

                item.innerHTML = `
                    <div class="order-id">📦 ${order.id} - ${order.shelfId}</div>
                    <div class="order-info">
                        <span>${statusText[order.status]}</span>
                        <span class="order-deadline">${deadlineDisplay}</span>
                    </div>
                    <div class="order-info">
                        <span>📊 ${order.baseScore}分</span>
                        <span>${order.items.length}件商品</span>
                    </div>
                `;

                container.appendChild(item);
            }

            if (orders.length === 0) {
                container.innerHTML = '<div style="color: #a0aec0; text-align: center; padding: 20px;">暂无订单</div>';
            }
        }

        updateOccupiedRoutes(routes) {
            const container = this.elements.occupiedRoutes;
            container.innerHTML = '';

            if (routes.length === 0) {
                container.innerHTML = '<div style="color: #a0aec0; text-align: center; padding: 15px;">暂无占用路线</div>';
                return;
            }

            for (const route of routes) {
                const item = document.createElement('div');
                item.className = 'route-item';
                
                const pathPreview = route.path.length > 0 
                    ? `${route.path[0]} → ${route.path[route.path.length - 1]}`
                    : '已到达';

                item.innerHTML = `
                    <strong>${route.workerName}</strong> (${route.workerId})<br>
                    📦 订单: ${route.orderId}<br>
                    📍 位置: ${route.currentPosition}<br>
                    🛤️ 路径: ${pathPreview}<br>
                    剩余: ${route.path.length} 步
                `;

                container.appendChild(item);
            }
        }

        updateWorkerSelect(workers, selectedWorkerId = null) {
            const select = this.elements.workerSelect;
            select.innerHTML = '';

            for (const worker of workers) {
                const option = document.createElement('option');
                option.value = worker.id;
                option.disabled = worker.status !== 'IDLE';
                option.textContent = `${worker.name} (${worker.id}) ${worker.status !== 'IDLE' ? ' - 忙碌中' : ' - 空闲'}`;
                
                if (worker.id === selectedWorkerId) {
                    option.selected = true;
                }
                
                select.appendChild(option);
            }
        }

        updateOrderSelect(orders, currentTime, selectedOrderId = null) {
            const select = this.elements.orderSelect;
            select.innerHTML = '';

            const availableOrders = orders.filter(o => o.status === ORDER_STATUS.PENDING);
            
            if (availableOrders.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = '暂无可用订单';
                option.disabled = true;
                select.appendChild(option);
                return;
            }

            for (const order of availableOrders) {
                const option = document.createElement('option');
                option.value = order.id;
                
                const remainingTime = ScoringSystem.formatTime(order.getRemainingTime(currentTime));
                const isUrgent = order.isUrgent(currentTime);
                
                option.textContent = `${order.id} - ${order.shelfId} | ${remainingTime} | ${order.baseScore}分`;
                
                if (order.id === selectedOrderId) {
                    option.selected = true;
                }
                
                if (isUrgent) {
                    option.style.color = '#e53e3e';
                    option.style.fontWeight = 'bold';
                }
                
                select.appendChild(option);
            }
        }

        updatePauseButton(isPaused) {
            const btn = this.elements.pauseButton;
            if (isPaused) {
                btn.innerHTML = '▶️ 继续';
            } else {
                btn.innerHTML = '⏸️ 暂停';
            }
        }

        updateResult(result, level) {
            const titleEl = document.getElementById('result-title');
            const scoreEl = document.getElementById('result-score');
            const ordersEl = document.getElementById('result-orders');
            const comboEl = document.getElementById('result-combo');
            const timeoutsEl = document.getElementById('result-timeouts');
            const nextBtn = document.getElementById('btn-next-level');

            if (result.won) {
                titleEl.textContent = '🎉 关卡完成！';
                titleEl.className = 'success';
                nextBtn.style.display = 'inline-flex';
            } else {
                titleEl.textContent = '😢 挑战失败';
                titleEl.className = 'failure';
                nextBtn.style.display = 'none';
            }

            scoreEl.textContent = ScoringSystem.formatScore(result.totalScore);
            ordersEl.textContent = `${result.completedOrders} / ${level.orders.length}`;
            comboEl.textContent = result.maxCombo;
            timeoutsEl.textContent = result.timeoutOrders;

            const progress = Storage.loadProgress();
            const highScore = progress.highScores[level.id] || 0;
            if (result.won && result.totalScore > highScore) {
                scoreEl.innerHTML += ` <span style="font-size: 14px; color: #48bb78;">🏆 新纪录！</span>`;
            }
        }

        showNotification(message, type = 'info', duration = 3000) {
            const notification = this.elements.notification;
            notification.textContent = message;
            notification.className = `notification ${type}`;
            
            clearTimeout(this._notificationTimeout);
            
            setTimeout(() => {
                notification.classList.remove('hidden');
            }, 10);

            this._notificationTimeout = setTimeout(() => {
                notification.classList.add('hidden');
            }, duration);
        }

        showErrors(errors) {
            if (!errors || errors.length === 0) return;
            
            const message = errors.map(e => e.message).join('\n');
            this.showNotification(message, 'error', 5000);
        }

        updateSettingsUI() {
            document.getElementById('setting-speed').value = this.settings.gameSpeed;
            document.getElementById('speed-value').textContent = `${this.settings.gameSpeed.toFixed(1)}x`;
            document.getElementById('setting-sound').checked = this.settings.soundEnabled;
            document.getElementById('setting-autopause').checked = this.settings.autoPause;
            document.getElementById('setting-grid').checked = this.settings.showGrid;
        }

        getSettingsFromUI() {
            return {
                gameSpeed: parseFloat(document.getElementById('setting-speed').value),
                soundEnabled: document.getElementById('setting-sound').checked,
                autoPause: document.getElementById('setting-autopause').checked,
                showGrid: document.getElementById('setting-grid').checked
            };
        }

        saveSettings(settings) {
            this.settings = settings;
            Storage.saveSettings(settings);
        }

        applySettings(gameEngine, renderer) {
            if (gameEngine) {
                gameEngine.setGameSpeed(this.settings.gameSpeed);
            }
            if (renderer) {
                renderer.setShowGrid(this.settings.showGrid);
            }
        }
    }

    return {
        Panel
    };
})();
