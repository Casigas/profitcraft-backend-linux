const technicalIndicators = require('technicalindicators');

class ScalpingStrategy {
    constructor(config) {
        // Core settings
        this.timeframe = config.timeframe || '1m';
        this.entryType = config.entryType || 'market';
        this.tradingPair = config.tradingPair || 'BTC/USDT';
        
        // Risk management
        this.profitTarget = parseFloat(config.profitTarget) || 0.5;
        this.stopLoss = parseFloat(config.stopLoss) || 0.3;
        this.riskPerTrade = parseFloat(config.riskPerTrade) || 1;
        this.maxOpenTrades = parseInt(config.maxOpenTrades) || 2;
        this.useTrailingStop = config.useTrailingStop || false;
        this.trailingStopDistance = parseFloat(config.trailingStopDistance) || 0.2;
        
        // Technical indicators configuration
        this.indicators = {
            rsi: {
                enabled: config.useRSI || true,
                period: parseInt(config.rsiPeriod) || 14,
                overbought: parseInt(config.rsiOverbought) || 70,
                oversold: parseInt(config.rsiOversold) || 30
            },
            stochRsi: {
                enabled: config.useStochRSI || false,
                rsiPeriod: parseInt(config.stochRSIPeriod) || 14,
                kPeriod: parseInt(config.stochRSIKPeriod) || 3,
                dPeriod: parseInt(config.stochRSIDPeriod) || 3
            },
            macd: {
                enabled: config.useMACD || false,
                fastPeriod: parseInt(config.macdFastPeriod) || 12,
                slowPeriod: parseInt(config.macdSlowPeriod) || 26,
                signalPeriod: parseInt(config.macdSignalPeriod) || 9,
                useHistogram: config.useMACDHistogram || false
            },
            bollingerBands: {
                enabled: config.useBollingerBands || true,
                period: parseInt(config.bbPeriod) || 20,
                stdDev: parseFloat(config.bbDeviation) || 2
            },
            ema: {
                enabled: config.useEMA || true,
                fastPeriod: parseInt(config.fastEMA) || 9,
                slowPeriod: parseInt(config.slowEMA) || 21
            },
            vwap: {
                enabled: config.useVWAP || false,
                period: parseInt(config.vwapPeriod) || 14
            },
            supertrend: {
                enabled: config.useSupertrend || false,
                period: parseInt(config.supertrendPeriod) || 10,
                multiplier: parseFloat(config.supertrendMultiplier) || 3
            },
            atr: {
                enabled: config.useATR || false,
                period: parseInt(config.atrPeriod) || 14
            },
            choppinessIndex: {
                enabled: config.useChoppinessIndex || false,
                period: parseInt(config.choppinessPeriod) || 14
            },
            parabolicSar: {
                enabled: config.useParabolicSAR || false,
                step: parseFloat(config.sarStep) || 0.02,
                maxStep: parseFloat(config.sarMaxStep) || 0.2
            },
            donchianChannel: {
                enabled: config.useDonchianChannel || false,
                period: parseInt(config.donchianPeriod) || 20
            },
            pivotPoints: {
                enabled: config.usePivotPoints || false,
                type: config.pivotPointsType || 'standard'
            },
            heikinAshi: {
                enabled: config.useHeikinAshi || false
            },
            volume: {
                enabled: config.useVolume || true,
                multiplier: parseFloat(config.volumeMultiplier) || 1.5
            }
        };
        
        // Entry conditions
        this.entryConditions = {
            priceAction: config.priceAction || 'breakout',
            minimumVolume: parseInt(config.minimumVolume) || 1000,
            spreadLimit: parseFloat(config.spreadLimit) || 0.1
        };
        
        // State tracking
        this.positions = [];
        this.signals = [];
        this.lastCandle = null;
    }
    
    // Main strategy analysis function
    analyze(candleData) {
        if (!candleData || candleData.length < 50) {
            console.error('Insufficient data for analysis, minimum 50 candles required');
            return { success: false, message: 'Insufficient data for analysis' };
        }
        
        try {
            // Calculate all enabled indicators
            const indicators = this.calculateIndicators(candleData);
            
            // Generate signals
            const signals = this.generateSignals(candleData, indicators);
            
            return {
                success: true,
                signals: signals,
                indicators: indicators
            };
        } 
        catch (error) {
            console.error('Error analyzing candle data:', error);
            return {
                success: false,
                message: `Analysis error: ${error.message}`
            };
        }
    }
    
    // Calculate all enabled indicators
    calculateIndicators(candleData) {
        const results = {};
        const closes = candleData.map(candle => candle.close);
        const highs = candleData.map(candle => candle.high);
        const lows = candleData.map(candle => candle.low);
        const opens = candleData.map(candle => candle.open);
        const volumes = candleData.map(candle => candle.volume);
        
        // RSI
        if (this.indicators.rsi.enabled) {
            const rsiInput = {
                values: closes,
                period: this.indicators.rsi.period
            };
            results.rsi = technicalIndicators.RSI.calculate(rsiInput);
        }
        
        // Stochastic RSI
        if (this.indicators.stochRsi.enabled) {
            const stochRsiInput = {
                values: closes,
                rsiPeriod: this.indicators.stochRsi.rsiPeriod,
                stochasticPeriod: this.indicators.stochRsi.kPeriod,
                kPeriod: this.indicators.stochRsi.kPeriod,
                dPeriod: this.indicators.stochRsi.dPeriod
            };
            results.stochRsi = technicalIndicators.StochasticRSI.calculate(stochRsiInput);
        }
        
        // MACD
        if (this.indicators.macd.enabled) {
            const macdInput = {
                values: closes,
                fastPeriod: this.indicators.macd.fastPeriod,
                slowPeriod: this.indicators.macd.slowPeriod,
                signalPeriod: this.indicators.macd.signalPeriod,
                SimpleMAOscillator: false,
                SimpleMASignal: false
            };
            results.macd = technicalIndicators.MACD.calculate(macdInput);
        }
        
        // Bollinger Bands
        if (this.indicators.bollingerBands.enabled) {
            const bbInput = {
                values: closes,
                period: this.indicators.bollingerBands.period,
                stdDev: this.indicators.bollingerBands.stdDev
            };
            results.bollingerBands = technicalIndicators.BollingerBands.calculate(bbInput);
        }
        
        // EMA (Fast & Slow)
        if (this.indicators.ema.enabled) {
            const fastEmaInput = {
                values: closes,
                period: this.indicators.ema.fastPeriod
            };
            results.fastEma = technicalIndicators.EMA.calculate(fastEmaInput);
            
            const slowEmaInput = {
                values: closes,
                period: this.indicators.ema.slowPeriod
            };
            results.slowEma = technicalIndicators.EMA.calculate(slowEmaInput);
        }
        
        // ATR
        if (this.indicators.atr.enabled) {
            const atrInput = {
                high: highs,
                low: lows,
                close: closes,
                period: this.indicators.atr.period
            };
            results.atr = technicalIndicators.ATR.calculate(atrInput);
        }

        // Implement other indicators in a similar pattern...
        
        return results;
    }
    
    // Generate signals based on indicators and candle data
    generateSignals(candleData, indicators) {
        const signals = [];
        
        // Start from the 50th candle to ensure we have enough data for all indicators
        for (let i = 50; i < candleData.length; i++) {
            const candle = candleData[i];
            const signal = this.checkForSignal(candle, candleData.slice(0, i+1), indicators, i);
            
            if (signal) {
                signals.push({
                    timestamp: candle.timestamp,
                    type: signal.type,
                    entry_price: signal.entryPrice,
                    tp: signal.takeProfit,
                    sl: signal.stopLoss,
                    indicators: signal.indicators,
                    candle_index: i
                });
            }
        }
        
        return signals;
    }
    
    // Check for a signal on a specific candle
    checkForSignal(currentCandle, historicalCandles, indicators, currentIndex) {
        // Minimum index required for all indicators to have data
        const indicatorOffset = Math.max(
            this.indicators.rsi.enabled ? this.indicators.rsi.period : 0,
            this.indicators.ema.enabled ? this.indicators.ema.slowPeriod : 0,
            this.indicators.bollingerBands.enabled ? this.indicators.bollingerBands.period : 0,
            this.indicators.macd.enabled ? this.indicators.macd.slowPeriod + this.indicators.macd.signalPeriod : 0
        );
        
        if (currentIndex < indicatorOffset) {
            return null;
        }
        
        // Adjust index for the indicators arrays which are shorter than the candle data
        const idx = indicators.rsi ? indicators.rsi.length - (historicalCandles.length - currentIndex) : 0;
        
        if (idx < 0) return null;
        
        // Check volume requirement
        if (this.indicators.volume.enabled && 
            currentCandle.volume < this.entryConditions.minimumVolume) {
            return null;
        }
        
        // Now check for signals based on selected indicators
        const bullishSignals = [];
        const bearishSignals = [];
        
        // Check RSI
        if (this.indicators.rsi.enabled && indicators.rsi && indicators.rsi[idx]) {
            const rsiValue = indicators.rsi[idx];
            if (rsiValue < this.indicators.rsi.oversold) {
                bullishSignals.push('RSI oversold');
            } else if (rsiValue > this.indicators.rsi.overbought) {
                bearishSignals.push('RSI overbought');
            }
        }
        
        // Check Stochastic RSI
        if (this.indicators.stochRsi.enabled && indicators.stochRsi && indicators.stochRsi[idx]) {
            const stochK = indicators.stochRsi[idx].k;
            const stochD = indicators.stochRsi[idx].d;
            
            if (stochK < 20 && stochD < 20 && stochK > stochD) {
                bullishSignals.push('StochRSI bullish crossover in oversold');
            } else if (stochK > 80 && stochD > 80 && stochK < stochD) {
                bearishSignals.push('StochRSI bearish crossover in overbought');
            }
        }
        
        // Check MACD
        if (this.indicators.macd.enabled && indicators.macd && indicators.macd[idx]) {
            const macdValue = indicators.macd[idx];
            
            if (macdValue.MACD > macdValue.signal && 
                (indicators.macd[idx-1] && indicators.macd[idx-1].MACD <= indicators.macd[idx-1].signal)) {
                bullishSignals.push('MACD bullish crossover');
            } else if (macdValue.MACD < macdValue.signal && 
                      (indicators.macd[idx-1] && indicators.macd[idx-1].MACD >= indicators.macd[idx-1].signal)) {
                bearishSignals.push('MACD bearish crossover');
            }
            
            if (this.indicators.macd.useHistogram) {
                if (macdValue.histogram > 0 && 
                    (indicators.macd[idx-1] && indicators.macd[idx-1].histogram <= 0)) {
                    bullishSignals.push('MACD histogram turned positive');
                } else if (macdValue.histogram < 0 && 
                          (indicators.macd[idx-1] && indicators.macd[idx-1].histogram >= 0)) {
                    bearishSignals.push('MACD histogram turned negative');
                }
            }
        }
        
        // Check Bollinger Bands
        if (this.indicators.bollingerBands.enabled && indicators.bollingerBands && indicators.bollingerBands[idx]) {
            const bb = indicators.bollingerBands[idx];
            
            if (currentCandle.close < bb.lower) {
                bullishSignals.push('Price below lower Bollinger Band');
            } else if (currentCandle.close > bb.upper) {
                bearishSignals.push('Price above upper Bollinger Band');
            }
        }
        
        // Check EMA crossover
        if (this.indicators.ema.enabled && indicators.fastEma && indicators.slowEma && 
            indicators.fastEma[idx] && indicators.slowEma[idx]) {
            
            const fastEma = indicators.fastEma[idx];
            const slowEma = indicators.slowEma[idx];
            
            if (fastEma > slowEma && 
                (indicators.fastEma[idx-1] && indicators.slowEma[idx-1] && 
                 indicators.fastEma[idx-1] <= indicators.slowEma[idx-1])) {
                bullishSignals.push('Fast EMA crossed above slow EMA');
            } else if (fastEma < slowEma && 
                      (indicators.fastEma[idx-1] && indicators.slowEma[idx-1] && 
                       indicators.fastEma[idx-1] >= indicators.slowEma[idx-1])) {
                bearishSignals.push('Fast EMA crossed below slow EMA');
            }
        }
        
        // Determine final signal based on entry conditions and combined indicators
        let signalType = null;
        let entryPrice = null;
        let takeProfit = null;
        let stopLoss = null;
        
        // A minimum number of confirming signals required (can be adjusted)
        const minConfirmingSignals = 2;
        
        if (bullishSignals.length >= minConfirmingSignals && bearishSignals.length === 0) {
            signalType = 'long';
            entryPrice = currentCandle.close;
            takeProfit = entryPrice * (1 + this.profitTarget / 100);
            stopLoss = entryPrice * (1 - this.stopLoss / 100);
        } else if (bearishSignals.length >= minConfirmingSignals && bullishSignals.length === 0) {
            signalType = 'short';
            entryPrice = currentCandle.close;
            takeProfit = entryPrice * (1 - this.profitTarget / 100);
            stopLoss = entryPrice * (1 + this.stopLoss / 100);
        }
        
        if (signalType) {
            return {
                type: signalType,
                entryPrice: entryPrice,
                takeProfit: takeProfit,
                stopLoss: stopLoss,
                indicators: {
                    bullish: bullishSignals,
                    bearish: bearishSignals
                }
            };
        }
        
        return null;
    }
}

module.exports = ScalpingStrategy; 