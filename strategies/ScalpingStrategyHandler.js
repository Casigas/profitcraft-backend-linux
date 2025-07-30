const express = require('express');
const router = express.Router();
const ScalpingStrategy = require('./Scalping_Strategy');

class ScalpingStrategyHandler {
    constructor() {
        this.strategy = null;
        this.isInitialized = false;
        this.strategyConfig = null;
    }
    
    initialize(config) {
        try {
            this.strategyConfig = config;
            this.strategy = new ScalpingStrategy(config);
            this.isInitialized = true;
            
            return {
                success: true,
                message: 'Strategy initialized successfully'
            };
        } catch (error) {
            console.error('Failed to initialize strategy:', error);
            return {
                success: false,
                message: `Failed to initialize strategy: ${error.message}`
            };
        }
    }
    
    analyze(candleData) {
        if (!this.isInitialized || !this.strategy) {
            return {
                success: false,
                message: 'Strategy not initialized. Call initialize() first.'
            };
        }
        
        try {
            if (!this._validateCandleData(candleData)) {
                return {
                    success: false,
                    message: 'Invalid candle data format'
                };
            }
            
            const result = this.strategy.analyze(candleData);
            
            return result;
        } catch (error) {
            console.error('Error during strategy analysis:', error);
            return {
                success: false,
                message: `Analysis error: ${error.message}`
            };
        }
    }
    
    _validateCandleData(candleData) {
        if (!Array.isArray(candleData) || candleData.length === 0) {
            return false;
        }
        
        const requiredFields = ['timestamp', 'open', 'high', 'low', 'close', 'volume'];
        return requiredFields.every(field => typeof candleData[0][field] !== 'undefined');
    }
    
    /**
     * Get strategy configuration
     * @returns {Object} Current strategy configuration
     */
    getConfiguration() {
        return this.strategyConfig;
    }
    
    /**
     * Get strategy information and capabilities
     * @returns {Object} Strategy information
     */
    getInfo() {
        return {
            name: 'Scalping Strategy',
            version: '1.0.0',
            description: 'High-frequency trading strategy focusing on small price movements',
            author: 'ProfitCraft',
            supportedTimeframes: ['1m', '3m', '5m', '15m'],
            supportedAssets: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT'],
            indicators: [
                'RSI', 'Stochastic RSI', 'MACD', 'Bollinger Bands', 
                'EMA', 'VWAP', 'Supertrend', 'ATR', 'Choppiness Index',
                'Parabolic SAR', 'Donchian Channel', 'Pivot Points',
                'Heikin-Ashi'
            ]
        };
    }
    
    /**
     * Execute backtest on historical data
     * @param {Array} historicalData - Array of historical candle data
     * @param {Object} backtestConfig - Backtest configuration
     * @returns {Object} Backtest results
     */
    backtest(historicalData, backtestConfig) {
        if (!this.isInitialized || !this.strategy) {
            return {
                success: false,
                message: 'Strategy not initialized. Call initialize() first.'
            };
        }
        
        try {
            // Validate historical data
            if (!this._validateCandleData(historicalData)) {
                return {
                    success: false,
                    message: 'Invalid historical data format'
                };
            }
            
            // Get signals from the strategy
            const analysisResult = this.strategy.analyze(historicalData);
            if (!analysisResult.success) {
                return analysisResult;
            }
            
            const signals = analysisResult.signals;
            
            // Run backtest simulation
            const results = this._simulateBacktest(historicalData, signals, backtestConfig);
            
            return {
                success: true,
                results: results
            };
        } catch (error) {
            console.error('Error during backtest:', error);
            return {
                success: false,
                message: `Backtest error: ${error.message}`
            };
        }
    }
    
    /**
     * Simulate backtest based on signals
     * @param {Array} candleData - Historical candle data
     * @param {Array} signals - Trading signals
     * @param {Object} config - Backtest configuration
     * @returns {Object} Backtest results
     * @private
     */
    _simulateBacktest(candleData, signals, config) {
        // Reset trade state at start of backtest
        if (this.strategy && this.strategy.resetActiveTradeState) {
            this.strategy.resetActiveTradeState();
        }
        // Default configuration
        const backtestConfig = {
            initialCapital: config?.initialCapital || 10000,
            includeFees: config?.includeFees || true,
            feePercentage: config?.feePercentage || 0.1,
            ...config
        };
        
        let balance = backtestConfig.initialCapital;
        let equity = balance;
        const trades = [];
        let openPositions = [];
        let closedTrades = [];
        
        // Statistics
        let winCount = 0;
        let lossCount = 0;
        let totalProfit = 0;
        let totalLoss = 0;
        
        // Process each candle and check for signal execution
        for (let i = 0; i < candleData.length; i++) {
            const candle = candleData[i];
            
            // Check for signals at this candle
            const signalsAtCandle = signals.filter(s => s.candle_index === i);
            
            // Open new positions based on signals (respect single trade mode)
            for (const signal of signalsAtCandle) {
                // Check if we should honor single trade mode from strategy
                if (this.strategy && this.strategy.singleTradeMode && openPositions.length > 0) {
                    console.log(`[BACKTEST] Skipping signal at candle ${i} - single trade mode active, ${openPositions.length} positions open`);
                    continue; // Skip this signal if single trade mode is enabled and we have open positions
                }
                
                // Calculate position size based on risk percentage
                const positionSize = (balance * this.strategy.riskPerTrade / 100) / 
                                     (Math.abs(signal.entry_price - signal.sl) / signal.entry_price);
                
                // Calculate fees if enabled
                const entryFee = backtestConfig.includeFees ? 
                                (positionSize * (backtestConfig.feePercentage / 100)) : 0;
                
                // Open position
                openPositions.push({
                    type: signal.type,
                    entry_price: signal.entry_price,
                    entry_time: candle.timestamp,
                    position_size: positionSize,
                    take_profit: signal.tp,
                    stop_loss: signal.sl,
                    current_price: signal.entry_price,
                    fee_paid: entryFee
                });
                
                // Deduct fees from balance
                balance -= entryFee;
                
                console.log(`[BACKTEST] Opened ${signal.type} position at candle ${i}: entry=${signal.entry_price}, tp=${signal.tp}, sl=${signal.sl}`);
                
                // In single trade mode, only open one position
                if (this.strategy && this.strategy.singleTradeMode) {
                    break; // Exit loop after opening one position
                }
            }
            
            // Check open positions for TP/SL hits
            const stillOpenPositions = [];
            
            for (const position of openPositions) {
                let isPositionClosed = false;
                let exitPrice = null;
                let pnl = 0;
                
                if (position.type === 'long') {
                    // Check for stop loss
                    if (candle.low <= position.stop_loss) {
                        isPositionClosed = true;
                        exitPrice = position.stop_loss;
                        pnl = ((exitPrice - position.entry_price) / position.entry_price) * position.position_size;
                    } 
                    // Check for take profit
                    else if (candle.high >= position.take_profit) {
                        isPositionClosed = true;
                        exitPrice = position.take_profit;
                        pnl = ((exitPrice - position.entry_price) / position.entry_price) * position.position_size;
                    }
                } else { // Short position
                    // Check for stop loss
                    if (candle.high >= position.stop_loss) {
                        isPositionClosed = true;
                        exitPrice = position.stop_loss;
                        pnl = ((position.entry_price - exitPrice) / position.entry_price) * position.position_size;
                    } 
                    // Check for take profit
                    else if (candle.low <= position.take_profit) {
                        isPositionClosed = true;
                        exitPrice = position.take_profit;
                        pnl = ((position.entry_price - exitPrice) / position.entry_price) * position.position_size;
                    }
                }
                
                // If position closed, calculate final P&L and update statistics
                if (isPositionClosed) {
                    // Calculate exit fee if enabled
                    const exitFee = backtestConfig.includeFees ? 
                                   (position.position_size * (exitPrice / position.entry_price) * 
                                    (backtestConfig.feePercentage / 100)) : 0;
                    
                    // Final P&L after fees
                    const finalPnL = pnl - position.fee_paid - exitFee;
                    
                    // Update balance
                    balance += position.position_size + finalPnL;
                    
                    // Record trade
                    const trade = {
                        type: position.type,
                        entry_price: position.entry_price,
                        entry_time: position.entry_time,
                        exit_price: exitPrice,
                        exit_time: candle.timestamp,
                        position_size: position.position_size,
                        pnl: finalPnL,
                        pnl_percentage: (finalPnL / position.position_size) * 100,
                        fees_paid: position.fee_paid + exitFee
                    };
                    
                    closedTrades.push(trade);
                    
                    // Update statistics
                    if (finalPnL > 0) {
                        winCount++;
                        totalProfit += finalPnL;
                    } else {
                        lossCount++;
                        totalLoss += Math.abs(finalPnL);
                    }
                    
                    console.log(`[BACKTEST] Closed ${position.type} position at candle ${i}: exit=${exitPrice}, P&L=${finalPnL.toFixed(2)} (${(finalPnL/position.position_size*100).toFixed(2)}%)`);
                } else {
                    // Update current price for open position
                    position.current_price = candle.close;
                    stillOpenPositions.push(position);
                }
            }
            
            // Update open positions list
            openPositions = stillOpenPositions;
            
            // Calculate current equity (balance + value of open positions)
            equity = balance;
            for (const position of openPositions) {
                let positionValue = 0;
                if (position.type === 'long') {
                    positionValue = position.position_size * (position.current_price / position.entry_price);
                } else {
                    positionValue = position.position_size * (2 - position.current_price / position.entry_price);
                }
                equity += positionValue;
            }
            
            // Record equity at each step for equity curve
            trades.push({
                timestamp: candle.timestamp,
                balance: balance,
                equity: equity
            });
        }
        
        // Calculate final statistics
        const totalTrades = winCount + lossCount;
        const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
        const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0;
        const totalReturn = ((equity - backtestConfig.initialCapital) / backtestConfig.initialCapital) * 100;
        
        return {
            initialCapital: backtestConfig.initialCapital,
            finalBalance: balance,
            finalEquity: equity,
            totalReturn: totalReturn,
            totalTrades: totalTrades,
            winCount: winCount,
            lossCount: lossCount,
            winRate: winRate,
            profitFactor: profitFactor,
            totalProfit: totalProfit,
            totalLoss: totalLoss,
            netProfit: totalProfit - totalLoss,
            equityCurve: trades,
            closedTrades: closedTrades
        };
    }
}

// Create a single instance of the strategy handler
const strategyHandler = new ScalpingStrategyHandler();

// Helper function to validate candle data
function validateCandleData(candleData) {
    if (!Array.isArray(candleData) || candleData.length === 0) {
        return false;
    }
    
    const requiredFields = ['timestamp', 'open', 'high', 'low', 'close', 'volume'];
    return requiredFields.every(field => typeof candleData[0][field] !== 'undefined');
}

// Store strategy instances by userId_strategyId
const strategyInstances = {};

// Clear strategy instances endpoint (for debugging/testing)
router.post('/clear-instances', (req, res) => {
    console.log(`[SCALPING CLEAR] Clearing all strategy instances. Current instances:`, Object.keys(strategyInstances));
    Object.keys(strategyInstances).forEach(key => delete strategyInstances[key]);
    console.log(`[SCALPING CLEAR] All instances cleared`);
    res.json({ success: true, message: 'All strategy instances cleared' });
});

// Get current instances endpoint (for debugging)
router.get('/instances', (req, res) => {
    const instanceInfo = {};
    Object.keys(strategyInstances).forEach(key => {
        const instance = strategyInstances[key];
        instanceInfo[key] = {
            isInitialized: instance.isInitialized,
            configSummary: {
                rsiEnabled: instance.config.useRSI,
                macdEnabled: instance.config.useMACD,
                emaEnabled: instance.config.useEMA,
                primaryIndicator: instance.config.primarySignalIndicator
            },
            tradeStatus: instance.instance && instance.instance.getTradeStatus ? 
                        instance.instance.getTradeStatus() : null
        };
    });
    res.json({ instances: instanceInfo });
});

// Get trade status for a specific strategy instance
router.get('/trade-status/:userId/:strategyId', (req, res) => {
    const { userId, strategyId } = req.params;
    const key = `${userId}_${strategyId}`;
    
    const strategyObj = strategyInstances[key];
    if (!strategyObj || !strategyObj.isInitialized) {
        return res.status(404).json({
            success: false,
            message: 'Strategy not found or not initialized'
        });
    }
    
    const tradeStatus = strategyObj.instance.getTradeStatus();
    res.json({
        success: true,
        tradeStatus: tradeStatus
    });
});

// Reset trade state for a specific strategy instance (for debugging/testing)
router.post('/reset-trade-state/:userId/:strategyId', (req, res) => {
    const { userId, strategyId } = req.params;
    const key = `${userId}_${strategyId}`;
    
    const strategyObj = strategyInstances[key];
    if (!strategyObj || !strategyObj.isInitialized) {
        return res.status(404).json({
            success: false,
            message: 'Strategy not found or not initialized'
        });
    }
    
    strategyObj.instance.resetActiveTradeState();
    res.json({
        success: true,
        message: 'Trade state reset successfully'
    });
});

// Initialize strategy for a specific userId and strategyId
router.post('/initialize/:userId/:strategyId', (req, res) => {
    const { userId, strategyId } = req.params;
    const config = req.body;
    const key = `${userId}_${strategyId}`;
    
    // Add detailed logging for debugging
    console.log(`[SCALPING INIT] Initializing strategy for userId: ${userId}, strategyId: ${strategyId}`);
    console.log(`[SCALPING INIT] Config received:`, JSON.stringify(config, null, 2));
    
    // Force clear any existing instance for this key
    if (strategyInstances[key]) {
        console.log(`[SCALPING INIT] Clearing existing instance for key: ${key}`);
        delete strategyInstances[key];
    }
    
    try {
        strategyInstances[key] = {
            config,
            instance: new ScalpingStrategy(config),
            isInitialized: true
        };
        
        console.log(`[SCALPING INIT] Successfully initialized strategy ${key}`);
        res.json({
            success: true,
            message: `Strategy ${strategyId} for user ${userId} initialized successfully`
        });
    } catch (error) {
        console.error(`[SCALPING INIT] Failed to initialize strategy ${key}:`, error);
        console.error(`[SCALPING INIT] Error stack:`, error.stack);
        res.status(500).json({
            success: false,
            message: `Failed to initialize strategy: ${error.message}`
        });
    }
});

// Main analyze endpoint that handles requests from the dynamic router
router.post('/analyze/:userId/:strategyId', (req, res) => {
    const { userId, strategyId } = req.params;
    const { candleData } = req.body;
    const key = `${userId}_${strategyId}`;
    
    console.log(`[SCALPING ANALYZE] Received analysis request for key: ${key}`);
    console.log(`[SCALPING ANALYZE] Request body keys:`, Object.keys(req.body));
    console.log(`[SCALPING ANALYZE] CandleData length:`, candleData?.length || 'undefined');
    console.log(`[SCALPING ANALYZE] CandleData type:`, typeof candleData);
    
    const strategyObj = strategyInstances[key];
    console.log(`[SCALPING ANALYZE] Strategy instance exists:`, !!strategyObj);
    console.log(`[SCALPING ANALYZE] Strategy initialized:`, strategyObj?.isInitialized || false);
    console.log(`[SCALPING ANALYZE] Available instances:`, Object.keys(strategyInstances));
    
    if (!strategyObj || !strategyObj.isInitialized) {
        console.log(`[SCALPING ANALYZE] Strategy not initialized for key: ${key}, attempting auto-initialization`);
        
        // Try to auto-initialize the strategy using data from the request
        if (req.strategy) {
            try {
                // Parse the strategy configuration from the database
                const entryConditions = req.strategy.EntryConditions ? JSON.parse(req.strategy.EntryConditions) : {};
                const exitConditions = req.strategy.ExitConditions ? JSON.parse(req.strategy.ExitConditions) : {};
                
                console.log(`[SCALPING ANALYZE] Raw EntryConditions from DB:`, req.strategy.EntryConditions);
                console.log(`[SCALPING ANALYZE] Parsed EntryConditions:`, JSON.stringify(entryConditions, null, 2));
                console.log(`[SCALPING ANALYZE] Raw ExitConditions from DB:`, req.strategy.ExitConditions);
                console.log(`[SCALPING ANALYZE] Parsed ExitConditions:`, JSON.stringify(exitConditions, null, 2));
                
                // Create configuration object from strategy data
                const autoConfig = {
                    strategyName: req.strategy.StrategyName,
                    strategyDescription: req.strategy.Description || '',
                    timeframe: req.strategy.TimeFrame || '1m',
                    riskPerTrade: req.strategy.RiskPercentage || 1,
                    profitTarget: (req.strategy.TakeProfit || 0.005) * 100, // Convert back to percentage
                    stopLoss: (req.strategy.StopLoss || 0.003) * 100, // Convert back to percentage
                    
                    // Technical indicators from entry conditions
                    ...entryConditions,
                    
                    // Risk management from exit conditions  
                    ...exitConditions
                };
                
                console.log(`[SCALPING ANALYZE] Auto-initializing strategy with config:`, JSON.stringify(autoConfig, null, 2));
                
                // Initialize the strategy
                strategyInstances[key] = {
                    config: autoConfig,
                    instance: new ScalpingStrategy(autoConfig),
                    isInitialized: true
                };
                
                console.log(`[SCALPING ANALYZE] Successfully auto-initialized strategy ${key}`);
            } catch (initError) {
                console.error(`[SCALPING ANALYZE] Failed to auto-initialize strategy ${key}:`, initError);
                return res.status(400).json({
                    success: false,
                    message: `Strategy not initialized and auto-initialization failed: ${initError.message}`
                });
            }
        } else {
            console.error(`[SCALPING ANALYZE] Strategy not initialized for key: ${key} and no strategy data available for auto-init`);
            return res.status(400).json({
                success: false,
                message: 'Strategy not initialized. Call initialize first for this user and strategy.'
            });
        }
    }
    
    try {
        if (!Array.isArray(candleData) || candleData.length === 0) {
            console.error(`[SCALPING ANALYZE] Invalid candle data:`, {
                isArray: Array.isArray(candleData),
                length: candleData?.length,
                type: typeof candleData
            });
            return res.status(400).json({
                success: false,
                message: 'Invalid candle data format'
            });
        }
        
        console.log(`[SCALPING ANALYZE] Analyzing ${candleData.length} candles`);
        console.log(`[SCALPING ANALYZE] First candle sample:`, candleData[0]);
        
        // Get the strategy object (either existing or newly auto-initialized)
        const finalStrategyObj = strategyInstances[key];
        const result = finalStrategyObj.instance.analyze(candleData);
        
        console.log(`[SCALPING ANALYZE] Analysis result:`, {
            success: result.success,
            signalsCount: result.signals?.length || 0,
            message: result.message
        });
        
        res.json(result);
    } catch (error) {
        console.error('[SCALPING ANALYZE] Error during strategy analysis:', error);
        console.error('[SCALPING ANALYZE] Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: `Analysis error: ${error.message}`
        });
    }
});

// Legacy analyze endpoint for backward compatibility
router.post('/analyze', (req, res) => {
    console.log(`[SCALPING ANALYZE] Legacy analyze endpoint called, redirecting to dynamic endpoint`);
    // Extract strategy info from request if available, or use default values
    const userId = req.strategy?.UserId || 'default';
    const strategyId = req.strategy?.StrategyId || 'default';
    
    // Redirect to the specific endpoint
    req.params.userId = userId;
    req.params.strategyId = strategyId;
    req.url = `/analyze/${userId}/${strategyId}`;
    
    // Call the main handler
    return router.stack.find(layer => 
        layer.route && 
        layer.route.path === '/analyze/:userId/:strategyId' && 
        layer.route.methods.post
    ).handle(req, res);
});

// Get configuration endpoint
router.get('/configuration', (req, res) => {
    res.json(strategyHandler.strategyConfig);
});

// Get strategy info endpoint
router.get('/info', (req, res) => {
    res.json(strategyHandler.getInfo());
});

// Backtest endpoint
router.post('/backtest', (req, res) => {
    if (!strategyHandler.isInitialized || !strategyHandler.strategy) {
        return res.status(400).json({
            success: false,
            message: 'Strategy not initialized. Call initialize() first.'
        });
    }
    
    try {
        const { historicalData, backtestConfig } = req.body;
        
        if (!validateCandleData(historicalData)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid historical data format'
            });
        }
        
        const analysisResult = strategyHandler.strategy.analyze(historicalData);
        if (!analysisResult.success) {
            return res.json(analysisResult);
        }
        
        const signals = analysisResult.signals;
        const results = strategyHandler._simulateBacktest(historicalData, signals, backtestConfig);
        
        res.json({
            success: true,
            results: results
        });
    } catch (error) {
        console.error('Error during backtest:', error);
        res.status(500).json({
            success: false,
            message: `Backtest error: ${error.message}`
        });
    }
});

module.exports = router; 