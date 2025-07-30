const ScalpingStrategy = require('./Scalping_Strategy');

// Create test configuration
const testConfig = {
    timeframe: '1m',
    profitTarget: 0.5,
    stopLoss: 0.3,
    riskPerTrade: 1,
    
    // Enable basic indicators
    useRSI: true,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    
    useEMA: true,
    fastEMA: 9,
    slowEMA: 21,
    
    useBollingerBands: true,
    bbPeriod: 20,
    bbDeviation: 2,
    
    // Use very permissive signal rules
    primarySignalIndicator: 'rsi',
    confirmationLogic: 'any',
    minConfirmations: 0,
    rsiExtremesOnly: false,
    
    // Disable volume filtering
    useVolume: false,
    minimumVolume: 1
};

// Generate sample candle data
function generateSampleData(count = 100) {
    const data = [];
    let price = 50000; // Starting price
    const baseTime = Date.now() - (count * 60000); // 1 minute intervals
    
    for (let i = 0; i < count; i++) {
        // Create some price movement with RSI oscillation
        const trend = Math.sin(i * 0.1) * 500; // Oscillating trend
        const randomWalk = (Math.random() - 0.5) * 100; // Random component
        
        price = Math.max(price + trend * 0.01 + randomWalk, 1000); // Prevent negative prices
        
        const high = price * (1 + Math.random() * 0.01);
        const low = price * (1 - Math.random() * 0.01);
        const volume = Math.floor(Math.random() * 1000000) + 100000;
        
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

// Test the strategy
async function testStrategy() {
    console.log('🧪 Testing Scalping Strategy Signal Generation...\n');
    
    // Create strategy instance
    const strategy = new ScalpingStrategy(testConfig);
    
    // Generate test data
    const candleData = generateSampleData(100);
    console.log(`📊 Generated ${candleData.length} test candles`);
    console.log(`📈 Price range: ${Math.min(...candleData.map(c => c.close)).toFixed(2)} - ${Math.max(...candleData.map(c => c.close)).toFixed(2)}`);
    
    // Analyze the data
    console.log('\n🔍 Running strategy analysis...\n');
    const result = strategy.analyze(candleData);
    
    // Display results
    console.log('\n📊 Analysis Results:');
    console.log(`✅ Success: ${result.success}`);
    console.log(`📡 Signals Generated: ${result.signals ? result.signals.length : 0}`);
    
    if (result.signals && result.signals.length > 0) {
        console.log('\n🎯 Signal Details:');
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
        console.log('\n❌ No signals generated. This indicates the strategy conditions are too restrictive.');
    }
    
    // Test with different configurations
    console.log('\n🔧 Testing with even more permissive settings...\n');
    
    const permissiveConfig = {
        ...testConfig,
        rsiOverbought: 90,  // Very high threshold
        rsiOversold: 10,    // Very low threshold
        primarySignalIndicator: 'rsi',
        confirmationLogic: 'any',
        minConfirmations: 0,
        rsiExtremesOnly: false
    };
    
    const permissiveStrategy = new ScalpingStrategy(permissiveConfig);
    const permissiveResult = permissiveStrategy.analyze(candleData);
    
    console.log(`📡 Permissive Strategy Signals: ${permissiveResult.signals ? permissiveResult.signals.length : 0}`);
    
    if (permissiveResult.signals && permissiveResult.signals.length > 0) {
        console.log('✅ Permissive strategy generated signals!');
    } else {
        console.log('❌ Even permissive strategy failed to generate signals.');
    }
}

// Run the test
testStrategy().catch(console.error); 