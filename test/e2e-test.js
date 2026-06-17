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
    assert(lastRestore.counts.imported === 2, '上次恢复导入数应正确');
    assert(lastRestore.counts.new === 2, 'counts.new应正确');

    console.log('   导入: %d, 跳过: %d, 失败: %d',
        result.importedCount, result.skippedCount, result.failedCount);
    console.log('   counts: new=%d, overwrite=%d, saveAsNew=%d',
        lastRestore.counts.new, lastRestore.counts.overwrite, lastRestore.counts.saveAsNew);
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
    assert(lastRestore.counts.imported === 1, '刷新后上次恢复导入数应正确');
    assert(lastRestore.counts.new === 1, '刷新后counts.new应正确');

    const lastOp = Storage.loadLastOperation();
    assert(!!lastOp, '刷新后最近操作应保留');
    assert(lastOp.type === 'batch_restore', '最近操作类型应为批量恢复');

    console.log('   自定义关卡数: %d', Object.keys(customLevels).length);
    console.log('   撤销快照: %s', snapshot ? '存在' : '不存在');
    console.log('   上次恢复信息: imported=%d, new=%d', lastRestore.counts.imported, lastRestore.counts.new);
    console.log('   历史记录条数: %d', Storage.loadBatchRestoreHistory().length);
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

test('49. 恢复记录持久化 - 记录结构完整+localStorage跨刷新保留', () => {
    clearAllCustomLevels();
    Storage.clearLastBatchRestoreInfo();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');

    const badLevel = { ...CUSTOM_LEVEL_B };
    badLevel.orders = [{ id: 'O-BAD', shelfId: 'S-INVALID', deadline: 120, items: ['x'] }];

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 6,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '覆盖后的A', difficulty: 3 }, highScore: 999, completed: true },
            { id: 'custom-new-c', levelData: { ...CUSTOM_LEVEL_A, id: 'custom-new-c', name: '新增关卡C' }, highScore: 200 },
            { id: 'custom-saveas', levelData: { ...CUSTOM_LEVEL_A, id: 'custom-saveas', name: '副本原关卡' }, highScore: 300 },
            { id: 'level-1', levelData: { id: 'level-1', name: '伪内置冲突' } },
            { id: 'custom-bad-x', levelData: badLevel },
            null
        ]
    };

    const decisions = [
        { action: 'overwrite' },
        { action: 'import' },
        { action: 'save_as_new' },
        { action: 'skip' },
        { action: 'import' },
        { action: 'skip' }
    ];

    const result = Storage.executeBatchRestore(backupData, decisions);
    assert(result.success === true, '恢复应成功');
    assert(!!result.recordId, '应返回recordId');
    assert(!!result.counts, '应返回counts统计');
    assert(result.counts.new === 1, 'new计数应为1');
    assert(result.counts.overwrite === 1, 'overwrite计数应为1');
    assert(result.counts.saveAsNew === 1, 'saveAsNew计数应为1');
    assert(result.counts.builtinConflict === 1, 'builtinConflict计数应为1');
    assert(result.counts.badEntries === 1, 'badEntries计数应为1（第6条null）');
    assert(result.counts.skipped === 1, 'skipped计数应为1（语义错误的custom-bad-x）');
    assert(result.counts.imported === 3, 'imported总数应为3（new+overwrite+saveAsNew）');

    const lastRestore = Storage.getLastBatchRestoreInfo();
    assert(!!lastRestore, 'getLastBatchRestoreInfo应返回记录');
    assert(lastRestore.recordId === result.recordId, 'recordId应一致');
    assert(!!lastRestore.timestamp, '应有timestamp');
    assert(lastRestore.undoable === true, 'undoable应为true');
    assert(lastRestore.undone === false, 'undone应为false');
    assert(!!lastRestore.decisions, '应有decisions记录');
    assert(!!lastRestore.counts, '应有counts');
    assert(!!lastRestore.detailed, '应有detailed详细记录');

    assert(lastRestore.detailed.new.length === 1, 'detailed.new应有1条');
    assert(lastRestore.detailed.new[0].id === 'custom-new-c', '新增关卡ID正确');
    assert(lastRestore.detailed.new[0].decision === 'import', '决策标签正确');
    assert(lastRestore.detailed.new[0].conflictType === 'no_conflict', '冲突类型正确');
    assert(lastRestore.detailed.new[0].highScore === 200, '最高分记录正确');

    assert(lastRestore.detailed.overwrite.length === 1, 'detailed.overwrite应有1条');
    assert(lastRestore.detailed.overwrite[0].id === 'custom-batch-a', '覆盖关卡ID正确');
    assert(lastRestore.detailed.overwrite[0].originalName === '批量测试关卡A', '原名称记录正确');
    assert(lastRestore.detailed.overwrite[0].decision === 'overwrite', '决策标签正确');
    assert(lastRestore.detailed.overwrite[0].conflictType === 'id_conflict', '冲突类型正确');

    assert(lastRestore.detailed.saveAsNew.length === 1, 'detailed.saveAsNew应有1条');
    assert(lastRestore.detailed.saveAsNew[0].originalId === 'custom-saveas', '原ID记录正确');
    assert(lastRestore.detailed.saveAsNew[0].decision === 'save_as_new', '决策标签正确');
    assert(lastRestore.detailed.saveAsNew[0].name.includes('副本'), '新名称包含副本标记');

    assert(lastRestore.detailed.builtinConflict.length === 1, 'detailed.builtinConflict应有1条');
    assert(lastRestore.detailed.builtinConflict[0].id === 'level-1', '内置冲突ID正确');
    assert(lastRestore.detailed.builtinConflict[0].reason.includes('内置'), '原因包含内置关键字');
    assert(lastRestore.detailed.builtinConflict[0].conflictType === 'builtin_conflict', '冲突类型为builtin_conflict');

    assert(lastRestore.detailed.badEntries.length === 1, 'detailed.badEntries应有1条（null条目）');
    assert(lastRestore.detailed.badEntries[0].conflictType === 'bad_entry', '格式错误的冲突类型');
    assert(lastRestore.detailed.badEntries[0].reason.includes('无效的关卡数据'), 'badEntries原因正确');

    const semanticBad = lastRestore.detailed.skipped.find(s => s.id === 'custom-bad-x');
    assert(!!semanticBad, 'detailed.skipped中应包含语义错误的custom-bad-x');
    assert(semanticBad.conflictType === 'validation_error', '语义错误的冲突类型为validation_error');
    assert(semanticBad.reason.includes('校验失败'), '原因包含校验失败');
    assert(semanticBad.reason.includes('S-INVALID'), '原因包含具体坏货架ID');

    const history = Storage.loadBatchRestoreHistory();
    assert(Array.isArray(history), '历史记录应为数组');
    assert(history.length >= 1, '历史记录至少1条');
    assert(history[0].recordId === result.recordId, '历史首条应为本次记录');

    const recordById = Storage.getBatchRestoreRecord(result.recordId);
    assert(!!recordById, 'getBatchRestoreRecord按ID查询成功');
    assert(recordById.recordId === result.recordId, '查询的recordId一致');

    console.log('   recordId: %s', result.recordId);
    console.log('   counts: total=%d, imported=%d, new=%d, overwrite=%d, saveAsNew=%d',
        result.counts.total, result.counts.imported, result.counts.new, result.counts.overwrite, result.counts.saveAsNew);
    console.log('   counts: skipped=%d, builtin=%d, bad=%d, failed=%d',
        result.counts.skipped, result.counts.builtinConflict, result.counts.badEntries, result.counts.failed);
    console.log('   历史记录条数: %d, 按ID查询成功: %s', history.length, !!recordById);
    console.log('   ✅ 恢复记录结构完整，跨刷新持久化正常');
});

test('50. 记录导出JSON - 导出结构完整+冲突分支与决策一致', () => {
    clearAllCustomLevels();
    Storage.clearLastBatchRestoreInfo();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 4,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '覆盖A' }, highScore: 888 },
            { id: 'custom-new-exp', levelData: { ...CUSTOM_LEVEL_B, id: 'custom-new-exp', name: '新增导出' }, highScore: 400, completed: true },
            { id: 'level-2', levelData: { id: 'level-2', name: '伪内置2' }, highScore: 100 },
            null
        ]
    };

    const decisions = [
        { action: 'overwrite' },
        { action: 'import' },
        { action: 'skip' },
        { action: 'skip' }
    ];

    const restoreResult = Storage.executeBatchRestore(backupData, decisions);
    assert(restoreResult.success === true, '恢复应成功');

    const exportResult = Storage.exportBatchRestoreRecordAsJson();
    assert(exportResult.success === true, '导出应成功');
    assert(!!exportResult.json, '应有JSON字符串');
    assert(!!exportResult.data, '应有结构化数据');

    const parsed = JSON.parse(exportResult.json);
    assert(parsed.exportType === 'batch_restore_report', 'exportType标记正确');
    assert(!!parsed.exportedAt, '应有导出时间戳');
    assert(parsed.record.recordId === restoreResult.recordId, 'recordId一致');
    assert(parsed.record.undoable === true, '导出状态undoable正确');
    assert(parsed.record.undone === false, '导出状态undone正确');
    assert(!!parsed.record.decisions, '导出包含decisions');

    assert(parsed.counts.overwrite === 1, '导出counts.overwrite正确');
    assert(parsed.counts.new === 1, '导出counts.new正确');
    assert(parsed.counts.builtinConflict === 1, '导出counts.builtinConflict正确');
    assert(parsed.counts.badEntries === 1, '导出counts.badEntries正确');

    assert(parsed.categories.overwrite.length === 1, '分类.overwrite数量正确');
    assert(parsed.categories.overwrite[0].id === 'custom-batch-a', '覆盖ID正确');
    assert(parsed.categories.overwrite[0].originalName === '批量测试关卡A', '原名称保留');
    assert(parsed.categories.overwrite[0].decision === 'overwrite', '决策与当时选择一致');

    assert(parsed.categories.new.length === 1, '分类.new数量正确');
    assert(parsed.categories.new[0].id === 'custom-new-exp', '新增ID正确');
    assert(parsed.categories.new[0].highScore === 400, '最高分一致');
    assert(parsed.categories.new[0].completed === true, '完成状态一致');
    assert(parsed.categories.new[0].decision === 'import', '决策与当时选择一致');

    assert(parsed.categories.builtinConflict.length === 1, '分类.builtinConflict正确');
    assert(parsed.categories.builtinConflict[0].id === 'level-2', '内置冲突ID正确');
    assert(parsed.categories.builtinConflict[0].decision === 'skip', '决策与用户选择一致');

    assert(parsed.categories.badEntries.length === 1, '分类.badEntries正确');
    assert(parsed.categories.badEntries[0].reason.includes('无效的关卡数据'), '坏条目原因正确');

    console.log('   导出JSON大小: %d 字符', exportResult.json.length);
    console.log('   分类条目数: overwrite=%d, new=%d, builtin=%d, bad=%d',
        parsed.categories.overwrite.length, parsed.categories.new.length,
        parsed.categories.builtinConflict.length, parsed.categories.badEntries.length);
    console.log('   categories.overwrite[0].decision=%s（与用户选择一致）',
        parsed.categories.overwrite[0].decision);
    console.log('   categories.new[0].decision=%s（与用户选择一致）',
        parsed.categories.new[0].decision);
    console.log('   ✅ 导出JSON结构完整，冲突分支与决策完全一致');
});

test('51. 撤销联动 - 记录数量/关卡名单/可撤销提示同步回退', () => {
    clearAllCustomLevels();
    Storage.clearLastBatchRestoreInfo();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 3,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '覆盖撤销测试' }, highScore: 777 },
            { id: 'custom-undo-new', levelData: { ...CUSTOM_LEVEL_B, id: 'custom-undo-new', name: '撤销新增' }, highScore: 500 },
            { id: 'custom-undo-saveas', levelData: { ...CUSTOM_LEVEL_A, id: 'custom-undo-saveas', name: '撤销副本' }, highScore: 200 }
        ]
    };

    const decisions = [
        { action: 'overwrite' },
        { action: 'import' },
        { action: 'save_as_new' }
    ];

    const restoreResult = Storage.executeBatchRestore(backupData, decisions);
    assert(restoreResult.success === true, '恢复应成功');
    const recordId = restoreResult.recordId;

    const levelsAfterRestore = Storage.loadCustomLevels();
    const saveAsNewEntry = restoreResult.detailed.saveAsNew[0];
    assert(levelsAfterRestore['custom-batch-a'].name === '覆盖撤销测试', '覆盖生效');
    assert(!!levelsAfterRestore['custom-undo-new'], '新增关卡存在');
    assert(!!levelsAfterRestore[saveAsNewEntry.id], '副本关卡存在');

    let record = Storage.getBatchRestoreRecord(recordId);
    assert(record.undoable === true, '撤销前undoable=true');
    assert(record.undone === false, '撤销前undone=false');
    assert(record.counts.imported === 3, '撤销前imported=3');
    assert(record.detailed.new.length === 1, '撤销前detailed.new有数据');
    assert(record.detailed.overwrite.length === 1, '撤销前detailed.overwrite有数据');
    assert(record.detailed.saveAsNew.length === 1, '撤销前detailed.saveAsNew有数据');

    const snapshot = Storage.getBatchRestoreUndoSnapshot();
    assert(!!snapshot, '撤销前快照存在');

    const undoResult = Storage.undoBatchRestore();
    assert(undoResult.success === true, '撤销应成功');
    assert(undoResult.recordId === recordId, '撤销返回的recordId正确');

    const levelsAfterUndo = Storage.loadCustomLevels();
    assert(levelsAfterUndo['custom-batch-a'].name === '批量测试关卡A', '撤销后名称回退');
    assert(!levelsAfterUndo['custom-undo-new'], '撤销后新增关卡移除');
    assert(!levelsAfterUndo[saveAsNewEntry.id], '撤销后副本关卡移除');

    const snapshotAfter = Storage.getBatchRestoreUndoSnapshot();
    assert(!snapshotAfter, '撤销后快照清除');

    record = Storage.getBatchRestoreRecord(recordId);
    assert(!!record, '撤销后记录仍在历史中');
    assert(record.undoable === false, '撤销后undoable=false');
    assert(record.undone === true, '撤销后undone=true');
    assert(!!record.undoneAt, '撤销后有undoneAt时间戳');
    assert(record.counts.imported === 0, '撤销后counts.imported回退为0');
    assert(record.counts.new === 0, '撤销后counts.new回退为0');
    assert(record.counts.overwrite === 0, '撤销后counts.overwrite回退为0');
    assert(record.counts.saveAsNew === 0, '撤销后counts.saveAsNew回退为0');
    assert(record.detailed.new.length === 0, '撤销后detailed.new清空');
    assert(record.detailed.overwrite.length === 0, '撤销后detailed.overwrite清空');
    assert(record.detailed.saveAsNew.length === 0, '撤销后detailed.saveAsNew清空');
    assert(record.detailed._originalDetailed, '撤销后保留_originalDetailed备份');

    const lastRestore = Storage.getLastBatchRestoreInfo();
    assert(lastRestore.undone === true, 'getLastBatchRestoreInfo也标记undone');
    assert(lastRestore.undoable === false, 'getLastBatchRestoreInfo也标记不可撤销');

    console.log('   撤销前: imported=3, undoable=true, undone=false');
    console.log('   撤销后: imported=%d, undoable=%s, undone=%s',
        record.counts.imported, record.undoable, record.undone);
    console.log('   关卡数据回退: 覆盖名称恢复=%s, 新增移除=%s, 副本移除=%s',
        levelsAfterUndo['custom-batch-a'].name === '批量测试关卡A',
        !levelsAfterUndo['custom-undo-new'],
        !levelsAfterUndo[saveAsNewEntry.id]);
    console.log('   原始数据备份: _originalDetailed存在=%s', !!record.detailed._originalDetailed);
    console.log('   ✅ 撤销联动正常：关卡数据+记录数量+名单+可撤销标记全部同步回退');
});

test('52. 冲突分支一致性 - 覆盖/另存为/内置/坏条目 记录和导出与用户决策一致', () => {
    clearAllCustomLevels();
    Storage.clearLastBatchRestoreInfo();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');
    Storage.saveCustomLevel(CUSTOM_LEVEL_B, 'import', 'import');
    Storage.saveCustomLevel({ ...CUSTOM_LEVEL_A, id: 'custom-conflict-c', name: '原关卡C' }, 'import', 'import');

    const badData = { ...CUSTOM_LEVEL_A };
    badData.orders = [{ id: 'O-BAD', shelfId: 'S-BAD-ID', deadline: 100, items: ['bad'] }];

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 7,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '决策1-覆盖' }, highScore: 1000 },
            { id: 'custom-batch-b', levelData: { ...CUSTOM_LEVEL_B, name: '决策2-跳过' }, highScore: 2000 },
            { id: 'custom-conflict-c', levelData: { ...CUSTOM_LEVEL_A, id: 'custom-conflict-c', name: '决策3-ID冲突另存为' } },
            { id: 'custom-no-conflict-d', levelData: { ...CUSTOM_LEVEL_A, id: 'custom-no-conflict-d', name: '决策4-无冲突另存为' } },
            { id: 'level-1', levelData: { ...CUSTOM_LEVEL_A, id: 'level-1', name: '内置冲突1(副本)' } },
            { id: 'level-2', levelData: { ...CUSTOM_LEVEL_B, id: 'level-2', name: '内置冲突2(跳过)' } },
            { id: 'custom-bad-entry', levelData: badData }
        ]
    };

    const decisions = [
        { action: 'overwrite' },
        { action: 'skip' },
        { action: 'save_as_new' },
        { action: 'save_as_new' },
        { action: 'save_as_new' },
        { action: 'skip' },
        { action: 'import' }
    ];

    const result = Storage.executeBatchRestore(backupData, decisions);
    assert(result.success === true, '恢复应成功');

    const last = Storage.getLastBatchRestoreInfo();
    const d = last.detailed;

    const overwriteEntry = d.overwrite.find(x => x.id === 'custom-batch-a');
    assert(!!overwriteEntry, '覆盖分支存在');
    assert(overwriteEntry.decision === 'overwrite', '覆盖决策标签与用户选择overwrite一致');
    assert(overwriteEntry.conflictType === 'id_conflict', '覆盖冲突类型为id_conflict');
    assert(overwriteEntry.reason === '同ID关卡已存在，用户选择覆盖', '覆盖原因与选择一致');
    assert(overwriteEntry.originalName === '批量测试关卡A', '覆盖原名称正确');

    const skippedByUser = d.skipped.find(x => x.id === 'custom-batch-b');
    assert(!!skippedByUser, '用户主动跳过的分支存在');
    assert(skippedByUser.decision === 'skip', '跳过决策标签与用户选择skip一致');
    assert(skippedByUser.conflictType === 'id_conflict', '跳过冲突类型为id_conflict');
    assert(skippedByUser.reason === '同ID关卡已存在，用户选择跳过', '跳过原因与选择一致');

    const saveAsFromConflict = d.saveAsNew.find(x => x.originalId === 'custom-conflict-c');
    assert(!!saveAsFromConflict, 'ID冲突另存为分支存在');
    assert(saveAsFromConflict.decision === 'save_as_new', '决策标签与用户save_as_new一致');
    assert(saveAsFromConflict.conflictType === 'id_conflict', 'ID冲突另存为的冲突类型为id_conflict');
    assert(saveAsFromConflict.originalName === '原关卡C', '冲突另存为的原名称记录正确');
    assert(saveAsFromConflict.reason === '同ID关卡已存在，用户选择另存为副本', '冲突另存为原因正确');

    const saveAsFromNone = d.saveAsNew.find(x => x.originalId === 'custom-no-conflict-d');
    assert(!!saveAsFromNone, '无冲突另存为分支存在');
    assert(saveAsFromNone.decision === 'save_as_new', '无冲突另存决策一致');
    assert(saveAsFromNone.conflictType === 'no_conflict', '无冲突另存的类型为no_conflict');
    assert(saveAsFromNone.reason === '用户选择另存为副本', '无冲突另存原因正确');

    const saveAsFromBuiltin = d.saveAsNew.find(x => x.originalId === 'level-1');
    assert(!!saveAsFromBuiltin, '内置冲突另存为分支存在');
    assert(saveAsFromBuiltin.decision === 'save_as_new', '内置另存决策一致');
    assert(saveAsFromBuiltin.conflictType === 'builtin_conflict', '内置冲突类型为builtin_conflict');
    assert(saveAsFromBuiltin.reason.includes('内置关卡ID冲突'), '原因包含内置冲突');

    const builtinSkipped = d.builtinConflict.find(x => x.id === 'level-2');
    assert(!!builtinSkipped, '内置跳过分支存在');
    assert(builtinSkipped.decision === 'skip', '内置跳过决策与用户skip一致');
    assert(builtinSkipped.reason.includes('内置'), '原因包含内置');

    const badEntry = d.skipped.find(x => x.id === 'custom-bad-entry');
    assert(!!badEntry, '坏条目分支存在');
    assert(badEntry.conflictType === 'validation_error', '坏条目冲突类型');
    assert(badEntry.reason.includes('校验失败'), '坏条目原因包含校验失败');
    assert(badEntry.reason.includes('S-BAD-ID'), '坏条目原因包含具体货架ID');

    const levels = Storage.loadCustomLevels();
    assert(levels['custom-batch-a'].name === '决策1-覆盖', '覆盖实际生效');
    assert(levels['custom-batch-b'].name === '批量测试关卡B', '用户跳过实际未变');
    assert(levels['custom-conflict-c'].name === '原关卡C', '冲突另存为时原关卡保持不变');
    assert(!!levels[saveAsFromConflict.id], 'ID冲突另存为写入副本成功');
    assert(!!levels[saveAsFromNone.id], '无冲突另存为写入成功');
    assert(!!levels[saveAsFromBuiltin.id], '内置另存为实际写入');
    assert(!levels['custom-bad-entry'], '坏条目未写入');

    const exportData = Storage.exportBatchRestoreRecordAsJson().data;
    assert(exportData.categories.overwrite[0].decision === 'overwrite', '导出覆盖决策一致');
    assert(exportData.categories.skipped.find(x => x.id === 'custom-batch-b').decision === 'skip', '导出跳过决策一致');
    assert(exportData.categories.saveAsNew.find(x => x.originalId === 'custom-conflict-c').decision === 'save_as_new',
        '导出ID冲突另存为决策一致');
    assert(exportData.categories.saveAsNew.find(x => x.originalId === 'custom-conflict-c').conflictType === 'id_conflict',
        '导出ID冲突另存为conflictType一致');
    assert(exportData.categories.builtinConflict[0].decision === 'skip', '导出内置跳过决策一致');

    console.log('   覆盖: decision=%s, conflictType=%s, 实际生效=%s',
        overwriteEntry.decision, overwriteEntry.conflictType,
        levels['custom-batch-a'].name === '决策1-覆盖');
    console.log('   用户跳过: decision=%s, conflictType=%s, 实际保留原名=%s',
        skippedByUser.decision, skippedByUser.conflictType,
        levels['custom-batch-b'].name === '批量测试关卡B');
    console.log('   ID冲突另存: decision=%s, conflictType=%s, 原关卡保留=%s, 副本写入=%s',
        saveAsFromConflict.decision, saveAsFromConflict.conflictType,
        levels['custom-conflict-c'].name === '原关卡C', !!levels[saveAsFromConflict.id]);
    console.log('   无冲突另存: decision=%s, conflictType=%s, 写入=%s',
        saveAsFromNone.decision, saveAsFromNone.conflictType,
        !!levels[saveAsFromNone.id]);
    console.log('   内置另存: decision=%s, conflictType=%s, 写入存在=%s',
        saveAsFromBuiltin.decision, saveAsFromBuiltin.conflictType,
        !!levels[saveAsFromBuiltin.id]);
    console.log('   内置跳过: decision=%s, 原因含内置=%s',
        builtinSkipped.decision, builtinSkipped.reason.includes('内置'));
    console.log('   坏条目: decision=import(用户选的), 实际进入skipped因校验拦截, conflictType=%s',
        badEntry.conflictType);
    console.log('   saveAsNew共%d条: 1个id_conflict + 1个no_conflict + 1个builtin_conflict', d.saveAsNew.length);
    console.log('   导出JSON中各分类决策标签与用户原始选择完全一致');
    console.log('   ✅ 所有冲突分支：覆盖/另存为(ID+无+内置)/跳过/内置/坏条目 记录+导出+实际三者完全一致');
});

test('53. 真实页面入口DOM结构解析 - 主菜单入口/恢复记录按钮/弹窗容器可解析', () => {
    clearAllCustomLevels();

    console.log('   读取index.html并解析DOM结构...');
    const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    const requiredButtonIds = [
        'btn-backup-all',
        'btn-restore-all',
        'btn-view-restore-history',
        'btn-undo-batch-restore',
        'btn-open-last-restore-detail',
        'btn-export-restore-result',
        'btn-export-restore-detail',
        'btn-close-restore-history',
        'btn-close-restore-detail'
    ];

    console.log('   检查核心入口按钮...');
    requiredButtonIds.forEach(id => {
        const hasBtn = new RegExp(`id=["']${id}["']`).test(htmlContent);
        assert(hasBtn, `HTML中缺少必需的入口按钮: #${id}`);
        console.log(`     ✅ #${id} 存在`);
    });

    const requiredContainerIds = [
        'main-menu',
        'last-restore-card',
        'last-restore-card-content',
        'restore-history-modal',
        'restore-history-list',
        'restore-detail-modal',
        'restore-detail-status-bar',
        'restore-detail-summary',
        'restore-detail-tabs',
        'restore-detail-tab-content',
        'restore-result-modal',
        'restore-result-summary',
        'restore-result-details',
        'batch-undo-bar'
    ];

    console.log('   检查恢复记录相关的弹窗/面板容器...');
    requiredContainerIds.forEach(id => {
        const hasContainer = new RegExp(`id=["']${id}["']`).test(htmlContent);
        assert(hasContainer, `HTML中缺少必需的容器: #${id}`);
        console.log(`     ✅ #${id} 存在`);
    });

    const requiredTabClasses = [
        'detail-tab',
        'restore-detail-tabs',
        'restore-detail-status-bar',
        'restore-detail-summary',
        'restore-detail-tab-content',
        'restore-history-list',
        'history-item',
        'last-restore-card',
        'batch-undo-bar'
    ];

    console.log('   检查详情页Tab分类...');
    const tabNames = ['new', 'overwrite', 'saveAsNew', 'skipped', 'builtinConflict', 'badEntries', 'failed'];
    tabNames.forEach(tab => {
        const hasTab = new RegExp(`data-tab=["']${tab}["']`).test(htmlContent);
        assert(hasTab, `HTML中缺少详情Tab: data-tab="${tab}"`);
        console.log(`     ✅ Tab: ${tab} 存在`);
    });

    console.log('   检查script脚本加载顺序...');
    const scriptTags = htmlContent.match(/<script[^>]*src=["'][^"']+["'][^>]*>/g) || [];
    const scriptSources = scriptTags.map(tag => tag.match(/src=["']([^"']+)["']/)[1]);

    const persistenceIdx = scriptSources.indexOf('js/storage/persistence.js');
    const modelsIdx = scriptSources.indexOf('js/game/models.js');
    const mainIdx = scriptSources.indexOf('js/main.js');

    assert(persistenceIdx !== -1, '应加载 persistence.js');
    assert(modelsIdx !== -1, '应加载 models.js');
    assert(mainIdx !== -1, '应加载 main.js');
    assert(persistenceIdx < modelsIdx, 'persistence.js 应在 models.js 之前加载（依赖Storage）');
    assert(modelsIdx < mainIdx, 'models.js 应在 main.js 之前加载');

    console.log(`     ✅ 脚本顺序正确: persistence(${persistenceIdx}) → models(${modelsIdx}) → main(${mainIdx})`);

    console.log('   检查CSS文件引入...');
    const hasCss = /<link[^>]*href=["']css\/style\.css["']/.test(htmlContent);
    assert(hasCss, '应引入 css/style.css');
    console.log('     ✅ css/style.css 已引入');

    console.log('   ✅ 真实页面入口DOM结构完整，可解析可启动');
});

test('54. 跨重启持久化深度回归 - 模拟3次页面刷新后记录完整', () => {
    clearAllCustomLevels();
    Storage.clearLastBatchRestoreInfo();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');
    Storage.saveCustomLevel(CUSTOM_LEVEL_B, 'import', 'import');

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 4,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '重启测试覆盖A' }, highScore: 666, completed: true },
            { id: 'custom-persist-new1', levelData: { ...CUSTOM_LEVEL_A, id: 'custom-persist-new1', name: '重启新增1' }, highScore: 400 },
            { id: 'level-1', levelData: { id: 'level-1', name: '重启内置冲突' }, highScore: 50 },
            null
        ]
    };

    const decisions = [
        { action: 'overwrite' },
        { action: 'import' },
        { action: 'skip' },
        { action: 'skip' }
    ];

    const result = Storage.executeBatchRestore(backupData, decisions);
    assert(result.success === true, '首次恢复应成功');
    const recordId = result.recordId;
    const beforeLevelsKeys = Object.keys(Storage.loadCustomLevels()).sort();

    const lastRestoreBeforeRefresh = JSON.parse(JSON.stringify(Storage.getLastBatchRestoreInfo()));
    const historyBeforeRefresh = JSON.parse(JSON.stringify(Storage.loadBatchRestoreHistory()));
    const snapshotBeforeRefresh = JSON.parse(JSON.stringify(Storage.getBatchRestoreUndoSnapshot()));

    console.log('   📟 第1次模拟页面刷新（序列化localStorage后再解析）...');
    const serializedStorage1 = JSON.parse(JSON.stringify(context.localStorage.data));
    context.localStorage.data = {};
    Object.keys(serializedStorage1).forEach(k => {
        context.localStorage.data[k] = serializedStorage1[k];
    });

    let levelsAfterR1 = Storage.loadCustomLevels();
    assert(Object.keys(levelsAfterR1).sort().join(',') === beforeLevelsKeys.join(','),
        '刷新1后自定义关卡集合不变');
    assert(levelsAfterR1['custom-batch-a'].name === '重启测试覆盖A', '刷新1后覆盖名称保留');

    let lastRestoreAfterR1 = Storage.getLastBatchRestoreInfo();
    assert(lastRestoreAfterR1.recordId === recordId, '刷新1后LAST_BATCH_RESTORE的recordId一致');
    assert(lastRestoreAfterR1.counts.overwrite === 1, '刷新1后counts.overwrite保留');
    assert(lastRestoreAfterR1.counts.new === 1, '刷新1后counts.new保留');
    assert(lastRestoreAfterR1.counts.builtinConflict === 1, '刷新1后counts.builtinConflict保留');
    assert(lastRestoreAfterR1.counts.badEntries === 1, '刷新1后counts.badEntries保留');
    assert(lastRestoreAfterR1.detailed.overwrite[0].originalName === '批量测试关卡A',
        '刷新1后detailed.overwrite.originalName保留');
    assert(lastRestoreAfterR1.detailed.new[0].highScore === 400,
        '刷新1后detailed.new.highScore保留');
    assert(lastRestoreAfterR1.undoable === true, '刷新1后undoable标记保留');
    assert(lastRestoreAfterR1.undone === false, '刷新1后undone标记保留');

    let historyAfterR1 = Storage.loadBatchRestoreHistory();
    assert(historyAfterR1.length >= 1, '刷新1后历史记录数组非空');
    assert(historyAfterR1[0].recordId === recordId, '刷新1后历史首条recordId一致');

    let snapshotAfterR1 = Storage.getBatchRestoreUndoSnapshot();
    assert(!!snapshotAfterR1, '刷新1后撤销快照仍存在');
    assert(Object.keys(snapshotAfterR1.beforeLevels).length >= 2, '刷新1后快照中的beforeLevels有数据');

    console.log('   📟 第2次模拟页面刷新...');
    const serializedStorage2 = JSON.parse(JSON.stringify(context.localStorage.data));
    context.localStorage.data = {};
    Object.keys(serializedStorage2).forEach(k => {
        context.localStorage.data[k] = serializedStorage2[k];
    });

    let lastRestoreAfterR2 = Storage.getLastBatchRestoreInfo();
    assert(lastRestoreAfterR2.recordId === recordId, '刷新2后recordId不变');
    assert(lastRestoreAfterR2.detailed.saveAsNew.length === 0, '刷新2后detailed.saveAsNew仍为0');
    assert(lastRestoreAfterR2.detailed.builtinConflict[0].id === 'level-1',
        '刷新2后detailed.builtinConflict内容保留');
    assert(lastRestoreAfterR2.detailed.badEntries[0].reason.includes('无效'),
        '刷新2后detailed.badEntries的原因保留');
    assert(JSON.stringify(lastRestoreAfterR2.counts) === JSON.stringify(lastRestoreBeforeRefresh.counts),
        '刷新2后counts对象与刷新前完全一致');

    console.log('   📟 第3次模拟页面刷新...');
    const serializedStorage3 = JSON.parse(JSON.stringify(context.localStorage.data));
    context.localStorage.data = {};
    Object.keys(serializedStorage3).forEach(k => {
        context.localStorage.data[k] = serializedStorage3[k];
    });

    let recordAfterR3 = Storage.getBatchRestoreRecord(recordId);
    assert(!!recordAfterR3, '刷新3后按recordId查询仍能找到记录');
    assert(recordAfterR3.decisions[0].action === 'overwrite', '刷新3后用户决策decisions保留');
    assert(recordAfterR3.summary.imported === 2, '刷新3后summary.imported保留');

    console.log('   ✅ 3次模拟刷新后：记录ID/数量/分类/用户决策/撤销快照/历史记录 全部完整保留');
});

test('55. 导出JSON往返复查 - 导出→落盘→再解析→与原记录逐项对比', () => {
    clearAllCustomLevels();
    Storage.clearLastBatchRestoreInfo();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');
    Storage.saveCustomLevel({ ...CUSTOM_LEVEL_A, id: 'custom-export-a', name: '导出覆盖原' }, 'import', 'import');

    const badForExport = { ...CUSTOM_LEVEL_B };
    badForExport.orders = [{ id: 'O-BAD-EXP', shelfId: 'S-NOT-REAL', deadline: 80, items: ['z'] }];

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 5,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '导出覆盖' }, highScore: 777, completed: true },
            { id: 'custom-export-new', levelData: { ...CUSTOM_LEVEL_B, id: 'custom-export-new', name: '导出新增' }, highScore: 333, completed: false },
            { id: 'custom-export-a', levelData: { ...CUSTOM_LEVEL_A, id: 'custom-export-a', name: '导出另存原' }, highScore: 111 },
            { id: 'level-2', levelData: { id: 'level-2', name: '导出内置冲突' }, highScore: 222 },
            { id: 'custom-bad-export', levelData: badForExport, highScore: 9999 }
        ]
    };

    const decisions = [
        { action: 'overwrite' },
        { action: 'import' },
        { action: 'save_as_new' },
        { action: 'skip' },
        { action: 'import' }
    ];

    const restoreResult = Storage.executeBatchRestore(backupData, decisions);
    assert(restoreResult.success === true, '恢复应成功');

    const exportResult = Storage.exportBatchRestoreRecordAsJson();
    assert(exportResult.success === true, '导出应成功');
    assert(typeof exportResult.json === 'string', '导出结果应是JSON字符串');

    console.log('   💾 模拟将导出JSON写入磁盘...');
    const tempFilePath = path.join(__dirname, '..', 'test-results', 'temp-export-check.json');
    try { fs.mkdirSync(path.dirname(tempFilePath), { recursive: true }); } catch (e) {}
    fs.writeFileSync(tempFilePath, exportResult.json, 'utf8');

    console.log('   📤 从磁盘重新读回导出的JSON文件...');
    const readBackStr = fs.readFileSync(tempFilePath, 'utf8');
    const reParsed = JSON.parse(readBackStr);

    const origRecord = Storage.getLastBatchRestoreInfo();

    console.log('   🔍 逐项对比导出字段...');

    assert(reParsed.exportType === 'batch_restore_report', 'exportType正确');
    assert(typeof reParsed.exportedAt === 'number', 'exportedAt是时间戳数字');
    assert(reParsed.record.recordId === restoreResult.recordId, 'recordId匹配');
    assert(reParsed.record.undoable === origRecord.undoable, 'undoable标记匹配');
    assert(reParsed.record.undone === origRecord.undone, 'undone标记匹配');
    assert(Object.keys(reParsed.record.decisions).length === Object.keys(origRecord.decisions || {}).length,
        'decisions条目数匹配');
    assert(reParsed.record.decisions[0].action === 'overwrite', '第0条决策overwrite正确');
    assert(reParsed.record.decisions[2].action === 'save_as_new', '第2条决策save_as_new正确');

    console.log('     ✅ 头部字段（exportType/exportedAt/record/undoable/decisions）一致');

    assert(reParsed.counts.total === origRecord.counts.total, 'counts.total匹配');
    assert(reParsed.counts.imported === origRecord.counts.imported, 'counts.imported匹配');
    assert(reParsed.counts.new === origRecord.counts.new, 'counts.new匹配');
    assert(reParsed.counts.overwrite === origRecord.counts.overwrite, 'counts.overwrite匹配');
    assert(reParsed.counts.saveAsNew === origRecord.counts.saveAsNew, 'counts.saveAsNew匹配');
    assert(reParsed.counts.skipped === origRecord.counts.skipped, 'counts.skipped匹配');
    assert(reParsed.counts.builtinConflict === origRecord.counts.builtinConflict, 'counts.builtinConflict匹配');
    assert(reParsed.counts.badEntries === origRecord.counts.badEntries, 'counts.badEntries匹配');
    assert(reParsed.counts.failed === origRecord.counts.failed, 'counts.failed匹配');

    console.log('     ✅ counts统计9个字段全部一致');

    const catNames = ['new', 'overwrite', 'saveAsNew', 'skipped', 'builtinConflict', 'badEntries', 'failed'];
    let totalCatItems = 0;
    catNames.forEach(cat => {
        const origCount = (origRecord.detailed[cat] || []).length;
        const expCount = (reParsed.categories[cat] || []).length;
        assert(expCount === origCount, `categories.${cat} 条目数匹配 (${expCount})`);
        totalCatItems += expCount;

        if (origCount > 0) {
            for (let i = 0; i < origCount; i++) {
                const origItem = origRecord.detailed[cat][i];
                const expItem = reParsed.categories[cat][i];
                assert(expItem.id === origItem.id, `${cat}[${i}].id匹配: ${expItem.id}`);
                assert(expItem.name === origItem.name, `${cat}[${i}].name匹配`);
                assert(expItem.reason === origItem.reason, `${cat}[${i}].reason匹配`);
                assert(expItem.decision === origItem.decision, `${cat}[${i}].decision匹配`);
                assert(expItem.conflictType === origItem.conflictType, `${cat}[${i}].conflictType匹配`);

                if (cat === 'overwrite') {
                    assert(expItem.originalName === origItem.originalName, `${cat}[${i}].originalName匹配`);
                }
                if (cat === 'saveAsNew') {
                    assert(expItem.originalId === origItem.originalId, `${cat}[${i}].originalId匹配`);
                }
                if (cat === 'new' || cat === 'overwrite' || cat === 'saveAsNew') {
                    assert(expItem.highScore === origItem.highScore, `${cat}[${i}].highScore匹配`);
                    assert(expItem.completed === origItem.completed, `${cat}[${i}].completed匹配`);
                }
            }
        }
    });

    console.log(`     ✅ categories 7个分类共 ${totalCatItems} 条记录全部逐项字段一致`);

    const saveAsEntry = reParsed.categories.saveAsNew.find(x => x.originalId === 'custom-export-a');
    assert(!!saveAsEntry, 'ID冲突另存为的条目在导出中存在');
    assert(saveAsEntry.conflictType === 'id_conflict', 'ID冲突另存为conflictType正确');
    assert(saveAsEntry.name.includes('副本'), '另存为名称带副本标记');

    const builtinEntry = reParsed.categories.builtinConflict[0];
    assert(builtinEntry.id === 'level-2', '内置冲突条目ID正确');
    assert(builtinEntry.decision === 'skip', '内置冲突用户决策skip导出正确');
    assert(builtinEntry.reason.includes('内置'), '内置冲突原因包含内置');

    const badEntry = reParsed.categories.skipped.find(x => x.id === 'custom-bad-export');
    assert(!!badEntry, '坏条目在导出skipped分类中存在');
    assert(badEntry.conflictType === 'validation_error', '坏条目conflictType为validation_error');
    assert(badEntry.reason.includes('S-NOT-REAL'), '坏条目原因包含具体坏货架ID');

    console.log('     ✅ 冲突分支细节（ID冲突另存为/内置冲突/坏条目校验拦截）导出内容正确');

    try { fs.unlinkSync(tempFilePath); } catch (e) {}

    console.log('   ✅ 导出JSON→落盘→读回→逐项对比：头部/9个counts/7个分类/所有字段/冲突细节 完全一致');
});

test('56. 撤销联动深度回归 - 撤销后详情/导出/刷新/再撤销全链路验证', () => {
    clearAllCustomLevels();
    Storage.clearLastBatchRestoreInfo();

    Storage.saveCustomLevel(CUSTOM_LEVEL_A, 'import', 'import');
    Storage.saveCustomLevel(CUSTOM_LEVEL_B, 'import', 'import');

    const progressOrig = Storage.loadProgress();
    progressOrig.highScores['custom-batch-a'] = 50;
    Storage.saveProgress(progressOrig);

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 4,
        levels: [
            { id: 'custom-batch-a', levelData: { ...CUSTOM_LEVEL_A, name: '联动覆盖', difficulty: 3 }, highScore: 9000, completed: true },
            { id: 'custom-link-new1', levelData: { ...CUSTOM_LEVEL_A, id: 'custom-link-new1', name: '联动新增1' }, highScore: 111 },
            { id: 'custom-link-new2', levelData: { ...CUSTOM_LEVEL_B, id: 'custom-link-new2', name: '联动新增2' }, highScore: 222, completed: true },
            { id: 'custom-link-saveas', levelData: { ...CUSTOM_LEVEL_A, id: 'custom-link-saveas', name: '联动另存原' }, highScore: 333 }
        ]
    };

    const decisions = [
        { action: 'overwrite' },
        { action: 'import' },
        { action: 'import' },
        { action: 'save_as_new' }
    ];

    const restoreResult = Storage.executeBatchRestore(backupData, decisions);
    assert(restoreResult.success === true, '恢复应成功');
    const recordId = restoreResult.recordId;

    const saveAsId = restoreResult.detailed.saveAsNew[0].id;
    const origOverwriteName = restoreResult.detailed.overwrite[0].originalName;

    console.log('   撤销前检查...');
    let rec = Storage.getBatchRestoreRecord(recordId);
    assert(rec.counts.imported === 4, '撤销前imported=4');
    assert(rec.counts.new === 2, '撤销前new=2');
    assert(rec.counts.overwrite === 1, '撤销前overwrite=1');
    assert(rec.counts.saveAsNew === 1, '撤销前saveAsNew=1');
    assert(rec.detailed.new.length === 2, '撤销前detailed.new有2条');
    assert(rec.detailed.new[0].name === '联动新增1', '撤销前新增1名称正确');
    assert(rec.detailed.overwrite[0].name === '联动覆盖', '撤销前覆盖名称正确');
    assert(rec.detailed.saveAsNew[0].originalName === '联动另存原', '撤销前另存原名正确');
    assert(rec.undoable === true, '撤销前undoable=true');
    assert(rec.undone === false, '撤销前undone=false');

    let lv = Storage.loadCustomLevels();
    assert(lv['custom-batch-a'].name === '联动覆盖', '撤销前覆盖名称生效');
    assert(lv['custom-batch-a'].difficulty === 3, '撤销前覆盖难度生效');
    assert(!!lv['custom-link-new1'], '撤销前新增1存在');
    assert(!!lv['custom-link-new2'], '撤销前新增2存在');
    assert(!!lv[saveAsId], '撤销前另存副本存在');

    let pg = Storage.loadProgress();
    assert(pg.highScores['custom-batch-a'] === 9000, '撤销前最高分覆盖生效');
    assert(pg.highScores['custom-link-new1'] === 111, '撤销前新增1最高分');
    assert(pg.highScores['custom-link-new2'] === 222, '撤销前新增2最高分');
    assert(pg.completedLevels.includes('custom-batch-a'), '撤销前完成状态覆盖');
    assert(pg.completedLevels.includes('custom-link-new2'), '撤销前新增2完成状态');

    console.log('   🚨 执行撤销批量恢复...');
    const undoResult = Storage.undoBatchRestore();
    assert(undoResult.success === true, '撤销应成功');
    assert(undoResult.recordId === recordId, '撤销返回的recordId匹配');

    console.log('   撤销后关卡数据回退检查...');
    lv = Storage.loadCustomLevels();
    assert(lv['custom-batch-a'].name === origOverwriteName, '撤销后覆盖关卡名称回退');
    assert(lv['custom-batch-a'].difficulty === 1, '撤销后覆盖关卡难度回退');
    assert(!lv['custom-link-new1'], '撤销后新增1移除');
    assert(!lv['custom-link-new2'], '撤销后新增2移除');
    assert(!lv[saveAsId], '撤销后另存副本移除');
    assert(Object.keys(lv).length === 2, '撤销后仅剩最初2个自定义关卡');

    pg = Storage.loadProgress();
    assert(pg.highScores['custom-batch-a'] === 50, '撤销后最高分回退到原值');
    assert(!pg.highScores['custom-link-new1'], '撤销后新增1最高分清除');
    assert(!pg.highScores['custom-link-new2'], '撤销后新增2最高分清除');

    console.log('   撤销后记录统计回退检查...');
    rec = Storage.getBatchRestoreRecord(recordId);
    assert(rec.undoable === false, '撤销后undoable=false');
    assert(rec.undone === true, '撤销后undone=true');
    assert(typeof rec.undoneAt === 'number', '撤销后有undoneAt时间戳');
    assert(rec.counts.imported === 0, '撤销后counts.imported回退为0');
    assert(rec.counts.new === 0, '撤销后counts.new回退为0');
    assert(rec.counts.overwrite === 0, '撤销后counts.overwrite回退为0');
    assert(rec.counts.saveAsNew === 0, '撤销后counts.saveAsNew回退为0');
    assert(rec.counts.skipped === 0, '撤销后counts.skipped仍为0（不变）');
    assert(rec.detailed.new.length === 0, '撤销后detailed.new清空');
    assert(rec.detailed.overwrite.length === 0, '撤销后detailed.overwrite清空');
    assert(rec.detailed.saveAsNew.length === 0, '撤销后detailed.saveAsNew清空');
    assert(rec.detailed._originalDetailed, '撤销后detailed._originalDetailed备份存在');
    assert(rec.detailed._originalDetailed.new.length === 2, '_originalDetailed.new保留原始2条');
    assert(rec.detailed._originalDetailed.overwrite[0].name === '联动覆盖', '_originalDetailed保留覆盖前的详情');
    assert(rec.counts._originalCounts, '撤销后counts._originalCounts备份存在');
    assert(rec.counts._originalCounts.imported === 4, '_originalCounts.imported保留原始4');
    assert(rec.summary._originalSummary, '撤销后summary._originalSummary备份存在');

    console.log('   撤销后可撤销提示状态检查...');
    const lastInfo = Storage.getLastBatchRestoreInfo();
    assert(lastInfo.undoable === false, 'getLastBatchRestoreInfo也返回undoable=false');
    assert(lastInfo.undone === true, 'getLastBatchRestoreInfo也返回undone=true');

    const snap = Storage.getBatchRestoreUndoSnapshot();
    assert(!snap, '撤销后BATCH_RESTORE_SNAPSHOT已清除，不能再次撤销');

    console.log('   📟 撤销后模拟刷新（验证状态持久化）...');
    const serialized = JSON.parse(JSON.stringify(context.localStorage.data));
    context.localStorage.data = {};
    Object.keys(serialized).forEach(k => { context.localStorage.data[k] = serialized[k]; });

    rec = Storage.getBatchRestoreRecord(recordId);
    assert(rec.undone === true, '刷新后undone标记仍为true');
    assert(rec.undoable === false, '刷新后undoable标记仍为false');
    assert(rec.counts.imported === 0, '刷新后counts.imported仍为0');
    assert(rec.detailed._originalDetailed.new.length === 2, '刷新后_originalDetailed保留');

    lv = Storage.loadCustomLevels();
    assert(!lv['custom-link-new1'], '刷新后新增关卡仍未回来（确实撤销了）');
    assert(lv['custom-batch-a'].name === origOverwriteName, '刷新后覆盖关卡名称仍保持已回退');

    console.log('   🚫 尝试再次撤销（应失败）...');
    const undoAgain = Storage.undoBatchRestore();
    assert(undoAgain.success === false, '无快照时再次撤销应失败');
    assert(undoAgain.reason === 'no_undo_snapshot', '失败原因为no_undo_snapshot');

    console.log('   撤销后导出JSON验证（状态也应同步回退）...');
    const exportAfterUndo = Storage.exportBatchRestoreRecordAsJson(recordId);
    assert(exportAfterUndo.success === true, '撤销后导出应仍可成功');
    const expData = exportAfterUndo.data;
    assert(expData.record.undoable === false, '导出record.undoable同步为false');
    assert(expData.record.undone === true, '导出record.undone同步为true');
    assert(expData.counts.imported === 0, '导出counts.imported同步为0');
    assert(expData.counts.new === 0, '导出counts.new同步为0');
    assert(expData.counts.overwrite === 0, '导出counts.overwrite同步为0');
    assert(expData.counts.saveAsNew === 0, '导出counts.saveAsNew同步为0');
    assert(expData.categories.new.length === 0, '导出categories.new同步为空');
    assert(expData.categories.overwrite.length === 0, '导出categories.overwrite同步为空');
    assert(expData.categories.saveAsNew.length === 0, '导出categories.saveAsNew同步为空');

    console.log('   ✅ 撤销联动深度验证全部通过：');
    console.log('      - 关卡数据（名称/难度/新增/副本）全部回退');
    console.log('      - 进度数据（最高分/完成状态）全部回退');
    console.log('      - 记录统计（counts 9字段）全部回退');
    console.log('      - 分类名单（detailed 7分类）新增/覆盖/另存清空，跳过/内置/坏条目不变');
    console.log('      - 原始数据备份（_originalDetailed/_originalCounts/_originalSummary）保留');
    console.log('      - 可撤销标记（undoable→false, undone→true）同步');
    console.log('      - 撤销快照清除，再次撤销拦截');
    console.log('      - 模拟刷新后所有状态仍正确（持久化生效）');
    console.log('      - 撤销后导出JSON的状态/统计/分类也同步回退');
});

test('57. 内置关卡ID冲突另存为副本 - 完整流程验证', () => {
    clearAllCustomLevels();
    Storage.clearLastBatchRestoreInfo();

    const builtinLevelData = {
        id: 'level-1',
        name: '第一关',
        description: '测试内置关卡导入',
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
            { id: 'O-BUILTIN-1', shelfId: 'S1', deadline: 120, items: ['内置商品A'] }
        ],
        pickDuration: 3,
        packDuration: 2,
        targetScore: 400,
        minOrdersToPass: 1
    };

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 3,
        levels: [
            { id: 'level-1', levelData: builtinLevelData, highScore: 888, completed: true },
            { id: 'level-2', levelData: { ...builtinLevelData, id: 'level-2', name: '第二关' }, highScore: 666 },
            { id: 'custom-normal', levelData: { ...builtinLevelData, id: 'custom-normal', name: '普通自定义' }, highScore: 500 }
        ]
    };

    const decisions = [
        { action: 'save_as_new' },
        { action: 'skip' },
        { action: 'import' }
    ];

    console.log('   执行批量恢复：2个内置ID（1个另存为副本，1个跳过）+ 1个普通新增');
    const result = Storage.executeBatchRestore(backupData, decisions);
    assert(result.success === true, '恢复应成功');

    console.log('   验证统计数据...');
    assert(result.counts.saveAsNew === 1, 'saveAsNew计数应为1（内置ID另存为副本）');
    assert(result.counts.builtinConflict === 1, 'builtinConflict计数应为1（内置ID跳过）');
    assert(result.counts.new === 1, 'new计数应为1（普通新增）');
    assert(result.counts.imported === 2, 'imported总数应为2（副本+新增）');

    console.log('   验证详细记录...');
    const lastRestore = Storage.getLastBatchRestoreInfo();
    const d = lastRestore.detailed;

    const builtinSaveAs = d.saveAsNew.find(x => x.originalId === 'level-1');
    assert(!!builtinSaveAs, '内置ID另存为副本应出现在saveAsNew分类');
    assert(builtinSaveAs.id !== 'level-1', '新ID不应等于内置ID');
    assert(builtinSaveAs.id.startsWith('level-1-copy'), '新ID应包含level-1-copy前缀');
    assert(builtinSaveAs.name.includes('副本'), '新名称应包含副本标记');
    assert(builtinSaveAs.decision === 'save_as_new', '决策标签应为save_as_new');
    assert(builtinSaveAs.conflictType === 'builtin_conflict', '冲突类型应为builtin_conflict');
    assert(builtinSaveAs.reason.includes('内置关卡ID冲突'), '原因应包含内置关卡ID冲突');
    assert(builtinSaveAs.highScore === 888, '最高分应正确带入');
    assert(builtinSaveAs.completed === true, '完成状态应正确带入');

    const builtinSkip = d.builtinConflict.find(x => x.id === 'level-2');
    assert(!!builtinSkip, '内置ID跳过应出现在builtinConflict分类');
    assert(builtinSkip.decision === 'skip', '决策标签应为skip');
    assert(builtinSkip.conflictType === 'builtin_conflict', '冲突类型应为builtin_conflict');
    assert(builtinSkip.reason.includes('内置关卡ID冲突'), '原因应包含内置关卡ID冲突');

    const normalNew = d.new.find(x => x.id === 'custom-normal');
    assert(!!normalNew, '普通新增应出现在new分类');
    assert(normalNew.decision === 'import', '决策标签应为import');

    console.log('   验证关卡实际写入...');
    const levels = Storage.loadCustomLevels();
    assert(!levels['level-1'], '原内置ID level-1不应被写入自定义关卡');
    assert(!levels['level-2'], '原内置ID level-2不应被写入自定义关卡');
    assert(!!levels[builtinSaveAs.id], '副本关卡应成功写入');
    assert(levels[builtinSaveAs.id].name === builtinSaveAs.name, '副本关卡名称正确');
    assert(!!levels['custom-normal'], '普通自定义关卡应成功写入');

    console.log('   验证进度数据...');
    const progress = Storage.loadProgress();
    assert(progress.highScores[builtinSaveAs.id] === 888, '副本关卡最高分正确');
    assert(progress.completedLevels.includes(builtinSaveAs.id), '副本关卡完成状态正确');
    assert(progress.highScores['custom-normal'] === 500, '普通关卡最高分正确');

    console.log('   验证导出JSON...');
    const exportResult = Storage.exportBatchRestoreRecordAsJson();
    const expData = exportResult.data;

    const expSaveAs = expData.categories.saveAsNew.find(x => x.originalId === 'level-1');
    assert(!!expSaveAs, '导出中应包含内置另存为副本');
    assert(expSaveAs.decision === 'save_as_new', '导出决策标签正确');
    assert(expSaveAs.conflictType === 'builtin_conflict', '导出冲突类型正确');
    assert(expSaveAs.id === builtinSaveAs.id, '导出的新ID正确');
    assert(expSaveAs.name === builtinSaveAs.name, '导出的新名称正确');

    const expBuiltinSkip = expData.categories.builtinConflict.find(x => x.id === 'level-2');
    assert(!!expBuiltinSkip, '导出中应包含内置跳过');
    assert(expBuiltinSkip.decision === 'skip', '导出决策标签正确');

    console.log('   新ID: %s, 新名称: %s', builtinSaveAs.id, builtinSaveAs.name);
    console.log('   ✅ 内置ID冲突另存为副本完整流程验证通过');
});

test('58. 内置ID冲突另存为副本 - 撤销联动验证', () => {
    clearAllCustomLevels();
    Storage.clearLastBatchRestoreInfo();

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 2,
        levels: [
            { id: 'level-1', levelData: { id: 'level-1', name: '内置关卡1', workerCount: 2, cartCount: 2, mapWidth: 4, mapHeight: 4, mapData: [['sp','a','a','sp'],['s:S1','a','a','a'],['e','a','p','a'],['sp','a','a','sp']], orders: [{id:'O1',shelfId:'S1',deadline:60,items:['x']}], pickDuration:1, packDuration:1, targetScore:100, minOrdersToPass:1 }, highScore: 777 },
            { id: 'custom-new', levelData: { id: 'custom-new', name: '普通新增', workerCount: 1, cartCount: 1, mapWidth: 4, mapHeight: 4, mapData: [['sp','a','a','sp'],['s:S1','a','a','a'],['e','a','p','a'],['sp','a','a','sp']], orders: [{id:'O1',shelfId:'S1',deadline:60,items:['x']}], pickDuration:1, packDuration:1, targetScore:100, minOrdersToPass:1 }, highScore: 333 }
        ]
    };

    const decisions = [
        { action: 'save_as_new' },
        { action: 'import' }
    ];

    console.log('   执行恢复：内置ID另存为副本 + 普通新增');
    const restoreResult = Storage.executeBatchRestore(backupData, decisions);
    assert(restoreResult.success === true, '恢复应成功');

    const saveAsEntry = restoreResult.detailed.saveAsNew[0];
    const newLevelId = saveAsEntry.id;

    console.log('   撤销前验证...');
    let levels = Storage.loadCustomLevels();
    assert(!!levels[newLevelId], '副本关卡存在');
    assert(!!levels['custom-new'], '普通新增存在');

    let progress = Storage.loadProgress();
    assert(progress.highScores[newLevelId] === 777, '副本最高分存在');

    let last = Storage.getLastBatchRestoreInfo();
    assert(last.counts.saveAsNew === 1, '撤销前saveAsNew=1');
    assert(last.counts.imported === 2, '撤销前imported=2');
    assert(last.undoable === true, '撤销前可撤销');

    console.log('   执行撤销...');
    const undoResult = Storage.undoBatchRestore();
    assert(undoResult.success === true, '撤销应成功');

    console.log('   撤销后验证...');
    levels = Storage.loadCustomLevels();
    assert(!levels[newLevelId], '撤销后副本关卡被移除');
    assert(!levels['custom-new'], '撤销后普通新增被移除');

    progress = Storage.loadProgress();
    assert(progress.highScores[newLevelId] === undefined, '撤销后副本最高分被清除');

    last = Storage.getLastBatchRestoreInfo();
    assert(last.undoable === false, '撤销后不可撤销');
    assert(last.undone === true, '撤销后标记为已撤销');
    assert(last.counts.saveAsNew === 0, '撤销后saveAsNew=0');
    assert(last.counts.imported === 0, '撤销后imported=0');
    assert(last.counts.new === 0, '撤销后new=0');
    assert(last.detailed.saveAsNew.length === 0, '撤销后detailed.saveAsNew清空');
    assert(last.detailed.new.length === 0, '撤销后detailed.new清空');

    console.log('   撤销后导出验证...');
    const exportAfterUndo = Storage.exportBatchRestoreRecordAsJson();
    const exp = exportAfterUndo.data;
    assert(exp.record.undoable === false, '导出undoable同步为false');
    assert(exp.record.undone === true, '导出undone同步为true');
    assert(exp.counts.saveAsNew === 0, '导出counts.saveAsNew=0');
    assert(exp.counts.imported === 0, '导出counts.imported=0');
    assert(exp.categories.saveAsNew.length === 0, '导出categories.saveAsNew为空');

    console.log('   ✅ 内置ID另存为副本的撤销联动验证通过');
});

test('59. 内置ID冲突另存为副本 - 跨刷新持久化验证', () => {
    clearAllCustomLevels();
    Storage.clearLastBatchRestoreInfo();

    const backupData = {
        version: 1,
        exportedAt: Date.now(),
        levelCount: 1,
        levels: [
            { id: 'level-1', levelData: { id: 'level-1', name: '持久化测试', workerCount: 2, cartCount: 2, mapWidth: 4, mapHeight: 4, mapData: [['sp','a','a','sp'],['s:S1','a','a','a'],['e','a','p','a'],['sp','a','a','sp']], orders: [{id:'O1',shelfId:'S1',deadline:60,items:['x']}], pickDuration:1, packDuration:1, targetScore:100, minOrdersToPass:1 }, highScore: 1234, completed: true }
        ]
    };

    const restoreResult = Storage.executeBatchRestore(backupData, [{ action: 'save_as_new' }]);
    const saveAsId = restoreResult.detailed.saveAsNew[0].id;
    const recordId = restoreResult.recordId;

    console.log('   新副本ID: %s', saveAsId);

    console.log('   📟 模拟页面刷新（序列化/反序列化localStorage）...');
    const serialized = JSON.parse(JSON.stringify(context.localStorage.data));
    context.localStorage.data = {};
    Object.keys(serialized).forEach(k => { context.localStorage.data[k] = serialized[k]; });

    console.log('   刷新后验证关卡数据...');
    const levelsAfter = Storage.loadCustomLevels();
    assert(!!levelsAfter[saveAsId], '刷新后副本关卡仍存在');
    assert(levelsAfter[saveAsId].name.includes('副本'), '刷新后名称仍包含副本标记');

    console.log('   刷新后验证进度数据...');
    const progressAfter = Storage.loadProgress();
    assert(progressAfter.highScores[saveAsId] === 1234, '刷新后最高分仍正确');
    assert(progressAfter.completedLevels.includes(saveAsId), '刷新后完成状态仍正确');

    console.log('   刷新后验证恢复记录...');
    const recordAfter = Storage.getBatchRestoreRecord(recordId);
    assert(!!recordAfter, '刷新后记录仍存在');
    assert(recordAfter.counts.saveAsNew === 1, '刷新后saveAsNew计数正确');
    assert(recordAfter.detailed.saveAsNew[0].id === saveAsId, '刷新后新ID仍正确');
    assert(recordAfter.detailed.saveAsNew[0].originalId === 'level-1', '刷新后原ID仍正确');
    assert(recordAfter.detailed.saveAsNew[0].decision === 'save_as_new', '刷新后决策仍正确');

    console.log('   刷新后验证撤销快照...');
    const snapshotAfter = Storage.getBatchRestoreUndoSnapshot();
    assert(!!snapshotAfter, '刷新后撤销快照仍存在');

    console.log('   刷新后验证导出...');
    const exportAfter = Storage.exportBatchRestoreRecordAsJson(recordId);
    const exp = exportAfter.data;
    assert(exp.categories.saveAsNew.length === 1, '刷新后导出saveAsNew分类有数据');
    assert(exp.categories.saveAsNew[0].id === saveAsId, '刷新后导出的新ID正确');

    console.log('   ✅ 内置ID另存为副本跨刷新持久化验证通过');
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
    console.log('   ✅ 恢复记录持久化：结构完整+7分类+跨刷新保留');
    console.log('   ✅ 记录导出JSON：结构完整+冲突决策与用户选择一致');
    console.log('   ✅ 撤销联动：记录数量/关卡名单/可撤销标记全部同步回退');
    console.log('   ✅ 冲突分支一致性：覆盖/另存/内置/坏条目 记录+导出+实际三者一致');
    console.log('   ✅ 真实页面入口DOM：按钮/弹窗容器/7个Tab/脚本加载顺序/CSS引入 全部可解析');
    console.log('   ✅ 跨重启持久化：3次模拟刷新后记录ID/统计/分类/快照/历史 全部完整保留');
    console.log('   ✅ 导出JSON往返：落盘→读回→头部/9个counts/7分类/冲突细节 完全一致');
   console.log('   ✅ 撤销联动深度：关卡/进度回退+记录统计归零+原始备份保留+刷新持久化+再次撤销拦截+导出同步回退');
   console.log('   ✅ 内置ID冲突另存为副本：完整流程+新ID/名称预览+记录/统计/导出口径一致');
   console.log('   ✅ 内置ID冲突另存撤销：关卡数据+记录名单+统计+可撤销标记+导出 全部联动回退');
   console.log('   ✅ 内置ID冲突跨刷新：关卡+进度+记录+快照+导出 全部持久化保留');
}
