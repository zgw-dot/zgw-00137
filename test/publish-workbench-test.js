const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== 关卡发布登记台 - 完整链路专项测试 ===\n');

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
console.log(`   模块加载状态: Storage=true, PublishWorkbench=true, LEVEL_1=true`);

const mockUIController = {
    showNotification: () => {},
    showError: () => {},
    refreshLevelList: () => {},
    updateLastOpHint: () => {},
    closePublishConflict: () => {},
    showPublishConflict: () => {},
    showPublishRenameSection: () => {},
    getDraftEditor: () => ({ close: () => {} })
};

console.log('\n📋 开始发布登记台专项测试...\n');

let workbench;
let testLevelConfig;

test('1. 初始化发布工作台', () => {
    workbench = new PublishWorkbench.Workbench(mockUIController);
    assert(!!workbench, '发布工作台初始化失败');
    assert(typeof workbench.checkAndPublish === 'function', 'checkAndPublish 方法不存在');
    assert(typeof workbench.undoLastPublish === 'function', 'undoLastPublish 方法不存在');
    assert(typeof workbench.renderPublishHistory === 'function', 'renderPublishHistory 方法不存在');
});

test('2. 验证双重冲突检测 - ID冲突', () => {
    Storage.saveCustomLevel('custom-1', { id: 'custom-1', name: '测试关卡1', map: [['SPAWN','SHELF','PACKING']], workers: 1, orders: [{id:'O1',shelfId:'S1'}], minOrdersToPass: 1 });
    
    const conflict = Storage.checkLevelConflict('custom-1', '其他名字');
    assert(conflict.hasConflict, 'ID 冲突应被检测到');
    assert(conflict.conflictType === 'id_conflict', '冲突类型应为 id_conflict');
    assert(conflict.existingLevel.name === '测试关卡1', '应找到已存在的关卡');
});

test('3. 验证双重冲突检测 - 名称冲突', () => {
    const conflict = Storage.checkLevelConflict('custom-2', '测试关卡1');
    assert(conflict.hasConflict, '名称冲突应被检测到');
    assert(conflict.conflictType === 'name_conflict', '冲突类型应为 name_conflict');
    assert(conflict.existingLevel.id === 'custom-1', '应找到已存在的关卡');
});

test('4. 验证双重冲突检测 - 双重冲突', () => {
    const conflict = Storage.checkLevelConflict('custom-1', '测试关卡1');
    assert(conflict.hasConflict, '双重冲突应被检测到');
    assert(conflict.conflictType === 'both_conflict', '冲突类型应为 both_conflict');
});

test('5. 验证双重冲突检测 - 内置关卡冲突', () => {
    const conflict = Storage.checkLevelConflict(LEVEL_1.id, '新关卡名');
    assert(conflict.hasConflict, '内置关卡ID冲突应被检测到');
    assert(conflict.conflictType === 'builtin_conflict', '冲突类型应为 builtin_conflict');
    assert(conflict.isBuiltin, '应标记为内置关卡冲突');
});

test('6. 验证双重冲突检测 - 无冲突', () => {
    const conflict = Storage.checkLevelConflict('custom-new', '全新关卡名');
    assert(!conflict.hasConflict, '不应检测到冲突');
    assert(conflict.conflictType === 'no_conflict', '冲突类型应为 no_conflict');
});

test('7. 正常发布流程 - 发布新关卡', () => {
    Storage.clearAllCustomData();
    
    const levelConfig = {
        id: 'test-publish-1',
        name: '发布测试关卡1',
        map: [
            ['SPAWN', 'SHELF', 'SHELF', 'PACKING'],
            ['SHELF', 'SHELF', 'SHELF', 'SHELF']
        ],
        workers: 2,
        orders: [
            { id: 'O-001', shelfId: 'S1', quantity: 1, dueTime: 100 }
        ],
        minOrdersToPass: 1,
        difficulty: 'easy'
    };
    
    const result = workbench.checkAndPublish('draft-1', levelConfig, 'draft');
    
    assert(result.success, '发布应成功');
    assert(!result.conflict, '不应有冲突');
    assert(result.recordId, '应返回记录ID');
    
    const savedLevel = Storage.getCustomLevel('test-publish-1');
    assert(!!savedLevel, '关卡应已保存');
    assert(savedLevel.name === '发布测试关卡1', '关卡名称应正确');
    
    const history = Storage.loadPublishHistory();
    assert(history.length === 1, '发布历史应有1条记录');
    assert(history[0].type === 'publish_new', '发布类型应为 publish_new');
    assert(history[0].success, '记录应标记为成功');
    assert(history[0].levelId === 'test-publish-1', '记录应包含正确的关卡ID');
    assert(history[0].levelName === '发布测试关卡1', '记录应包含正确的关卡名称');
});

test('8. 发布历史记录验证 - 完整记录字段', () => {
    const history = Storage.loadPublishHistory();
    const record = history[0];
    
    assert(!!record.recordId, '记录应有 recordId');
    assert(!!record.timestamp, '记录应有 timestamp');
    assert(!!record.sourceType, '记录应有 sourceType');
    assert(typeof record.success === 'boolean', '记录应有 success 字段');
    assert(record.conflictType === 'no_conflict', '冲突类型应为 no_conflict');
    assert(record.decision === 'publish', '决策应为 publish');
    assert(!!record.result, '记录应有 result 字段');
    assert(Array.isArray(record.conflictDetails), '冲突详情应为数组');
    assert(record.conflictDetails.length === 0, '冲突详情应为空数组');
});

test('9. ID冲突处理 - 覆盖发布', () => {
    Storage.clearAllCustomData();
    
    const level1 = {
        id: 'conflict-test',
        name: '原始关卡',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    Storage.saveCustomLevel('conflict-test', level1);
    
    const level2 = {
        id: 'conflict-test',
        name: '覆盖后的关卡',
        map: [['SPAWN', 'SHELF', 'SHELF', 'PACKING']],
        workers: 2,
        orders: [
            { id: 'O1', shelfId: 'S1' },
            { id: 'O2', shelfId: 'S2' }
        ],
        minOrdersToPass: 1
    };
    
    const result = workbench.checkAndPublish('draft-2', level2, 'draft');
    assert(!result.success, '直接发布应失败（有冲突）');
    assert(result.conflict, '应检测到冲突');
    assert(result.conflictType === 'id_conflict', '应只是ID冲突（名称不同）');
    
    const overwriteResult = workbench.handleOverwrite();
    assert(overwriteResult.success, '覆盖发布应成功');
    assert(overwriteResult.type === 'publish_overwrite', '发布类型应为 publish_overwrite');
    
    const savedLevel = Storage.getCustomLevel('conflict-test');
    assert(savedLevel.name === '覆盖后的关卡', '关卡名称应已更新');
    assert(savedLevel.workers === 2, '拣货员数量应已更新');
    
    const history = Storage.loadPublishHistory();
    const lastRecord = history[0];
    assert(lastRecord.type === 'publish_overwrite', '历史记录类型应为 publish_overwrite');
    assert(lastRecord.conflictType === 'id_conflict' || lastRecord.conflictType === 'both_conflict', '记录应包含冲突类型');
    assert(lastRecord.decision === 'overwrite', '决策应为 overwrite');
});

test('10. 名称冲突处理 - 改名另存为新关卡', () => {
    Storage.clearAllCustomData();
    
    const level1 = {
        id: 'level-original',
        name: '重名关卡',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    Storage.saveCustomLevel('level-original', level1);
    
    const level2 = {
        id: 'level-new',
        name: '重名关卡',
        map: [['SPAWN', 'SHELF', 'SHELF', 'PACKING']],
        workers: 2,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    
    const result = workbench.checkAndPublish('draft-3', level2, 'draft');
    assert(!result.success, '直接发布应失败（名称冲突）');
    assert(result.conflictType === 'name_conflict', '应是名称冲突');
    
    const saveAsResult = workbench.handleSaveAsNew('新的关卡名', 'level-new-id');
    assert(saveAsResult.success, '改名另存应成功');
    assert(saveAsResult.type === 'publish_save_as_new', '发布类型应为 publish_save_as_new');
    
    const originalLevel = Storage.getCustomLevel('level-original');
    assert(originalLevel.name === '重名关卡', '原关卡应保持不变');
    
    const newLevel = Storage.getCustomLevel('level-new-id');
    assert(!!newLevel, '新关卡应已创建');
    assert(newLevel.name === '新的关卡名', '新关卡名称应正确');
    assert(newLevel.workers === 2, '新关卡拣货员数量应正确');
    
    const history = Storage.loadPublishHistory();
    const lastRecord = history[0];
    assert(lastRecord.type === 'publish_save_as_new', '历史记录类型应为 publish_save_as_new');
    assert(lastRecord.decision === 'save_as_new', '决策应为 save_as_new');
    assert(lastRecord.newLevelId === 'level-new-id', '记录应包含新关卡ID');
    assert(lastRecord.newLevelName === '新的关卡名', '记录应包含新关卡名称');
});

test('11. 冲突处理 - 退回草稿', () => {
    Storage.clearAllCustomData();
    
    const level1 = {
        id: 'test-id',
        name: '测试关卡',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    Storage.saveCustomLevel('test-id', level1);
    
    const level2 = {
        id: 'test-id',
        name: '新关卡',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    
    const result = workbench.checkAndPublish('draft-back', level2, 'draft');
    assert(!result.success, '直接发布应失败');
    
    const backResult = workbench.handleBackToDraft('需要修改名称');
    assert(!backResult.success, '退回草稿不应视为发布成功');
    assert(backResult.type === 'conflict_back_to_draft', '类型应为 conflict_back_to_draft');
    assert(backResult.reason === '需要修改名称', '应包含原因');
    
    const history = Storage.loadPublishHistory();
    const lastRecord = history[0];
    assert(lastRecord.type === 'conflict_back_to_draft', '历史记录类型应为 conflict_back_to_draft');
    assert(lastRecord.success === false, '记录应标记为失败');
    assert(lastRecord.decision === 'back_to_draft', '决策应为 back_to_draft');
    
    const originalLevel = Storage.getCustomLevel('test-id');
    assert(originalLevel.name === '测试关卡', '原关卡应保持不变');
});

test('12. 冲突处理 - 取消发布', () => {
    Storage.clearAllCustomData();
    
    const level1 = {
        id: 'cancel-test',
        name: '取消测试关卡',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    Storage.saveCustomLevel('cancel-test', level1);
    
    const level2 = {
        id: 'cancel-test',
        name: '新关卡',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    
    const result = workbench.checkAndPublish('draft-cancel', level2, 'draft');
    assert(!result.success, '直接发布应失败');
    
    const cancelResult = workbench.handleCancel();
    assert(!cancelResult.success, '取消发布不应视为成功');
    assert(cancelResult.type === 'conflict_cancel', '类型应为 conflict_cancel');
    
    const history = Storage.loadPublishHistory();
    const lastRecord = history[0];
    assert(lastRecord.type === 'conflict_cancel', '历史记录类型应为 conflict_cancel');
    assert(lastRecord.success === false, '记录应标记为失败');
    assert(lastRecord.decision === 'cancel', '决策应为 cancel');
});

test('13. 内置关卡冲突处理', () => {
    Storage.clearAllCustomData();
    
    const levelConfig = {
        id: LEVEL_1.id,
        name: '我的关卡',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    
    const result = workbench.checkAndPublish('draft-builtin', levelConfig, 'draft');
    assert(!result.success, '直接发布应失败（内置关卡ID冲突）');
    assert(result.conflictType === 'builtin_conflict', '冲突类型应为 builtin_conflict');
    
    const saveAsResult = workbench.handleSaveAsNew('我的自定义关卡', 'my-custom-level');
    assert(saveAsResult.success, '改名另存应成功');
    
    const savedLevel = Storage.getCustomLevel('my-custom-level');
    assert(!!savedLevel, '新关卡应已保存');
    assert(savedLevel.name === '我的自定义关卡', '关卡名称应正确');
});

test('14. 撤销最近一次发布', () => {
    Storage.clearAllCustomData();
    
    const levelConfig = {
        id: 'undo-test',
        name: '撤销测试关卡',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    
    const publishResult = workbench.checkAndPublish('draft-undo', levelConfig, 'draft');
    assert(publishResult.success, '发布应成功');
    
    const levelBeforeUndo = Storage.getCustomLevel('undo-test');
    assert(!!levelBeforeUndo, '发布后关卡应存在');
    
    const historyBefore = Storage.loadPublishHistory();
    const countBefore = historyBefore.length;
    
    const undoResult = workbench.undoLastPublish();
    assert(undoResult.success, '撤销应成功');
    assert(undoResult.type === 'undo_publish', '类型应为 undo_publish');
    
    const levelAfterUndo = Storage.getCustomLevel('undo-test');
    assert(!levelAfterUndo, '撤销后关卡应被删除');
    
    const snapshot = Storage.getExtendedPublishSnapshot();
    assert(!snapshot, '撤销快照应已清除');
    
    const historyAfter = Storage.loadPublishHistory();
    const lastRecord = historyAfter[0];
    assert(lastRecord.type === 'undo_publish', '最后一条记录应为撤销记录');
    
    const originalPublishRecord = historyAfter.find(r => r.levelId === 'undo-test' && r.type === 'publish_new');
    assert(originalPublishRecord, '应找到原发布记录');
    assert(originalPublishRecord.undone === true, '原发布记录应被标记为已撤销');
    
    const undoRecord = historyAfter.find(r => r.type === 'undo_publish');
    assert(!!undoRecord, '应存在撤销记录');
});

test('15. 无快照时撤销应失败', () => {
    Storage.clearAllCustomData();
    Storage.clearExtendedPublishSnapshot();
    
    const result = workbench.undoLastPublish();
    assert(!result.success, '无快照时撤销应失败');
    assert(result.reason === 'no_undo_snapshot', '失败原因应为 no_undo_snapshot');
});

test('16. 覆盖发布后撤销 - 应恢复原关卡', () => {
    Storage.clearAllCustomData();
    
    const originalLevel = {
        id: 'overwrite-undo',
        name: '原始关卡名',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1,
        difficulty: 'easy'
    };
    Storage.saveCustomLevel('overwrite-undo', originalLevel);
    
    const newLevel = {
        id: 'overwrite-undo',
        name: '新关卡名',
        map: [['SPAWN', 'SHELF', 'SHELF', 'PACKING']],
        workers: 2,
        orders: [
            { id: 'O1', shelfId: 'S1' },
            { id: 'O2', shelfId: 'S2' }
        ],
        minOrdersToPass: 1,
        difficulty: 'medium'
    };
    
    workbench.checkAndPublish('draft-1', newLevel, 'draft');
    workbench.handleOverwrite();
    
    const levelAfterOverwrite = Storage.getCustomLevel('overwrite-undo');
    assert(levelAfterOverwrite.name === '新关卡名', '覆盖后名称应更新');
    assert(levelAfterOverwrite.workers === 2, '覆盖后拣货员数量应更新');
    
    const undoResult = workbench.undoLastPublish();
    assert(undoResult.success, '撤销应成功');
    
    const levelAfterUndo = Storage.getCustomLevel('overwrite-undo');
    assert(!!levelAfterUndo, '撤销后关卡应仍然存在');
    assert(levelAfterUndo.name === '原始关卡名', '撤销后名称应恢复');
    assert(levelAfterUndo.workers === 1, '撤销后拣货员数量应恢复');
    assert(levelAfterUndo.difficulty === 'easy', '撤销后难度应恢复');
});

test('17. 发布历史记录 - 数量限制', () => {
    Storage.clearAllCustomData();
    Storage.clearPublishHistory();
    
    for (let i = 0; i < 60; i++) {
        const levelConfig = {
            id: `bulk-${i}`,
            name: `批量关卡${i}`,
            map: [['SPAWN', 'SHELF', 'PACKING']],
            workers: 1,
            orders: [{ id: `O${i}`, shelfId: 'S1' }],
            minOrdersToPass: 1
        };
        workbench.checkAndPublish(`draft-${i}`, levelConfig, 'draft');
    }
    
    const history = Storage.loadPublishHistory();
    assert(history.length <= 50, '发布历史最多保留50条');
});

test('18. 跨重启持久化 - 发布记录', () => {
    Storage.clearAllCustomData();
    
    const levelConfig = {
        id: 'persist-test',
        name: '持久化测试关卡',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    
    workbench.checkAndPublish('draft-persist', levelConfig, 'draft');
    
    const savedData = JSON.stringify(context.localStorage.data);
    context.localStorage.data = JSON.parse(savedData);
    
    const history = Storage.loadPublishHistory();
    assert(history.length === 1, '跨重启后发布历史应保留');
    assert(history[0].levelName === '持久化测试关卡', '记录内容应正确');
    
    const level = Storage.getCustomLevel('persist-test');
    assert(!!level, '跨重启后关卡数据应保留');
});

test('19. 跨重启持久化 - 撤销快照', () => {
    Storage.clearAllCustomData();
    
    const levelConfig = {
        id: 'undo-persist',
        name: '撤销持久化测试',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    
    workbench.checkAndPublish('draft-undo-persist', levelConfig, 'draft');
    
    const snapshotBefore = Storage.getExtendedPublishSnapshot();
    assert(!!snapshotBefore, '发布后应有撤销快照');
    
    const savedData = JSON.stringify(context.localStorage.data);
    context.localStorage.data = JSON.parse(savedData);
    
    const snapshotAfter = Storage.getExtendedPublishSnapshot();
    assert(!!snapshotAfter, '跨重启后撤销快照应保留');
    assert(snapshotAfter.levelId === 'undo-persist', '快照关卡ID应正确');
});

test('20. 跨重启持久化 - 撤销后状态', () => {
    Storage.clearAllCustomData();
    
    const levelConfig = {
        id: 'undo-after-restart',
        name: '重启后撤销测试',
        map: [['SPAWN', 'SHELF', 'PACKING']],
        workers: 1,
        orders: [{ id: 'O1', shelfId: 'S1' }],
        minOrdersToPass: 1
    };
    
    workbench.checkAndPublish('draft-1', levelConfig, 'draft');
    
    const savedData = JSON.stringify(context.localStorage.data);
    context.localStorage.data = JSON.parse(savedData);
    
    const newWorkbench = new PublishWorkbench.Workbench(mockUIController);
    const undoResult = newWorkbench.undoLastPublish();
    
    assert(undoResult.success, '重启后仍能撤销发布');
    
    const level = Storage.getCustomLevel('undo-after-restart');
    assert(!level, '撤销后关卡应被删除');
    
    const history = Storage.loadPublishHistory();
    const undoRecord = history.find(r => r.type === 'undo_publish');
    assert(!!undoRecord, '应存在撤销记录');
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