const PublishWorkbench = (function() {
    'use strict';

    function formatTimestamp(ts) {
        if (!ts) return '-';
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }

    function isToday(ts) {
        if (!ts) return false;
        const d = new Date(ts);
        const today = new Date();
        return d.getFullYear() === today.getFullYear()
            && d.getMonth() === today.getMonth()
            && d.getDate() === today.getDate();
    }

    class Workbench {
        constructor(uiController) {
            this.ui = uiController;
            this.selectedDraftId = null;
            this.currentFilter = 'all';
        }

        init() {
            this._bindEvents();
        }

        _bindEvents() {
            const self = this;

            document.getElementById('btn-publish-workbench-back').addEventListener('click', () => {
                self.close();
            });

            document.getElementById('btn-publish-history').addEventListener('click', () => {
                self._openPublishHistory();
            });

            document.getElementById('btn-close-publish-history').addEventListener('click', () => {
                self._closePublishHistory();
            });

            document.getElementById('publish-history-filter').addEventListener('change', (e) => {
                self.currentFilter = e.target.value;
                self._renderPublishHistory();
            });

            document.getElementById('btn-clear-publish-history').addEventListener('click', () => {
                if (confirm('确定清空所有发布记录吗？此操作不可撤销。')) {
                    Storage.clearPublishHistory();
                    self._renderPublishHistory();
                    self.ui.infoPanel.showNotification('发布记录已清空', 'success');
                }
            });
        }

        open() {
            this.selectedDraftId = null;
            this._show();
            this._renderDraftList();
            this._renderStats();
            this._renderPrecheckEmpty();
        }

        close() {
            this.selectedDraftId = null;
            this.ui._showScreen('main-menu');
            this.ui._loadLevels();
            this.ui._renderMainMenu();
            this.ui._renderDraftList();
            this.ui._restoreLastOperation();
            this.ui._restoreUndoBar();
            this.ui._restoreBatchUndoBar();
            this.ui._restorePublishUndoBar();
            this.ui._renderLastRestoreCard();
        }

        _show() {
            this.ui._showScreen('publish-workbench-screen');
        }

        _renderStats() {
            const drafts = Storage.loadDrafts();
            const customLevels = Storage.loadCustomLevels();
            const history = Storage.loadPublishHistory();

            const draftCount = Object.keys(drafts).length;
            const publishedCount = Object.keys(customLevels).length;
            const todayCount = history.filter(r => !r.undone && isToday(r.timestamp)).length;

            document.getElementById('stat-draft-count').textContent = draftCount;
            document.getElementById('stat-published-count').textContent = publishedCount;
            document.getElementById('stat-today-publish').textContent = todayCount;
        }

        _renderDraftList() {
            const list = document.getElementById('workbench-draft-list');
            const drafts = Storage.loadDrafts();
            const ids = Object.keys(drafts);

            if (ids.length === 0) {
                list.innerHTML = '<div class="workbench-draft-item-empty">暂无草稿 — 先去「新建草稿」创建一个吧</div>';
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
                const mapSize = `${d.mapWidth || '?'}×${d.mapHeight || '?'}`;
                const orderCount = (d.orders || []).length;
                const selected = id === self.selectedDraftId ? 'selected' : '';
                return `
                    <div class="workbench-draft-item ${selected}" data-draft-id="${id}">
                        <div class="workbench-draft-item-title">
                            <span class="workbench-draft-item-name">${d.name || '未命名草稿'}</span>
                            <span class="workbench-draft-item-version">v${v}</span>
                        </div>
                        <div class="workbench-draft-item-meta">
                            <span>🆔 ${d.id || '(未设置)'}</span>
                            <span>📦 ${orderCount} 订单</span>
                            <span>🗺️ ${mapSize}</span>
                            <span>🕐 ${mod}</span>
                        </div>
                    </div>
                `;
            }).join('');

            list.querySelectorAll('.workbench-draft-item').forEach(el => {
                el.addEventListener('click', () => {
                    self._selectDraft(el.dataset.draftId);
                });
            });
        }

        _selectDraft(draftId) {
            this.selectedDraftId = draftId;
            this._renderDraftList();
            this._renderPrecheck(draftId);
        }

        _renderPrecheckEmpty() {
            document.getElementById('workbench-precheck').innerHTML =
                '<div class="precheck-empty">请从左侧选择一个草稿开始发布流程</div>';
        }

        _renderPrecheck(draftId) {
            const draft = Storage.loadDraft(draftId);
            if (!draft) {
                this._renderPrecheckEmpty();
                return;
            }

            const precheck = document.getElementById('workbench-precheck');

            const idCheck = this._checkId(draft.id);
            const nameCheck = Storage.checkNameConflict(draft.name);
            const validation = this._validateDraft(draft);

            let html = '<div class="precheck-content">';

            html += `<div class="precheck-item-row">
                <span class="precheck-item-label">关卡 ID</span>
                <span class="precheck-item-value ${idCheck.status}">${draft.id || '(未设置)'}</span>
            </div>`;

            html += `<div class="precheck-item-row">
                <span class="precheck-item-label">关卡名称</span>
                <span class="precheck-item-value ${nameCheck.hasConflict ? 'warning' : 'ok'}">${draft.name || '(未命名)'}</span>
            </div>`;

            if (idCheck.status === 'error') {
                html += `<div class="validation-error">❌ ${idCheck.message}</div>`;
            }
            if (nameCheck.hasConflict) {
                html += `<div class="validation-warn">⚠️ 名称 "${draft.name}" 已被关卡 "${nameCheck.conflictLevelId}" 使用</div>`;
            }

            if (validation.errors.length > 0) {
                validation.errors.forEach(e => {
                    html += `<div class="validation-error">❌ ${e}</div>`;
                });
            }
            if (validation.warnings.length > 0) {
                validation.warnings.forEach(w => {
                    html += `<div class="validation-warn">⚠️ ${w}</div>`;
                });
            }

            const canPublish = validation.errors.length === 0 && draft.id && draft.name;

            html += `<div class="precheck-actions">
                <button class="btn btn-secondary btn-small" id="btn-edit-draft">✏️ 编辑草稿</button>
                <button class="btn btn-success btn-small" id="btn-publish-from-workbench" ${canPublish ? '' : 'disabled'}>🚀 发布关卡</button>
            </div>`;

            html += '</div>';
            precheck.innerHTML = html;

            const self = this;
            document.getElementById('btn-edit-draft').addEventListener('click', () => {
                self.close();
                self.ui.draftEditor.openEdit(draftId);
            });

            if (canPublish) {
                document.getElementById('btn-publish-from-workbench').addEventListener('click', () => {
                    self._publishDraft(draftId);
                });
            }
        }

        _checkId(id) {
            if (!id) {
                return { status: 'error', message: '关卡 ID 不能为空' };
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
                return { status: 'error', message: '关卡 ID 只能包含字母、数字、下划线和连字符' };
            }
            if (Storage.isBuiltinLevelId(id)) {
                return { status: 'error', message: `ID "${id}" 与内置关卡冲突` };
            }
            const customLevels = Storage.loadCustomLevels();
            if (customLevels[id]) {
                return { status: 'warning', message: `ID "${id}" 已被自定义关卡使用` };
            }
            return { status: 'ok' };
        }

        _validateDraft(draft) {
            const errors = [];
            const warnings = [];

            if (!draft.id) errors.push('关卡 ID 不能为空');
            else if (!/^[a-zA-Z0-9_-]+$/.test(draft.id)) errors.push(`关卡 ID "${draft.id}" 格式不正确`);

            if (!draft.name) errors.push('关卡名称不能为空');
            if (!draft.timeLimit || draft.timeLimit <= 0) errors.push('时间限制必须大于 0');
            if (!draft.workerCount || draft.workerCount <= 0) errors.push('拣货员数量必须大于 0');
            if (draft.cartCount === undefined || draft.cartCount < 0) errors.push('推车数量不能为负数');
            if (!draft.mapWidth || draft.mapWidth < 4 || draft.mapWidth > 20) errors.push('地图宽度应在 4-20 之间');
            if (!draft.mapHeight || draft.mapHeight < 4 || draft.mapHeight > 20) errors.push('地图高度应在 4-20 之间');

            const orders = draft.orders || [];
            if (orders.length === 0) {
                warnings.push('还没有创建订单');
            } else if (draft.minOrdersToPass > orders.length) {
                errors.push(`通关最少订单数(${draft.minOrdersToPass})不能超过订单总数(${orders.length})`);
            }

            if (!draft.targetScore || draft.targetScore === 0) {
                warnings.push('目标分数为 0，通关评级可能不准确');
            }

            for (let i = 0; i < orders.length; i++) {
                const o = orders[i];
                if (!o.id) errors.push(`订单 #${i + 1} 的 ID 不能为空`);
                for (let j = i + 1; j < orders.length; j++) {
                    if (o.id && orders[j].id && o.id === orders[j].id) {
                        errors.push(`存在重复的订单 ID：${o.id}`);
                    }
                }
            }

            return { errors, warnings };
        }

        _publishDraft(draftId) {
            const draft = Storage.loadDraft(draftId);
            if (!draft) return;

            this.ui.draftEditor.currentDraftId = draftId;
            this.ui.draftEditor.draft = { ...draft };
            delete this.ui.draftEditor.draft._meta;
            this.ui.draftEditor.publish();
        }

        _openPublishHistory() {
            this.currentFilter = 'all';
            document.getElementById('publish-history-filter').value = 'all';
            this._renderPublishHistory();
            document.getElementById('publish-history-modal').classList.add('active');
        }

        _closePublishHistory() {
            document.getElementById('publish-history-modal').classList.remove('active');
        }

        _renderPublishHistory() {
            const list = document.getElementById('publish-history-list');
            const history = Storage.loadPublishHistory();

            let filtered = history;
            if (this.currentFilter === 'success') {
                filtered = history.filter(r => !r.undone && r.success);
            } else if (this.currentFilter === 'conflict') {
                filtered = history.filter(r => !r.undone && r.conflictType);
            } else if (this.currentFilter === 'undone') {
                filtered = history.filter(r => r.undone);
            }

            if (filtered.length === 0) {
                list.innerHTML = '<div class="publish-history-empty">暂无发布记录</div>';
                return;
            }

            const typeLabels = {
                publish: { label: '新发布', class: 'publish' },
                publish_overwrite: { label: '覆盖发布', class: 'publish_overwrite' },
                publish_save_as_new: { label: '另存为新', class: 'publish_save_as_new' },
                conflict_resolved: { label: '冲突处理', class: 'conflict_resolved' },
                undo_publish: { label: '撤销发布', class: 'undo_publish' }
            };

            const self = this;
            list.innerHTML = filtered.map(r => {
                const typeInfo = typeLabels[r.operationType] || { label: r.operationType, class: 'publish' };
                const undoneClass = r.undone ? 'undone' : '';

                let detailsHtml = '';

                if (r.conflictType) {
                    const conflictLabels = {
                        id_conflict: 'ID 冲突',
                        name_conflict: '名称冲突',
                        both_conflict: 'ID 和名称冲突',
                        builtin: '内置关卡冲突'
                    };
                    detailsHtml += `<div class="publish-history-item-detail-row">
                        <span class="publish-history-item-detail-label">冲突：</span>
                        <span>${conflictLabels[r.conflictType] || r.conflictType}</span>
                    </div>`;
                }

                if (r.resolution) {
                    const resolutionLabels = {
                        overwrite: '选择覆盖',
                        save_as_new: '另存为新关卡',
                        change_id: '更换 ID 重发',
                        change_name: '更换名称重发',
                        back_to_draft: '退回草稿继续修改',
                        cancel: '取消发布'
                    };
                    detailsHtml += `<div class="publish-history-item-detail-row">
                        <span class="publish-history-item-detail-label">处理：</span>
                        <span>${resolutionLabels[r.resolution] || r.resolution}</span>
                    </div>`;
                }

                if (r.reason) {
                    detailsHtml += `<div class="publish-history-item-detail-row">
                        <span class="publish-history-item-detail-label">原因：</span>
                        <span class="publish-history-item-reason">${r.reason}</span>
                    </div>`;
                }

                if (r.wasOverwrite !== undefined) {
                    detailsHtml += `<div class="publish-history-item-detail-row">
                        <span class="publish-history-item-detail-label">类型：</span>
                        <span>${r.wasOverwrite ? '覆盖原有' : '全新发布'}</span>
                    </div>`;
                }

                if (r.newId && r.newId !== r.levelId) {
                    detailsHtml += `<div class="publish-history-item-detail-row">
                        <span class="publish-history-item-detail-label">新 ID：</span>
                        <span class="publish-history-item-id">${r.newId}</span>
                    </div>`;
                }
                if (r.newName && r.newName !== r.levelName) {
                    detailsHtml += `<div class="publish-history-item-detail-row">
                        <span class="publish-history-item-detail-label">新名称：</span>
                        <span>${r.newName}</span>
                    </div>`;
                }

                let undoneHtml = '';
                if (r.undone) {
                    undoneHtml = `<div class="publish-history-undone-label">
                        ✖️ 已撤销 · ${formatTimestamp(r.undoneAt)}
                    </div>`;
                }

                return `
                    <div class="publish-history-item ${undoneClass}">
                        <div class="publish-history-item-header">
                            <div class="publish-history-item-title">
                                <span class="publish-history-item-name">${r.levelName || r.levelId}</span>
                                <span class="publish-history-item-id">${r.levelId}</span>
                                <span class="publish-history-item-type ${typeInfo.class}">${typeInfo.label}</span>
                            </div>
                            <span class="publish-history-item-time">${formatTimestamp(r.timestamp)}</span>
                        </div>
                        <div class="publish-history-item-details">
                            ${detailsHtml}
                        </div>
                        ${undoneHtml}
                    </div>
                `;
            }).join('');
        }

        refresh() {
            this._renderDraftList();
            this._renderStats();
            if (this.selectedDraftId) {
                this._renderPrecheck(this.selectedDraftId);
            }
        }
    }

    return { Workbench };
})();
