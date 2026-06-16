const CollisionDetector = (function() {
    const { DIRECTIONS, Position } = GameModels;

    function checkOneWayCollision(map, worker, path) {
        if (path.length < 2) return null;

        for (let i = 0; i < path.length - 1; i++) {
            const current = path[i];
            const next = path[i + 1];
            const currentCell = map.getCellAt(current);
            const nextCell = map.getCellAt(next);

            if (!currentCell || !nextCell) continue;

            const direction = getDirection(current, next);

            if (!currentCell.canExit(direction)) {
                return {
                    type: 'one_way_exit',
                    message: `无法从位置 ${current} 向 ${direction} 方向移动（单向巷道限制）`,
                    position: current,
                    direction
                };
            }

            if (!nextCell.canEnter(direction)) {
                return {
                    type: 'one_way_enter',
                    message: `无法从 ${direction} 方向进入位置 ${next}（单向巷道限制）`,
                    position: next,
                    direction
                };
            }
        }

        return null;
    }

    function checkPathOccupation(map, path, excludeWorkerId = null) {
        for (const pos of path) {
            const cell = map.getCellAt(pos);
            if (cell && cell.occupiedBy !== null && cell.occupiedBy !== excludeWorkerId) {
                return {
                    type: 'path_occupied',
                    message: `位置 ${pos} 已被拣货员 ${cell.occupiedBy} 占用`,
                    position: pos,
                    occupiedBy: cell.occupiedBy
                };
            }
        }
        return null;
    }

    function checkOneWayCongestion(map, path, activeWorkers) {
        if (path.length < 2) return null;

        for (let i = 0; i < path.length - 1; i++) {
            const current = path[i];
            const next = path[i + 1];
            const direction = getDirection(current, next);
            const currentCell = map.getCellAt(current);
            const nextCell = map.getCellAt(next);

            if (nextCell && nextCell.isOneWay()) {
                for (const worker of activeWorkers) {
                    if (worker.path.length === 0) continue;

                    for (let j = 0; j < worker.path.length - 1; j++) {
                        const wCurrent = worker.path[j];
                        const wNext = worker.path[j + 1];
                        const wDirection = getDirection(wCurrent, wNext);

                        if (next.equals(wCurrent) || next.equals(wNext)) {
                            if (isOppositeDirection(direction, wDirection)) {
                                return {
                                    type: 'one_way_congestion',
                                    message: `单向巷道 ${next} 存在逆向冲突，拣货员 ${worker.id} 正在反向移动`,
                                    position: next,
                                    conflictingWorker: worker.id,
                                    direction,
                                    conflictingDirection: wDirection
                                };
                            }
                        }
                    }
                }
            }
        }

        return null;
    }

    function checkResourceAvailability(workers, carts, useCart) {
        const idleWorkers = workers.filter(w => w.status === 'IDLE');
        if (idleWorkers.length === 0) {
            return {
                type: 'no_idle_workers',
                message: '没有空闲的拣货员'
            };
        }

        if (useCart) {
            const availableCarts = carts.filter(c => !c.inUse);
            if (availableCarts.length === 0) {
                return {
                    type: 'no_available_carts',
                    message: '没有可用的推车'
                };
            }
        }

        return null;
    }

    function checkOrderAvailability(order, currentTime) {
        if (!order) {
            return {
                type: 'invalid_order',
                message: '订单不存在'
            };
        }

        if (order.status !== 'pending') {
            const statusText = {
                'pending': '待处理',
                'in_progress': '进行中',
                'completed': '已完成',
                'timeout': '已超时'
            };
            return {
                type: 'order_not_available',
                message: `订单 ${order.id} 当前状态为 ${statusText[order.status]}，无法分配`
            };
        }

        if (order.getRemainingTime(currentTime) <= 0) {
            return {
                type: 'order_timeout',
                message: `订单 ${order.id} 已超时`
            };
        }

        return null;
    }

    function checkWorkerAvailability(worker) {
        if (!worker) {
            return {
                type: 'invalid_worker',
                message: '拣货员不存在'
            };
        }

        if (worker.status !== 'IDLE') {
            return {
                type: 'worker_busy',
                message: `拣货员 ${worker.name} 正在忙碌中`
            };
        }

        return null;
    }

    function checkPathExists(map, start, end, options = {}) {
        const path = map.findPath(start, end, options);
        if (!path) {
            return {
                type: 'no_path',
                message: `无法找到从 ${start} 到 ${end} 的可行路径`
            };
        }
        return null;
    }

    function validateDispatch(gameState, workerId, orderId, useCart) {
        const errors = [];
        const { level, workers, carts, currentTime, map } = gameState;

        const worker = workers.find(w => w.id === workerId);
        const order = level.orders.find(o => o.id === orderId);

        const workerError = checkWorkerAvailability(worker);
        if (workerError) errors.push(workerError);

        const orderError = checkOrderAvailability(order, currentTime);
        if (orderError) errors.push(orderError);

        const resourceError = checkResourceAvailability(workers, carts, useCart);
        if (resourceError) errors.push(resourceError);

        if (errors.length === 0 && worker && order) {
            const shelfPos = map.getShelfPosition(order.shelfId);
            if (shelfPos) {
                const pathError = checkPathExists(map, worker.position, shelfPos);
                if (pathError) errors.push(pathError);

                const packingPos = map.getNearestPackingPosition(shelfPos);
                const returnPathError = checkPathExists(map, packingPos, worker.position);
                if (returnPathError) errors.push(returnPathError);
            }
        }

        if (errors.length === 0 && worker && order) {
            const shelfPos = map.getShelfPosition(order.shelfId);
            if (shelfPos) {
                const pathToShelf = map.findPath(worker.position, shelfPos);
                const pathToPacking = map.findPath(shelfPos, map.getNearestPackingPosition(shelfPos));
                
                if (pathToShelf) {
                    const oneWayError = checkOneWayCollision(map, worker, pathToShelf);
                    if (oneWayError) errors.push(oneWayError);

                    const occupiedError = checkPathOccupation(map, pathToShelf, worker.id);
                    if (occupiedError) errors.push(occupiedError);

                    const congestionError = checkOneWayCongestion(map, pathToShelf, workers.filter(w => w.status !== 'IDLE'));
                    if (congestionError) errors.push(congestionError);
                }

                if (pathToPacking && errors.length === 0) {
                    const packingOneWayError = checkOneWayCollision(map, worker, pathToPacking);
                    if (packingOneWayError) errors.push(packingOneWayError);
                }
            }
        }

        return errors;
    }

    function detectRealTimeCollisions(map, workers) {
        const collisions = [];
        const positionMap = new Map();

        for (const worker of workers) {
            if (worker.status === 'IDLE') continue;

            const posKey = `${worker.position.x},${worker.position.y}`;
            
            if (positionMap.has(posKey)) {
                collisions.push({
                    type: 'same_position',
                    message: `拣货员 ${worker.id} 和 ${positionMap.get(posKey)} 在同一位置`,
                    position: worker.position,
                    workers: [worker.id, positionMap.get(posKey)]
                });
            } else {
                positionMap.set(posKey, worker.id);
            }
        }

        for (let i = 0; i < workers.length; i++) {
            for (let j = i + 1; j < workers.length; j++) {
                const w1 = workers[i];
                const w2 = workers[j];
                
                if (w1.status === 'IDLE' || w2.status === 'IDLE') continue;
                if (w1.path.length === 0 || w2.path.length === 0) continue;

                for (const pos1 of w1.path) {
                    for (const pos2 of w2.path) {
                        if (pos1.equals(pos2)) {
                            const cell = map.getCellAt(pos1);
                            if (cell && cell.isOneWay()) {
                                const dir1 = getDirection(w1.position, w1.path[w1.pathIndex + 1] || w1.path[w1.path.length - 1]);
                                const dir2 = getDirection(w2.position, w2.path[w2.pathIndex + 1] || w2.path[w2.path.length - 1]);
                                
                                if (isOppositeDirection(dir1, dir2)) {
                                    collisions.push({
                                        type: 'future_one_way_conflict',
                                        message: `预测到拣货员 ${w1.id} 和 ${w2.id} 将在单向巷道 ${pos1} 发生逆向冲突`,
                                        position: pos1,
                                        workers: [w1.id, w2.id],
                                        directions: [dir1, dir2]
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        return collisions;
    }

    function getDirection(from, to) {
        if (to.x > from.x) return DIRECTIONS.RIGHT;
        if (to.x < from.x) return DIRECTIONS.LEFT;
        if (to.y > from.y) return DIRECTIONS.DOWN;
        if (to.y < from.y) return DIRECTIONS.UP;
        return null;
    }

    function isOppositeDirection(dir1, dir2) {
        const opposites = {
            [DIRECTIONS.UP]: DIRECTIONS.DOWN,
            [DIRECTIONS.DOWN]: DIRECTIONS.UP,
            [DIRECTIONS.LEFT]: DIRECTIONS.RIGHT,
            [DIRECTIONS.RIGHT]: DIRECTIONS.LEFT
        };
        return opposites[dir1] === dir2;
    }

    function getDirectionArrow(direction) {
        const arrows = {
            [DIRECTIONS.UP]: '↑',
            [DIRECTIONS.DOWN]: '↓',
            [DIRECTIONS.LEFT]: '←',
            [DIRECTIONS.RIGHT]: '→'
        };
        return arrows[direction] || '';
    }

    return {
        checkOneWayCollision,
        checkPathOccupation,
        checkOneWayCongestion,
        checkResourceAvailability,
        checkOrderAvailability,
        checkWorkerAvailability,
        checkPathExists,
        validateDispatch,
        detectRealTimeCollisions,
        getDirection,
        isOppositeDirection,
        getDirectionArrow
    };
})();
