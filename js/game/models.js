const GameModels = (function() {
    const CELL_TYPES = {
        EMPTY: 'empty',
        SHELF: 'shelf',
        AISLE: 'aisle',
        PACKING: 'packing',
        SPAWN: 'spawn'
    };

    const DIRECTIONS = {
        UP: 'up',
        DOWN: 'down',
        LEFT: 'left',
        RIGHT: 'right',
        BIDIRECTIONAL: 'bidirectional'
    };

    const ORDER_STATUS = {
        PENDING: 'pending',
        IN_PROGRESS: 'in_progress',
        COMPLETED: 'completed',
        TIMEOUT: 'timeout'
    };

    const WORKER_STATUS = {
        IDLE: 'idle',
        MOVING: 'moving',
        PICKING: 'picking',
        PACKING: 'packing',
        RETURNING: 'returning'
    };

    const GAME_STATUS = {
        NOT_STARTED: 'not_started',
        PLAYING: 'playing',
        PAUSED: 'paused',
        WON: 'won',
        LOST: 'lost'
    };

    class Position {
        constructor(x, y) {
            this.x = x;
            this.y = y;
        }

        equals(other) {
            return other && this.x === other.x && this.y === other.y;
        }

        clone() {
            return new Position(this.x, this.y);
        }

        toString() {
            return `(${this.x}, ${this.y})`;
        }

        distanceTo(other) {
            return Math.abs(this.x - other.x) + Math.abs(this.y - other.y);
        }
    }

    class Cell {
        constructor(type, x, y, options = {}) {
            this.type = type;
            this.x = x;
            this.y = y;
            this.oneWay = options.oneWay || null;
            this.shelfId = options.shelfId || null;
            this.occupiedBy = null;
        }

        isPassable() {
            return this.type === CELL_TYPES.AISLE || 
                   this.type === CELL_TYPES.PACKING || 
                   this.type === CELL_TYPES.SPAWN ||
                   this.type === CELL_TYPES.SHELF;
        }

        isOneWay() {
            return this.oneWay !== null && this.oneWay !== DIRECTIONS.BIDIRECTIONAL;
        }

        canEnter(fromDirection) {
            if (!this.isPassable()) return false;
            if (!this.isOneWay()) return true;
            
            const allowedDirections = {
                [DIRECTIONS.UP]: ['down'],
                [DIRECTIONS.DOWN]: ['up'],
                [DIRECTIONS.LEFT]: ['right'],
                [DIRECTIONS.RIGHT]: ['left']
            };
            
            return allowedDirections[this.oneWay]?.includes(fromDirection) ?? true;
        }

        canExit(toDirection) {
            if (!this.isOneWay()) return true;
            return this.oneWay === toDirection;
        }
    }

    class Order {
        constructor(id, shelfId, deadline, items = []) {
            this.id = id;
            this.shelfId = shelfId;
            this.deadline = deadline;
            this.items = items;
            this.status = ORDER_STATUS.PENDING;
            this.assignedWorker = null;
            this.pickStartTime = null;
            this.completeTime = null;
            this.baseScore = 100 + items.length * 20;
        }

        getRemainingTime(currentTime) {
            return Math.max(0, this.deadline - currentTime);
        }

        isUrgent(currentTime, threshold = 30) {
            return this.status === ORDER_STATUS.PENDING && 
                   this.getRemainingTime(currentTime) <= threshold;
        }

        assignWorker(workerId, currentTime) {
            this.assignedWorker = workerId;
            this.status = ORDER_STATUS.IN_PROGRESS;
            this.pickStartTime = currentTime;
        }

        complete(currentTime) {
            this.status = ORDER_STATUS.COMPLETED;
            this.completeTime = currentTime;
        }

        markTimeout() {
            this.status = ORDER_STATUS.TIMEOUT;
        }
    }

    class Worker {
        constructor(id, name, spawnPosition) {
            this.id = id;
            this.name = name;
            this.position = spawnPosition.clone();
            this.targetPosition = null;
            this.status = WORKER_STATUS.IDLE;
            this.currentOrder = null;
            this.hasCart = false;
            this.cartId = null;
            this.path = [];
            this.pathIndex = 0;
            this.lastOrderTime = 0;
            this.consecutiveOrders = 0;
            this.moveSpeed = 1;
            this._isMovingToPacking = false;
        }

        isIdle() {
            return this.status === WORKER_STATUS.IDLE;
        }

        isBusy() {
            return !this.isIdle();
        }

        startOrder(order, path, useCart, cartId = null) {
            this.currentOrder = order;
            this.path = path;
            this.pathIndex = 0;
            this.hasCart = useCart;
            this.cartId = useCart ? cartId : null;
            this.status = WORKER_STATUS.MOVING;
            this._isMovingToPacking = false;
        }

        startPicking() {
            this.status = WORKER_STATUS.PICKING;
        }

        startPacking() {
            this.status = WORKER_STATUS.PACKING;
        }

        startReturning(path) {
            this.path = path;
            this.pathIndex = 0;
            this.status = WORKER_STATUS.RETURNING;
        }

        reset(spawnPosition) {
            this.position = spawnPosition.clone();
            this.targetPosition = null;
            this.status = WORKER_STATUS.IDLE;
            this.currentOrder = null;
            this.hasCart = false;
            this.cartId = null;
            this.path = [];
            this.pathIndex = 0;
            this._isMovingToPacking = false;
        }

        getComboMultiplier() {
            return 1 + Math.min(this.consecutiveOrders, 5) * 0.2;
        }

        incrementCombo() {
            this.consecutiveOrders++;
        }

        resetCombo() {
            this.consecutiveOrders = 0;
        }
    }

    class Cart {
        constructor(id, spawnPosition) {
            this.id = id;
            this.position = spawnPosition.clone();
            this.assignedWorker = null;
            this.inUse = false;
        }

        assign(workerId) {
            this.assignedWorker = workerId;
            this.inUse = true;
        }

        release() {
            this.assignedWorker = null;
            this.inUse = false;
        }
    }

    class WarehouseMap {
        constructor(width, height) {
            this.width = width;
            this.height = height;
            this.cells = [];
            this.shelfPositions = {};
            this.packingPositions = [];
            this.spawnPositions = [];
            this._initializeGrid();
        }

        _initializeGrid() {
            for (let y = 0; y < this.height; y++) {
                this.cells[y] = [];
                for (let x = 0; x < this.width; x++) {
                    this.cells[y][x] = new Cell(CELL_TYPES.EMPTY, x, y);
                }
            }
        }

        setCell(x, y, type, options = {}) {
            if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
                throw new Error(`Cell position (${x}, ${y}) out of bounds`);
            }
            this.cells[y][x] = new Cell(type, x, y, options);
            
            if (type === CELL_TYPES.SHELF && options.shelfId) {
                this.shelfPositions[options.shelfId] = new Position(x, y);
            }
            if (type === CELL_TYPES.PACKING) {
                this.packingPositions.push(new Position(x, y));
            }
            if (type === CELL_TYPES.SPAWN) {
                this.spawnPositions.push(new Position(x, y));
            }
        }

        getCell(x, y) {
            if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
                return null;
            }
            return this.cells[y][x];
        }

        getCellAt(position) {
            return this.getCell(position.x, position.y);
        }

        getShelfPosition(shelfId) {
            return this.shelfPositions[shelfId] || null;
        }

        getRandomSpawnPosition() {
            if (this.spawnPositions.length === 0) {
                throw new Error('No spawn positions defined');
            }
            return this.spawnPositions[Math.floor(Math.random() * this.spawnPositions.length)];
        }

        getNearestPackingPosition(from) {
            if (this.packingPositions.length === 0) {
                throw new Error('No packing positions defined');
            }
            let nearest = this.packingPositions[0];
            let minDist = from.distanceTo(nearest);
            
            for (const pos of this.packingPositions.slice(1)) {
                const dist = from.distanceTo(pos);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = pos;
                }
            }
            return nearest;
        }

        isPositionOccupied(position) {
            const cell = this.getCellAt(position);
            return cell && cell.occupiedBy !== null;
        }

        setPositionOccupied(position, workerId) {
            const cell = this.getCellAt(position);
            if (cell) {
                cell.occupiedBy = workerId;
            }
        }

        clearPositionOccupied(position) {
            const cell = this.getCellAt(position);
            if (cell) {
                cell.occupiedBy = null;
            }
        }

        findPath(start, end, options = {}) {
            const {
                avoidOccupied = true,
                occupiedPositions = new Set(),
                maxIterations = 1000
            } = options;

            const key = (p) => `${p.x},${p.y}`;
            const heuristic = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

            const openSet = [start.clone()];
            const cameFrom = new Map();
            const gScore = new Map();
            const fScore = new Map();

            gScore.set(key(start), 0);
            fScore.set(key(start), heuristic(start, end));

            const directions = [
                { dx: 0, dy: -1, dir: DIRECTIONS.UP },
                { dx: 0, dy: 1, dir: DIRECTIONS.DOWN },
                { dx: -1, dy: 0, dir: DIRECTIONS.LEFT },
                { dx: 1, dy: 0, dir: DIRECTIONS.RIGHT }
            ];

            let iterations = 0;

            while (openSet.length > 0 && iterations < maxIterations) {
                iterations++;
                
                let currentIndex = 0;
                for (let i = 1; i < openSet.length; i++) {
                    if ((fScore.get(key(openSet[i])) ?? Infinity) < 
                        (fScore.get(key(openSet[currentIndex])) ?? Infinity)) {
                        currentIndex = i;
                    }
                }

                const current = openSet[currentIndex];

                if (current.equals(end)) {
                    const path = [];
                    let node = current;
                    while (node) {
                        path.unshift(node.clone());
                        node = cameFrom.get(key(node));
                    }
                    return path;
                }

                openSet.splice(currentIndex, 1);

                const currentCell = this.getCellAt(current);
                if (!currentCell) continue;

                for (const { dx, dy, dir } of directions) {
                    if (!currentCell.canExit(dir)) continue;

                    const neighbor = new Position(current.x + dx, current.y + dy);
                    const neighborCell = this.getCellAt(neighbor);

                    if (!neighborCell) continue;
                    if (!neighborCell.isPassable()) continue;
                    if (!neighborCell.canEnter(dir)) continue;

                    if (avoidOccupied) {
                        if (this.isPositionOccupied(neighbor) && !neighbor.equals(end)) continue;
                        if (occupiedPositions.has(key(neighbor)) && !neighbor.equals(end)) continue;
                    }

                    const tentativeG = (gScore.get(key(current)) ?? Infinity) + 1;

                    if (tentativeG < (gScore.get(key(neighbor)) ?? Infinity)) {
                        cameFrom.set(key(neighbor), current);
                        gScore.set(key(neighbor), tentativeG);
                        fScore.set(key(neighbor), tentativeG + heuristic(neighbor, end));

                        if (!openSet.some(p => p.equals(neighbor))) {
                            openSet.push(neighbor);
                        }
                    }
                }
            }

            return null;
        }

        validateLevel() {
            const errors = [];

            if (this.spawnPositions.length === 0) {
                errors.push('地图必须至少有一个出生点（SPAWN）');
            }
            if (this.packingPositions.length === 0) {
                errors.push('地图必须至少有一个打包台（PACKING）');
            }
            if (Object.keys(this.shelfPositions).length === 0) {
                errors.push('地图必须至少有一个货架（SHELF）');
            }

            for (const shelfId in this.shelfPositions) {
                const shelfPos = this.shelfPositions[shelfId];
                let hasAccess = false;

                const directions = [
                    { dx: 0, dy: -1 },
                    { dx: 0, dy: 1 },
                    { dx: -1, dy: 0 },
                    { dx: 1, dy: 0 }
                ];

                for (const { dx, dy } of directions) {
                    const adjacent = this.getCell(shelfPos.x + dx, shelfPos.y + dy);
                    if (adjacent && adjacent.isPassable()) {
                        hasAccess = true;
                        break;
                    }
                }

                if (!hasAccess) {
                    errors.push(`货架 ${shelfId} 没有可通行的相邻巷道`);
                }
            }

            return errors;
        }
    }

    class Level {
        constructor(config) {
            this.id = config.id;
            this.name = config.name;
            this.description = config.description || '';
            this.difficulty = config.difficulty || 1;
            this.timeLimit = config.timeLimit || 300;
            this.mapWidth = config.mapWidth || 10;
            this.mapHeight = config.mapHeight || 10;
            
            this.warehouseMap = new WarehouseMap(this.mapWidth, this.mapHeight);
            
            if (config.mapData) {
                this._loadMapData(config.mapData);
            }
            
            this.workerCount = config.workerCount || 2;
            this.cartCount = config.cartCount || 2;
            this.orders = (config.orders || []).map(o => 
                new Order(o.id, o.shelfId, o.deadline, o.items || [])
            );
            this.pickDuration = config.pickDuration || 3;
            this.packDuration = config.packDuration || 2;
            
            this.targetScore = config.targetScore || 500;
            this.minOrdersToPass = config.minOrdersToPass || this.orders.length;
        }

        _loadMapData(mapData) {
            for (let y = 0; y < mapData.length; y++) {
                for (let x = 0; x < mapData[y].length; x++) {
                    const cellDef = mapData[y][x];
                    if (typeof cellDef === 'string') {
                        const [type, ...params] = cellDef.split(':');
                        const options = {};
                        
                        switch (type.toLowerCase()) {
                            case 's':
                            case 'shelf':
                                options.shelfId = params[0] || `S-${x}-${y}`;
                                this.warehouseMap.setCell(x, y, CELL_TYPES.SHELF, options);
                                break;
                            case 'a':
                            case 'aisle':
                                if (params[0]) {
                                    options.oneWay = params[0].toLowerCase();
                                }
                                this.warehouseMap.setCell(x, y, CELL_TYPES.AISLE, options);
                                break;
                            case 'p':
                            case 'packing':
                                this.warehouseMap.setCell(x, y, CELL_TYPES.PACKING, options);
                                break;
                            case 'sp':
                            case 'spawn':
                                this.warehouseMap.setCell(x, y, CELL_TYPES.SPAWN, options);
                                break;
                            case 'e':
                            case 'empty':
                            default:
                                break;
                        }
                    } else if (typeof cellDef === 'object' && cellDef !== null) {
                        const options = { ...cellDef };
                        delete options.type;
                        this.warehouseMap.setCell(x, y, cellDef.type, options);
                    }
                }
            }
        }

        validate() {
            const errors = [];

            errors.push(...this.warehouseMap.validateLevel());

            if (this.orders.length === 0) {
                errors.push('关卡必须至少有一个订单');
            }

            for (const order of this.orders) {
                if (!this.warehouseMap.getShelfPosition(order.shelfId)) {
                    errors.push(`订单 ${order.id} 引用了未知的货架 ${order.shelfId}`);
                }
            }

            if (this.workerCount <= 0) {
                errors.push('拣货员数量必须大于0');
            }

            if (this.workerCount > this.warehouseMap.spawnPositions.length) {
                errors.push(`拣货员数量(${this.workerCount})不能超过出生点数量(${this.warehouseMap.spawnPositions.length})`);
            }

            if (this.cartCount < 0) {
                errors.push('推车数量不能为负数');
            }

            if (this.timeLimit <= 0) {
                errors.push('时间限制必须大于0');
            }

            return errors;
        }

        toJSON() {
            const mapData = [];
            for (let y = 0; y < this.mapHeight; y++) {
                mapData[y] = [];
                for (let x = 0; x < this.mapWidth; x++) {
                    const cell = this.warehouseMap.getCell(x, y);
                    if (cell.type === CELL_TYPES.SHELF) {
                        mapData[y][x] = `s:${cell.shelfId}`;
                    } else if (cell.type === CELL_TYPES.AISLE) {
                        mapData[y][x] = cell.oneWay ? `a:${cell.oneWay}` : 'a';
                    } else if (cell.type === CELL_TYPES.PACKING) {
                        mapData[y][x] = 'p';
                    } else if (cell.type === CELL_TYPES.SPAWN) {
                        mapData[y][x] = 'sp';
                    } else {
                        mapData[y][x] = 'e';
                    }
                }
            }

            return {
                id: this.id,
                name: this.name,
                description: this.description,
                difficulty: this.difficulty,
                timeLimit: this.timeLimit,
                mapWidth: this.mapWidth,
                mapHeight: this.mapHeight,
                mapData: mapData,
                workerCount: this.workerCount,
                cartCount: this.cartCount,
                orders: this.orders.map(o => ({
                    id: o.id,
                    shelfId: o.shelfId,
                    deadline: o.deadline,
                    items: o.items,
                    baseScore: o.baseScore
                })),
                pickDuration: this.pickDuration,
                packDuration: this.packDuration,
                targetScore: this.targetScore,
                minOrdersToPass: this.minOrdersToPass
            };
        }

        static fromJSON(json) {
            return new Level(json);
        }
    }

    class Operation {
        constructor(type, data, timestamp) {
            this.type = type;
            this.data = data;
            this.timestamp = timestamp;
        }

        static dispatch(workerId, orderId, useCart, timestamp) {
            return new Operation('DISPATCH', { workerId, orderId, useCart }, timestamp);
        }

        static move(workerId, from, to, timestamp) {
            return new Operation('MOVE', { workerId, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } }, timestamp);
        }

        static pick(workerId, orderId, timestamp) {
            return new Operation('PICK', { workerId, orderId }, timestamp);
        }

        static pack(workerId, orderId, timestamp) {
            return new Operation('PACK', { workerId, orderId }, timestamp);
        }

        static complete(workerId, orderId, score, timestamp) {
            return new Operation('COMPLETE', { workerId, orderId, score }, timestamp);
        }

        static timeout(orderId, timestamp) {
            return new Operation('TIMEOUT', { orderId }, timestamp);
        }

        static error(message, timestamp) {
            return new Operation('ERROR', { message }, timestamp);
        }
    }

    return {
        CELL_TYPES,
        DIRECTIONS,
        ORDER_STATUS,
        WORKER_STATUS,
        GAME_STATUS,
        Position,
        Cell,
        Order,
        Worker,
        Cart,
        WarehouseMap,
        Level,
        Operation
    };
})();
