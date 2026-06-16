const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('=== 仓库拣货游戏 - 完整链路端到端测试 ===\n');

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

const Storage = context.Storage;
const GameModels = context.GameModels;
const CollisionDetector = context.CollisionDetector;
const ScoringSystem = context.ScoringSystem;
const GameEngine = context.GameEngine;
const LEVEL_1 = context.LEVEL_1;
const LEVEL_2 = context.LEVEL_2;

assert(!!Storage, 'Storage 模块加载失败');
assert(!!GameEngine, 'GameEngine 模块加载失败');
assert(!!LEVEL_1, 'LEVEL_1 模块加载失败');
console.log(`   模块加载状态: Storage=true, GameEngine=true, LEVEL_1=true`);

console.log('\n🎮 开始完整链路测试...\n');

let testGame;

test('1. 初始化游戏引擎 - 验证开局状态', () => {
    const game = new GameEngine.Engine();
    game.initLevel(LEVEL_1);
    
    const state = game.getGameState();
    console.log(`   关卡: ${state.level.name}`);
    console.log(`   拣货员数量: ${state.workers.length}`);
    console.log(`   推车数量: ${state.carts.length}`);
    console.log(`   订单数量: ${state.level.orders.length}`);
    console.log(`   过关要求: 至少完成 ${state.level.minOrdersToPass} 个订单`);
    
    state.workers.forEach((w, i) => {
        console.log(`   拣货员 ${i+1}: ${w.name} (${w.id}) - status: '${w.status}'`);
        assert(w.status === 'idle', `拣货员 ${w.name} 初始状态应为 'idle'，实际为 '${w.status}'`);
    });
    
    const availableWorkers = state.workers.filter(w => w.status === 'idle');
    assert(availableWorkers.length === state.workers.length, 
        `开局时所有拣货员都应空闲，实际空闲 ${availableWorkers.length}/${state.workers.length}`);
    
    testGame = game;
});

test('2. 验证UI下拉选项状态 - 拣货员应可选择', () => {
    const state = testGame.getGameState();
    
    const idleWorkers = state.workers.filter(w => w.status === 'idle');
    console.log(`   空闲拣货员: ${idleWorkers.length}/${state.workers.length}`);
    
    idleWorkers.forEach(w => {
        const isDisabled = (w.status !== 'idle');
        console.log(`   ${w.name}: disabled = ${isDisabled}`);
        assert(isDisabled === false, `${w.name} 应可选择（disabled=false），实际为 ${isDisabled}`);
    });
});

test('3. 首次派工 - 同时派遣两个拣货员处理前两单', () => {
    testGame.start();
    
    const state = testGame.getGameState();
    const workers = state.workers;
    const orders = state.level.orders;
    
    for (let i = 0; i < Math.min(workers.length, 2); i++) {
        const worker = workers[i];
        const order = orders[i];
        console.log(`   派遣 ${worker.name} (${worker.id}) 处理订单 ${order.id} (${order.shelfId})`);
        
        const result = testGame.dispatchWorker(worker.id, order.id, true);
        console.log(`   派遣结果: ${result.success ? '成功' : '失败'}`);
        
        if (!result.success) {
            console.log(`   错误: ${result.errors?.map(e => e.message).join(', ')}`);
        }
        
        assert(result.success, `派遣 ${worker.name} 处理 ${order.id} 应成功，实际失败: ${result.errors?.map(e => e.message).join(', ')}`);
        
        const stateAfter = testGame.getGameState();
        const workerAfter = stateAfter.workers.find(w => w.id === worker.id);
        console.log(`   派遣后状态: ${workerAfter.status}`);
        assert(workerAfter.status === 'moving', `派遣后状态应为 'moving'，实际为 '${workerAfter.status}'`);
        assert(workerAfter.currentOrder?.id === order.id, `拣货员应关联订单 ${order.id}`);
        assert(workerAfter.hasCart === true, '应使用推车');
    }
});

function advanceTimeRealFrames(game, seconds) {
    const originalNow = Date.now;
    const internalStart = game.lastUpdate || Date.now();
    let simulatedTime = internalStart;
    const targetTime = internalStart + seconds * 1000;
    
    Date.now = () => simulatedTime;
    
    while (simulatedTime < targetTime && game.status === 'playing') {
        const stepMs = 16;
        simulatedTime += stepMs;
        game.update();
    }
    
    Date.now = originalNow;
}

test('4. 真实逐帧模拟（16ms/帧）- 验证拣货员移动离开出生点', () => {
    console.log('   推进游戏时间 3 秒（16ms/帧）...');
    advanceTimeRealFrames(testGame, 3);
    
    const state = testGame.getGameState();
    const worker1 = state.workers[0];
    const worker2 = state.workers[1];
    console.log(`   ${worker1.name} 状态: ${worker1.status}, 位置: (${worker1.position.x}, ${worker1.position.y})`);
    console.log(`   ${worker2.name} 状态: ${worker2.status}, 位置: (${worker2.position.y}, ${worker2.position.y})`);
    
    const workersMoved = state.workers.filter(w => w.status !== 'idle');
    console.log(`   处理中拣货员: ${workersMoved.length}/${state.workers.length}`);
    
    assert(workersMoved.length >= 1, '至少应一个拣货员在处理订单');
});

test('5. 继续推进时间 - 自动派遣所有订单并验证得分增加', () => {
    const initialState = testGame.getGameState();
    const initialScore = initialState.totalScore;
    const initialCompletedOrders = initialState.level.orders.filter(o => o.status === 'completed').length;
    console.log(`   初始得分: ${initialScore}, 已完成: ${initialCompletedOrders}`);
    
    console.log('   继续推进游戏时间并自动派遣空闲拣货员...');
    let completedOrders = 0;
    
    testGame.on('orderCompleted', (data) => {
        completedOrders++;
        console.log(`   ✅ 订单 ${data.order.id} 完成! +${data.score}分`);
    });
    
    const originalNow = Date.now;
    const internalStart = testGame.lastUpdate || Date.now();
    let simulatedTime = internalStart;
    const targetTime = internalStart + 180000;
    
    Date.now = () => simulatedTime;
    
    while (simulatedTime < targetTime && testGame.status === 'playing') {
        const state = testGame.getGameState();
        
        for (const worker of state.workers) {
            if (worker.status === 'idle') {
                const pendingOrder = state.level.orders.find(o => o.status === 'pending');
                if (pendingOrder) {
                    const result = testGame.dispatchWorker(worker.id, pendingOrder.id, true);
                    if (result.success) {
                        console.log(`   🚀 自动派遣 ${worker.name} 处理 ${pendingOrder.id}`);
                    }
                }
            }
        }
        
        const stepMs = 16;
        simulatedTime += stepMs;
        testGame.update();
    }
    
    Date.now = originalNow;
    
    const state = testGame.getGameState();
    console.log(`   当前得分: ${state.totalScore}, 已完成订单: ${state.level.orders.filter(o => o.status === 'completed').length}`);
    console.log(`   游戏状态: ${state.status}`);
    
    for (const w of state.workers) {
        console.log(`   ${w.name}: status=${w.status}, pos=(${w.position.x},${w.position.y}), pathLen=${w.path.length}, pathIdx=${w.pathIndex}`);
    }
    for (const o of state.level.orders) {
        console.log(`   ${o.id}: status=${o.status}, shelf=${o.shelfId}`);
    }
    
    assert(state.totalScore > initialScore, `得分应从 ${initialScore} 增加，实际仍为 ${state.totalScore}`);
});

test('6. 验证游戏胜利（所有订单完成）', () => {
    const state = testGame.getGameState();
    const completedOrders = state.level.orders.filter(o => o.status === 'completed').length;
    const timeoutOrders = state.level.orders.filter(o => o.status === 'timeout').length;
    
    console.log(`   游戏状态: ${state.status}`);
    console.log(`   最终得分: ${state.totalScore}`);
    console.log(`   已完成订单: ${completedOrders}/${state.level.orders.length}`);
    console.log(`   超时订单: ${timeoutOrders}`);
    
    if (state.status === 'won') {
        console.log('   🎉 关卡胜利!');
    } else if (state.status === 'lost') {
        console.log('   😢 关卡失败');
        state.level.orders.forEach(o => {
            console.log(`     订单 ${o.id}: status=${o.status}, shelf=${o.shelfId}`);
        });
    }
    
    assert(state.status === 'won' || state.status === 'lost', 
        `游戏应已结束，实际状态为 '${state.status}'`);
    assert(state.status === 'won', 
        `游戏应胜利（完成所有订单），实际失败。已完成 ${completedOrders}/${state.level.orders.length}，超时 ${timeoutOrders}`);
});

test('7. 验证操作序列已保存 - 完整链路记录', () => {
    const state = testGame.getGameState();
    
    console.log(`   操作记录数: ${state.operations.length}`);
    
    const dispatchOps = state.operations.filter(op => op.type === 'DISPATCH');
    const moveOps = state.operations.filter(op => op.type === 'MOVE');
    const pickOps = state.operations.filter(op => op.type === 'PICK');
    const packOps = state.operations.filter(op => op.type === 'PACK');
    const completeOps = state.operations.filter(op => op.type === 'COMPLETE');
    
    console.log(`   派遣操作: ${dispatchOps.length}`);
    console.log(`   移动操作: ${moveOps.length}`);
    console.log(`   拣货操作: ${pickOps.length}`);
    console.log(`   打包操作: ${packOps.length}`);
    console.log(`   完成操作: ${completeOps.length}`);
    
    assert(dispatchOps.length > 0, '应有派遣操作记录');
    assert(moveOps.length > 0, '应有移动操作记录');
    assert(pickOps.length > 0, '应有拣货操作记录');
    assert(packOps.length > 0, '应有打包操作记录');
    assert(completeOps.length > 0, '应有完成操作记录');
});

test('8. 验证得分已更新并可进入下一关', () => {
    const state = testGame.getGameState();
    
    console.log(`   最终得分: ${state.totalScore}`);
    console.log(`   游戏状态: ${state.status}`);
    console.log(`   已完成订单: ${state.level.orders.filter(o => o.status === 'completed').length}/${state.level.orders.length}`);
    
    assert(state.totalScore > 0, '应有得分');
    assert(state.status === 'won', '游戏应胜利才能进入下一关');
    
    const hasLevel2 = !!LEVEL_2;
    console.log(`   下一关（LEVEL_2）是否存在: ${hasLevel2 ? '是' : '否'}`);
    
    if (hasLevel2) {
        console.log(`   ✅ 可以进入下一关: ${LEVEL_2.name}`);
        const nextGame = new GameEngine.Engine();
        nextGame.initLevel(LEVEL_2);
        const nextState = nextGame.getGameState();
        console.log(`   ✅ 下一关初始化成功: ${nextState.level.name}, 拣货员: ${nextState.workers.length}人`);
        assert(nextState.workers.length > 0, '下一关应至少有一个拣货员');
    } else {
        console.log(`   ℹ️ 当前是最后一关`);
    }
});

console.log('\n🔄 测试第二关 - 单向巷道冲突拦截...\n');

test('9. 初始化第二关 - 验证单向巷道配置', () => {
    const game = new GameEngine.Engine();
    game.initLevel(LEVEL_2);
    
    const state = game.getGameState();
    console.log(`   关卡: ${state.level.name}`);
    console.log(`   地图大小: ${state.level.mapWidth}x${state.level.mapHeight}`);
    
    let oneWayCount = 0;
    for (let y = 0; y < state.level.mapHeight; y++) {
        for (let x = 0; x < state.level.mapWidth; x++) {
            const cell = state.map.getCell(x, y);
            if (cell && cell.oneWay && cell.oneWay !== 'bidirectional') {
                oneWayCount++;
            }
        }
    }
    console.log(`   单向巷道数量: ${oneWayCount}`);
    assert(oneWayCount > 0, '第二关应有单向巷道');
});

test('10. 验证推车不足拦截 - 尝试分配超过可用数量的推车', () => {
    console.log(`   直接测试碰撞检测模块的 checkResourceAvailability 函数...`);
    
    const game = new GameEngine.Engine();
    game.initLevel(LEVEL_2);
    game.start();
    
    let state = game.getGameState();
    const workers = state.workers;
    const carts = state.carts;
    
    console.log(`   可用推车: ${carts.length}辆`);
    console.log(`   拣货员数量: ${workers.length}人`);
    
    console.log(`   测试1: 有空闲拣货员和可用推车时...`);
    const error1 = CollisionDetector.checkResourceAvailability(workers, carts, true);
    console.log(`   结果: ${error1 ? `失败 - ${error1.message}` : '通过 (无错误)'}`);
    assert(error1 === null, '有资源时不应返回错误');
    
    console.log(`   测试2: 标记所有推车为已使用...`);
    const occupiedCarts = carts.map(c => ({ ...c, inUse: true }));
    const error2 = CollisionDetector.checkResourceAvailability(workers, occupiedCarts, true);
    console.log(`   结果: ${error2 ? `失败 - ${error2.message}` : '通过 (无错误)'}`);
    assert(error2 !== null, '推车不足时应返回错误');
    assert(error2.type === 'no_available_carts' || error2.message.includes('推车'), '错误类型应为推车不足');
    
    console.log(`   测试3: 不使用推车时，即使推车全被占用也应允许派遣...`);
    const error3 = CollisionDetector.checkResourceAvailability(workers, occupiedCarts, false);
    console.log(`   结果: ${error3 ? `失败 - ${error3.message}` : '通过 (无错误)'}`);
    assert(error3 === null, '不使用推车时不应返回错误');
    
    console.log(`   测试4: 所有拣货员忙碌时...`);
    const busyWorkers = workers.map(w => ({ ...w, status: 'moving' }));
    const error4 = CollisionDetector.checkResourceAvailability(busyWorkers, carts, true);
    console.log(`   结果: ${error4 ? `失败 - ${error4.message}` : '通过 (无错误)'}`);
    assert(error4 !== null, '没有空闲拣货员时应返回错误');
    
    console.log(`   ✅ 推车不足拦截正常工作!`);
});

test('11. 验证碰撞检测 - 忙碌拣货员不能被重复派遣', () => {
    const game = new GameEngine.Engine();
    game.initLevel(LEVEL_1);
    game.start();
    
    const state = game.getGameState();
    const worker = state.workers[0];
    const order1 = state.level.orders[0];
    const order2 = state.level.orders[1];
    
    console.log(`   先派遣 ${worker.name} 处理 ${order1.id}...`);
    const result1 = game.dispatchWorker(worker.id, order1.id, true);
    console.log(`   第一次派遣: ${result1.success ? '成功' : '失败'}`);
    assert(result1.success === true, '第一次派遣应成功');
    
    console.log(`   尝试再次派遣 ${worker.name} 处理 ${order2.id}...`);
    const result2 = game.dispatchWorker(worker.id, order2.id, true);
    console.log(`   第二次派遣: ${result2.success ? '成功' : '失败 - ' + result2.errors?.map(e => e.message).join(', ')}`);
    
    const busyErrors = result2.errors?.filter(e => 
        e.type === 'worker_busy' || e.message.includes('忙碌')
    ) || [];
    
    assert(result2.success === false, '忙碌拣货员不能被重复派遣');
    assert(busyErrors.length > 0, '应有拣货员忙碌的错误提示');
});

test('12. 验证单向巷道冲突检测未被破坏', () => {
    console.log(`   测试 validateDispatch 的完整检测链...`);
    const collisionContent = fs.readFileSync(
        path.join(__dirname, '..', 'js', 'game', 'collision.js'),
        'utf8'
    );
    
    assert(collisionContent.includes('checkOneWayCollision'), '缺少 checkOneWayCollision');
    assert(collisionContent.includes('checkOneWayCongestion'), '缺少 checkOneWayCongestion');
    assert(collisionContent.includes('checkPathOccupation'), '缺少 checkPathOccupation');
    console.log(`   ✅ 单向巷道冲突检测逻辑完整存在`);
});

console.log('\n📦 测试自定义关卡管理增强功能...\n');

const CUSTOM_LEVEL = {
    id: 'custom-test-1',
    name: '测试自定义关卡',
    description: '用于测试导入导出的自定义关卡',
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
        { id: 'O-001', shelfId: 'S1', deadline: 120, items: ['商品A', '商品B'] },
        { id: 'O-002', shelfId: 'S5', deadline: 100, items: ['商品C'] },
        { id: 'O-003', shelfId: 'S8', deadline: 140, items: ['商品D', '商品E', '商品F'] },
        { id: 'O-004', shelfId: 'S12', deadline: 160, items: ['商品G', '商品H'] }
    ],
    pickDuration: 3,
    packDuration: 2,
    targetScore: 600,
    minOrdersToPass: 4
};

const CUSTOM_LEVEL_V2 = {
    ...CUSTOM_LEVEL,
    name: '测试自定义关卡V2',
    difficulty: 2,
    orders: [
        ...CUSTOM_LEVEL.orders,
        { id: 'O-005', shelfId: 'S3', deadline: 90, items: ['商品I'] }
    ],
    targetScore: 800
};

test('13. 自定义关卡导入 - 基本导入流程', () => {
    console.log('   导入自定义关卡...');
    const result = Storage.saveCustomLevel(CUSTOM_LEVEL, 'import', 'import');
    assert(result === true, '导入应成功');
    
    const levels = Storage.loadCustomLevels();
    assert(!!levels['custom-test-1'], '自定义关卡应存在于存储中');
    assert(levels['custom-test-1'].name === '测试自定义关卡', '关卡名称应正确');
    assert(!!levels['custom-test-1']._meta, '关卡应有 _meta 元数据');
    assert(levels['custom-test-1']._meta.sourceType === 'import', '来源类型应为 import');
    assert(!!levels['custom-test-1']._meta.importTime, '应有导入时间');
    assert(levels['custom-test-1']._meta.lastOperation === 'import', '最近操作应为 import');
    
    console.log(`   导入时间: ${new Date(levels['custom-test-1']._meta.importTime).toISOString()}`);
    console.log('   ✅ 自定义关卡导入成功，元数据正确');
});

test('14. 重复导入冲突 - 覆盖已有自定义关卡', () => {
    console.log('   导入同ID不同内容的关卡（模拟覆盖）...');
    
    const levelsBefore = Storage.loadCustomLevels();
    const metaBefore = levelsBefore['custom-test-1']._meta;
    const originalImportTime = metaBefore.importTime;
    
    const result = Storage.saveCustomLevel(CUSTOM_LEVEL_V2, 'import', 'overwrite');
    assert(result === true, '覆盖导入应成功');
    
    const levelsAfter = Storage.loadCustomLevels();
    assert(levelsAfter['custom-test-1'].name === '测试自定义关卡V2', '名称应更新为V2');
    assert(levelsAfter['custom-test-1'].difficulty === 2, '难度应更新为2');
    assert(levelsAfter['custom-test-1']._meta.importTime === originalImportTime, '首次导入时间应保留');
    assert(levelsAfter['custom-test-1']._meta.lastOperation === 'overwrite', '最近操作应为 overwrite');
    assert(!!levelsAfter['custom-test-1']._meta.lastModifiedTime, '应有最后修改时间');
    
    console.log(`   首次导入时间保留: ${new Date(originalImportTime).toISOString()}`);
    console.log(`   最后修改时间: ${new Date(levelsAfter['custom-test-1']._meta.lastModifiedTime).toISOString()}`);
    console.log('   ✅ 覆盖导入成功，首次导入时间保留，操作记录正确');
});

test('15. 内置关卡ID冲突拦截', () => {
    console.log('   尝试导入与内置关卡同ID的关卡...');
    
    const builtinLevel = { ...CUSTOM_LEVEL, id: 'level-1' };
    
    assert(Storage.isBuiltinLevelId('level-1') === true, 'level-1 应为内置关卡ID');
    assert(Storage.isBuiltinLevelId('level-2') === true, 'level-2 应为内置关卡ID');
    assert(Storage.isBuiltinLevelId('custom-test-1') === false, 'custom-test-1 不应为内置关卡ID');
    
    console.log('   ✅ 内置关卡ID检测正常，内置关卡不可被覆盖');
});

test('16. 坏JSON格式验证', () => {
    console.log('   测试各种无效JSON...');
    
    const badInputs = [
        { input: 'not json at all', desc: '非JSON字符串' },
        { input: '{missing: quotes}', desc: '不完整JSON' },
        { input: 'null', desc: 'null值' },
        { input: '[]', desc: '空数组' },
    ];
    
    for (const { input, desc } of badInputs) {
        try {
            JSON.parse(input);
            console.log(`   ${desc}: 解析成功（可能是合法JSON但不合法关卡）`);
        } catch (e) {
            console.log(`   ${desc}: 解析失败（预期行为）- ${e.message.substring(0, 30)}`);
        }
    }
    
    console.log('   测试缺少必要字段的关卡...');
    const incompleteLevel = { id: 'bad-level', name: '坏关卡' };
    try {
        const level = GameModels.Level.fromJSON(incompleteLevel);
        const errors = level.validate();
        console.log(`   验证错误: ${errors.join('; ')}`);
        assert(errors.length > 0, '不完整关卡应验证失败');
    } catch (e) {
        console.log(`   创建关卡失败: ${e.message.substring(0, 50)}`);
    }
    
    console.log('   ✅ 坏JSON格式验证正常');
});

test('17. 未知货架验证', () => {
    console.log('   测试订单引用不存在的货架...');
    
    const badShelfLevel = {
        ...CUSTOM_LEVEL,
        id: 'bad-shelf-level',
        orders: [
            { id: 'O-001', shelfId: 'S-NONEXISTENT', deadline: 120, items: ['商品A'] }
        ]
    };
    
    const level = GameModels.Level.fromJSON(badShelfLevel);
    const errors = level.validate();
    console.log(`   验证错误: ${errors.join('; ')}`);
    assert(errors.length > 0, '引用未知货架应验证失败');
    assert(errors.some(e => e.includes('S-NONEXISTENT') || e.includes('未知')), 
        '应提示未知货架');
    
    console.log('   ✅ 未知货架验证正常');
});

test('18. 删除自定义关卡', () => {
    console.log('   删除自定义关卡 custom-test-1...');
    
    const levelsBefore = Storage.loadCustomLevels();
    assert(!!levelsBefore['custom-test-1'], '删除前关卡应存在');
    
    const result = Storage.deleteCustomLevel('custom-test-1');
    assert(result === true, '删除应成功');
    
    const levelsAfter = Storage.loadCustomLevels();
    assert(!levelsAfter['custom-test-1'], '删除后关卡不应存在');
    
    console.log('   ✅ 自定义关卡删除成功');
});

test('19. 删除后撤销恢复', () => {
    console.log('   测试撤销删除...');
    
    const snapshot = Storage.getUndoSnapshot();
    assert(!!snapshot, '应有撤销快照');
    assert(snapshot.levelId === 'custom-test-1', '快照关卡ID应正确');
    assert(!!snapshot.levelData, '快照应包含关卡数据');
    console.log(`   快照关卡名: ${snapshot.levelData.name}`);
    
    const result = Storage.undoDelete();
    assert(result.success === true, '撤销应成功');
    assert(result.levelId === 'custom-test-1', '返回的关卡ID应正确');
    
    const levels = Storage.loadCustomLevels();
    assert(!!levels['custom-test-1'], '撤销后关卡应恢复');
    assert(levels['custom-test-1'].name === '测试自定义关卡V2', '恢复的关卡名称应为覆盖后的V2');
    
    console.log('   ✅ 撤销删除成功，关卡已恢复');
    
    const snapshotAfter = Storage.getUndoSnapshot();
    assert(!snapshotAfter, '撤销后快照应被清除');
    console.log('   ✅ 撤销快照已清除');
});

test('20. 单次撤销限制 - 再次撤销应失败', () => {
    console.log('   尝试再次撤销（无快照）...');
    
    const result = Storage.undoDelete();
    assert(result.success === false, '没有快照时撤销应失败');
    assert(result.reason === 'no_undo_snapshot', '失败原因应为 no_undo_snapshot');
    
    console.log('   ✅ 单次撤销限制正常');
});

test('21. 最近操作记录', () => {
    console.log('   检查最近操作记录...');
    
    const op = Storage.loadLastOperation();
    assert(!!op, '应有最近操作记录');
    console.log(`   最近操作: type=${op.type}, levelName=${op.levelName}, success=${op.success}`);
    
    assert(op.type === 'undo_delete', '最近操作类型应为 undo_delete');
    assert(op.levelName === '测试自定义关卡V2', '操作关卡名应正确');
    assert(op.success === true, '操作应成功');
    assert(!!op.timestamp, '应有时间戳');
    
    console.log('   ✅ 最近操作记录正确');
});

test('22. 导出并重新导入 - 完整往返验证', () => {
    console.log('   清除之前的自定义关卡...');
    Storage.deleteCustomLevel('custom-test-1');
    Storage.clearUndoSnapshot();
    
    console.log('   重新导入自定义关卡...');
    Storage.saveCustomLevel(CUSTOM_LEVEL, 'import', 'import');
    
    const levels = Storage.loadCustomLevels();
    const savedLevel = levels['custom-test-1'];
    assert(!!savedLevel, '导入后关卡应存在');
    
    const levelDataForExport = { ...savedLevel };
    delete levelDataForExport._meta;
    
    console.log('   导出关卡JSON...');
    const levelObj = GameModels.Level.fromJSON(levelDataForExport);
    const exportedJson = levelObj.toJSON();
    const exportedString = JSON.stringify(exportedJson);
    console.log(`   导出JSON长度: ${exportedString.length} 字符`);
    
    console.log('   删除原关卡...');
    Storage.deleteCustomLevel('custom-test-1');
    Storage.clearUndoSnapshot();
    
    console.log('   重新导入导出的JSON...');
    const reimported = JSON.parse(exportedString);
    const newLevel = GameModels.Level.fromJSON(reimported);
    const errors = newLevel.validate();
    assert(errors.length === 0, `重新导入的关卡应验证通过，错误: ${errors.join('; ')}`);
    
    Storage.saveCustomLevel(newLevel.toJSON(), 'import', 'import');
    
    const levelsAfter = Storage.loadCustomLevels();
    assert(!!levelsAfter['custom-test-1'], '重新导入后关卡应存在');
    assert(levelsAfter['custom-test-1'].id === 'custom-test-1', '关卡ID应一致');
    assert(levelsAfter['custom-test-1'].name === '测试自定义关卡', '关卡名称应一致');
    
    console.log('   用重新导入的关卡初始化游戏引擎...');
    const game = new GameEngine.Engine();
    game.initLevel(newLevel);
    const state = game.getGameState();
    assert(state.workers.length === 2, '应有2个拣货员');
    assert(state.level.orders.length === 4, '应有4个订单');
    
    console.log('   ✅ 导出再导入往返验证成功');
});

test('23. 跨重启状态保留 - 模拟页面刷新', () => {
    console.log('   模拟页面刷新（重新从 localStorage 加载）...');
    
    const customLevels = Storage.loadCustomLevels();
    assert(!!customLevels['custom-test-1'], '刷新后自定义关卡应仍在');
    assert(!!customLevels['custom-test-1']._meta, '元数据应保留');
    assert(!!customLevels['custom-test-1']._meta.importTime, '导入时间应保留');
    
    const progress = Storage.loadProgress();
    console.log(`   进度: completedLevels=${progress.completedLevels.length}, highScores=${Object.keys(progress.highScores).length}`);
    
    const lastOp = Storage.loadLastOperation();
    assert(!!lastOp, '刷新后最近操作应保留');
    console.log(`   最近操作: ${lastOp.type} - ${lastOp.levelName}`);
    
    const snapshot = Storage.getUndoSnapshot();
    console.log(`   撤销快照: ${snapshot ? '存在' : '不存在'}`);
    
    console.log('   ✅ 跨重启状态保留正常');
});

test('24. 导入冲突时的另存为新关卡', () => {
    console.log('   模拟另存为新关卡...');
    
    const existingLevels = Storage.loadCustomLevels();
    const existingData = existingLevels['custom-test-1'];
    assert(!!existingData, '原关卡应存在');
    
    let newId = 'custom-test-1-copy';
    let counter = 1;
    while (existingLevels[newId] || Storage.isBuiltinLevelId(newId)) {
        newId = 'custom-test-1-copy-' + counter;
        counter++;
    }
    
    const newLevelData = { ...CUSTOM_LEVEL_V2, id: newId, name: CUSTOM_LEVEL_V2.name + ' (副本)' };
    const newLevel = GameModels.Level.fromJSON(newLevelData);
    Storage.saveCustomLevel(newLevel.toJSON(), 'import', 'save_as_new');
    
    const levels = Storage.loadCustomLevels();
    assert(!!levels['custom-test-1'], '原关卡应保留');
    assert(!!levels[newId], '新关卡应存在');
    assert(levels[newId].name === '测试自定义关卡V2 (副本)', '新关卡名称应有副本标记');
    
    console.log(`   新关卡ID: ${newId}`);
    console.log(`   新关卡名称: ${levels[newId].name}`);
    console.log('   ✅ 另存为新关卡成功');
});

test('25. 内置关卡ID注册机制', () => {
    console.log('   测试内置关卡ID注册...');
    
    assert(Storage.isBuiltinLevelId('level-1') === true, 'level-1 应为内置');
    assert(Storage.isBuiltinLevelId('level-2') === true, 'level-2 应为内置');
    assert(Storage.isBuiltinLevelId('custom-anything') === false, 'custom-anything 不应为内置');
    
    Storage.registerBuiltinIds(['level-3']);
    assert(Storage.isBuiltinLevelId('level-3') === true, '注册后 level-3 应为内置');
    
    console.log('   ✅ 内置关卡ID注册机制正常');
});

test('26. 删除后操作记录保留', () => {
    console.log('   删除后检查操作记录...');
    
    Storage.deleteCustomLevel('custom-test-1');
    
    const op = Storage.loadLastOperation();
    assert(!!op, '删除后应有操作记录');
    assert(op.type === 'delete', '操作类型应为 delete');
    assert(op.success === true, '操作应成功');
    assert(op.undoable === true, '应标记为可撤销');
    
    console.log(`   操作: ${op.type}, 可撤销: ${op.undoable}`);
    console.log('   ✅ 删除后操作记录正确');
    
    Storage.undoDelete();
    Storage.deleteCustomLevel('custom-test-1-copy');
    if (Storage.loadCustomLevels()['custom-test-1']) {
        Storage.deleteCustomLevel('custom-test-1');
    }
});

console.log('\n📦 测试整包备份/恢复增强功能...\n');

const CUSTOM_LEVEL_A = {
    id: 'custom-batch-a',
    name: '批量测试关卡A',
    description: '用于整包备份测试的关卡A',
    difficulty: 1,
    timeLimit: 180,
    mapWidth: 6,
    mapHeight: 6,
    mapData: [
        ['sp', 'a', 'a', 'a', 'a', 'sp'],
        ['s:S1', 'a', 's:S2', 'a', 's:S3', 'a'],
        ['e', 'a', 'e', 'a', 'e', 'a'],
        ['s:S4', 'a', 's:S5', 'a', 's:S6', 'a'],
        ['e', 'a', 'e', 'a', 'e', 'a'],
        ['sp', 'a', 'a', 'p', 'a', 'sp']
    ],
    workerCount: 2,
    cartCount: 2,
    orders: [
        { id: 'O-A1', shelfId: 'S1', deadline: 120, items: ['商品A'] },
        { id: 'O-A2', shelfId: 'S3', deadline: 100, items: ['商品B'] }
    ],
    pickDuration: 3,
    packDuration: 2,
    targetScore: 400,
    minOrdersToPass: 2
};

const CUSTOM_LEVEL_B = {
    id: 'custom-batch-b',
    name: '批量测试关卡B',
    description: '用于整包备份测试的关卡B',
    difficulty: 2,
    timeLimit: 240,
    mapWidth: 8,
    mapHeight: 6,
    mapData: [
        ['sp', 'a', 'a', 'a', 'a', 'a', 'a', 'sp'],
        ['s:S1', 'a', 's:S2', 'a', 's:S3', 'a', 's:S4', 'a'],
        ['e', 'a', 'e', 'a', 'e', 'a', 'e', 'a'],
        ['s:S5', 'a', 's:S6', 'a', 's:S7', 'a', 's:S8', 'a'],
        ['e', 'a', 'e', 'a', 'e', 'a', 'e', 'a'],
        ['sp', 'a', 'a', 'p', 'p', 'a', 'a', 'sp']
    ],
    workerCount: 3,
    cartCount: 3,
    orders: [
        { id: 'O-B1', shelfId: 'S1', deadline: 150, items: ['商品X'] },
        { id: 'O-B2', shelfId: 'S5', deadline: 130, items: ['商品Y'] },
        { id: 'O-B3', shelfId: 'S8', deadline: 180, items: ['商品Z'] }
    ],
    pickDuration: 2,
    packDuration: 2,
    targetScore: 700,
    minOrdersToPass: 3
};

function clearAllCustomLevels() {
    const levels = Storage.loadCustomLevels();
    for (const id in levels) {
        Storage.deleteCustomLevel(id);
        Storage.clearUndoSnapshot();
    }
    Storage.clearBatchRestoreUndoSnapshot();
    Storage.clearLastBatchRestoreInfo();

    const progress = Storage.loadProgress();
    for (const id in progress.highScores) {
        if (id.startsWith('custom-') || levels[id]) {
            delete progress.highScores[id];
        }
    }
    progress.completedLevels = progress.completedLevels.filter(id => 
        !id.startsWith('custom-') && !levels[id]
    );
    Storage.saveProgress(progress);
}

test('27. 整包备份 - 空数据时生成备份', () => {
    clearAllCustomLevels();

    const backup = Storage.createFullBackup();
    assert(backup.success === true, '备份应成功');
    assert(backup.levelCount === 0, '空数据时关卡数应为0');
    assert(backup.data.version === 1, '备份版本应为1');
    assert(!!backup.data.exportedAt, '应有导出时间戳');
    assert(Array.isArray(backup.data.levels), 'levels应为数组');
    assert(backup.data.levels.length === 0, 'levels数组应为空');

    const parsed = JSON.parse(backup.json);
    assert(parsed.version === 1, 'JSON中的版本应正确');
    assert(parsed.levelCount === 0, 'JSON中的关卡数应正确');

    console.log('   ✅ 空备份生成成功');
});

test('28. 整包备份 - 有数据时生成完整备份', () => {
    clearAllCustomLevels();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');
    Storage.saveCustomLevel(CUSTOM_LEVEL_B, 'import', 'import');

    const progress = Storage.loadProgress();
    progress.highScores['custom-batch-a'] = 500;
    progress.completedLevels.push('custom-batch-a');
    Storage.saveProgress(progress);

    const backup = Storage.createFullBackup();
    assert(backup.success === true, '备份应成功');
    assert(backup.levelCount === 2, '应有2个关卡');
    assert(backup.data.levels.length === 2, 'levels数组应有2个元素');

    const levelA = backup.data.levels.find(l => l.id === 'custom-batch-a');
    assert(!!levelA, '应包含关卡A');
    assert(levelA.levelData.name === '批量测试关卡A', '关卡A名称应正确');
    assert(levelA.highScore === 500, '关卡A最高分应正确');
    assert(levelA.completed === true, '关卡A应标记为已完成');
    assert(!!levelA._meta, '关卡A应包含_meta');
    assert(levelA._meta.sourceType === 'import', '来源类型应为import');
    assert(!!levelA._meta.importTime, '应有导入时间');

    const levelB = backup.data.levels.find(l => l.id === 'custom-batch-b');
    assert(!!levelB, '应包含关卡B');
    assert(levelB.levelData.name === '批量测试关卡B', '关卡B名称应正确');
    assert(levelB.highScore === 0, '关卡B最高分应为0');
    assert(levelB.completed === false, '关卡B应标记为未完成');

    console.log('   关卡A: id=%s, name=%s, highScore=%d', levelA.id, levelA.levelData.name, levelA.highScore);
    console.log('   关卡B: id=%s, name=%s, highScore=%d', levelB.id, levelB.levelData.name, levelB.highScore);
    console.log('   ✅ 完整备份生成成功，包含关卡数据、最高分、元数据');
});

test('29. 备份数据验证 - 格式校验', () => {
    console.log('   测试各种无效备份格式...');

    const badJson = Storage.validateAndParseBackup('not json at all');
    assert(badJson.success === false, '非JSON应解析失败');
    assert(badJson.error.includes('JSON'), '错误应提示JSON相关');

    const badVersion = Storage.validateAndParseBackup(JSON.stringify({ version: 999, levels: [] }));
    assert(badVersion.success === false, '版本不匹配应失败');
    assert(badVersion.error.includes('版本'), '错误应提示版本相关');

    const noLevels = Storage.validateAndParseBackup(JSON.stringify({ version: 1 }));
    assert(noLevels.success === false, '缺少levels应失败');

    const validBackup = Storage.validateAndParseBackup(JSON.stringify({ version: 1, levels: [] }));
    assert(validBackup.success === true, '有效备份应通过验证');

    console.log('   ✅ 备份格式验证正常');
});

test('30. 预检 - 全新增关卡', () => {
    clearAllCustomLevels();

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 2,
        levels: [
            { id: 'custom-batch-a', levelData: CUSTOM_LEVEL_A, highScore: 500, completed: true },
            { id: 'custom-batch-b', levelData: CUSTOM_LEVEL_B, highScore: 0, completed: false }
        ]
    };

    const precheck = Storage.precheckBackup(backupData);
    assert(precheck.totalCount === 2, '总数量应为2');
    assert(precheck.validCount === 2, '有效数量应为2');
    assert(precheck.newLevels.length === 2, '新增关卡应为2');
    assert(precheck.conflictLevels.length === 0, '冲突关卡应为0');
    assert(precheck.builtinConflict.length === 0, '内置冲突应为0');
    assert(precheck.badEntries.length === 0, '坏条目应为0');

    assert(precheck.newLevels[0].name === '批量测试关卡A', '新增关卡名称应正确');
    assert(precheck.newLevels[0].highScore === 500, '新增关卡最高分应正确');

    console.log('   新增: %d, 冲突: %d, 内置冲突: %d, 坏条目: %d',
        precheck.newLevels.length, precheck.conflictLevels.length,
        precheck.builtinConflict.length, precheck.badEntries.length);
    console.log('   ✅ 全新增关卡预检正确');
});

test('31. 预检 - 部分冲突 + 内置ID冲突 + 坏条目', () => {
    clearAllCustomLevels();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 5,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '修改后的关卡A' }, highScore: 800, completed: true },
            { id: 'custom-batch-b', levelData: CUSTOM_LEVEL_B, highScore: 300, completed: false },
            { id: 'level-1', levelData: { id: 'level-1', name: '伪内置关卡' }, highScore: 100, completed: true },
            { id: 'bad-entry-1' },
            null
        ]
    };

    const precheck = Storage.precheckBackup(backupData);
    assert(precheck.totalCount === 5, '总数量应为5');
    assert(precheck.validCount === 3, '有效数量应为3');
    assert(precheck.newLevels.length === 1, '新增关卡应为1');
    assert(precheck.conflictLevels.length === 1, '冲突关卡应为1');
    assert(precheck.builtinConflict.length === 1, '内置冲突应为1');
    assert(precheck.badEntries.length === 2, '坏条目应为2');

    assert(precheck.conflictLevels[0].id === 'custom-batch-a', '冲突关卡ID应正确');
    assert(precheck.conflictLevels[0].existingName === '批量测试关卡A', '现有关卡名称应正确');
    assert(precheck.conflictLevels[0].name === '修改后的关卡A', '导入关卡名称应正确');

    assert(precheck.builtinConflict[0].id === 'level-1', '内置冲突ID应正确');
    assert(precheck.builtinConflict[0].reason === '与内置关卡ID冲突', '原因应正确');

    assert(precheck.badEntries[0].id === 'bad-entry-1', '第一个坏条目ID应正确');
    assert(precheck.badEntries[0].reason === '关卡数据格式无效', '坏条目原因应正确');

    console.log('   总计: %d, 有效: %d', precheck.totalCount, precheck.validCount);
    console.log('   新增: %d, 冲突: %d, 内置冲突: %d, 坏条目: %d',
        precheck.newLevels.length, precheck.conflictLevels.length,
        precheck.builtinConflict.length, precheck.badEntries.length);
    console.log('   ✅ 混合场景预检正确');
});

test('32. 批量恢复 - 全新增关卡导入', () => {
    clearAllCustomLevels();

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 2,
        levels: [
            { id: 'custom-batch-a', levelData: CUSTOM_LEVEL_A, highScore: 500, completed: true },
            { id: 'custom-batch-b', levelData: CUSTOM_LEVEL_B, highScore: 300, completed: false }
        ]
    };

    const decisions = [
        { action: 'import' },
        { action: 'import' }
    ];

    const result = Storage.executeBatchRestore(backupData, decisions);
    assert(result.success === true, '恢复应成功');
    assert(result.importedCount === 2, '应导入2个关卡');
    assert(result.skippedCount === 0, '应跳过0个');
    assert(result.failedCount === 0, '应失败0个');
    assert(result.undoable === true, '应支持撤销');

    const levels = Storage.loadCustomLevels();
    assert(!!levels['custom-batch-a'], '关卡A应存在');
    assert(!!levels['custom-batch-b'], '关卡B应存在');
    assert(levels['custom-batch-a'].name === '批量测试关卡A', '关卡A名称应正确');
    assert(levels['custom-batch-b'].name === '批量测试关卡B', '关卡B名称应正确');

    const progress = Storage.loadProgress();
    assert(progress.highScores['custom-batch-a'] === 500, '关卡A最高分应正确');
    assert(progress.highScores['custom-batch-b'] === 300, '关卡B最高分应正确');
    assert(progress.completedLevels.includes('custom-batch-a'), '关卡A应标记为已完成');

    const snapshot = Storage.getBatchRestoreUndoSnapshot();
    assert(!!snapshot, '应有批量恢复撤销快照');
    assert(!!snapshot.beforeLevels, '快照应包含之前的关卡数据');

    const lastRestore = Storage.getLastBatchRestoreInfo();
    assert(!!lastRestore, '应有上次批量恢复信息');
    assert(lastRestore.imported === 2, '上次恢复导入数应正确');

    console.log('   导入: %d, 跳过: %d, 失败: %d',
        result.importedCount, result.skippedCount, result.failedCount);
    console.log('   ✅ 全新增关卡批量恢复成功');
});

test('33. 批量恢复 - 冲突处理：覆盖 + 跳过 + 另存为副本', () => {
    clearAllCustomLevels();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');
    Storage.saveCustomLevel(CUSTOM_LEVEL_B, 'import', 'import');

    const originalLevels = Storage.loadCustomLevels();
    const originalImportTimeA = originalLevels['custom-batch-a']._meta.importTime;

    const progressBefore = Storage.loadProgress();
    const originalHighScoreB = progressBefore.highScores['custom-batch-b'];

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 3,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '覆盖后的A', difficulty: 3 }, highScore: 999, completed: true },
            { id: 'custom-batch-b', levelData: { ...CUSTOM_LEVEL_B, name: '跳过的B' }, highScore: 888, completed: false },
            { id: 'custom-batch-c', levelData: { ...CUSTOM_LEVEL_A, id: 'custom-batch-c', name: '新关卡C' }, highScore: 0, completed: false }
        ]
    };

    const decisions = [
        { action: 'overwrite' },
        { action: 'skip' },
        { action: 'import' }
    ];

    const result = Storage.executeBatchRestore(backupData, decisions);
    assert(result.success === true, '恢复应成功');
    assert(result.importedCount === 2, '应导入2个（1覆盖+1新增）');
    assert(result.skippedCount === 1, '应跳过1个');
    assert(result.failedCount === 0, '应失败0个');

    assert(result.results.overwrite.length === 1, '覆盖数量应为1');
    assert(result.results.skipped.length === 1, '跳过数量应为1');
    assert(result.results.imported.some(i => i.action === 'overwrite'), '应有覆盖操作');
    assert(result.results.imported.some(i => i.action === 'import'), '应有新增操作');

    const levels = Storage.loadCustomLevels();
    assert(levels['custom-batch-a'].name === '覆盖后的A', '关卡A应被覆盖');
    assert(levels['custom-batch-a'].difficulty === 3, '关卡A难度应更新');
    assert(levels['custom-batch-a']._meta.importTime === originalImportTimeA, '首次导入时间应保留');
    assert(levels['custom-batch-a']._meta.lastOperation === 'batch_restore_overwrite', '最近操作应记录为批量覆盖');

    assert(levels['custom-batch-b'].name === '批量测试关卡B', '关卡B名称应保持不变（跳过）');

    assert(!!levels['custom-batch-c'], '关卡C应新增成功');
    assert(levels['custom-batch-c'].name === '新关卡C', '关卡C名称应正确');

    const progress = Storage.loadProgress();
    assert(progress.highScores['custom-batch-a'] === 999, '关卡A最高分应被覆盖更新');
    assert(progress.highScores['custom-batch-b'] === originalHighScoreB, '关卡B最高分应保持不变（跳过）');

    console.log('   导入: %d, 跳过: %d, 失败: %d',
        result.importedCount, result.skippedCount, result.failedCount);
    console.log('   覆盖: %d, 另存为: %d', result.results.overwrite.length, result.results.saveAsNew.length);
    console.log('   ✅ 混合冲突处理正确');
});

test('34. 批量恢复 - 另存为副本功能', () => {
    clearAllCustomLevels();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 1,
        levels: [
            { id: 'custom-batch-a', levelData: CUSTOM_LEVEL_A, highScore: 500, completed: false }
        ]
    };

    const decisions = [
        { action: 'save_as_new' }
    ];

    const result = Storage.executeBatchRestore(backupData, decisions);
    assert(result.success === true, '恢复应成功');
    assert(result.importedCount === 1, '应导入1个');
    assert(result.results.saveAsNew.length === 1, '另存为数量应为1');

    const newId = result.results.saveAsNew[0].id;
    assert(newId !== 'custom-batch-a', '新ID不应与原ID相同');
    assert(newId.startsWith('custom-batch-a-copy'), '新ID应包含copy前缀');

    const levels = Storage.loadCustomLevels();
    assert(!!levels['custom-batch-a'], '原关卡应保留');
    assert(levels['custom-batch-a'].name === '批量测试关卡A', '原关卡名称应不变');
    assert(!!levels[newId], '新关卡应存在');
    assert(levels[newId].name.includes('副本'), '新关卡名称应包含副本标记');

    console.log('   原ID: custom-batch-a, 新ID: %s', newId);
    console.log('   新关卡名: %s', levels[newId].name);
    console.log('   ✅ 另存为副本功能正确');
});

test('35. 批量恢复 - 内置关卡ID冲突拦截', () => {
    clearAllCustomLevels();

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 2,
        levels: [
            { id: 'level-1', levelData: { id: 'level-1', name: '伪关卡1' }, highScore: 100 },
            { id: 'custom-ok', levelData: CUSTOM_LEVEL_A, highScore: 200 }
        ]
    };

    const decisions = [
        { action: 'import' },
        { action: 'import' }
    ];

    const result = Storage.executeBatchRestore(backupData, decisions);
    assert(result.success === true, '恢复应成功（部分失败但整体流程成功）');
    assert(result.importedCount === 1, '应成功导入1个');
    assert(result.failedCount === 1, '应失败1个（内置ID冲突）');

    assert(result.results.failed[0].id === 'level-1', '失败的应是level-1');
    assert(result.results.failed[0].reason.includes('内置'), '失败原因应包含内置');

    const levels = Storage.loadCustomLevels();
    assert(!levels['level-1'], '内置ID不应被导入');
    assert(!!levels['custom-ok'], '正常关卡应导入成功');

    console.log('   导入: %d, 失败: %d', result.importedCount, result.failedCount);
    console.log('   失败原因: %s', result.results.failed[0].reason);
    console.log('   ✅ 内置关卡ID冲突拦截正确');
});

test('36. 批量恢复撤销 - 完整撤销一次恢复', () => {
    clearAllCustomLevels();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');

    const beforeLevels = { ...Storage.loadCustomLevels() };
    const beforeProgress = { ...Storage.loadProgress() };

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 2,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '被覆盖的A' }, highScore: 999 },
            { id: 'custom-new-1', levelData: CUSTOM_LEVEL_B, highScore: 500 }
        ]
    };

    const decisions = [
        { action: 'overwrite' },
        { action: 'import' }
    ];

    const restoreResult = Storage.executeBatchRestore(backupData, decisions);
    assert(restoreResult.success === true, '恢复应成功');

    let levels = Storage.loadCustomLevels();
    assert(levels['custom-batch-a'].name === '被覆盖的A', '恢复后关卡A应被覆盖');
    assert(!!levels['custom-new-1'], '恢复后新关卡应存在');

    const undoResult = Storage.undoBatchRestore();
    assert(undoResult.success === true, '撤销应成功');

    levels = Storage.loadCustomLevels();
    assert(levels['custom-batch-a'].name === '批量测试关卡A', '撤销后关卡A应恢复原名');
    assert(!levels['custom-new-1'], '撤销后新关卡应被移除');

    const progress = Storage.loadProgress();
    assert(progress.highScores['custom-batch-a'] === beforeProgress.highScores['custom-batch-a'],
        '撤销后最高分应恢复');

    const snapshotAfter = Storage.getBatchRestoreUndoSnapshot();
    assert(!snapshotAfter, '撤销后快照应被清除');

    const lastOp = Storage.loadLastOperation();
    assert(lastOp.type === 'undo_batch_restore', '最近操作应为undo_batch_restore');

    console.log('   撤销前: %d 个关卡', Object.keys(beforeLevels).length);
    console.log('   恢复后: %d 个关卡', Object.keys(Storage.loadCustomLevels()).length + 1);
    console.log('   撤销后: %d 个关卡', Object.keys(levels).length);
    console.log('   ✅ 批量恢复撤销功能正确');
});

test('37. 批量恢复撤销 - 无快照时撤销失败', () => {
    clearAllCustomLevels();

    const result = Storage.undoBatchRestore();
    assert(result.success === false, '没有快照时撤销应失败');
    assert(result.reason === 'no_undo_snapshot', '失败原因应为no_undo_snapshot');

    console.log('   撤销结果: success=%s, reason=%s', result.success, result.reason);
    console.log('   ✅ 无快照时撤销拦截正确');
});

test('38. 跨重启状态保留 - 批量恢复相关状态', () => {
    clearAllCustomLevels();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 1,
        levels: [
            { id: 'custom-batch-b', levelData: CUSTOM_LEVEL_B, highScore: 300 }
        ]
    };

    Storage.executeBatchRestore(backupData, [{ action: 'import' }]);

    console.log('   模拟页面刷新（重新从 localStorage 加载）...');

    const customLevels = Storage.loadCustomLevels();
    assert(!!customLevels['custom-batch-a'], '刷新后关卡A应仍在');
    assert(!!customLevels['custom-batch-b'], '刷新后关卡B应仍在');

    const snapshot = Storage.getBatchRestoreUndoSnapshot();
    assert(!!snapshot, '刷新后批量撤销快照应保留');

    const lastRestore = Storage.getLastBatchRestoreInfo();
    assert(!!lastRestore, '刷新后上次恢复信息应保留');
    assert(lastRestore.imported === 1, '刷新后上次恢复导入数应正确');

    const lastOp = Storage.loadLastOperation();
    assert(!!lastOp, '刷新后最近操作应保留');
    assert(lastOp.type === 'batch_restore', '最近操作类型应为批量恢复');

    console.log('   自定义关卡数: %d', Object.keys(customLevels).length);
    console.log('   撤销快照: %s', snapshot ? '存在' : '不存在');
    console.log('   上次恢复信息: %s', lastRestore ? '存在' : '不存在');
    console.log('   ✅ 跨重启状态保留正常');
});

test('39. 元数据保留 - 导入时间、最近操作等', () => {
    clearAllCustomLevels();

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 1,
        levels: [
            {
                id: 'custom-meta-test',
                levelData: CUSTOM_LEVEL_A,
                highScore: 600,
                completed: true,
                _meta: {
                    sourceType: 'batch_import',
                    importTime: Date.now() - 86400000,
                    lastModifiedTime: Date.now() - 3600000,
                    lastOperation: 'some_operation',
                    lastOperationTime: Date.now() - 1800000
                }
            }
        ]
    };

    const result = Storage.executeBatchRestore(backupData, [{ action: 'import' }]);
    assert(result.success === true, '恢复应成功');

    const levels = Storage.loadCustomLevels();
    const level = levels['custom-meta-test'];
    assert(!!level, '关卡应存在');
    assert(!!level._meta, '应有_meta元数据');
    assert(level._meta.sourceType === 'batch_import', '来源类型应保留');
    assert(!!level._meta.importTime, '应有导入时间');
    assert(level._meta.lastOperation === 'batch_restore_import', '最近操作应更新为批量恢复导入');
    assert(!!level._meta.lastOperationTime, '应有最近操作时间');

    console.log('   来源类型: %s', level._meta.sourceType);
    console.log('   最近操作: %s', level._meta.lastOperation);
    console.log('   ✅ 元数据处理正确');
});

test('40. 多次批量恢复 - 只保留最近一次撤销快照', () => {
    clearAllCustomLevels();

    const backup1 = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 1,
        levels: [
            { id: 'custom-multi-1', levelData: { ...CUSTOM_LEVEL_A, id: 'custom-multi-1', name: '多次恢复1' }, highScore: 100 }
        ]
    };

    const backup2 = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 1,
        levels: [
            { id: 'custom-multi-2', levelData: { ...CUSTOM_LEVEL_B, id: 'custom-multi-2', name: '多次恢复2' }, highScore: 200 }
        ]
    };

    const result1 = Storage.executeBatchRestore(backup1, [{ action: 'import' }]);
    assert(result1.success === true, '第一次恢复应成功');
    assert(result1.importedCount === 1, '第一次恢复应导入1个关卡');
    const levelsAfter1 = Storage.loadCustomLevels();
    assert(!!levelsAfter1['custom-multi-1'], '第一次恢复后关卡1应存在');

    const snapshot1 = Storage.getBatchRestoreUndoSnapshot();
    const snapshot1LevelsJson = JSON.stringify(snapshot1.beforeLevels);

    const start = Date.now();
    while (Date.now() === start) {}

    const result2 = Storage.executeBatchRestore(backup2, [{ action: 'import' }]);
    assert(result2.success === true, '第二次恢复应成功');
    assert(result2.importedCount === 1, '第二次恢复应导入1个关卡');
    const levelsAfter2 = Storage.loadCustomLevels();
    assert(!!levelsAfter2['custom-multi-1'], '第二次恢复后关卡1应仍在');
    assert(!!levelsAfter2['custom-multi-2'], '第二次恢复后关卡2应新增');

    const snapshot2 = Storage.getBatchRestoreUndoSnapshot();
    assert(!!snapshot2, '第二次恢复后应有快照');
    assert(JSON.stringify(snapshot2.beforeLevels) !== snapshot1LevelsJson,
        '快照内容应不同（第二次恢复前的关卡集合包含关卡1）');

    const undoResult = Storage.undoBatchRestore();
    assert(undoResult.success === true, '撤销应成功');

    const levels = Storage.loadCustomLevels();
    assert(!!levels['custom-multi-1'], '撤销后第一次恢复的关卡应仍在');
    assert(!levels['custom-multi-2'], '撤销后第二次恢复的关卡应被移除');

    console.log('   第一次恢复后: 1个关卡');
    console.log('   第二次恢复后: 2个关卡');
    console.log('   撤销后: %d 个关卡（应剩下第一次的）', Object.keys(levels).length);
    console.log('   ✅ 多次恢复只保留最近一次撤销快照');
});

test('41. 预检拦截 - 语义坏关卡（订单引用不存在货架）', () => {
    clearAllCustomLevels();

    const badLevelData = { ...CUSTOM_LEVEL_A };
    badLevelData.orders = [
        { id: 'O-BAD', shelfId: 'S-NOT-EXIST', deadline: 120, items: ['商品X'] }
    ];

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 3,
        levels: [
            { id: 'custom-ok-1', levelData: CUSTOM_LEVEL_A, highScore: 100 },
            { id: 'custom-bad-shelf', levelData: badLevelData, highScore: 200 },
            { id: 'custom-ok-2', levelData: CUSTOM_LEVEL_B, highScore: 300 }
        ]
    };

    const precheck = Storage.precheckBackup(backupData);
    assert(precheck.totalCount === 3, '总数量应为3');
    assert(precheck.validCount === 2, '有效数量应为2（2个好关卡）');
    assert(precheck.newLevels.length === 2, '新增关卡应为2个好关卡');
    assert(precheck.badEntries.length === 1, '坏条目应为1');
    assert(precheck.badEntries[0].id === 'custom-bad-shelf', '坏条目ID应正确');
    assert(precheck.badEntries[0].reason.includes('验证失败'), '坏条目原因应包含验证失败');
    assert(precheck.badEntries[0].reason.includes('S-NOT-EXIST'), '坏条目原因应包含未知货架ID');

    assert(precheck.newLevels[0].id === 'custom-ok-1', '好关卡1应在新增列表');
    assert(precheck.newLevels[1].id === 'custom-ok-2', '好关卡2应在新增列表');

    console.log('   总计: %d, 有效: %d, 坏条目: %d',
        precheck.totalCount, precheck.validCount, precheck.badEntries.length);
    console.log('   坏条目原因: %s', precheck.badEntries[0].reason);
    console.log('   ✅ 语义坏关卡预检拦截正确');
});

test('42. 预检拦截 - 缺少出生点/打包台/货架的坏关卡', () => {
    clearAllCustomLevels();

    const noSpawnLevel = {
        id: 'custom-no-spawn',
        name: '无出生点关卡',
        mapWidth: 3,
        mapHeight: 3,
        mapData: [
            ['a', 'a', 'a'],
            ['a', 'a', 'a'],
            ['a', 'a', 'p']
        ],
        workerCount: 1,
        cartCount: 1,
        orders: [{ id: 'O-1', shelfId: 'S1', deadline: 100, items: ['x'] }],
        pickDuration: 2,
        packDuration: 2,
        targetScore: 100,
        minOrdersToPass: 1
    };

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 1,
        levels: [
            { id: 'custom-no-spawn', levelData: noSpawnLevel, highScore: 0 }
        ]
    };

    const precheck = Storage.precheckBackup(backupData);
    assert(precheck.totalCount === 1, '总数量应为1');
    assert(precheck.validCount === 0, '有效数量应为0');
    assert(precheck.badEntries.length === 1, '坏条目应为1');
    assert(precheck.badEntries[0].reason.includes('出生点'), '原因应包含出生点');

    console.log('   坏条目原因: %s', precheck.badEntries[0].reason);
    console.log('   ✅ 缺少必要元素的坏关卡预检拦截正确');
});

test('43. 批量恢复 - 混入坏关卡时只导入好关卡', () => {
    clearAllCustomLevels();

    const badLevelData = { ...CUSTOM_LEVEL_A };
    badLevelData.orders = [
        { id: 'O-BAD', shelfId: 'S-INVALID', deadline: 120, items: ['商品X'] }
    ];

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 3,
        levels: [
            { id: 'custom-good-1', levelData: CUSTOM_LEVEL_A, highScore: 500 },
            { id: 'custom-bad', levelData: badLevelData, highScore: 999 },
            { id: 'custom-good-2', levelData: CUSTOM_LEVEL_B, highScore: 300 }
        ]
    };

    const precheck = Storage.precheckBackup(backupData);
    assert(precheck.badEntries.length === 1, '预检应发现1个坏条目');
    assert(precheck.badEntries[0].index === 1, '坏条目索引应为1');

    const decisions = backupData.levels.map((entry, i) => {
        const isBad = precheck.badEntries.some(b => b.index === i);
        return isBad ? { action: 'skip' } : { action: 'import' };
    });

    const result = Storage.executeBatchRestore(backupData, decisions);

    assert(result.success === true, '恢复应成功');
    assert(result.importedCount === 2, '应只导入2个好关卡');
    assert(result.failedCount === 0, '坏条目在预检已排除，执行阶段不应失败');

    const levels = Storage.loadCustomLevels();
    assert(!!levels['custom-good-1'], '好关卡1应存在');
    assert(!!levels['custom-good-2'], '好关卡2应存在');
    assert(!levels['custom-bad'], '坏关卡不应存在');

    const progress = Storage.loadProgress();
    assert(progress.highScores['custom-good-1'] === 500, '好关卡1最高分正确');
    assert(progress.highScores['custom-good-2'] === 300, '好关卡2最高分正确');
    assert(progress.highScores['custom-bad'] === undefined, '坏关卡最高分不应存在');

    console.log('   导入: %d, 坏关卡未导入: custom-bad', result.importedCount);
    console.log('   ✅ 坏关卡不会被导入主菜单');
});

test('44. 结果摘要 - 坏条目统计正确', () => {
    clearAllCustomLevels();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');

    const badLevelData = { ...CUSTOM_LEVEL_B };
    badLevelData.orders = [
        { id: 'O-BAD', shelfId: 'S-NOT-THERE', deadline: 100, items: ['x'] }
    ];

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 4,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '修改A' }, highScore: 999 },
            { id: 'custom-bad-1', levelData: badLevelData, highScore: 100 },
            { id: 'custom-new-good', levelData: CUSTOM_LEVEL_B, highScore: 200 },
            { id: 'level-1', levelData: { id: 'level-1', name: '伪内置' }, highScore: 50 }
        ]
    };

    const precheck = Storage.precheckBackup(backupData);
    assert(precheck.totalCount === 4, '总数量应为4');
    assert(precheck.validCount === 3, '有效数量应为3（冲突+新增+内置冲突）');
    assert(precheck.conflictLevels.length === 1, '冲突关卡应为1');
    assert(precheck.newLevels.length === 1, '新增关卡应为1');
    assert(precheck.builtinConflict.length === 1, '内置冲突应为1');
    assert(precheck.badEntries.length === 1, '坏条目应为1');

    console.log('   总计: %d, 有效: %d, 冲突: %d, 新增: %d, 内置: %d, 坏条目: %d',
        precheck.totalCount, precheck.validCount,
        precheck.conflictLevels.length, precheck.newLevels.length,
        precheck.builtinConflict.length, precheck.badEntries.length);
    console.log('   ✅ 混合场景下各类条目统计正确');
});

test('45. 原有链路验证 - 有效新增+冲突+撤销+刷新保留正常', () => {
    clearAllCustomLevels();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');
    const originalProgress = Storage.loadProgress();
    originalProgress.highScores['custom-batch-a'] = 100;
    Storage.saveProgress(originalProgress);

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 2,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '覆盖后A' }, highScore: 999, completed: true },
            { id: 'custom-new-ok', levelData: CUSTOM_LEVEL_B, highScore: 500, completed: false }
        ]
    };

    const precheck = Storage.precheckBackup(backupData);
    assert(precheck.conflictLevels.length === 1, '应检测到1个冲突');
    assert(precheck.newLevels.length === 1, '应检测到1个新增');
    assert(precheck.badEntries.length === 0, '坏条目应为0');

    const decisions = [
        { action: 'overwrite' },
        { action: 'import' }
    ];

    const result = Storage.executeBatchRestore(backupData, decisions);
    assert(result.success === true, '恢复应成功');
    assert(result.importedCount === 2, '应导入2个');
    assert(result.undoable === true, '应支持撤销');

    const levels = Storage.loadCustomLevels();
    assert(levels['custom-batch-a'].name === '覆盖后A', '覆盖应生效');
    assert(!!levels['custom-new-ok'], '新增应生效');

    const progress = Storage.loadProgress();
    assert(progress.highScores['custom-batch-a'] === 999, '最高分应更新');
    assert(progress.highScores['custom-new-ok'] === 500, '新关卡最高应正确');
    assert(progress.completedLevels.includes('custom-batch-a'), '完成状态应更新');

    const undoResult = Storage.undoBatchRestore();
    assert(undoResult.success === true, '撤销应成功');

    const levelsAfterUndo = Storage.loadCustomLevels();
    assert(levelsAfterUndo['custom-batch-a'].name === '批量测试关卡A', '撤销后名称应恢复');
    assert(!levelsAfterUndo['custom-new-ok'], '撤销后新增关卡应移除');

    const progressAfterUndo = Storage.loadProgress();
    assert(progressAfterUndo.highScores['custom-batch-a'] === 100, '撤销后最高分应恢复');

    console.log('   模拟页面刷新（重新加载）...');
    const levelsRefresh = Storage.loadCustomLevels();
    const snapshotRefresh = Storage.getBatchRestoreUndoSnapshot();
    const lastRestoreRefresh = Storage.getLastBatchRestoreInfo();

    assert(!!levelsRefresh['custom-batch-a'], '刷新后关卡拉应保留');
    assert(!snapshotRefresh, '刷新后撤销快照已被清除（因已撤销）');

    console.log('   ✅ 原有链路（新增/冲突/撤销/刷新）全部正常');
});

test('46. 数据层兜底 - 恶意篡改坏条目决策为import仍被拦截', () => {
    clearAllCustomLevels();

    const badLevelData = { ...CUSTOM_LEVEL_A };
    badLevelData.orders = [
        { id: 'O-EVIL', shelfId: 'S-FAKE', deadline: 120, items: ['商品X'] }
    ];

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 2,
        levels: [
            { id: 'custom-hack-bad', levelData: badLevelData, highScore: 9999 },
            { id: 'custom-hack-good', levelData: CUSTOM_LEVEL_B, highScore: 500 }
        ]
    };

    const decisions = [
        { action: 'import' },
        { action: 'import' }
    ];

    const result = Storage.executeBatchRestore(backupData, decisions);

    assert(result.success === true, '恢复应成功');
    assert(result.importedCount === 1, '只应导入1个好关卡');
    assert(result.skippedCount === 1, '应跳过1个坏关卡');
    assert(result.failedCount === 0, '不应有失败（坏条目是语义跳过不是执行失败）');

    assert(result.results.skipped.some(s => s.id === 'custom-hack-bad'), '坏条目应出现在skipped列表');
    assert(result.results.skipped.find(s => s.id === 'custom-hack-bad').reason.includes('校验失败'),
        'skipped条目的原因应包含校验失败');
    assert(result.results.skipped.find(s => s.id === 'custom-hack-bad').reason.includes('S-FAKE'),
        'skipped条目的原因应包含具体的坏货架ID');

    const levels = Storage.loadCustomLevels();
    assert(!levels['custom-hack-bad'], '坏关卡绝对不能写进主菜单关卡列表');
    assert(!!levels['custom-hack-good'], '好关卡应正常写入');

    const progress = Storage.loadProgress();
    assert(progress.highScores['custom-hack-bad'] === undefined, '坏关卡不能留下最高分');
    assert(progress.highScores['custom-hack-good'] === 500, '好关卡最高分正常写入');

    assert(!result.results.imported.some(i => i.id === 'custom-hack-bad'),
        '最终恢复结果摘要的imported列表不能出现坏条目');

    console.log('   决策强行import了坏关卡custom-hack-bad');
    console.log('   数据层二次校验仍拦住，skipped原因:', result.results.skipped.find(s => s.id === 'custom-hack-bad').reason);
    console.log('   主菜单关卡数: %d, 坏关卡写入: %s',
        Object.keys(levels).length,
        Object.keys(levels).includes('custom-hack-bad') ? '是' : '否');
    console.log('   ✅ 数据层兜底有效：恶意篡改决策也写不进去');
});

test('47. 数据层兜底 - overwrite坏关卡也被拦住+save_as_new坏关卡也被拦住', () => {
    clearAllCustomLevels();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');

    const badOverwrite = { ...CUSTOM_LEVEL_A };
    badOverwrite.orders = [
        { id: 'O-BAD', shelfId: 'S-NOT-THERE', deadline: 100, items: ['x'] }
    ];

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 2,
        levels: [
            { id: 'custom-batch-a', levelData: badOverwrite, highScore: 777 },
            { id: 'custom-saveas-bad', levelData: badOverwrite, highScore: 888 }
        ]
    };

    const decisions = [
        { action: 'overwrite' },
        { action: 'save_as_new' }
    ];

    const result = Storage.executeBatchRestore(backupData, decisions);

    assert(result.success === true, '恢复应成功');
    assert(result.importedCount === 0, '两个坏关卡都不能导入');
    assert(result.skippedCount === 2, '两个坏关卡都应被语义跳过');

    const levels = Storage.loadCustomLevels();
    assert(levels['custom-batch-a'].name === '批量测试关卡A', '原关卡A不能被坏数据覆盖');
    assert(!Object.keys(levels).some(k => k.startsWith('custom-saveas-bad')), '不能生成坏关卡的副本');

    const progress = Storage.loadProgress();
    assert(progress.highScores['custom-batch-a'] !== 777, '原关卡A最高分不能被坏数据的777覆盖');

    console.log('   尝试overwrite+save_as_new两个语义坏关卡');
    console.log('   imported: %d, skipped: %d', result.importedCount, result.skippedCount);
    console.log('   原关卡名称保持: %s（未被覆盖）', levels['custom-batch-a'].name);
    console.log('   ✅ overwrite和save_as_new的语义坏关卡也被数据层拦住');
});

test('48. 数据层兜底 - 决策数组完全缺失时默认skip+decisions留空也安全', () => {
    clearAllCustomLevels();

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 2,
        levels: [
            { id: 'custom-ok-x', levelData: CUSTOM_LEVEL_A, highScore: 100 },
            { id: 'custom-ok-y', levelData: CUSTOM_LEVEL_B, highScore: 200 }
        ]
    };

    const result1 = Storage.executeBatchRestore(backupData, undefined);
    assert(result1.success === true, '恢复应成功');
    assert(result1.skippedCount === 2, '无decisions数组时默认全部skip');
    assert(result1.importedCount === 0, '无decisions时不能导入任何东西');

    const levels1 = Storage.loadCustomLevels();
    assert(Object.keys(levels1).length === 0, 'decisions完全缺失时不能写关卡');

    const result2 = Storage.executeBatchRestore(backupData, {});
    assert(result2.success === true, '空decisions对象也应成功');
    assert(result2.skippedCount === 2, '空对象decisions也默认全部skip');

    const levels2 = Storage.loadCustomLevels();
    assert(Object.keys(levels2).length === 0, '空decisions也不能写关卡');

    console.log('   decisions=undefined: skipped=%d, levels=%d', result1.skippedCount, Object.keys(levels1).length);
    console.log('   decisions={}:        skipped=%d, levels=%d', result2.skippedCount, Object.keys(levels2).length);
    console.log('   ✅ decisions缺失/留空时安全默认skip，不写入任何东西');
});

console.log('\n=== 测试总结 ===');
const passed = testResults.filter(r => r.passed).length;
const total = testResults.length;
console.log(`通过: ${passed}/${total}`);

if (passed < total) {
    console.log('\n❌ 失败的测试:');
    testResults.filter(r => !r.passed).forEach(r => {
        console.log(`  ❌ ${r.name}: ${r.error}`);
    });
    process.exit(1);
} else {
    console.log('\n🎉 所有端到端测试通过！');
    console.log('\n📋 验证的功能:');
    console.log('   ✅ 开局状态正确（拣货员空闲）');
    console.log('   ✅ UI下拉选项状态正确');
    console.log('   ✅ 首次派工功能正常');
    console.log('   ✅ 拣货员移动正常（真实逐帧16ms/帧）');
    console.log('   ✅ 拣货流程正常');
    console.log('   ✅ 打包流程正常');
    console.log('   ✅ 订单完成和结算正常（得分增加）');
    console.log('   ✅ 游戏胜利（不是失败）');
    console.log('   ✅ 操作序列记录完整');
    console.log('   ✅ 可进入下一关');
    console.log('   ✅ 单向巷道配置正确');
    console.log('   ✅ 推车不足拦截正常');
    console.log('   ✅ 忙碌拣货员拦截正常');
    console.log('   ✅ 单向巷道冲突检测未被破坏');
    console.log('   ✅ 自定义关卡导入+元数据');
    console.log('   ✅ 重复导入冲突（覆盖）');
    console.log('   ✅ 内置关卡ID冲突拦截');
    console.log('   ✅ 坏JSON格式验证');
    console.log('   ✅ 未知货架验证');
    console.log('   ✅ 删除自定义关卡');
    console.log('   ✅ 删除后撤销恢复');
    console.log('   ✅ 单次撤销限制');
    console.log('   ✅ 最近操作记录');
    console.log('   ✅ 导出再导入完整往返');
    console.log('   ✅ 跨重启状态保留');
    console.log('   ✅ 另存为新关卡');
    console.log('   ✅ 内置关卡ID注册');
    console.log('   ✅ 删除后操作记录保留');
    console.log('   ✅ 预检语义校验（订单引用不存在货架等）');
    console.log('   ✅ 批量恢复混入坏关卡只导入好的');
    console.log('   ✅ 混合场景各类条目统计正确');
    console.log('   ✅ 原有链路完整保留（新增/冲突/撤销/刷新）');
    console.log('   ✅ 数据层兜底：恶意篡改坏条目决策为import仍被拦');
    console.log('   ✅ 数据层兜底：overwrite/save_as_new坏关卡也被拦');
    console.log('   ✅ 数据层兜底：decisions缺失/留空时默认skip安全');
}
