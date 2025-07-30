const express = require('express');
const router = express.Router();
const ScalpingStrategy = require('./Scalping_Strategy');

// Generate sample candle data for testing
function generateSampleCandles(count = 100) {
    const candles = [];
    const basePrice = 50000;
    
    for (let i = 0; i < count; i++) {
        // Create price movement with some RSI patterns
        let price;
        if (i < 30) {
            // Oversold scenario
            price = basePrice - (i * 100) + (Math.random() * 200 - 100);
        } else if (i < 60) {
            // Recovery
            price = basePrice - 3000 + ((i - 30) * 150) + (Math.random() * 200 - 100);
        } else {
            // Overbought scenario  
            price = basePrice + 1500 + ((i - 60) * 50) + (Math.random() * 200 - 100);
        }
        
        candles.push({
            timestamp: Date.now() + (i * 60000),
            open: price - 50,
            high: price + 100,
            low: price - 100,
            close: price,
            volume: Math.random() * 1000 + 500
        });
    }
    
    return candles;
}

// Test different strategy configurations
router.post('/test-configurations', (req, res) => {
    console.log('\n=== TESTING STRATEGY CONFIGURATIONS ===');
    
    try {
        const sampleCandles = generateSampleCandles(100);
        
        // Configuration 1: RSI only
        const rsiOnlyConfig = {
            useRSI: true,
            rsiPeriod: 14,
            rsiOversold: 30,
            rsiOverbought: 70,
            useMACD: false,
            useEMA: false,
            useBollingerBands: false,
            primarySignalIndicator: 'rsi',
            confirmationLogic: 'any',
            profitTarget: 0.5,
            stopLoss: 0.3
        };
        
        // Configuration 2: MACD only
        const macdOnlyConfig = {
            useRSI: false,
            useMACD: true,
            macdFastPeriod: 12,
            macdSlowPeriod: 26,
            macdSignalPeriod: 9,
            useEMA: false,
            useBollingerBands: false,
            primarySignalIndicator: 'macd',
            confirmationLogic: 'any',
            profitTarget: 1.0,
            stopLoss: 0.5
        };
        
        // Configuration 3: EMA only
        const emaOnlyConfig = {
            useRSI: false,
            useMACD: false,
            useEMA: true,
            fastEMA: 9,
            slowEMA: 21,
            useBollingerBands: false,
            primarySignalIndicator: 'ema',
            confirmationLogic: 'any',
            profitTarget: 0.8,
            stopLoss: 0.4
        };
        
        const configs = [
            { name: 'RSI Only', config: rsiOnlyConfig },
            { name: 'MACD Only', config: macdOnlyConfig },
            { name: 'EMA Only', config: emaOnlyConfig }
        ];
        
        const results = {};
        
        configs.forEach(({ name, config }) => {
            console.log(`\n--- Testing ${name} Configuration ---`);
            
            const strategy = new ScalpingStrategy(config);
            const analysisResult = strategy.analyze(sampleCandles);
            
            results[name] = {
                success: analysisResult.success,
                signalCount: analysisResult.signals?.length || 0,
                signals: analysisResult.signals || [],
                config: {
                    rsiEnabled: strategy.indicators.rsi.enabled,
                    macdEnabled: strategy.indicators.macd.enabled,
                    emaEnabled: strategy.indicators.ema.enabled,
                    primaryIndicator: strategy.signalRules.primarySignalIndicator
                }
            };
            
            console.log(`${name} Results:`, {
                signals: results[name].signalCount,
                success: results[name].success,
                config: results[name].config
            });
        });
        
        // Check if results are different
        const signalCounts = Object.values(results).map(r => r.signalCount);
        const areResultsDifferent = new Set(signalCounts).size > 1;
        
        console.log('\n=== SUMMARY ===');
        console.log('Signal counts:', signalCounts);
        console.log('Results are different:', areResultsDifferent);
        
        res.json({
            success: true,
            areResultsDifferent,
            results,
            summary: {
                rsiOnlySignals: results['RSI Only']?.signalCount || 0,
                macdOnlySignals: results['MACD Only']?.signalCount || 0,
                emaOnlySignals: results['EMA Only']?.signalCount || 0
            }
        });
        
    } catch (error) {
        console.error('Error testing configurations:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test a specific configuration
router.post('/test-single-config', (req, res) => {
    try {
        const config = req.body;
        const sampleCandles = generateSampleCandles(100);
        
        console.log('\n=== TESTING SINGLE CONFIGURATION ===');
        console.log('Config:', JSON.stringify(config, null, 2));
        
        const strategy = new ScalpingStrategy(config);
        const result = strategy.analyze(sampleCandles);
        
        res.json({
            success: true,
            result,
            strategyConfig: {
                rsiEnabled: strategy.indicators.rsi.enabled,
                rsiPeriod: strategy.indicators.rsi.period,
                rsiOversold: strategy.indicators.rsi.oversold,
                rsiOverbought: strategy.indicators.rsi.overbought,
                macdEnabled: strategy.indicators.macd.enabled,
                emaEnabled: strategy.indicators.ema.enabled,
                primaryIndicator: strategy.signalRules.primarySignalIndicator,
                confirmationLogic: strategy.signalRules.confirmationLogic
            }
        });
    } catch (error) {
        console.error('Error testing single config:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router; 