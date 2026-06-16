const GameEngine = (function() {
    const { 
        GAME_STATUS, ORDER_STATUS, WORKER_STATUS, 
        Position, Worker, Cart, Operation, Level 
    } = GameModels;

    const WORKER_NAMES = ['小明', '小红', '小刚', '小丽', '大壮'];

    class Engine {
        constructor() {
            this.level = null;
            this.workers = [];
            this.carts = [];
            this.map = null;
            this.status = GAME_STATUS.NOT_STARTED;
            this.currentTime = 0;
            this.totalScore = 0;
            this.gameSpeed = 1;
            this.lastUpdate = 0;
            this.operations = [];
            this.listeners = {};
            this.pickTimers = new Map();
            this.packTimers = new Map();
        }

        initLevel(levelConfig) {
            this.level = levelConfig instanceof Level ? levelConfig : new Level(levelConfig);
            
            const validationErrors = this.level.validate();
            if (validationErrors.length > 0) {
                throw new Error('关卡验证失败: ' + validationErrors.join('; '));
            }

            this.map = this.level.warehouseMap;
            this._initializeWorkers();
            this._initializeCarts();
            this._resetGameState();
            
            this.emit('levelInitialized', { level: this.level });
        }

        _initializeWorkers() {
            this.workers = [];
            const spawnPositions = this.map.spawnPositions;
            
            for (let i = 0; i < this.level.workerCount; i++) {
                const spawnPos = spawnPositions[i % spawnPositions.length];
                const worker = new Worker(
                    `W${i + 1}`,
                    WORKER_NAMES[i % WORKER_NAMES.length],
                    spawnPos
                );
                this.workers.push(worker);
                this.map.setPositionOccupied(spawnPos, worker.id);
            }
        }

        _initializeCarts() {
            this.carts = [];
            const spawnPositions = this.map.spawnPositions;
            
            for (let i = 0; i < this.level.cartCount; i++) {
                const spawnPos = spawnPositions[(i + this.level.workerCount) % spawnPositions.length];
                const cart = new Cart(`C${i + 1}`, spawnPos);
                this.carts.push(cart);
            }
        }

        _resetGameState() {
            this.status = GAME_STATUS.NOT_STARTED;
            this.currentTime = 0;
            this.totalScore = 0;
            this.operations = [];
            this.pickTimers.clear();
            this.packTimers.clear();

            const spawnPositions = this.map.spawnPositions;
            for (let i = 0; i < this.workers.length; i++) {
                const spawnPos = spawnPositions[i % spawnPositions.length];
                this.map.clearPositionOccupied(this.workers[i].position);
                this.workers[i].reset(spawnPos);
                this.map.setPositionOccupied(spawnPos, this.workers[i].id);
            }

            for (const cart of this.carts) {
                cart.release();
            }
        }

        start() {
            if (this.status !== GAME_STATUS.NOT_STARTED && this.status !== GAME_STATUS.PAUSED) {
                throw new Error('游戏已在运行中');
            }

            if (this.status === GAME_STATUS.NOT_STARTED) {
                this._resetGameState();
                this.level.orders.forEach(o => {
                    o.status = ORDER_STATUS.PENDING;
                    o.assignedWorker = null;
                    o.pickStartTime = null;
                    o.completeTime = null;
                });
            }

            this.status = GAME_STATUS.PLAYING;
            this.lastUpdate = Date.now();
            this.emit('gameStarted', { currentTime: this.currentTime });
        }

        pause() {
            if (this.status !== GAME_STATUS.PLAYING) return;
            this.status = GAME_STATUS.PAUSED;
            this.emit('gamePaused', { currentTime: this.currentTime });
        }

        resume() {
            if (this.status !== GAME_STATUS.PAUSED) return;
            this.status = GAME_STATUS.PLAYING;
            this.lastUpdate = Date.now();
            this.emit('gameResumed', { currentTime: this.currentTime });
        }

        reset() {
            this._resetGameState();
            this.level.orders.forEach(o => {
                o.status = ORDER_STATUS.PENDING;
                o.assignedWorker = null;
                o.pickStartTime = null;
                o.completeTime = null;
            });
            this.emit('gameReset');
        }

        update() {
            if (this.status !== GAME_STATUS.PLAYING) return;

            const now = Date.now();
            const deltaTime = (now - this.lastUpdate) / 1000 * this.gameSpeed;
            this.lastUpdate = now;

            this.currentTime += deltaTime;

            if (this.currentTime >= this.level.timeLimit) {
                this._endGame(false, '时间已到');
                return;
            }

            this._checkTimeouts();
            this._updateWorkers(deltaTime);
            this._checkGameEnd();
            this.emit('tick', { currentTime: this.currentTime, deltaTime });
        }

        _checkTimeouts() {
            for (const order of this.level.orders) {
                if (order.status === ORDER_STATUS.PENDING && 
                    order.getRemainingTime(this.currentTime) <= 0) {
                    order.markTimeout();
                    this.operations.push(Operation.timeout(order.id, this.currentTime));
                    this.emit('orderTimeout', { order });
                }
            }
        }

        _updateWorkers(deltaTime) {
            for (const worker of this.workers) {
                if (worker.status === WORKER_STATUS.MOVING || worker.status === WORKER_STATUS.RETURNING) {
                    this._updateWorkerMovement(worker, deltaTime);
                } else if (worker.status === WORKER_STATUS.PICKING) {
                    this._updatePicking(worker, deltaTime);
                } else if (worker.status === WORKER_STATUS.PACKING) {
                    this._updatePacking(worker, deltaTime);
                }
            }
        }

        _updateWorkerMovement(worker, deltaTime) {
            if (worker.path.length === 0 || worker.pathIndex >= worker.path.length) {
                this._handleWorkerArrival(worker);
                return;
            }

            const moveSpeed = worker.moveSpeed * deltaTime * 2;

            while (moveSpeed > 0 && worker.pathIndex < worker.path.length) {
                const targetPos = worker.path[worker.pathIndex];
                const distance = worker.position.distanceTo(targetPos);

                if (distance <= moveSpeed) {
                    this.map.clearPositionOccupied(worker.position);
                    worker.position = targetPos.clone();
                    this.map.setPositionOccupied(worker.position, worker.id);
                    
                    this.operations.push(Operation.move(
                        worker.id,
                        worker.path[Math.max(0, worker.pathIndex - 1)] || worker.position,
                        targetPos,
                        this.currentTime
                    ));
                    
                    worker.pathIndex++;
                    
                    if (worker.hasCart && worker.cartId) {
                        const cart = this.carts.find(c => c.id === worker.cartId);
                        if (cart) {
                            cart.position = worker.position.clone();
                        }
                    }
                } else {
                    break;
                }
            }

            if (worker.pathIndex >= worker.path.length) {
                this._handleWorkerArrival(worker);
            }
        }

        _handleWorkerArrival(worker) {
            if (worker.status === WORKER_STATUS.MOVING) {
                const order = worker.currentOrder;
                
                if (worker._isMovingToPacking && worker.targetPosition && worker.position.equals(worker.targetPosition)) {
                    worker._isMovingToPacking = false;
                    worker.startPacking();
                    this.operations.push(Operation.pack(worker.id, order.id, this.currentTime));
                    
                    this.packTimers.set(worker.id, {
                        startTime: this.currentTime,
                        duration: this.level.packDuration,
                        orderId: order.id
                    });
                    
                    this.emit('workerPacking', { worker, order });
                } else {
                    const shelfPos = this.map.getShelfPosition(order.shelfId);
                    if (shelfPos && worker.position.equals(shelfPos)) {
                        worker.startPicking();
                        this.pickTimers.set(worker.id, {
                            startTime: this.currentTime,
                            duration: this.level.pickDuration
                        });
                        this.operations.push(Operation.pick(worker.id, order.id, this.currentTime));
                        this.emit('workerPicking', { worker, order });
                    }
                }
            } else if (worker.status === WORKER_STATUS.RETURNING) {
                this.map.clearPositionOccupied(worker.position);
                const spawnPos = this.map.getRandomSpawnPosition();
                worker.position = spawnPos.clone();
                this.map.setPositionOccupied(worker.position, worker.id);
                
                if (worker.hasCart && worker.cartId) {
                    const cart = this.carts.find(c => c.id === worker.cartId);
                    if (cart) {
                        cart.release();
                        cart.position = spawnPos.clone();
                    }
                }

                worker.hasCart = false;
                worker.cartId = null;
                worker.status = WORKER_STATUS.IDLE;
                worker.path = [];
                worker.pathIndex = 0;
                
                this.emit('workerIdle', { worker });
            }
        }

        _updatePicking(worker, deltaTime) {
            const timer = this.pickTimers.get(worker.id);
            if (!timer) return;

            timer.elapsed = (timer.elapsed || 0) + deltaTime;

            if (timer.elapsed >= timer.duration) {
                this._finishPicking(worker);
            }
        }

        _finishPicking(worker) {
            const order = worker.currentOrder;
            this.pickTimers.delete(worker.id);

            const packingPos = this.map.getNearestPackingPosition(worker.position);
            const pathToPacking = this.map.findPath(worker.position, packingPos, {
                avoidOccupied: true
            });

            if (!pathToPacking) {
                this._endGame(false, `无法找到到打包台的路径`);
                return;
            }

            worker.path = pathToPacking;
            worker.pathIndex = 0;
            worker.status = WORKER_STATUS.MOVING;
            worker.targetPosition = packingPos;
            worker._isMovingToPacking = true;
            
            this.emit('workerMovingToPacking', { worker, order });
        }

        _updatePacking(worker, deltaTime) {
            const timer = this.packTimers.get(worker.id);
            if (!timer) return;

            timer.elapsed = (timer.elapsed || 0) + deltaTime;

            if (timer.elapsed >= timer.duration) {
                this._finishPacking(worker, timer.orderId);
            }
        }

        _finishPacking(worker, orderId) {
            const order = this.level.orders.find(o => o.id === orderId);
            if (!order) return;

            this.packTimers.delete(worker.id);

            order.complete(this.currentTime);
            
            const score = ScoringSystem.calculateOrderScore(order, worker, this.currentTime);
            this.totalScore += score;

            worker.incrementCombo();
            worker.lastOrderTime = this.currentTime;

            this.operations.push(Operation.complete(worker.id, orderId, score, this.currentTime));

            this.emit('orderCompleted', { worker, order, score });

            const returnPath = this.map.findPath(
                worker.position,
                this.map.getRandomSpawnPosition(),
                { avoidOccupied: true }
            );

            if (returnPath) {
                worker.startReturning(returnPath);
            } else {
                worker.status = WORKER_STATUS.IDLE;
                worker.currentOrder = null;
            }
        }

        dispatchWorker(workerId, orderId, useCart = true) {
            if (this.status !== GAME_STATUS.PLAYING) {
                return { success: false, errors: [{ message: '游戏未在进行中' }] };
            }

            const gameState = {
                level: this.level,
                workers: this.workers,
                carts: this.carts,
                currentTime: this.currentTime,
                map: this.map
            };

            const validationErrors = CollisionDetector.validateDispatch(
                gameState, workerId, orderId, useCart
            );

            if (validationErrors.length > 0) {
                this.operations.push(Operation.error(
                    validationErrors.map(e => e.message).join('; '),
                    this.currentTime
                ));
                return { success: false, errors: validationErrors };
            }

            const worker = this.workers.find(w => w.id === workerId);
            const order = this.level.orders.find(o => o.id === orderId);

            const shelfPos = this.map.getShelfPosition(order.shelfId);
            const pathToShelf = this.map.findPath(worker.position, shelfPos, {
                avoidOccupied: true
            });

            if (!pathToShelf) {
                return { 
                    success: false, 
                    errors: [{ message: `无法找到从 ${worker.position} 到货架 ${order.shelfId} 的路径` }] 
                };
            }

            let cartId = null;
            if (useCart) {
                const availableCart = this.carts.find(c => !c.inUse);
                if (availableCart) {
                    cartId = availableCart.id;
                    availableCart.assign(workerId);
                }
            }

            order.assignWorker(workerId, this.currentTime);
            worker.startOrder(order, pathToShelf, useCart, cartId);

            this.operations.push(Operation.dispatch(workerId, orderId, useCart, this.currentTime));
            this.emit('workerDispatched', { worker, order, useCart, cartId });

            return { success: true };
        }

        _checkGameEnd() {
            const allOrdersProcessed = this.level.orders.every(
                o => o.status === ORDER_STATUS.COMPLETED || o.status === ORDER_STATUS.TIMEOUT
            );

            const allWorkersIdle = this.workers.every(w => w.status === 'idle');

            if (allOrdersProcessed && allWorkersIdle) {
                const passed = ScoringSystem.isLevelPassed(this.level.orders, this.level);
                this._endGame(passed, passed ? '所有订单已完成' : '有订单超时');
            }
        }

        _endGame(won, reason) {
            this.status = won ? GAME_STATUS.WON : GAME_STATUS.LOST;
            
            const finalStats = ScoringSystem.calculateLevelScore(
                this.level.orders,
                this.workers,
                this.currentTime,
                this.level
            );

            const result = {
                won,
                reason,
                ...finalStats,
                operations: [...this.operations]
            };

            Storage.saveOperationHistory(this.level.id, this.operations);
            
            if (!won) {
                Storage.saveLastReplay({
                    levelId: this.level.id,
                    levelConfig: this.level.toJSON(),
                    operations: [...this.operations],
                    finalStats,
                    reason,
                    timestamp: Date.now()
                });
            }

            this.emit('gameEnded', result);
        }

        getGameState() {
            return {
                level: this.level,
                workers: this.workers,
                carts: this.carts,
                map: this.map,
                status: this.status,
                currentTime: this.currentTime,
                totalScore: this.totalScore,
                operations: [...this.operations]
            };
        }

        getOccupiedRoutes() {
            const routes = [];
            for (const worker of this.workers) {
                if (worker.status !== 'idle' && worker.path.length > 0) {
                    routes.push({
                        workerId: worker.id,
                        workerName: worker.name,
                        path: worker.path.slice(worker.pathIndex),
                        currentPosition: worker.position.clone(),
                        orderId: worker.currentOrder?.id
                    });
                }
            }
            return routes;
        }

        setGameSpeed(speed) {
            this.gameSpeed = Math.max(0.5, Math.min(3, speed));
            this.emit('speedChanged', { speed: this.gameSpeed });
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
    }

    return {
        Engine
    };
})();
