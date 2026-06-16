const LEVEL_1 = {
    id: 'level-1',
    name: '新手仓管员',
    description: '欢迎来到仓库！这是你的第一个任务。安排2名拣货员完成4个订单，所有巷道都是双向通行的。',
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
