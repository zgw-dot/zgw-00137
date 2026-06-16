const Renderer = (function() {
    const { CELL_TYPES, DIRECTIONS } = GameModels;

    const CELL_SIZE = 40;
    const CELL_PADDING = 2;

    class WarehouseRenderer {
        constructor(container, mapContainer) {
            this.container = container;
            this.mapContainer = mapContainer;
            this.showGrid = true;
            this.animationFrameId = null;
        }

        render(gameState) {
            const { map, workers, carts, level } = gameState;
            
            this._renderMap(map, level);
            this._renderPaths(workers);
            this._renderWorkers(workers);
            this._renderCarts(carts);
        }

        _renderMap(map, level) {
            this.mapContainer.innerHTML = '';
            
            if (this.showGrid) {
                this.mapContainer.classList.add('show-grid');
            } else {
                this.mapContainer.classList.remove('show-grid');
            }

            const mapWidth = map.width * (CELL_SIZE + CELL_PADDING);
            const mapHeight = map.height * (CELL_SIZE + CELL_PADDING);
            
            this.mapContainer.style.width = `${mapWidth + 40}px`;
            this.mapContainer.style.height = `${mapHeight + 40}px`;
            this.mapContainer.style.minWidth = `${mapWidth + 40}px`;
            this.mapContainer.style.minHeight = `${mapHeight + 40}px`;

            for (let y = 0; y < map.height; y++) {
                for (let x = 0; x < map.width; x++) {
                    const cell = map.getCell(x, y);
                    if (!cell || cell.type === CELL_TYPES.EMPTY) continue;

                    const cellEl = document.createElement('div');
                    cellEl.className = 'map-cell';
                    
                    const left = x * (CELL_SIZE + CELL_PADDING) + 20;
                    const top = y * (CELL_SIZE + CELL_PADDING) + 20;
                    
                    cellEl.style.left = `${left}px`;
                    cellEl.style.top = `${top}px`;
                    cellEl.style.width = `${CELL_SIZE}px`;
                    cellEl.style.height = `${CELL_SIZE}px`;

                    switch (cell.type) {
                        case CELL_TYPES.SHELF:
                            cellEl.classList.add('cell-shelf');
                            cellEl.textContent = cell.shelfId || '📦';
                            break;
                        case CELL_TYPES.AISLE:
                            cellEl.classList.add('cell-aisle');
                            if (cell.oneWay && cell.oneWay !== DIRECTIONS.BIDIRECTIONAL) {
                                cellEl.classList.add(`one-way-${cell.oneWay}`);
                                const arrow = CollisionDetector.getDirectionArrow(cell.oneWay);
                                const arrowEl = document.createElement('div');
                                arrowEl.className = 'direction-arrow';
                                arrowEl.textContent = arrow;
                                arrowEl.style.left = '50%';
                                arrowEl.style.top = '50%';
                                arrowEl.style.transform = 'translate(-50%, -50%)';
                                cellEl.appendChild(arrowEl);
                            }
                            break;
                        case CELL_TYPES.PACKING:
                            cellEl.classList.add('cell-packing');
                            cellEl.textContent = '📦';
                            break;
                        case CELL_TYPES.SPAWN:
                            cellEl.classList.add('cell-spawn');
                            cellEl.textContent = '🏁';
                            break;
                    }

                    if (cell.occupiedBy) {
                        cellEl.classList.add('cell-occupied');
                        cellEl.title = `被拣货员 ${cell.occupiedBy} 占用`;
                    }

                    this.mapContainer.appendChild(cellEl);
                }
            }
        }

        _renderPaths(workers) {
            for (const worker of workers) {
                if (worker.path.length === 0 || worker.pathIndex >= worker.path.length) continue;

                const remainingPath = worker.path.slice(worker.pathIndex);
                
                for (let i = 1; i < remainingPath.length - 1; i++) {
                    const pos = remainingPath[i];
                    const indicator = document.createElement('div');
                    indicator.className = 'path-indicator';
                    
                    const left = pos.x * (CELL_SIZE + CELL_PADDING) + CELL_SIZE / 2 + 20 - 4;
                    const top = pos.y * (CELL_SIZE + CELL_PADDING) + CELL_SIZE / 2 + 20 - 4;
                    
                    indicator.style.left = `${left}px`;
                    indicator.style.top = `${top}px`;
                    indicator.style.opacity = `${0.8 - (i / remainingPath.length) * 0.5}`;
                    
                    this.mapContainer.appendChild(indicator);
                }
            }
        }

        _renderWorkers(workers) {
            for (const worker of workers) {
                const workerEl = document.createElement('div');
                workerEl.className = 'worker';
                workerEl.id = `worker-${worker.id}`;
                
                if (worker.status !== 'idle') {
                    workerEl.classList.add('busy');
                }
                if (worker.hasCart) {
                    workerEl.classList.add('has-cart');
                }

                const left = worker.position.x * (CELL_SIZE + CELL_PADDING) + 20 + 2;
                const top = worker.position.y * (CELL_SIZE + CELL_PADDING) + 20 + 2;
                
                workerEl.style.left = `${left}px`;
                workerEl.style.top = `${top}px`;

                workerEl.textContent = worker.name.charAt(0);

                const tooltip = document.createElement('div');
                tooltip.className = 'worker-tooltip';
                
                let statusText = '空闲';
                if (worker.status === 'moving') statusText = '移动中';
                else if (worker.status === 'picking') statusText = '拣货中';
                else if (worker.status === 'packing') statusText = '打包中';
                else if (worker.status === 'returning') statusText = '返回中';

                const cartText = worker.hasCart ? '🚛 有推车' : '';
                const orderText = worker.currentOrder ? `📦 ${worker.currentOrder.id}` : '';
                const comboText = worker.consecutiveOrders > 0 ? `🔥 连单x${worker.consecutiveOrders}` : '';

                tooltip.innerHTML = `
                    <strong>${worker.name}</strong> (${worker.id})<br>
                    状态: ${statusText}<br>
                    ${orderText ? `${orderText}<br>` : ''}
                    ${cartText ? `${cartText}<br>` : ''}
                    ${comboText ? `${comboText}<br>` : ''}
                    位置: ${worker.position}
                `;
                
                workerEl.appendChild(tooltip);
                this.mapContainer.appendChild(workerEl);
            }
        }

        _renderCarts(carts) {
            for (const cart of carts) {
                if (cart.inUse && cart.assignedWorker) continue;

                const cartEl = document.createElement('div');
                cartEl.className = 'cart';
                cartEl.id = `cart-${cart.id}`;
                cartEl.title = `推车 ${cart.id} - 可用`;

                const left = cart.position.x * (CELL_SIZE + CELL_PADDING) + 20 + 6;
                const top = cart.position.y * (CELL_SIZE + CELL_PADDING) + 20 + 6;
                
                cartEl.style.left = `${left}px`;
                cartEl.style.top = `${top}px`;
                cartEl.textContent = '🚛';

                this.mapContainer.appendChild(cartEl);
            }
        }

        setShowGrid(show) {
            this.showGrid = show;
            if (this.showGrid) {
                this.mapContainer.classList.add('show-grid');
            } else {
                this.mapContainer.classList.remove('show-grid');
            }
        }

        highlightCell(position, type = 'warning') {
            const selector = `[style*="left: ${position.x * (CELL_SIZE + CELL_PADDING) + 20}px"][style*="top: ${position.y * (CELL_SIZE + CELL_PADDING) + 20}px"]`;
            const cell = this.mapContainer.querySelector(selector);
            if (cell) {
                cell.classList.add('highlight-' + type);
                setTimeout(() => cell.classList.remove('highlight-' + type), 2000);
            }
        }

        clear() {
            this.mapContainer.innerHTML = '';
        }

        destroy() {
            this.clear();
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
        }
    }

    return {
        WarehouseRenderer
    };
})();
