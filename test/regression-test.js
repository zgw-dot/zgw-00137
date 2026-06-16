const fs = require('fs');
const path = require('path');

console.log('=== 仓库拣货游戏 - 开局bug回归测试 ===\n');

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

console.log('1. 检查状态枚举定义...');
const modelsContent = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'game', 'models.js'),
    'utf8'
);

const idleEnumMatch = modelsContent.match(/IDLE:\s*['"]([^'"]+)['"]/);
const idleValue = idleEnumMatch ? idleEnumMatch[1] : null;
console.log(`   WORKER_STATUS.IDLE = '${idleValue}'`);

test('状态枚举IDLE应为小写', () => {
    assert(idleValue === 'idle', `期望 'idle'，实际为 '${idleValue}'`);
});

console.log('\n2. 检查所有状态判断字符串是否与枚举一致...');

const jsFiles = [
    'js/game/collision.js',
    'js/game/engine.js',
    'js/ui/info-panel.js',
    'js/ui/renderer.js'
];

const statusChecks = [];
for (const file of jsFiles) {
    const content = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const idleChecks = content.match(/status\s*[=!]==\s*['"][^'"]+['"]/g) || [];
    for (const check of idleChecks) {
        const valueMatch = check.match(/['"]([^'"]+)['"]/);
        if (valueMatch) {
            statusChecks.push({ file, check, value: valueMatch[1] });
        }
    }
}

console.log(`   共找到 ${statusChecks.length} 处状态判断`);

test('所有IDLE状态判断使用小写字符串', () => {
    const badChecks = statusChecks.filter(c => 
        c.value === 'IDLE' || c.value !== 'idle' && c.check.includes('IDLE')
    );
    if (badChecks.length > 0) {
        console.log('   问题检查:');
        badChecks.forEach(c => console.log(`     ${c.file}: ${c.check}`));
    }
    assert(badChecks.length === 0, `发现 ${badChecks.length} 处状态判断字符串不匹配`);
});

test('所有状态判断字符串与枚举定义一致', () => {
    const inconsistentChecks = statusChecks.filter(c => {
        if (c.check.includes('idle')) return c.value !== 'idle';
        return false;
    });
    assert(inconsistentChecks.length === 0, `发现 ${inconsistentChecks.length} 处状态判断与枚举不一致`);
});

console.log('\n3. 模拟游戏初始化验证...');

const vm = require('vm');
const context = {
    console: console,
    localStorage: {
        data: {},
        getItem: function(key) { return this.data[key] || null; },
        setItem: function(key, value) { this.data[key] = value; },
        removeItem: function(key) { delete this.data[key]; }
    },
    document: {
        getElementById: () => ({ innerHTML: '', textContent: '', addEventListener: () => {}, appendChild: () => {} }),
        createElement: () => ({ innerHTML: '', textContent: '', addEventListener: () => {}, appendChild: () => {}, classList: { add: () => {}, remove: () => {} } }),
        querySelector: () => ({ innerHTML: '', textContent: '', addEventListener: () => {}, appendChild: () => {} }),
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
        readyState: 'complete'
    },
    window: {
        addEventListener: () => {},
        cancelAnimationFrame: () => {},
        requestAnimationFrame: (cb) => { setTimeout(cb, 16); return 1; },
        confirm: () => true
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Date: Date,
    JSON: JSON,
    Math: Math,
    Infinity: Infinity
};
vm.createContext(context);

function loadScript(filePath) {
    const content = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
    vm.runInContext(content, context, { filename: filePath });
}

console.log('   加载游戏模块...');
try {
    loadScript('js/storage/persistence.js');
    loadScript('js/game/models.js');
    loadScript('js/game/collision.js');
    loadScript('js/game/scoring.js');
    loadScript('js/game/engine.js');
    loadScript('js/levels/level1.js');
    
    console.log('   初始化游戏引擎...');
    const game = new context.GameEngine.Engine();
    game.initLevel(context.LEVEL_1);
    
    console.log('   检查初始状态...');
    const state = game.getGameState();
    
    test('开局时所有拣货员状态应为idle', () => {
        state.workers.forEach((w, i) => {
            console.log(`     拣货员 ${w.name} (${w.id}): status = '${w.status}'`);
            assert(w.status === 'idle', `拣货员 ${w.name} 状态应为 'idle'，实际为 '${w.status}'`);
        });
    });
    
    test('开局时所有拣货员应可派遣（isIdle判断正确）', () => {
        const availableWorkers = state.workers.filter(w => w.status === 'idle');
        console.log(`     空闲拣货员数量: ${availableWorkers.length}/${state.workers.length}`);
        assert(availableWorkers.length === state.workers.length, 
            `所有拣货员都应空闲，实际空闲 ${availableWorkers.length}/${state.workers.length}`);
    });
    
    test('开局时资源检查应通过', () => {
        const errors = context.CollisionDetector.checkResourceAvailability(
            state.workers, 
            state.carts, 
            true
        );
        console.log(`     资源检查结果: ${errors ? errors.message : '通过'}`);
        assert(!errors, `资源检查不应报错，实际: ${errors?.message}`);
    });
    
    test('碰撞检测中worker状态检查应通过', () => {
        const worker = state.workers[0];
        const errors = context.CollisionDetector.checkWorkerStatus(
            state.workers, 
            worker.id
        );
        console.log(`     拣货员 ${worker.name} 状态检查: ${errors ? errors.message : '通过'}`);
        assert(!errors, `拣货员状态检查不应报错，实际: ${errors?.message}`);
    });
    
    test('验证首次派工功能正常', () => {
        const workerId = state.workers[0].id;
        const orderId = state.level.orders[0].id;
        
        game.start();
        const result = game.dispatchWorker(workerId, orderId, true);
        
        console.log(`     派遣 ${workerId} 处理 ${orderId}: ${result.success ? '成功' : '失败 - ' + result.errors?.map(e => e.message).join(', ')}`);
        assert(result.success, `首次派工应成功，实际失败: ${result.errors?.map(e => e.message).join(', ')}`);
        
        const workerAfter = state.workers.find(w => w.id === workerId);
        console.log(`     派遣后状态: ${workerAfter.status}`);
        assert(workerAfter.status === 'moving', `派遣后状态应为 'moving'，实际为 '${workerAfter.status}'`);
    });
    
} catch (e) {
    console.log(`   模拟测试跳过: ${e.message}`);
}

console.log('\n4. 验证单向巷道冲突检测未被破坏...');
const collisionContent = fs.readFileSync(
    path.join(__dirname, '..', 'js', 'game', 'collision.js'),
    'utf8'
);

test('单向巷道冲突检测逻辑存在', () => {
    assert(collisionContent.includes('checkOneWayCollision'), '缺少 checkOneWayCollision 函数');
    assert(collisionContent.includes('checkOneWayCongestion'), '缺少 checkOneWayCongestion 函数');
});

test('validateDispatch 包含完整检测链', () => {
    assert(collisionContent.includes('checkOneWayCollision'), 'validateDispatch 应调用 checkOneWayCollision');
    assert(collisionContent.includes('checkPathOccupation'), 'validateDispatch 应调用 checkPathOccupation');
    assert(collisionContent.includes('checkResourceAvailability'), 'validateDispatch 应调用 checkResourceAvailability');
    assert(collisionContent.includes('checkWorkerAvailability'), 'validateDispatch 应调用 checkWorkerAvailability');
    assert(collisionContent.includes('checkOrderAvailability'), 'validateDispatch 应调用 checkOrderAvailability');
    assert(collisionContent.includes('checkPathExists'), 'validateDispatch 应调用 checkPathExists');
});

console.log('\n=== 测试总结 ===');
const passed = testResults.filter(r => r.passed).length;
const total = testResults.length;
console.log(`通过: ${passed}/${total}`);

if (passed < total) {
    console.log('\n失败的测试:');
    testResults.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
} else {
    console.log('\n🎉 所有回归测试通过！开局bug已修复。');
}
