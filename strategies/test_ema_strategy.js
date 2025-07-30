const ScalpingStrategy = require('./Scalping_Strategy');

// Create EMA-only strategy configuration
const emaConfig = {
    timeframe: '1m',
    profitTarget: 0.5,
    stopLoss: 0.3,
    riskPerTrade: 1,
    
    // Enable only EMA
    useEMA: true,
    fastEMA: 9,
    slowEMA: 21,
    
    // Disable other indicators
    useRSI: false,
    useBollingerBands: false,
    useMACD: false,
    
    // Set EMA as primary indicator
    primarySignalIndicator: 'ema',
    confirmationLogic: 'any',
    minConfirmations: 0,
    emaFreshCrossover: false, // Don't require fresh crossovers
    emaPriceConfirmation: false,
    
    // Disable volume filtering
    useVolume: false,
    minimumVolume: 1
};

// Generate sample data that will create EMA signals
function generateEMATestData(count = 100) {
    const data = [];
    let price = 50000;
    const baseTime = Date.now() - (count * 60000);
    
    for (let i = 0; i < count; i++) {
        // Create trending price movement that will generate EMA signals
        if (i < 30) {
            // Downtrend first
            price = price - Math.random() * 50 - 10;
        } else if (i < 70) {
            // Then uptrend
            price = price + Math.random() * 50 + 10;
        } else {
            // Then sideways
            price = price + (Math.random() - 0.5) * 20;
        }
        
        const high = price * (1 + Math.random() * 0.005);
        const low = price * (1 - Math.random() * 0.005);
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

// Test the EMA strategy
async function testEMAStrategy() {
    console.log('🧪 Testing EMA-Only Strategy...\n');
    
    const strategy = new ScalpingStrategy(emaConfig);
    const candleData = generateEMATestData(100);
    
    console.log(`📊 Generated ${candleData.length} test candles`);
    console.log(`📈 Price range: ${Math.min(...candleData.map(c => c.close)).toFixed(2)} - ${Math.max(...candleData.map(c => c.close)).toFixed(2)}`);
    
    console.log('\n🔍 Running EMA strategy analysis...\n');
    const result = strategy.analyze(candleData);
    
    console.log('\n📊 EMA Strategy Results:');
    console.log(`✅ Success: ${result.success}`);
    console.log(`📡 Signals Generated: ${result.signals ? result.signals.length : 0}`);
    
    if (result.signals && result.signals.length > 0) {
        console.log('\n🎯 EMA Signal Details (first 5):');
        result.signals.slice(0, 5).forEach((signal, index) => {
            console.log(`  Signal ${index + 1}:`);
            console.log(`    Type: ${signal.type}`);
            console.log(`    Entry: ${signal.entry_price}`);
            console.log(`    TP: ${signal.tp}`);
            console.log(`    SL: ${signal.sl}`);
            console.log(`    Candle: ${signal.candle_index}`);
            console.log('');
        });
        
        // Show signal distribution
        const longSignals = result.signals.filter(s => s.type === 'long').length;
        const shortSignals = result.signals.filter(s => s.type === 'short').length;
        console.log(`📊 Signal Distribution: ${longSignals} Long, ${shortSignals} Short`);
    } else {
        console.log('\n❌ No EMA signals generated.');
        console.log('This indicates an issue with the EMA signal logic.');
    }
    
    return result;
}

// Run the test
testEMAStrategy().catch(console.error); 