(function() {
    'use strict';

    let game, uiController, infoPanel, renderer, replayPlayer;

    function init() {
        const elements = {
            currentLevel: document.getElementById('current-level'),
            timeRemaining: document.getElementById('time-remaining'),
            currentScore: document.getElementById('current-score'),
            comboBonus: document.getElementById('combo-bonus'),
            cartsAvailable: document.getElementById('carts-available'),
            cartsUsed: document.getElementById('carts-used'),
            workersAvailable: document.getElementById('workers-available'),
            workersBusy: document.getElementById('workers-busy'),
            ordersList: document.getElementById('orders-list'),
            occupiedRoutes: document.getElementById('occupied-routes'),
            workerSelect: document.getElementById('worker-select'),
            orderSelect: document.getElementById('order-select'),
            pauseButton: document.getElementById('btn-pause'),
            notification: document.getElementById('notification')
        };

        game = new GameEngine.Engine();
        infoPanel = new InfoPanel.Panel(elements);
        renderer = new Renderer.WarehouseRenderer(
            document.getElementById('game-screen'),
            document.getElementById('warehouse-map')
        );
        replayPlayer = new ReplaySystem.ReplayPlayer();

        uiController = new UIController.Controller(game, infoPanel, renderer, replayPlayer);
        uiController.init();

        window.addEventListener('beforeunload', () => {
            if (uiController) {
                uiController.destroy();
            }
        });

        const progress = Storage.loadProgress();
        const settings = Storage.loadSettings();
        
        if (progress.currentLevel && settings.autoPause) {
            setTimeout(() => {
                if (confirm(`检测到未完成的关卡，是否继续？`)) {
                    uiController._startLevel(progress.currentLevel);
                }
            }, 500);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
