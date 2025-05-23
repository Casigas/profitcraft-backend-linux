/**
 * Test Scalping Strategy
 * 
 * This file demonstrates how to use the ScalpingStrategyHandler to:
 * 1. Initialize the strategy with configuration
 * 2. Analyze candle data
 * 3. Run a backtest
 */

const ScalpingStrategyHandler = require('./ScalpingStrategyHandler');

// Sample candle data (replace with real data in production)
const generateSampleData = (count = 200) => {
    const data = [];
    let price = 30000; // Starting price
    const now = Date.now();
    const interval = 60000; // 1 minute in milliseconds
    
    for (let i = 0; i < count; i++) {
        const timestamp = now - (count - i) * interval;
        const change = (Math.random() - 0.48) * 50; // Slightly biased upward
        price += change;
        
        const open = price;
        const high = price + Math.random() * 20;
        const low = price - Math.random() * 20;
        const close = price + (Math.random() - 0.5) * 15;
        const volume = 10000 + Math.random() * 50000;
        
        data.push({
            timestamp,
            open,
            high,
            low,
            close,
            volume
        });
    }
    
    return data;
};

// Example strategy configuration from ScalpingStrategyScreen
const strategyConfig = {
    // Basic Settings
    timeframe: '1m',
    entryType: 'market',
    tradingPair: 'BTC/USDT',
    
    // Risk Management
    profitTarget: '0.5',
    stopLoss: '0.3',
    riskPerTrade: '1',
    maxOpenTrades: '2',
    useTrailingStop: false,
    trailingStopDistance: '0.2',
    
    // Technical Indicators
    useRSI: true,
    rsiPeriod: '14',
    rsiOverbought: '70',
    rsiOversold: '30',
    
    useStochRSI: false,
    stochRSIPeriod: '14',
    stochRSIKPeriod: '3',
    stochRSIDPeriod: '3',
    
    useMACD: true,
    macdFastPeriod: '12',
    macdSlowPeriod: '26',
    macdSignalPeriod: '9',
    useMACDHistogram: true,
    
    useBollingerBands: true,
    bbPeriod: '20',
    bbDeviation: '2',
    
    useEMA: true,
    fastEMA: '9',
    slowEMA: '21',
    
    useVWAP: false,
    vwapPeriod: '14',
    
    useSupertrend: false,
    supertrendPeriod: '10',
    supertrendMultiplier: '3',
    
    // Entry Conditions
    priceAction: 'breakout',
    minimumVolume: '1000',
    spreadLimit: '0.1'
};

// Run test with sample data
const runTest = () => {
    try {
        console.log('Initializing Scalping Strategy Handler...');
        const handler = new ScalpingStrategyHandler();
        
        // Initialize the strategy
        const initResult = handler.initialize(strategyConfig);
        if (!initResult.success) {
            console.error('Failed to initialize strategy:', initResult.message);
            return;
        }
        
        console.log('Strategy initialized successfully');
        
        // Generate sample data
        console.log('Generating sample data...');
        const sampleData = generateSampleData(500);
        
        // Analyze the data
        console.log('Analyzing data for signals...');
        const analysisResult = handler.analyze(sampleData);
        
        if (!analysisResult.success) {
            console.error('Analysis failed:', analysisResult.message);
            return;
        }
        
        // Display analysis results
        console.log(`Analysis complete. Found ${analysisResult.signals.length} signals.`);
        
        if (analysisResult.signals.length > 0) {
            console.log('\nSample Signals:');
            
            // Display first 5 signals
            analysisResult.signals.slice(0, 5).forEach((signal, index) => {
                const date = new Date(signal.timestamp).toLocaleString();
                console.log(`\nSignal ${index + 1} (${date}):`);
                console.log(`  Type: ${signal.type}`);
                console.log(`  Entry Price: ${signal.entry_price.toFixed(2)}`);
                console.log(`  Take Profit: ${signal.tp.toFixed(2)}`);
                console.log(`  Stop Loss: ${signal.sl.toFixed(2)}`);
                console.log('  Indicators:');
                
                if (signal.indicators.bullish.length > 0) {
                    console.log('    Bullish:', signal.indicators.bullish.join(', '));
                }
                
                if (signal.indicators.bearish.length > 0) {
                    console.log('    Bearish:', signal.indicators.bearish.join(', '));
                }
            });
        }
        
        // Run backtest with the same data
        console.log('\nRunning backtest...');
        const backtestConfig = {
            initialCapital: 10000,
            includeFees: true,
            feePercentage: 0.1
        };
        
        const backtestResult = handler.backtest(sampleData, backtestConfig);
        
        if (!backtestResult.success) {
            console.error('Backtest failed:', backtestResult.message);
            return;
        }
        
        // Display backtest results
        const results = backtestResult.results;
        console.log('\nBacktest Results:');
        console.log(`  Initial Capital: $${results.initialCapital.toFixed(2)}`);
        console.log(`  Final Equity: $${results.finalEquity.toFixed(2)}`);
        console.log(`  Total Return: ${results.totalReturn.toFixed(2)}%`);
        console.log(`  Total Trades: ${results.totalTrades}`);
        console.log(`  Win Rate: ${results.winRate.toFixed(2)}%`);
        console.log(`  Profit Factor: ${results.profitFactor.toFixed(2)}`);
        console.log(`  Net Profit: $${results.netProfit.toFixed(2)}`);
        
        console.log('\nTest completed successfully!');
    } catch (error) {
        console.error('Error during test:', error);
    }
};

// Run the test
runTest(); 