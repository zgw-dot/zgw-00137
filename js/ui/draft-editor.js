const DraftEditor = (function() {
    'use strict';

    const CELL_LABELS = {
        'e': '',
        'a': '·',
        'a:up': '↑',
        'a:down': '↓',
        'a:left': '←',
        'a:right': '→',
        's': null,
        'p': '📋',
        'sp': '🚶'
    };

    const DEFAULT_DRAFT = {
        id: '',
        name: '未命名关卡',
        description: '',
        difficulty: 1,
        targetScore: 500,
        mapWidth: 8,
        mapHeight: 8,
        mapData: null,
        timeLimit: 180,
        workerCount: 2,
        cartCount: 2,
        pickDuration: 3,
        packDuration: 2,
        minOrdersToPass: 4,
        orders: []
    };

    function createDefaultMap(width, height) {
        const mapData = [];
        for (let y = 0; y < height; y++) {
            const row = [];
            for (let x = 0; x < width; x++) {
                if (y === 0 || y === height - 1) {
                    if (x === 0 || x === width - 1) row.push('sp');
                    else row.push('a');
                } else if (x === 0 || x === width - 1) {
                    row.push('a');
                } else if (y % 2 === 1) {
                    if (x % 2 === 1) row.push(`s:S-${x}-${y}`);
                    else row.push('a');
                } else {
                    row.push('e');
                }
            }
            mapData.push(row);
        }
        if (height >= 2 && width >= 2) {
            const lastRow = mapData[height - 1];
            const midX = Math.floor(width / 2);
            for (let i = midX - 1; i <= midX && i < lastRow.length; i++) {
                if (i >= 0 && i < lastRow.length) lastRow[i] = 'p';
            }
        }
        return mapData;
    }

    class Editor {
        constructor(uiController) {
            this.ui = uiController;
            this.currentDraftId = null;
            this.isEditing = false;
            this.draft = { ...DEFAULT_DRAFT };
            this.draft.mapData = createDefaultMap(DEFAULT_DRAFT.mapWidth, DEFAULT_DRAFT.mapHeight);
            this.currentTool = 'a';
            this._isNew = true;
            this._debounceTimer = null;
            this.publishWorkbench = null;
        }

        openNew() {
            const draftId = Storage.generateDraftId();
            this.currentDraftId = draftId;
            this._isNew = true;
            this.draft = {
                ...DEFAULT_DRAFT,
                id: '',
                mapData: createDefaultMap(DEFAULT_DRAFT.mapWidth, DEFAULT_DRAFT.mapHeight),
                orders: []
            };
            document.getElementById('draft-editor-title').textContent = '📝 新建关卡草稿';
            this._show();
            this._populateFields();
            this._renderMap();
            this._renderOrders();
            this._scheduleValidate();
        }

        openEdit(draftId) {
            const raw = Storage.loadDraft(draftId);
            if (!raw) {
                this.ui.infoPanel.showNotification('找不到该草稿', 'error');
                return;
            }
            const data = { ...raw };
            delete data._meta;
            this.currentDraftId = draftId;
            this._isNew = false;
            this.draft = data;
            if (!this.draft.mapData || this.draft.mapData.length === 0) {
                this.draft.mapData = createDefaultMap(this.draft.mapWidth || 8, this.draft.mapHeight || 8);
            }
            if (!this.draft.orders) this.draft.orders = [];
            document.getElementById('draft-editor-title').textContent = `📝 编辑草稿：${data.name || '未命名'}`;
            this._show();
            this._populateFields();
            this._renderMap();
            this._renderOrders();
            this._scheduleValidate();
        }

        openFromTemplate(levelData) {
            const draftId = Storage.generateDraftId();
            this.currentDraftId = draftId;
            this._isNew = true;
            const lv = { ...levelData };
            delete lv._meta;
            this.draft = {
                ...DEFAULT_DRAFT,
                ...lv,
                id: lv.id ? '' : '',
                orders: (lv.orders || []).map(o => ({ ...o })),
                mapData: lv.mapData ? JSON.parse(JSON.stringify(lv.mapData)) : createDefaultMap(lv.mapWidth || 8, lv.mapHeight || 8)
            };
            if (this.draft.name) this.draft.name = this.draft.name + ' (草稿)';
            document.getElementById('draft-editor-title').textContent = `📝 基于模板：${levelData.name || '未命名'}`;
            this._show();
            this._populateFields();
            this._renderMap();
            this._renderOrders();
            this._scheduleValidate();
        }

        _show() {
            this.isEditing = true;
            this.ui._showScreen('draft-editor-screen');
        }

        close() {
            this.isEditing = false;
            this.currentDraftId = null;
            this.ui._showScreen('main-menu');
            this.ui._loadLevels();
            this.ui._renderMainMenu();
            this.ui._restoreLastOperation();
            this.ui._restoreUndoBar();
            this.ui._restoreBatchUndoBar();
            this.ui._restorePublishUndoBar();
            this.ui._renderLastRestoreCard();
        }

        _populateFields() {
            const d = this.draft;
            document.getElementById('draft-id').value = d.id || '';
            document.getElementById('draft-name').value = d.name || '';
            document.getElementById('draft-description').value = d.description || '';
            document.getElementById('draft-difficulty').value = d.difficulty || 1;
            document.getElementById('draft-target-score').value = d.targetScore || 500;
            document.getElementById('draft-map-width').value = d.mapWidth || 8;
            document.getElementById('draft-map-height').value = d.mapHeight || 8;
            document.getElementById('draft-time-limit').value = d.timeLimit || 180;
            document.getElementById('draft-worker-count').value = d.workerCount || 2;
            document.getElementById('draft-cart-count').value = d.cartCount || 2;
            document.getElementById('draft-pick-duration').value = d.pickDuration || 3;
            document.getElementById('draft-pack-duration').value = d.packDuration || 2;
            document.getElementById('draft-min-orders').value = d.minOrdersToPass || 4;
            document.getElementById('map-tool-select').value = this.currentTool;
        }

        _collectFromFields() {
            const d = this.draft;
            d.id = document.getElementById('draft-id').value.trim();
            d.name = document.getElementById('draft-name').value.trim();
            d.description = document.getElementById('draft-description').value.trim();
            d.difficulty = parseInt(document.getElementById('draft-difficulty').value) || 1;
            d.targetScore = parseInt(document.getElementById('draft-target-score').value) || 0;
            d.mapWidth = parseInt(document.getElementById('draft-map-width').value) || 8;
            d.mapHeight = parseInt(document.getElementById('draft-map-height').value) || 8;
            d.timeLimit = parseInt(document.getElementById('draft-time-limit').value) || 180;
            d.workerCount = parseInt(document.getElementById('draft-worker-count').value) || 1;
            d.cartCount = parseInt(document.getElementById('draft-cart-count').value) || 0;
            d.pickDuration = parseInt(document.getElementById('draft-pick-duration').value) || 1;
            d.packDuration = parseInt(document.getElementById('draft-pack-duration').value) || 1;
            d.minOrdersToPass = parseInt(document.getElementById('draft-min-orders').value) || 1;
        }

        bindEvents() {
            const self = this;

            ['draft-id', 'draft-name', 'draft-description', 'draft-difficulty',
             'draft-target-score', 'draft-time-limit', 'draft-worker-count',
             'draft-cart-count', 'draft-pick-duration', 'draft-pack-duration',
             'draft-min-orders'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', () => {
                    self._collectFromFields();
                    self._scheduleValidate();
                });
            });

            document.getElementById('map-tool-select').addEventListener('change', (e) => {
                self.currentTool = e.target.value;
            });

            document.getElementById('btn-apply-map-size').addEventListener('click', () => self._applyMapSize());

            document.getElementById('btn-draft-save').addEventListener('click', () => self.save());
            document.getElementById('btn-draft-publish').addEventListener('click', () => self.publish());
            document.getElementById('btn-draft-back').addEventListener('click', () => {
                if (confirm('确定返回主菜单吗？未保存的修改会丢失。')) self.close();
            });

            document.getElementById('btn-add-order').addEventListener('click', () => self._addOrder());
            document.getElementById('btn-validate-draft').addEventListener('click', () => self._validateAndShow());
            document.getElementById('btn-copy-draft-json').addEventListener('click', () => {
                const ta = document.getElementById('draft-json-preview');
                ta.select();
                document.execCommand('copy');
                self.ui.infoPanel.showNotification('JSON已复制到剪贴板', 'success');
            });
        }

        _applyMapSize() {
            const newW = parseInt(document.getElementById('draft-map-width').value) || 8;
            const newH = parseInt(document.getElementById('draft-map-height').value) || 8;
            const mode = document.getElementById('draft-map-resize-mode').value;
            const old = this.draft.mapData || [];
            const newMap = [];
            for (let y = 0; y < newH; y++) {
                const row = [];
                for (let x = 0; x < newW; x++) {
                    if (mode === 'preserve' && old[y] && old[y][x] !== undefined) {
                        row.push(old[y][x]);
                    } else {
                        row.push('e');
                    }
                }
                newMap.push(row);
            }
            this.draft.mapWidth = newW;
            this.draft.mapHeight = newH;
            this.draft.mapData = newMap;
            this._renderMap();
            this._scheduleValidate();
            this.ui.infoPanel.showNotification(`已重建 ${newW}×${newH} 地图`, 'info');
        }

        _renderMap() {
            const grid = document.getElementById('draft-map-grid');
            const w = this.draft.mapWidth;
            const h = this.draft.mapHeight;
            grid.style.gridTemplateColumns = `repeat(${w}, 36px)`;
            grid.innerHTML = '';

            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const cellDef = this.draft.mapData?.[y]?.[x] || 'e';
                    const [type, ...params] = typeof cellDef === 'string' ? cellDef.split(':') : ['e'];
                    const div = document.createElement('div');
                    let label = '';
                    let cls = 'map-cell ';

                    switch (type.toLowerCase()) {
                        case 's':
                        case 'shelf':
                            cls += 'cell-shelf';
                            label = (params[0] || `S-${x}-${y}`).replace(/^S-/, '');
                            if (label.length > 3) label = label.slice(0, 3);
                            break;
                        case 'a':
                        case 'aisle':
                            if (params[0]) cls += 'cell-oneway';
                            else cls += 'cell-aisle';
                            const dirMap = { up: '↑', down: '↓', left: '←', right: '→' };
                            label = params[0] ? (dirMap[params[0].toLowerCase()] || '·') : '·';
                            break;
                        case 'p':
                        case 'packing':
                            cls += 'cell-packing';
                            label = '📋';
                            break;
                        case 'sp':
                        case 'spawn':
                            cls += 'cell-spawn';
                            label = '🚶';
                            break;
                        case 'e':
                        default:
                            cls += 'cell-empty';
                            label = '';
                    }

                    div.className = cls;
                    div.textContent = label;
                    div.dataset.x = x;
                    div.dataset.y = y;
                    div.addEventListener('click', () => this._onCellClick(x, y));
                    grid.appendChild(div);
                }
            }
        }

        _onCellClick(x, y) {
            const tool = this.currentTool;
            let cellVal = tool;
            if (tool === 's') {
                cellVal = `s:S-${x}-${y}`;
            }
            if (!this.draft.mapData) this.draft.mapData = [];
            if (!this.draft.mapData[y]) this.draft.mapData[y] = [];
            this.draft.mapData[y][x] = cellVal;

            const rowEls = document.getElementById('draft-map-grid').children;
            const idx = y * this.draft.mapWidth + x;
            if (rowEls[idx]) {
                const grid = document.getElementById('draft-map-grid');
                this._renderMap();
            }
            this._scheduleValidate();
        }

        _renderOrders() {
            const list = document.getElementById('draft-orders-list');
            const orders = this.draft.orders || [];
            if (orders.length === 0) {
                list.innerHTML = '<div class="orders-empty">暂无订单，点击右上角「➕ 添加订单」开始创建</div>';
                return;
            }
            const self = this;
            list.innerHTML = orders.map((o, idx) => {
                const items = Array.isArray(o.items) ? o.items.join(', ') : '';
                const dir = ('' + (o.shelfId || '')).replace(/^.*S-/, '').replace(/^S/, '');
                return `
                    <div class="order-editor-item" data-idx="${idx}">
                        <div class="order-editor-header">
                            <span class="order-editor-title">📦 订单 #${idx + 1}${o.id ? ` (${o.id})` : ''}</span>
                            <button class="btn btn-danger btn-small btn-remove-order" data-idx="${idx}">🗑️ 删除</button>
                        </div>
                        <div class="order-editor-fields">
                            <div class="form-item">
                                <label>订单 ID</label>
                                <input type="text" class="order-field-id" value="${o.id || ''}" placeholder="O-001">
                            </div>
                            <div class="form-item">
                                <label>货架 ID</label>
                                <input type="text" class="order-field-shelf" value="${o.shelfId || ''}" placeholder="S-${dir || '1-1'}">
                            </div>
                            <div class="form-item">
                                <label>截止时间（秒）</label>
                                <input type="number" class="order-field-deadline" value="${o.deadline || ''}" placeholder="120">
                            </div>
                        </div>
                        <div class="order-items-input">
                            <label>商品（用英文逗号分隔）</label>
                            <input type="text" class="order-field-items" value="${items}" placeholder="商品A, 商品B">
                        </div>
                    </div>
                `;
            }).join('');

            list.querySelectorAll('.btn-remove-order').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const i = parseInt(e.target.dataset.idx);
                    self.draft.orders.splice(i, 1);
                    self._renderOrders();
                    self._scheduleValidate();
                });
            });

            list.querySelectorAll('.order-field-id, .order-field-shelf, .order-field-deadline, .order-field-items').forEach(input => {
                input.addEventListener('input', () => {
                    const item = input.closest('.order-editor-item');
                    const i = parseInt(item.dataset.idx);
                    const id = item.querySelector('.order-field-id').value.trim();
                    const shelf = item.querySelector('.order-field-shelf').value.trim();
                    const deadline = parseInt(item.querySelector('.order-field-deadline').value) || 0;
                    const itemsRaw = item.querySelector('.order-field-items').value || '';
                    const items = itemsRaw.split(/[，,]/).map(s => s.trim()).filter(Boolean);
                    if (self.draft.orders[i]) {
                        self.draft.orders[i] = {
                            ...self.draft.orders[i],
                            id,
                            shelfId: shelf,
                            deadline,
                            items
                        };
                        self._scheduleValidate();
                    }
                });
            });
        }

        _addOrder() {
            const n = (this.draft.orders || []).length + 1;
            this.draft.orders = this.draft.orders || [];
            const shelves = this._collectShelfIds();
            const shelfId = shelves[n - 1] || shelves[0] || `S-${n}-1`;
            this.draft.orders.push({
                id: `O-${String(n).padStart(3, '0')}`,
                shelfId,
                deadline: Math.max(60, (this.draft.timeLimit || 180) - 30),
                items: [`商品${String.fromCharCode(64 + Math.min(n, 26))}`]
            });
            this._renderOrders();
            this._scheduleValidate();
        }

        _collectShelfIds() {
            const ids = [];
            const map = this.draft.mapData || [];
            for (let y = 0; y < map.length; y++) {
                for (let x = 0; x < (map[y] || []).length; x++) {
                    const c = map[y][x];
                    if (typeof c === 'string') {
                        const [t, ...p] = c.split(':');
                        if (t === 's' || t.toLowerCase() === 'shelf') {
                            ids.push(p[0] || `S-${x}-${y}`);
                        }
                    }
                }
            }
            return ids;
        }

        _scheduleValidate() {
            if (this._debounceTimer) clearTimeout(this._debounceTimer);
            this._debounceTimer = setTimeout(() => this._validateAndShow(), 300);
        }

        _buildLevelConfig() {
            this._collectFromFields();
            const d = this.draft;
            return {
                id: d.id || '',
                name: d.name || '',
                description: d.description || '',
                difficulty: d.difficulty || 1,
                timeLimit: d.timeLimit || 180,
                mapWidth: d.mapWidth || 8,
                mapHeight: d.mapHeight || 8,
                mapData: d.mapData ? JSON.parse(JSON.stringify(d.mapData)) : createDefaultMap(d.mapWidth || 8, d.mapHeight || 8),
                workerCount: d.workerCount || 1,
                cartCount: d.cartCount || 0,
                orders: (d.orders || []).map(o => ({ ...o, items: [...(o.items || [])] })),
                pickDuration: d.pickDuration || 3,
                packDuration: d.packDuration || 2,
                targetScore: d.targetScore || 0,
                minOrdersToPass: d.minOrdersToPass || 1
            };
        }

        _validateAndShow() {
            const cfg = this._buildLevelConfig();
            const errors = [];
            const warnings = [];

            if (!cfg.id) errors.push('关卡 ID 不能为空');
            else if (!/^[a-zA-Z0-9_-]+$/.test(cfg.id)) errors.push(`关卡 ID "${cfg.id}" 只能包含字母、数字、下划线和连字符`);

            if (!cfg.name) errors.push('关卡名称不能为空');
            if (cfg.timeLimit <= 0) errors.push('时间限制必须大于 0');
            if (cfg.workerCount <= 0) errors.push('拣货员数量必须大于 0');
            if (cfg.cartCount < 0) errors.push('推车数量不能为负数');
            if (cfg.mapWidth < 4 || cfg.mapWidth > 20) errors.push('地图宽度应在 4-20 之间');
            if (cfg.mapHeight < 4 || cfg.mapHeight > 20) errors.push('地图高度应在 4-20 之间');

            let semanticErrors = null;
            let levelObj = null;
            try {
                levelObj = GameModels.Level.fromJSON(cfg);
                semanticErrors = levelObj.validate();
            } catch (e) {
                errors.push('关卡数据结构错误：' + e.message);
            }

            if (semanticErrors && semanticErrors.length > 0) {
                errors.push(...semanticErrors);
            }

            if (cfg.orders.length === 0) {
                warnings.push('还没有创建订单');
            } else if (cfg.minOrdersToPass > cfg.orders.length) {
                errors.push(`通关最少订单数(${cfg.minOrdersToPass})不能超过订单总数(${cfg.orders.length})`);
            }

            if (cfg.targetScore === 0) warnings.push('目标分数为 0，通关评级可能不准确');

            const shelfIds = this._collectShelfIds();
            if (shelfIds.length === 0) warnings.push('地图上还没有货架');
            if (cfg.orders.length > shelfIds.length && shelfIds.length > 0) {
                warnings.push(`订单数量(${cfg.orders.length})超过货架数量(${shelfIds.length})，部分订单可能引用相同货架`);
            }

            const orders = cfg.orders || [];
            for (let i = 0; i < orders.length; i++) {
                const o = orders[i];
                if (!o.id) errors.push(`订单 #${i + 1} 的 ID 不能为空`);
                for (let j = i + 1; j < orders.length; j++) {
                    if (o.id && orders[j].id && o.id === orders[j].id) {
                        errors.push(`存在重复的订单 ID：${o.id}`);
                    }
                }
            }

            const va = document.getElementById('draft-validation');
            let html = '';
            if (errors.length === 0) {
                html += `<div class="validation-success">✅ 校验通过！关卡配置看起来没问题</div>`;
            }
            errors.forEach(e => html += `<div class="validation-error">❌ ${e}</div>`);
            warnings.forEach(w => html += `<div class="validation-warn">⚠️ ${w}</div>`);
            va.innerHTML = html;

            let jsonObj = cfg;
            try {
                if (levelObj && errors.length === 0) jsonObj = levelObj.toJSON();
            } catch (_) {}
            document.getElementById('draft-json-preview').value = JSON.stringify(jsonObj, null, 2);

            return { errors, warnings, config: cfg, levelObj };
        }

        save() {
            const { errors, config } = this._validateAndShow();
            if (errors.length > 0) {
                this.ui.infoPanel.showNotification(`还有 ${errors.length} 个问题未解决，草稿已保存但不校验内容`, 'warning');
            }
            const res = Storage.saveDraft(this.currentDraftId, config);
            if (res.success) {
                this._isNew = false;
                this.ui.infoPanel.showNotification(`草稿已保存 (版本 v${res.version})`, 'success');
            } else {
                this.ui.infoPanel.showNotification('草稿保存失败：' + (res.error || '未知错误'), 'error');
            }
        }

        publish() {
            const { errors, warnings, config } = this._validateAndShow();
            if (errors.length > 0) {
                this.ui.infoPanel.showNotification(`请先修复 ${errors.length} 个校验错误再发布`, 'error');
                return;
            }

            if (!this.publishWorkbench) {
                this.publishWorkbench = new PublishWorkbench.Workbench(this.ui);
            }

            const result = this.publishWorkbench.checkAndPublish(this.currentDraftId, config, 'draft_publish');

            if (result.success && result.needUIRefresh) {
                this.ui.infoPanel.showNotification(
                    `🎉 关卡 "${config.name}" 发布成功！草稿已自动删除`,
                    'success'
                );
                this.close();
                this.ui._syncAfterPublish(result);
            }
        }
    }

    return { Editor };
})();
