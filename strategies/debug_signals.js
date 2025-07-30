const ScalpingStrategy = require('./Scalping_Strategy');

// Create a very permissive test configuration
const debugConfig = {
    timeframe: '1m',
    profitTarget: 0.5,
    stopLoss: 0.3,
    riskPerTrade: 1,
    
    // Enable RSI with very permissive settings
    useRSI: true,
    rsiPeriod: 14,
    rsiOverbought: 90,  // Very high
    rsiOversold: 10,    // Very low
    
    // Enable EMA
    useEMA: true,
    fastEMA: 9,
    slowEMA: 21,
    
    // Disable volume filtering
    useVolume: false,
    minimumVolume: 1,
    
    // Very permissive signal rules
    primarySignalIndicator: 'rsi',
    confirmationLogic: 'any',
    minConfirmations: 0,
    rsiExtremesOnly: false,
    conflictingSignalsAction: 'primary'
};

// Generate simple test data with known RSI patterns
function generateTestData(count = 100) {
    const data = [];
    let price = 50000;
    const baseTime = Date.now() - (count * 60000);
    
    for (let i = 0; i < count; i++) {
        // Create oscillating price pattern to generate clear RSI signals
        const oscillation = Math.sin(i * 0.2) * 1000; // Strong oscillation
        const trend = i * 5; // Slight upward trend
        
        price = 50000 + oscillation + trend;
        
        const high = price * 1.001;
        const low = price * 0.999;
        const volume = 100000;
        
        data.push({
            timestamp: baseTime + (i * 60000),
            open: i === 0 ? price : data[i-1].close,
            high: high,
            low: low,
            close: price,
            volume: volume
        });
    }
    
    return data;
}

// Debug function to test the strategy
async function debugSignalGeneration() {
    console.log('🔍 DEBUGGING SIGNAL GENERATION ISSUE\n');
    
    // Create strategy instance
    const strategy = new ScalpingStrategy(debugConfig);
    
    // Generate test data
    const candleData = generateTestData(100);
    console.log(`📊 Generated ${candleData.length} test candles`);
    console.log(`📈 Price range: ${Math.min(...candleData.map(c => c.close)).toFixed(2)} - ${Math.max(...candleData.map(c => c.close)).toFixed(2)}`);
    
    // Debug: Check strategy configuration
    console.log('\n🔧 Strategy Configuration:');
    console.log(`Primary Indicator: ${strategy.signalRules.primarySignalIndicator}`);
    console.log(`RSI Enabled: ${strategy.indicators.rsi.enabled}`);
    console.log(`RSI Oversold: ${strategy.indicators.rsi.oversold}`);
    console.log(`RSI Overbought: ${strategy.indicators.rsi.overbought}`);
    console.log(`Confirmation Logic: ${strategy.signalRules.confirmationLogic}`);
    console.log(`Min Confirmations: ${strategy.signalRules.minConfirmations}`);
    
    // Analyze the data
    console.log('\n🔍 Running strategy analysis...\n');
    const result = strategy.analyze(candleData);
    
    // Display results
    console.log('\n📊 ANALYSIS RESULTS:');
    console.log(`✅ Success: ${result.success}`);
    console.log(`📡 Signals Generated: ${result.signals ? result.signals.length : 0}`);
    
    if (result.message) {
        console.log(`📝 Message: ${result.message}`);
    }
    
    // Display indicator data for debugging
    if (result.indicators) {
        console.log('\n📈 INDICATOR DATA:');
        console.log(`RSI values: ${result.indicators.rsi ? result.indicators.rsi.length : 0} values`);
        console.log(`EMA values: ${result.indicators.fastEma ? result.indicators.fastEma.length : 0} fast, ${result.indicators.slowEma ? result.indicators.slowEma.length : 0} slow`);
        
        if (result.indicators.rsi && result.indicators.rsi.length > 0) {
            const lastRSI = result.indicators.rsi.slice(-5);
            console.log(`Last 5 RSI values: ${lastRSI.map(v => v.toFixed(2)).join(', ')}`);
        }
    }
    
    if (result.signals && result.signals.length > 0) {
        console.log('\n🎯 SIGNALS FOUND:');
        result.signals.forEach((signal, index) => {
            console.log(`  Signal ${index + 1}:`);
            console.log(`    Type: ${signal.type}`);
            console.log(`    Entry: ${signal.entry_price}`);
            console.log(`    TP: ${signal.tp}`);
            console.log(`    SL: ${signal.sl}`);
            console.log(`    Candle: ${signal.candle_index}`);
            console.log('');
        });
    } else {
        console.log('\n❌ NO SIGNALS GENERATED');
        console.log('   This suggests one of these issues:');
        console.log('   1. Primary indicator not properly enabled');
        console.log('   2. Indicator calculation failed');
        console.log('   3. Index mapping between candles and indicators is incorrect');
        console.log('   4. Signal rules are too restrictive');
        console.log('   5. Data format issues');
    }
    
    // Test with minimal configuration
    console.log('\n🧪 TESTING WITH ABSOLUTE MINIMAL CONFIG...\n');
    
    const minimalConfig = {
        useRSI: true,
        rsiPeriod: 14,
        rsiOverbought: 70,
        rsiOversold: 30,
        primarySignalIndicator: 'rsi',
        confirmationLogic: 'any',
        minConfirmations: 0,
        rsiExtremesOnly: false,
        useVolume: false
    };
    
    const minimalStrategy = new ScalpingStrategy(minimalConfig);
    const minimalResult = minimalStrategy.analyze(candleData);
    
    console.log(`📡 Minimal Strategy Signals: ${minimalResult.signals ? minimalResult.signals.length : 0}`);
    
    if (minimalResult.signals && minimalResult.signals.length > 0) {
        console.log('✅ Minimal strategy worked! The issue is with the main configuration.');
    } else {
        console.log('❌ Even minimal strategy failed. The issue is deeper in the code.');
    }
}

// Run the debug test
debugSignalGeneration().catch(console.error); 