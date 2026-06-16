const ScoringSystem = (function() {
    const { ORDER_STATUS, WORKER_STATUS } = GameModels;

    const SCORE_CONFIG = {
        BASE_ORDER_SCORE: 100,
        PER_ITEM_SCORE: 20,
        TIME_BONUS_FACTOR: 0.5,
        COMBO_MULTIPLIER_STEP: 0.2,
        MAX_COMBO_MULTIPLIER: 2.0,
        CART_BONUS: 1.5,
        TIMEOUT_PENALTY: 0.3,
        PERFECT_TIME_THRESHOLD: 0.5,
        PERFECT_BONUS: 500
    };

    function calculateOrderScore(order, worker, currentTime, settings = {}) {
        const config = { ...SCORE_CONFIG, ...settings };
        
        if (order.status === ORDER_STATUS.TIMEOUT) {
            return Math.floor(order.baseScore * config.TIMEOUT_PENALTY);
        }

        let score = order.baseScore;

        const timeBonus = Math.floor(order.getRemainingTime(currentTime) * config.TIME_BONUS_FACTOR);
        score += timeBonus;

        const comboMultiplier = worker.getComboMultiplier();
        score = Math.floor(score * comboMultiplier);

        if (worker.hasCart) {
            score = Math.floor(score * config.CART_BONUS);
        }

        return Math.max(0, score);
    }

    function calculateComboMultiplier(consecutiveOrders) {
        return 1 + Math.min(consecutiveOrders, 5) * SCORE_CONFIG.COMBO_MULTIPLIER_STEP;
    }

    function calculateLevelScore(orders, workers, currentTime, level) {
        let totalScore = 0;
        let completedOrders = 0;
        let timeoutOrders = 0;
        let maxCombo = 0;

        for (const order of orders) {
            if (order.status === ORDER_STATUS.COMPLETED) {
                completedOrders++;
                const worker = workers.find(w => w.id === order.assignedWorker);
                if (worker) {
                    totalScore += calculateOrderScore(order, worker, order.completeTime || currentTime);
                }
            } else if (order.status === ORDER_STATUS.TIMEOUT) {
                timeoutOrders++;
            }
        }

        for (const worker of workers) {
            maxCombo = Math.max(maxCombo, worker.consecutiveOrders);
        }

        const timeRemaining = level.timeLimit - currentTime;
        if (timeRemaining > level.timeLimit * SCORE_CONFIG.PERFECT_TIME_THRESHOLD && 
            completedOrders >= level.minOrdersToPass) {
            totalScore += SCORE_CONFIG.PERFECT_BONUS;
        }

        return {
            totalScore,
            completedOrders,
            timeoutOrders,
            maxCombo,
            timeRemaining
        };
    }

    function isLevelPassed(orders, level) {
        const completedOrders = orders.filter(o => o.status === ORDER_STATUS.COMPLETED).length;
        const timeoutOrders = orders.filter(o => o.status === ORDER_STATUS.TIMEOUT).length;
        
        return completedOrders >= level.minOrdersToPass && timeoutOrders < orders.length;
    }

    function getStarRating(score, targetScore, completedRatio) {
        if (score >= targetScore * 1.5 && completedRatio >= 1) {
            return 3;
        } else if (score >= targetScore && completedRatio >= 0.8) {
            return 2;
        } else if (completedRatio >= 0.5) {
            return 1;
        }
        return 0;
    }

    function formatScore(score) {
        return score.toLocaleString();
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function getScoreBreakdown(order, worker, currentTime) {
        const breakdown = [];
        
        breakdown.push({
            label: '基础分',
            value: order.baseScore,
            type: 'base'
        });

        const timeBonus = Math.floor(order.getRemainingTime(currentTime) * SCORE_CONFIG.TIME_BONUS_FACTOR);
        if (timeBonus > 0) {
            breakdown.push({
                label: '时间奖励',
                value: timeBonus,
                type: 'bonus'
            });
        }

        const comboMultiplier = worker.getComboMultiplier();
        if (comboMultiplier > 1) {
            breakdown.push({
                label: `连单加成 (x${comboMultiplier.toFixed(1)})`,
                value: Math.floor((order.baseScore + timeBonus) * (comboMultiplier - 1)),
                type: 'combo'
            });
        }

        if (worker.hasCart) {
            const cartBonus = Math.floor((order.baseScore + timeBonus) * (SCORE_CONFIG.CART_BONUS - 1));
            breakdown.push({
                label: '推车加成',
                value: cartBonus,
                type: 'cart'
            });
        }

        const total = breakdown.reduce((sum, item) => sum + item.value, 0);
        breakdown.push({
            label: '总计',
            value: total,
            type: 'total'
        });

        return breakdown;
    }

    return {
        SCORE_CONFIG,
        calculateOrderScore,
        calculateComboMultiplier,
        calculateLevelScore,
        isLevelPassed,
        getStarRating,
        formatScore,
        formatTime,
        getScoreBreakdown
    };
})();
