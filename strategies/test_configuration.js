const ScalpingStrategy = require('./Scalping_Strategy');

console.log('=== Testing Scalping Strategy Configuration ===\n');

console.log('TEST 1: Default configuration');
const defaultConfig = {
    useRSI: true,
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
    useEMA: true,
    fastEMA: 9,
    slowEMA: 21,
    useMACD: false,
    useBollingerBands: false,
    primarySignalIndicator: 'rsi',
    confirmationLogic: 'any',
    profitTarget: 0.5,
    stopLoss: 0.3
};

const strategy1 = new ScalpingStrategy(defaultConfig);
console.log('RSI enabled:', strategy1.indicators.rsi.enabled);
console.log('RSI period:', strategy1.indicators.rsi.period);
console.log('EMA enabled:', strategy1.indicators.ema.enabled);
console.log('MACD enabled:', strategy1.indicators.macd.enabled);
console.log('Primary indicator:', strategy1.signalRules.primarySignalIndicator);
console.log('');

console.log('TEST 2: Only MACD enabled');
const macdConfig = {
    useRSI: false,
    useEMA: false,
    useMACD: true,
    macdFastPeriod: 12,
    macdSlowPeriod: 26,
    macdSignalPeriod: 9,
    useBollingerBands: false,
    primarySignalIndicator: 'macd',
    confirmationLogic: 'any',
    profitTarget: 1.0,
    stopLoss: 0.5
};

const strategy2 = new ScalpingStrategy(macdConfig);
console.log('RSI enabled:', strategy2.indicators.rsi.enabled);
console.log('EMA enabled:', strategy2.indicators.ema.enabled);
console.log('MACD enabled:', strategy2.indicators.macd.enabled);
console.log('MACD fast period:', strategy2.indicators.macd.fastPeriod);
console.log('Primary indicator:', strategy2.signalRules.primarySignalIndicator);
console.log('');

console.log('TEST 3: Custom RSI settings');
const customRsiConfig = {
    useRSI: true,
    rsiPeriod: 21,
    rsiOversold: 20,
    rsiOverbought: 80,
    useEMA: false,
    useMACD: false,
    useBollingerBands: false,
    primarySignalIndicator: 'rsi',
    rsiExtremesOnly: true,
    confirmationLogic: 'all',
    profitTarget: 2.0,
    stopLoss: 1.0
};

const strategy3 = new ScalpingStrategy(customRsiConfig);
console.log('RSI enabled:', strategy3.indicators.rsi.enabled);
console.log('RSI period:', strategy3.indicators.rsi.period);
console.log('RSI oversold:', strategy3.indicators.rsi.oversold);
console.log('RSI overbought:', strategy3.indicators.rsi.overbought);
console.log('RSI extremes only:', strategy3.signalRules.rsiExtremesOnly);
console.log('Confirmation logic:', strategy3.signalRules.confirmationLogic);
console.log('Profit target:', strategy3.profitTarget);
console.log('Stop loss:', strategy3.stopLoss);
console.log('');

console.log('=== Configuration Tests Complete ===');

console.log('\n=== Testing with Sample Data ===');

const sampleCandles = [];
const basePrice = 50000;
for (let i = 0; i < 100; i++) {
    const randomChange = (Math.random() - 0.5) * 1000;
    const price = basePrice + randomChange;
    sampleCandles.push({
        timestamp: Date.now() + (i * 60000),
        open: price - 50,
        high: price + 100,
        low: price - 100,
        close: price,
        volume: Math.random() * 1000
    });
}

console.log('Testing analysis with custom RSI config...');
const result = strategy3.analyze(sampleCandles);
console.log('Analysis result:', result.success);
console.log('Signals generated:', result.signals?.length || 0);

if (result.signals && result.signals.length > 0) {
    console.log('First signal details:', {
        type: result.signals[0].type,
        entry_price: result.signals[0].entry_price,
        tp: result.signals[0].tp,
        sl: result.signals[0].sl
    });
} 