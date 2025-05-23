const express = require('express');
const router = express.Router();
const ScalpingStrategy = require('./Scalping_Strategy');

/**
 * ScalpingStrategyHandler - Integration layer between the React Native app and the strategy logic
 * 
 * This handler:
 * 1. Provides a clean interface for the React Native app to execute the scalping strategy
 * 2. Formats and validates data from the app
 * 3. Orchestrates strategy execution and processes results
 */
class ScalpingStrategyHandler {
    constructor() {
        this.strategy = null;
        this.isInitialized = false;
        this.strategyConfig = null;
    }
    
    /**
     * Initialize the strategy with configuration
     * @param {Object} config - Strategy configuration
     * @returns {Object} Status of initialization
     */
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
    
    /**
     * Analyze candle data using the initialized strategy
     * @param {Array} candleData - Array of candle data objects
     * @returns {Object} Analysis results with signals
     */
    analyze(candleData) {
        if (!this.isInitialized || !this.strategy) {
            return {
                success: false,
                message: 'Strategy not initialized. Call initialize() first.'
            };
        }
        
        try {
            // Validate candle data
            if (!this._validateCandleData(candleData)) {
                return {
                    success: false,
                    message: 'Invalid candle data format'
                };
            }
            
            // Execute strategy analysis
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
    
    /**
     * Validate candle data format
     * @param {Array} candleData - Array of candle data objects
     * @returns {boolean} Is data valid
     * @private
     */
    _validateCandleData(candleData) {
        if (!Array.isArray(candleData) || candleData.length === 0) {
            return false;
        }
        
        // Check for required fields in first candle
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
            
            // Open new positions based on signals
            for (const signal of signalsAtCandle) {
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

// Initialize strategy endpoint
router.post('/initialize', (req, res) => {
    try {
        const config = req.body;
        strategyHandler.strategyConfig = config;
        strategyHandler.strategy = new ScalpingStrategy(config);
        strategyHandler.isInitialized = true;
        
        res.json({
            success: true,
            message: 'Strategy initialized successfully'
        });
    } catch (error) {
        console.error('Failed to initialize strategy:', error);
        res.status(500).json({
            success: false,
            message: `Failed to initialize strategy: ${error.message}`
        });
    }
});

// Analyze endpoint
router.post('/analyze', (req, res) => {
    if (!strategyHandler.isInitialized || !strategyHandler.strategy) {
        return res.status(400).json({
            success: false,
            message: 'Strategy not initialized. Call initialize() first.'
        });
    }
    
    try {
        const { candleData } = req.body;
        
        if (!validateCandleData(candleData)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid candle data format'
            });
        }
        
        const result = strategyHandler.strategy.analyze(candleData);
        res.json(result);
    } catch (error) {
        console.error('Error during strategy analysis:', error);
        res.status(500).json({
            success: false,
            message: `Analysis error: ${error.message}`
        });
    }
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
        const results = strategyHandler.strategy._simulateBacktest(historicalData, signals, backtestConfig);
        
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