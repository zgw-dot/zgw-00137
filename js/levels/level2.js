const LEVEL_2 = {
    id: 'level-2',
    name: '单向巷道挑战',
    description: '难度升级！这次有单向巷道限制，注意不能让两名拣货员在单向巷道中相向而行。推车有限，合理分配资源。',
    difficulty: 2,
    timeLimit: 240,
    mapWidth: 10,
    mapHeight: 10,
    mapData: [
        ['sp', 'a:right', 'a:right', 'a:right', 'a:right', 'a:right', 'a:right', 'a:right', 'a:right', 'sp'],
        ['s:S1', 'a:down', 's:S2', 'a:down', 's:S3', 'a:down', 's:S4', 'a:down', 's:S5', 'a:down'],
        ['e', 'a', 'e', 'a', 'e', 'a', 'e', 'a', 'e', 'a'],
        ['s:S6', 'a:up', 's:S7', 'a:up', 's:S8', 'a:up', 's:S9', 'a:up', 's:S10', 'a:up'],
        ['e', 'a:left', 'a:left', 'a:left', 'a:left', 'a:left', 'a:left', 'a:left', 'a:left', 'a'],
        ['e', 'a:right', 'a:right', 'a:right', 'a:right', 'a:right', 'a:right', 'a:right', 'a:right', 'a'],
        ['s:S11', 'a:down', 's:S12', 'a:down', 's:S13', 'a:down', 's:S14', 'a:down', 's:S15', 'a:down'],
        ['e', 'a', 'e', 'a', 'e', 'a', 'e', 'a', 'e', 'a'],
        ['s:S16', 'a:up', 's:S17', 'a:up', 's:S18', 'a:up', 's:S19', 'a:up', 's:S20', 'a:up'],
        ['sp', 'a', 'a', 'a', 'p', 'p', 'a', 'a', 'a', 'sp']
    ],
    workerCount: 3,
    cartCount: 2,
    orders: [
        { id: 'O-001', shelfId: 'S1', deadline: 80, items: ['手机', '充电器'] },
        { id: 'O-002', shelfId: 'S5', deadline: 100, items: ['笔记本电脑'] },
        { id: 'O-003', shelfId: 'S10', deadline: 120, items: ['耳机', '鼠标', '键盘'] },
        { id: 'O-004', shelfId: 'S15', deadline: 140, items: ['显示器'] },
        { id: 'O-005', shelfId: 'S20', deadline: 160, items: ['打印机', '墨盒'] },
        { id: 'O-006', shelfId: 'S8', deadline: 90, items: ['平板', '保护套'] }
    ],
    pickDuration: 4,
    packDuration: 3,
    targetScore: 1200,
    minOrdersToPass: 5
};
