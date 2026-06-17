const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== 发布冲突链路 + 跨重启恢复 + 撤销发布 - 回归测试 ===\n');

const testResults = [];

function test(name, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${name}`);
        testResults.push({ name, passed: true });
    } catch (e) {
        console.log(`❌ FAIL: ${name}`);
        console.log(`   错误: ${e.message}`);
        testResults.push({ name, passed: false, error: e.message });
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || '断言失败');
    }
}

console.log('🔧 准备浏览器环境模拟...\n');

const context = {
    console: console,
    localStorage: {
        data: {},
        getItem: function(key) { return this.data[key] || null; },
        setItem: function(key, value) { this.data[key] = value; },
        removeItem: function(key) { delete this.data[key]; }
    },
    document: {
        elements: {},
        getElementById: function(id) {
            if (!this.elements[id]) {
                this.elements[id] = {
                    innerHTML: '',
                    textContent: '',
                    value: '',
                    options: [],
                    disabled: false,
                    checked: false,
                    style: {},
                    classList: {
                        add: () => {},
                        remove: () => {},
                        contains: () => false
                    },
                    addEventListener: () => {},
                    appendChild: () => {},
                    removeChild: () => {},
                    closest: () => null
                };
            }
            return this.elements[id];
        },
        createElement: function(tag) {
            return {
                tagName: tag,
                innerHTML: '',
                textContent: '',
                value: '',
                disabled: false,
                checked: false,
                style: {},
                classList: { add: () => {}, remove: () => {} },
                addEventListener: () => {},
                appendChild: () => {},
                setAttribute: () => {},
                getAttribute: () => null,
                querySelector: () => this.createElement('div'),
                querySelectorAll: () => [],
                closest: () => null
            };
        },
        querySelector: function() { return this.createElement('div'); },
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        readyState: 'complete'
    },
    window: {
        addEventListener: () => {},
        cancelAnimationFrame: () => {},
        requestAnimationFrame: function(cb) {
            if (!this._rafCallbacks) this._rafCallbacks = [];
            this._rafCallbacks.push(cb);
            return this._rafCallbacks.length;
        },
        confirm: () => true,
        alert: () => {}
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date,
    JSON: JSON,
    Math: Math,
    Infinity: Infinity
};
context.requestAnimationFrame = context.window.requestAnimationFrame.bind(context.window);
context.cancelAnimationFrame = context.window.cancelAnimationFrame;

vm.createContext(context);

function loadScript(filePath) {
    const content = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
    const modifiedContent = content.replace(/^const\s+(\w+)\s*=/gm, 'var $1 =');
    vm.runInContext(modifiedContent, context, { filename: filePath });
}

console.log('📦 加载游戏模块...');
loadScript('js/storage/persistence.js');
loadScript('js/game/models.js');
loadScript('js/game/collision.js');
loadScript('js/game/scoring.js');
loadScript('js/game/engine.js');
loadScript('js/levels/level1.js');
loadScript('js/levels/level2.js');
loadScript('js/ui/publish-workbench.js');

const Storage = context.Storage;
const PublishWorkbench = context.PublishWorkbench;
const LEVEL_1 = context.LEVEL_1;
const LEVEL_2 = context.LEVEL_2;

assert(!!Storage, 'Storage 模块加载失败');
assert(!!PublishWorkbench, 'PublishWorkbench 模块加载失败');
assert(!!LEVEL_1, 'LEVEL_1 模块加载失败');
assert(typeof PublishWorkbench._makeResult === 'function', '_makeResult 应被导出');

const mockUIController = {
    infoPanel: { showNotification: () => {} },
    showError: () => {},
    refreshLevelList: () => {},
    updateLastOpHint: () => {},
    closePublishConflict: () => {},
    showPublishConflict: () => {},
    showPublishRenameSection: () => {},
    getDraftEditor: () => ({ close: () => {} }),
    _syncAfterPublish: () => {}
};

console.log('\n📋 开始回归测试...\n');

let workbench;

const SAMPLE_LEVEL = {
    id: 'test-level',
    name: '测试关卡',
    difficulty: 1,
    timeLimit: 180,
    mapWidth: 8,
    mapHeight: 8,
    mapData: [
        ['sp', 'a', 'a', 'a', 'a', 'a', 'a', 'sp'],
        ['s:S1', 'a', 's:S2', 'a', 's:S3', 'a', 's:S4', 'a'],
        ['e', 'a', 'e', 'a', 'e', 'a', 'e', 'a'],
        ['s:S5', 'a', 's:S6', 'a', 's:S7', 'a', 's:S8', 'a'],
        ['e', 'a', 'e', 'a', 'e', 'a', 'e', 'a'],
        ['s:S9', 'a', 's:S10', 'a', 's:S11', 'a', 's:S12', 'a'],
        ['e', 'a', 'e', 'a', 'e', 'a', 'e', 'a'],
        ['sp', 'a', 'a', 'p', 'p', 'a', 'a', 'sp']
    ],
    workerCount: 2,
    cartCount: 2,
    orders: [
        { id: 'O-001', shelfId: 'S1', deadline: 120, items: ['商品A'] },
        { id: 'O-002', shelfId: 'S5', deadline: 100, items: ['商品B'] },
        { id: 'O-003', shelfId: 'S8', deadline: 140, items: ['商品C'] },
        { id: 'O-004', shelfId: 'S12', deadline: 160, items: ['商品D'] }
    ],
    pickDuration: 3,
    packDuration: 2,
    targetScore: 500,
    minOrdersToPass: 4
};

function resetState() {
    Storage.clearAllCustomData();
    workbench = new PublishWorkbench.Workbench(mockUIController);
}

test('1. _makeResult 返回统一结构', () => {
    const result = PublishWorkbench._makeResult({ success: true, type: 'test' });
    assert(result.success === true, 'success 应为 true');
    assert(result.type === 'test', 'type 应为 test');
    assert(result.conflict === false, 'conflict 默认 false');
    assert(result.conflictType === 'no_conflict', 'conflictType 默认 no_conflict');
    assert(result.needUIRefresh === false, 'needUIRefresh 默认 false');
    assert(result.recordId === null, 'recordId 默认 null');
    assert(result.newLevelId === null, 'newLevelId 默认 null');
});

test('2. 无冲突直接发布 - 完整数据流', () => {
    resetState();

    const result = workbench.checkAndPublish('draft-1', { ...SAMPLE_LEVEL, id: 'clean-1', name: '无冲突关卡' }, 'draft');

    assert(result.success === true, '发布应成功');
    assert(result.conflict === false, '不应有冲突');
    assert(result.type === 'publish_new', '类型应为 publish_new');
    assert(result.needUIRefresh === true, '需要UI刷新');
    assert(result.levelId === 'clean-1', 'levelId 应正确');
    assert(!!result.recordId, '应有 recordId');

    const saved = Storage.getCustomLevel('clean-1');
    assert(!!saved, '关卡应已写入存储');
    assert(saved.name === '无冲突关卡', '关卡名称应正确');

    const history = Storage.loadPublishHistory();
    assert(history.length === 1, '应有1条发布记录');
    assert(history[0].type === 'publish_new', '记录类型应为 publish_new');
    assert(history[0].success === true, '记录应标记成功');
    assert(history[0].levelId === 'clean-1', '记录 levelId 应正确');
});

test('3. ID冲突 → 覆盖发布 - 完整数据流', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'conflict-1', name: '原始关卡' });

    const result = workbench.checkAndPublish('draft-2', { ...SAMPLE_LEVEL, id: 'conflict-1', name: '新关卡' }, 'draft');

    assert(result.success === false, '直接发布应失败');
    assert(result.conflict === true, '应检测到冲突');
    assert(result.conflictType === 'id_conflict', '冲突类型应为 id_conflict');

    const overwriteResult = workbench.handleOverwrite();
    assert(overwriteResult.success === true, '覆盖发布应成功');
    assert(overwriteResult.type === 'publish_overwrite', '类型应为 publish_overwrite');
    assert(overwriteResult.wasOverwrite === true, '应标记为覆盖');
    assert(overwriteResult.needUIRefresh === true, '需要UI刷新');

    const saved = Storage.getCustomLevel('conflict-1');
    assert(saved.name === '新关卡', '关卡名称应已更新');

    const history = Storage.loadPublishHistory();
    const overwriteRecord = history.find(r => r.type === 'publish_overwrite');
    assert(!!overwriteRecord, '应有覆盖发布记录');
    assert(overwriteRecord.decision === 'overwrite', '决策应为 overwrite');
});

test('4. ID冲突 → 改名另存 - 完整数据流（核心修复点）', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'original-id', name: '原始关卡' });

    const result = workbench.checkAndPublish('draft-3', { ...SAMPLE_LEVEL, id: 'original-id', name: '新关卡' }, 'draft');

    assert(result.conflict === true, '应检测到冲突');

    const saveAsResult = workbench.handleSaveAsNew('新关卡名', 'new-level-id');

    assert(saveAsResult.success === true, '改名另存应成功');
    assert(saveAsResult.type === 'publish_save_as_new', '类型应为 publish_save_as_new');
    assert(saveAsResult.newLevelId === 'new-level-id', 'newLevelId 应正确');
    assert(saveAsResult.newLevelName === '新关卡名', 'newLevelName 应正确');
    assert(saveAsResult.originalId === 'original-id', 'originalId 应正确');
    assert(saveAsResult.originalName === '新关卡', 'originalName 应正确');
    assert(saveAsResult.needUIRefresh === true, '需要UI刷新');

    const originalLevel = Storage.getCustomLevel('original-id');
    assert(originalLevel.name === '原始关卡', '原关卡应保持不变');

    const newLevel = Storage.getCustomLevel('new-level-id');
    assert(!!newLevel, '新关卡应已写入存储');
    assert(newLevel.name === '新关卡名', '新关卡名称应正确');
    assert(newLevel.id === 'new-level-id', '新关卡ID应正确');

    const history = Storage.loadPublishHistory();
    const saveAsRecord = history.find(r => r.type === 'publish_save_as_new');
    assert(!!saveAsRecord, '应有另存发布记录');
    assert(saveAsRecord.newLevelId === 'new-level-id', '记录应包含新关卡ID');
    assert(saveAsRecord.newLevelName === '新关卡名', '记录应包含新关卡名称');
    assert(saveAsRecord.originalId === 'original-id', '记录应包含原始ID');
    assert(saveAsRecord.success === true, '记录应标记成功');

    const undoSnapshot = Storage.getExtendedPublishSnapshot();
    assert(!!undoSnapshot, '应有撤销快照');
    assert(undoSnapshot.levelId === 'new-level-id', '快照应指向新关卡ID');

    const lastOp = Storage.loadLastOperation();
    assert(!!lastOp, '应有最近操作记录');
    assert(lastOp.type === 'publish_save_as_new', '操作类型应为 publish_save_as_new');
    assert(lastOp.levelId === 'new-level-id', '操作应指向新关卡ID');
});

test('5. 名称冲突 → 改名另存', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'level-a', name: '同名关卡' });

    const result = workbench.checkAndPublish('draft-4', { ...SAMPLE_LEVEL, id: 'level-b', name: '同名关卡' }, 'draft');

    assert(result.conflict === true, '应检测到名称冲突');
    assert(result.conflictType === 'name_conflict', '冲突类型应为 name_conflict');

    const saveAsResult = workbench.handleSaveAsNew('不同名', 'level-b-new');

    assert(saveAsResult.success === true, '改名另存应成功');

    const levelA = Storage.getCustomLevel('level-a');
    assert(levelA.name === '同名关卡', '原关卡A应不变');

    const newLevel = Storage.getCustomLevel('level-b-new');
    assert(!!newLevel, '新关卡应存在');
    assert(newLevel.name === '不同名', '新关卡名称应正确');
});

test('6. 双重冲突 → 改名另存', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'both-id', name: '双重冲突名' });

    const result = workbench.checkAndPublish('draft-5', { ...SAMPLE_LEVEL, id: 'both-id', name: '双重冲突名' }, 'draft');

    assert(result.conflict === true, '应检测到冲突');
    assert(result.conflictType === 'both_conflict', '冲突类型应为 both_conflict');

    const saveAsResult = workbench.handleSaveAsNew('全新名称', 'both-id-new');

    assert(saveAsResult.success === true, '改名另存应成功');

    const newLevel = Storage.getCustomLevel('both-id-new');
    assert(!!newLevel, '新关卡应存在');
    assert(newLevel.name === '全新名称', '新关卡名称应正确');
});

test('7. 内置关卡冲突 → 改名另存', () => {
    resetState();

    const result = workbench.checkAndPublish('draft-6', { ...SAMPLE_LEVEL, id: LEVEL_1.id, name: '我的关卡' }, 'draft');

    assert(result.conflict === true, '应检测到内置冲突');
    assert(result.conflictType === 'builtin_conflict', '冲突类型应为 builtin_conflict');

    const overwriteResult = workbench.handleOverwrite();
    assert(overwriteResult.success === false, '内置关卡不允许覆盖');
    assert(overwriteResult.reason === 'builtin_conflict', '原因应为 builtin_conflict');

    const saveAsResult = workbench.handleSaveAsNew('我的自定义关卡', 'my-custom-level');
    assert(saveAsResult.success === true, '改名另存应成功');

    const saved = Storage.getCustomLevel('my-custom-level');
    assert(!!saved, '新关卡应已写入');
    assert(saved.name === '我的自定义关卡', '关卡名称应正确');
});

test('8. 冲突 → 退回草稿', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'back-id', name: '退回测试' });

    workbench.checkAndPublish('draft-back', { ...SAMPLE_LEVEL, id: 'back-id', name: '新关卡' }, 'draft');

    const backResult = workbench.handleBackToDraft('需要修改');
    assert(backResult.success === false, '退回草稿不应视为成功');
    assert(backResult.type === 'conflict_back_to_draft', '类型应为 conflict_back_to_draft');
    assert(backResult.reason === '需要修改', '原因应正确');
    assert(backResult.needUIRefresh === true, '需要UI刷新');

    const history = Storage.loadPublishHistory();
    const backRecord = history.find(r => r.type === 'conflict_back_to_draft');
    assert(!!backRecord, '应有退回草稿记录');
    assert(backRecord.success === false, '记录应标记失败');
    assert(backRecord.decision === 'back_to_draft', '决策应为 back_to_draft');

    const originalLevel = Storage.getCustomLevel('back-id');
    assert(originalLevel.name === '退回测试', '原关卡应保持不变');
});

test('9. 冲突 → 取消发布', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'cancel-id', name: '取消测试' });

    workbench.checkAndPublish('draft-cancel', { ...SAMPLE_LEVEL, id: 'cancel-id', name: '新关卡' }, 'draft');

    const cancelResult = workbench.handleCancel();
    assert(cancelResult.success === false, '取消发布不应视为成功');
    assert(cancelResult.type === 'conflict_cancel', '类型应为 conflict_cancel');
    assert(cancelResult.needUIRefresh === true, '需要UI刷新');

    const history = Storage.loadPublishHistory();
    const cancelRecord = history.find(r => r.type === 'conflict_cancel');
    assert(!!cancelRecord, '应有取消发布记录');
    assert(cancelRecord.success === false, '记录应标记失败');
});

test('10. 改名另存 - 验证输入（空ID）', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'valid-id', name: '验证测试' });

    workbench.checkAndPublish('draft-valid', { ...SAMPLE_LEVEL, id: 'valid-id', name: '新关卡' }, 'draft');

    const result = workbench.handleSaveAsNew('有关卡名', '');
    assert(result.success === false, '空ID应失败');
    assert(result.reason === 'missing_id', '原因应为 missing_id');
});

test('11. 改名另存 - 验证输入（空名称）', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'valid-id2', name: '验证测试2' });

    workbench.checkAndPublish('draft-valid2', { ...SAMPLE_LEVEL, id: 'valid-id2', name: '新关卡' }, 'draft');

    const result = workbench.handleSaveAsNew('', 'some-id');
    assert(result.success === false, '空名称应失败');
    assert(result.reason === 'missing_name', '原因应为 missing_name');
});

test('12. 改名另存 - 验证输入（非法ID）', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'valid-id3', name: '验证测试3' });

    workbench.checkAndPublish('draft-valid3', { ...SAMPLE_LEVEL, id: 'valid-id3', name: '新关卡' }, 'draft');

    const result = workbench.handleSaveAsNew('名称', 'invalid id!');
    assert(result.success === false, '非法ID应失败');
    assert(result.reason === 'invalid_id', '原因应为 invalid_id');
});

test('13. 改名另存 - 验证输入（ID与内置关卡冲突）', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'valid-id4', name: '验证测试4' });

    workbench.checkAndPublish('draft-valid4', { ...SAMPLE_LEVEL, id: 'valid-id4', name: '新关卡' }, 'draft');

    const result = workbench.handleSaveAsNew('名称', 'level-1');
    assert(result.success === false, '内置关卡ID应失败');
    assert(result.reason === 'builtin_conflict', '原因应为 builtin_conflict');
});

test('14. 改名另存 - 验证输入（ID已被占用）', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'taken-id', name: '已占用' });
    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'conflict-id', name: '冲突测试' });

    workbench.checkAndPublish('draft-taken', { ...SAMPLE_LEVEL, id: 'conflict-id', name: '新关卡' }, 'draft');

    const result = workbench.handleSaveAsNew('名称', 'taken-id');
    assert(result.success === false, '已占用ID应失败');
    assert(result.reason === 'id_exists', '原因应为 id_exists');
});

test('15. 撤销新发布 - 关卡应被删除', () => {
    resetState();

    workbench.checkAndPublish('draft-undo1', { ...SAMPLE_LEVEL, id: 'undo-new', name: '撤销新发布' }, 'draft');

    assert(!!Storage.getCustomLevel('undo-new'), '发布后关卡应存在');

    const undoResult = workbench.undoLastPublish();
    assert(undoResult.success === true, '撤销应成功');
    assert(undoResult.type === 'undo_publish', '类型应为 undo_publish');
    assert(undoResult.wasOverwrite === false, '不是覆盖');
    assert(undoResult.needUIRefresh === true, '需要UI刷新');

    assert(!Storage.getCustomLevel('undo-new'), '撤销后关卡应被删除');

    const history = Storage.loadPublishHistory();
    const originalRecord = history.find(r => r.levelId === 'undo-new' && r.type === 'publish_new');
    assert(!!originalRecord, '应找到原始发布记录');
    assert(originalRecord.undone === true, '原始记录应标记已撤销');

    const undoRecord = history.find(r => r.type === 'undo_publish');
    assert(!!undoRecord, '应有撤销发布记录');
    assert(undoRecord.success === true, '撤销记录应标记成功');
});

test('16. 撤销覆盖发布 - 应恢复原关卡', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'undo-overwrite', name: '原始关卡', difficulty: 1 });

    workbench.checkAndPublish('draft-undo2', { ...SAMPLE_LEVEL, id: 'undo-overwrite', name: '覆盖后关卡', difficulty: 3 }, 'draft');
    workbench.handleOverwrite();

    assert(Storage.getCustomLevel('undo-overwrite').name === '覆盖后关卡', '覆盖后名称应更新');

    const undoResult = workbench.undoLastPublish();
    assert(undoResult.success === true, '撤销应成功');
    assert(undoResult.wasOverwrite === true, '是覆盖');

    const restored = Storage.getCustomLevel('undo-overwrite');
    assert(!!restored, '撤销后关卡应仍存在');
    assert(restored.name === '原始关卡', '名称应恢复');
    assert(restored.difficulty === 1, '难度应恢复');
});

test('17. 撤销改名另存发布 - 新关卡应被删除', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'undo-saveas-orig', name: '原始' });

    workbench.checkAndPublish('draft-undo3', { ...SAMPLE_LEVEL, id: 'undo-saveas-orig', name: '冲突' }, 'draft');
    const saveAsResult = workbench.handleSaveAsNew('另存名', 'undo-saveas-new');

    assert(saveAsResult.success === true, '改名另存应成功');
    assert(!!Storage.getCustomLevel('undo-saveas-new'), '另存后新关卡应存在');

    const undoResult = workbench.undoLastPublish();
    assert(undoResult.success === true, '撤销应成功');

    assert(!Storage.getCustomLevel('undo-saveas-new'), '撤销后新关卡应被删除');

    const original = Storage.getCustomLevel('undo-saveas-orig');
    assert(!!original, '原始关卡应保持不变');
    assert(original.name === '原始', '原始关卡名称应不变');
});

test('18. 无快照时撤销应失败', () => {
    resetState();
    Storage.clearExtendedPublishSnapshot();

    const result = workbench.undoLastPublish();
    assert(result.success === false, '无快照时撤销应失败');
    assert(result.reason === 'no_undo_snapshot', '原因应为 no_undo_snapshot');
    assert(result.needUIRefresh === false, '不需要UI刷新');
});

test('19. 跨重启持久化 - 发布记录', () => {
    resetState();

    workbench.checkAndPublish('draft-persist', { ...SAMPLE_LEVEL, id: 'persist-1', name: '持久化测试' }, 'draft');

    const savedData = JSON.stringify(context.localStorage.data);
    context.localStorage.data = JSON.parse(savedData);

    const history = Storage.loadPublishHistory();
    assert(history.length === 1, '跨重启后发布历史应保留');
    assert(history[0].levelName === '持久化测试', '记录内容应正确');

    const level = Storage.getCustomLevel('persist-1');
    assert(!!level, '跨重启后关卡数据应保留');
});

test('20. 跨重启持久化 - 撤销快照', () => {
    resetState();

    workbench.checkAndPublish('draft-undo-persist', { ...SAMPLE_LEVEL, id: 'undo-persist', name: '撤销持久化' }, 'draft');

    const snapshotBefore = Storage.getExtendedPublishSnapshot();
    assert(!!snapshotBefore, '发布后应有撤销快照');

    const savedData = JSON.stringify(context.localStorage.data);
    context.localStorage.data = JSON.parse(savedData);

    const snapshotAfter = Storage.getExtendedPublishSnapshot();
    assert(!!snapshotAfter, '跨重启后撤销快照应保留');
    assert(snapshotAfter.levelId === 'undo-persist', '快照关卡ID应正确');
});

test('21. 跨重启持久化 - 撤销后状态一致性', () => {
    resetState();

    workbench.checkAndPublish('draft-1', { ...SAMPLE_LEVEL, id: 'restart-undo', name: '重启后撤销测试' }, 'draft');

    const savedData = JSON.stringify(context.localStorage.data);
    context.localStorage.data = JSON.parse(savedData);

    const newWorkbench = new PublishWorkbench.Workbench(mockUIController);
    const undoResult = newWorkbench.undoLastPublish();

    assert(undoResult.success === true, '重启后仍能撤销发布');

    const level = Storage.getCustomLevel('restart-undo');
    assert(!level, '撤销后关卡应被删除');

    const history = Storage.loadPublishHistory();
    const undoRecord = history.find(r => r.type === 'undo_publish');
    assert(!!undoRecord, '应存在撤销记录');
});

test('22. 跨重启持久化 - 改名另存后撤销', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'orig-restart', name: '原始' });

    workbench.checkAndPublish('draft-1', { ...SAMPLE_LEVEL, id: 'orig-restart', name: '冲突' }, 'draft');
    workbench.handleSaveAsNew('新名', 'new-restart');

    const savedData = JSON.stringify(context.localStorage.data);
    context.localStorage.data = JSON.parse(savedData);

    const newWorkbench = new PublishWorkbench.Workbench(mockUIController);
    const undoResult = newWorkbench.undoLastPublish();

    assert(undoResult.success === true, '重启后应能撤销改名另存');

    assert(!Storage.getCustomLevel('new-restart'), '撤销后新关卡应被删除');
    assert(!!Storage.getCustomLevel('orig-restart'), '原始关卡应保持不变');

    const history = Storage.loadPublishHistory();
    const saveAsRecord = history.find(r => r.type === 'publish_save_as_new');
    assert(!!saveAsRecord, '改名另存记录应存在');
    assert(saveAsRecord.undone === true, '记录应标记已撤销');
});

test('23. 跨重启持久化 - 草稿状态保留', () => {
    resetState();

    const draftConfig = { ...SAMPLE_LEVEL, id: 'draft-level', name: '草稿关卡' };
    Storage.saveDraft('draft-keep', draftConfig);

    const savedData = JSON.stringify(context.localStorage.data);
    context.localStorage.data = JSON.parse(savedData);

    const draft = Storage.loadDraft('draft-keep');
    assert(!!draft, '跨重启后草稿应保留');
    assert(draft.name === '草稿关卡', '草稿名称应正确');
    assert(draft.id === 'draft-level', '草稿关卡ID应正确');
});

test('24. 发布记录上限 - 50条', () => {
    resetState();
    Storage.clearPublishHistory();

    for (let i = 0; i < 60; i++) {
        const wb = new PublishWorkbench.Workbench(mockUIController);
        wb.checkAndPublish(`draft-bulk-${i}`, { ...SAMPLE_LEVEL, id: `bulk-${i}`, name: `批量${i}` }, 'draft');
    }

    const history = Storage.loadPublishHistory();
    assert(history.length <= 50, `发布历史最多50条，实际 ${history.length}`);
});

test('25. 冲突检测 - 无冲突时不设置 _currentConflict', () => {
    resetState();

    workbench.checkAndPublish('draft-no-conflict', { ...SAMPLE_LEVEL, id: 'no-conflict', name: '无冲突' }, 'draft');

    assert(workbench._currentConflict === null, '无冲突时 _currentConflict 应为 null');
});

test('26. 冲突处理后 _currentConflict 被清除', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'clear-conflict', name: '冲突测试' });

    workbench.checkAndPublish('draft-clear', { ...SAMPLE_LEVEL, id: 'clear-conflict', name: '新' }, 'draft');
    assert(workbench._currentConflict !== null, '冲突时 _currentConflict 应存在');

    workbench.handleOverwrite();
    assert(workbench._currentConflict === null, '处理后 _currentConflict 应被清除');
});

test('27. 改名另存后 _currentConflict 被清除', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'clear-saveas', name: '冲突' });

    workbench.checkAndPublish('draft-clear2', { ...SAMPLE_LEVEL, id: 'clear-saveas', name: '新' }, 'draft');
    workbench.handleSaveAsNew('新名', 'clear-saveas-new');

    assert(workbench._currentConflict === null, '改名另存后 _currentConflict 应被清除');
});

test('28. 退回草稿后 _currentConflict 被清除', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'clear-back', name: '冲突' });

    workbench.checkAndPublish('draft-clear3', { ...SAMPLE_LEVEL, id: 'clear-back', name: '新' }, 'draft');
    workbench.handleBackToDraft();

    assert(workbench._currentConflict === null, '退回草稿后 _currentConflict 应被清除');
});

test('29. 取消发布后 _currentConflict 被清除', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'clear-cancel', name: '冲突' });

    workbench.checkAndPublish('draft-clear4', { ...SAMPLE_LEVEL, id: 'clear-cancel', name: '新' }, 'draft');
    workbench.handleCancel();

    assert(workbench._currentConflict === null, '取消发布后 _currentConflict 应被清除');
});

test('30. 完整链路：冲突 → 改名另存 → 刷新 → 撤销 → 再次验证', () => {
    resetState();

    Storage.saveCustomLevel({ ...SAMPLE_LEVEL, id: 'full-chain', name: '原始关卡' });

    const r1 = workbench.checkAndPublish('draft-chain', { ...SAMPLE_LEVEL, id: 'full-chain', name: '冲突关卡' }, 'draft');
    assert(r1.conflict === true, '步骤1: 应检测到冲突');
    assert(r1.needUIRefresh === false, '步骤1: 冲突时不需要UI刷新');

    const r2 = workbench.handleSaveAsNew('改名后关卡', 'full-chain-new');
    assert(r2.success === true, '步骤2: 改名另存应成功');
    assert(r2.needUIRefresh === true, '步骤2: 需要UI刷新');
    assert(!!Storage.getCustomLevel('full-chain-new'), '步骤2: 新关卡应已写入');
    assert(Storage.getCustomLevel('full-chain').name === '原始关卡', '步骤2: 原关卡不变');

    const lastOp = Storage.loadLastOperation();
    assert(lastOp.levelId === 'full-chain-new', '步骤2: 最近操作应指向新关卡');

    const r3 = workbench.undoLastPublish();
    assert(r3.success === true, '步骤3: 撤销应成功');
    assert(!Storage.getCustomLevel('full-chain-new'), '步骤3: 新关卡应被删除');
    assert(Storage.getCustomLevel('full-chain').name === '原始关卡', '步骤3: 原关卡仍不变');

    const history = Storage.loadPublishHistory();
    const saveRecord = history.find(r => r.type === 'publish_save_as_new' && r.levelId === 'full-chain-new');
    assert(!!saveRecord, '步骤3: 应找到改名另存记录');
    assert(saveRecord.undone === true, '步骤3: 记录应标记已撤销');
});

console.log('\n📊 测试结果统计:');
const passed = testResults.filter(r => r.passed).length;
const total = testResults.length;
console.log(`   通过: ${passed} / ${total}`);
if (passed < total) {
    console.log('\n❌ 失败的测试:');
    testResults.filter(r => !r.passed).forEach(r => {
        console.log(`   - ${r.name}: ${r.error}`);
    });
    process.exit(1);
} else {
    console.log('\n✅ 全部测试通过！');
    process.exit(0);
}
