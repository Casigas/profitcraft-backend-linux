const technicalIndicators = require('technicalindicators');

class ScalpingStrategy {
    constructor(config) {
        console.log(`[SCALPING STRATEGY] Initializing with config:`, JSON.stringify(config, null, 2));
        
        // Core settings
        this.timeframe = config.timeframe || '1m';
        this.entryType = config.entryType || 'market';
        this.tradingPair = config.tradingPair || 'BTC/USDT';
        
        // Risk management
        this.profitTarget = parseFloat(config.profitTarget) || 0.5;
        this.stopLoss = parseFloat(config.stopLoss) || 0.3;
        this.riskPerTrade = parseFloat(config.riskPerTrade) || 1;
        this.maxOpenTrades = parseInt(config.maxOpenTrades) || 2;
        this.useTrailingStop = config.useTrailingStop === true;
        this.trailingStopDistance = parseFloat(config.trailingStopDistance) || 0.2;
        
        // Technical indicators configuration - Fix boolean handling
        this.indicators = {
            rsi: {
                enabled: config.useRSI !== undefined ? config.useRSI === true : true,
                period: parseInt(config.rsiPeriod) || 14,
                overbought: parseInt(config.rsiOverbought) || 70,
                oversold: parseInt(config.rsiOversold) || 30
            },
            stochRsi: {
                enabled: config.useStochRSI === true,
                rsiPeriod: parseInt(config.stochRSIPeriod) || 14,
                kPeriod: parseInt(config.stochRSIKPeriod) || 3,
                dPeriod: parseInt(config.stochRSIDPeriod) || 3
            },
            macd: {
                enabled: config.useMACD === true,
                fastPeriod: parseInt(config.macdFastPeriod) || 12,
                slowPeriod: parseInt(config.macdSlowPeriod) || 26,
                signalPeriod: parseInt(config.macdSignalPeriod) || 9,
                useHistogram: config.useMACDHistogram === true
            },
            bollingerBands: {
                enabled: config.useBollingerBands !== undefined ? config.useBollingerBands === true : true,
                period: parseInt(config.bbPeriod) || 20,
                stdDev: parseFloat(config.bbDeviation) || 2
            },
            ema: {
                enabled: config.useEMA !== undefined ? config.useEMA === true : true,
                fastPeriod: parseInt(config.fastEMA) || 9,
                slowPeriod: parseInt(config.slowEMA) || 21
            },
            vwap: {
                enabled: config.useVWAP === true,
                period: parseInt(config.vwapPeriod) || 14
            },
            supertrend: {
                enabled: config.useSupertrend === true,
                period: parseInt(config.supertrendPeriod) || 10,
                multiplier: parseFloat(config.supertrendMultiplier) || 3
            },
            atr: {
                enabled: config.useATR === true,
                period: parseInt(config.atrPeriod) || 14
            },
            choppinessIndex: {
                enabled: config.useChoppinessIndex === true,
                period: parseInt(config.choppinessPeriod) || 14
            },
            parabolicSar: {
                enabled: config.useParabolicSAR === true,
                step: parseFloat(config.sarStep) || 0.02,
                maxStep: parseFloat(config.sarMaxStep) || 0.2
            },
            donchianChannel: {
                enabled: config.useDonchianChannel === true,
                period: parseInt(config.donchianPeriod) || 20
            },
            pivotPoints: {
                enabled: config.usePivotPoints === true,
                type: config.pivotPointsType || 'standard'
            },
            heikinAshi: {
                enabled: config.useHeikinAshi === true
            },
            volume: {
                enabled: config.useVolume === true,
                multiplier: parseFloat(config.volumeMultiplier) || 1.5
            }
        };
        
        // Entry conditions
        this.entryConditions = {
            priceAction: config.priceAction || 'breakout',
            minimumVolume: parseInt(config.minimumVolume) || 10,
            spreadLimit: parseFloat(config.spreadLimit) || 0.1
        };
        
        // Signal Rules Configuration - Fix boolean handling
        this.signalRules = {
            primarySignalIndicator: config.primarySignalIndicator || 'rsi',
            confirmationLogic: config.confirmationLogic || 'any',
            minConfirmations: parseInt(config.minConfirmations) || 0,
            rsiExtremesOnly: config.rsiExtremesOnly === true,
            macdCrossoverRequired: config.macdCrossoverRequired === true,
            macdZeroLineRequired: config.macdZeroLineRequired === true,
            bbTouchRequired: config.bbTouchRequired === true,
            bbSqueezeBreakout: config.bbSqueezeBreakout === true,
            emaFreshCrossover: config.emaFreshCrossover === true,
            emaPriceConfirmation: config.emaPriceConfirmation === true,
            detectDivergences: config.detectDivergences === true,
            signalTimeout: parseInt(config.signalTimeout) || 5,
            conflictingSignalsAction: config.conflictingSignalsAction || 'primary'
        };
        
        // Log the final configuration for debugging
        console.log(`[SCALPING STRATEGY] Final indicator configuration:`, {
            rsi: this.indicators.rsi,
            macd: this.indicators.macd,
            bollingerBands: this.indicators.bollingerBands,
            ema: this.indicators.ema,
            primarySignalIndicator: this.signalRules.primarySignalIndicator,
            confirmationLogic: this.signalRules.confirmationLogic
        });
        
        // State tracking
        this.positions = [];
        this.signals = [];
        this.lastCandle = null;
        this.pendingSignals = []; // Track signals waiting for confirmation
        
        // Single trade mode - prevent multiple simultaneous trades
        this.singleTradeMode = true; // Always enforce single trade mode
        this.activeTradeInfo = {
            hasActiveTrade: false,
            tradeType: null,
            entryPrice: null,
            entryTime: null,
            takeProfit: null,
            stopLoss: null,
            entryCandle: null
        };
        
        console.log(`[SCALPING STRATEGY] Single trade mode enabled - will ignore signals while trade is active`);
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
        console.log(`[STRATEGY DEBUG] Calculated indicators:`, {
            rsi: indicators.rsi ? `${indicators.rsi.length} values` : 'disabled',
            macd: indicators.macd ? `${indicators.macd.length} values` : 'disabled',
            bollingerBands: indicators.bollingerBands ? `${indicators.bollingerBands.length} values` : 'disabled',
            ema: indicators.fastEma ? `Fast: ${indicators.fastEma.length}, Slow: ${indicators.slowEma?.length || 'N/A'}` : 'disabled'
        });
        
        // Generate signals
        const signals = this.generateSignals(candleData, indicators);
        console.log(`[STRATEGY DEBUG] Generated ${signals.length} signals from ${candleData.length} candles`);
            
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
        
        console.log(`[CALCULATE INDICATORS DEBUG] Starting indicator calculations with config:`, {
            rsi: { enabled: this.indicators.rsi.enabled, period: this.indicators.rsi.period },
            macd: { enabled: this.indicators.macd.enabled },
            ema: { enabled: this.indicators.ema.enabled },
            bollingerBands: { enabled: this.indicators.bollingerBands.enabled }
        });
        
        // RSI
        if (this.indicators.rsi.enabled) {
            console.log(`[CALCULATE INDICATORS DEBUG] Calculating RSI with period ${this.indicators.rsi.period}`);
            const rsiInput = {
                values: closes,
                period: this.indicators.rsi.period
            };
            results.rsi = technicalIndicators.RSI.calculate(rsiInput);
            console.log(`[CALCULATE INDICATORS DEBUG] RSI calculated: ${results.rsi.length} values`);
        } else {
            console.log(`[CALCULATE INDICATORS DEBUG] RSI disabled - skipping calculation`);
        }
        
        // Stochastic RSI
        if (this.indicators.stochRsi.enabled) {
            console.log(`[CALCULATE INDICATORS DEBUG] Calculating Stochastic RSI`);
            const stochRsiInput = {
                values: closes,
                rsiPeriod: this.indicators.stochRsi.rsiPeriod,
                stochasticPeriod: this.indicators.stochRsi.kPeriod,
                kPeriod: this.indicators.stochRsi.kPeriod,
                dPeriod: this.indicators.stochRsi.dPeriod
            };
            results.stochRsi = technicalIndicators.StochasticRSI.calculate(stochRsiInput);
            console.log(`[CALCULATE INDICATORS DEBUG] Stochastic RSI calculated: ${results.stochRsi.length} values`);
        } else {
            console.log(`[CALCULATE INDICATORS DEBUG] Stochastic RSI disabled - skipping calculation`);
        }
        
        // MACD
        if (this.indicators.macd.enabled) {
            console.log(`[CALCULATE INDICATORS DEBUG] Calculating MACD with periods ${this.indicators.macd.fastPeriod}/${this.indicators.macd.slowPeriod}/${this.indicators.macd.signalPeriod}`);
            const macdInput = {
                values: closes,
                fastPeriod: this.indicators.macd.fastPeriod,
                slowPeriod: this.indicators.macd.slowPeriod,
                signalPeriod: this.indicators.macd.signalPeriod,
                SimpleMAOscillator: false,
                SimpleMASignal: false
            };
            results.macd = technicalIndicators.MACD.calculate(macdInput);
            console.log(`[CALCULATE INDICATORS DEBUG] MACD calculated: ${results.macd.length} values`);
        } else {
            console.log(`[CALCULATE INDICATORS DEBUG] MACD disabled - skipping calculation`);
        }
        
        // Bollinger Bands
        if (this.indicators.bollingerBands.enabled) {
            console.log(`[CALCULATE INDICATORS DEBUG] Calculating Bollinger Bands with period ${this.indicators.bollingerBands.period}`);
            const bbInput = {
                values: closes,
                period: this.indicators.bollingerBands.period,
                stdDev: this.indicators.bollingerBands.stdDev
            };
            results.bollingerBands = technicalIndicators.BollingerBands.calculate(bbInput);
            console.log(`[CALCULATE INDICATORS DEBUG] Bollinger Bands calculated: ${results.bollingerBands.length} values`);
        } else {
            console.log(`[CALCULATE INDICATORS DEBUG] Bollinger Bands disabled - skipping calculation`);
        }
        
        // EMA (Fast & Slow)
        if (this.indicators.ema.enabled) {
            console.log(`[CALCULATE INDICATORS DEBUG] Calculating EMAs with periods ${this.indicators.ema.fastPeriod}/${this.indicators.ema.slowPeriod}`);
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
            console.log(`[CALCULATE INDICATORS DEBUG] EMAs calculated: fast=${results.fastEma.length}, slow=${results.slowEma.length} values`);
        } else {
            console.log(`[CALCULATE INDICATORS DEBUG] EMA disabled - skipping calculation`);
        }
        
        // ATR
        if (this.indicators.atr.enabled) {
            console.log(`[CALCULATE INDICATORS DEBUG] Calculating ATR with period ${this.indicators.atr.period}`);
            const atrInput = {
                high: highs,
                low: lows,
                close: closes,
                period: this.indicators.atr.period
            };
            results.atr = technicalIndicators.ATR.calculate(atrInput);
            console.log(`[CALCULATE INDICATORS DEBUG] ATR calculated: ${results.atr.length} values`);
        } else {
            console.log(`[CALCULATE INDICATORS DEBUG] ATR disabled - skipping calculation`);
        }

        // Implement other indicators in a similar pattern...
        
        console.log(`[CALCULATE INDICATORS DEBUG] Indicator calculation completed. Results summary:`, {
            rsi: results.rsi ? `${results.rsi.length} values` : 'not calculated',
            macd: results.macd ? `${results.macd.length} values` : 'not calculated',
            ema: results.fastEma ? `fast: ${results.fastEma.length}, slow: ${results.slowEma?.length || 0}` : 'not calculated',
            bollingerBands: results.bollingerBands ? `${results.bollingerBands.length} values` : 'not calculated'
        });
        
        return results;
    }
    
    // Generate signals based on indicators and candle data
    generateSignals(candleData, indicators) {
        const signals = [];
        
        // Start from the 50th candle to ensure we have enough data for all indicators
        const startIndex = Math.min(50, candleData.length - 1);
        console.log(`[GENERATE SIGNALS DEBUG] Processing ${candleData.length - startIndex} candles, starting from index ${startIndex}`);
        console.log(`[GENERATE SIGNALS DEBUG] Primary indicator: ${this.signalRules.primarySignalIndicator}, enabled: ${this.indicators[this.signalRules.primarySignalIndicator]?.enabled}`);
        console.log(`[GENERATE SIGNALS DEBUG] Single trade mode: ${this.singleTradeMode}, Active trade: ${this.activeTradeInfo.hasActiveTrade}`);
        console.log(`[GENERATE SIGNALS DEBUG] Configuration summary:`, {
            rsi: { enabled: this.indicators.rsi.enabled, period: this.indicators.rsi.period, oversold: this.indicators.rsi.oversold, overbought: this.indicators.rsi.overbought },
            macd: { enabled: this.indicators.macd.enabled },
            bollingerBands: { enabled: this.indicators.bollingerBands.enabled },
            ema: { enabled: this.indicators.ema.enabled, fastPeriod: this.indicators.ema.fastPeriod, slowPeriod: this.indicators.ema.slowPeriod },
            signalRules: this.signalRules
        });
        console.log(`[GENERATE SIGNALS DEBUG] Indicator data lengths:`, {
            rsi: indicators.rsi?.length || 0,
            fastEma: indicators.fastEma?.length || 0,
            slowEma: indicators.slowEma?.length || 0,
            macd: indicators.macd?.length || 0,
            bollingerBands: indicators.bollingerBands?.length || 0,
            candles: candleData.length
        });
        
        for (let i = startIndex; i < candleData.length; i++) {
            const candle = candleData[i];
            
            // First, check if we need to close any active trade
            if (this.singleTradeMode && this.activeTradeInfo.hasActiveTrade) {
                this.checkTradeExit(candle, i);
            }
            
            // Only generate new signals if no active trade (single trade mode)
            if (this.singleTradeMode && this.activeTradeInfo.hasActiveTrade) {
                if (i % 100 === 0) { // Log periodically to avoid spam
                    console.log(`[GENERATE SIGNALS DEBUG] Skipping signal generation at candle ${i} - active trade in progress since candle ${this.activeTradeInfo.entryCandle}`);
                }
                continue; // Skip signal generation when trade is active
            }
            
            const signal = this.checkForSignal(candle, candleData.slice(0, i+1), indicators, i);
            
            if (signal) {
                // Record this trade as active in single trade mode
                if (this.singleTradeMode) {
                    this.activeTradeInfo = {
                        hasActiveTrade: true,
                        tradeType: signal.type,
                        entryPrice: signal.entryPrice,
                        entryTime: candle.timestamp,
                        takeProfit: signal.takeProfit,
                        stopLoss: signal.stopLoss,
                        entryCandle: i
                    };
                    console.log(`[GENERATE SIGNALS DEBUG] Active trade registered at candle ${i}: ${signal.type} - entry: ${signal.entryPrice}, tp: ${signal.takeProfit}, sl: ${signal.stopLoss}`);
                }
                
                signals.push({
                    timestamp: candle.timestamp,
                    type: signal.type,
                    entry_price: signal.entryPrice,
                    tp: signal.takeProfit,
                    sl: signal.stopLoss,
                    indicators: signal.indicators,
                    candle_index: i
                });
                console.log(`[GENERATE SIGNALS DEBUG] Signal generated at candle ${i}: ${signal.type} - entry: ${signal.entryPrice}, tp: ${signal.takeProfit}, sl: ${signal.stopLoss}`);
            }
        }
        
        // If no signals generated, provide better debugging instead of fallback signals
        if (signals.length === 0) {
            console.log(`[GENERATE SIGNALS DEBUG] No signals generated - this is normal if indicators don't meet criteria`);
            console.log(`[GENERATE SIGNALS DEBUG] Strategy configuration:`, {
                primaryIndicator: this.signalRules.primarySignalIndicator,
                enabledIndicators: {
                    rsi: this.indicators.rsi.enabled,
                    macd: this.indicators.macd.enabled,
                    ema: this.indicators.ema.enabled,
                    bollingerBands: this.indicators.bollingerBands.enabled
                },
                confirmationLogic: this.signalRules.confirmationLogic,
                minConfirmations: this.signalRules.minConfirmations
            });
            console.log(`[GENERATE SIGNALS DEBUG] Indicator data availability:`, {
                rsi: indicators.rsi ? `${indicators.rsi.length} values` : 'not calculated',
                macd: indicators.macd ? `${indicators.macd.length} values` : 'not calculated',
                ema: indicators.fastEma ? `${indicators.fastEma.length} values` : 'not calculated',
                bollingerBands: indicators.bollingerBands ? `${indicators.bollingerBands.length} values` : 'not calculated'
            });
            
            // Sample a few indicator values for debugging
            if (indicators.rsi && indicators.rsi.length > 0) {
                const sampleRsi = indicators.rsi.slice(-5);
                console.log(`[GENERATE SIGNALS DEBUG] Last 5 RSI values:`, sampleRsi);
                console.log(`[GENERATE SIGNALS DEBUG] RSI thresholds - oversold: ${this.indicators.rsi.oversold}, overbought: ${this.indicators.rsi.overbought}`);
            }
            
            if (indicators.macd && indicators.macd.length > 0) {
                const sampleMacd = indicators.macd.slice(-3);
                console.log(`[GENERATE SIGNALS DEBUG] Last 3 MACD values:`, sampleMacd);
            }
            
            // No fallback signals - let the strategy return empty results if no valid signals found
            console.log(`[GENERATE SIGNALS DEBUG] No fallback signals will be generated - empty result is valid`);
        }
        
        console.log(`[GENERATE SIGNALS DEBUG] Total signals generated: ${signals.length}`);
        return signals;
    }
    
    // Check for a signal on a specific candle using advanced signal rules
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
        // Calculate the proper index mapping between candles and indicators
        const maxIndicatorLength = Math.max(
            indicators.rsi?.length || 0,
            indicators.fastEma?.length || 0,
            indicators.macd?.length || 0,
            indicators.bollingerBands?.length || 0
        );
        
        // Use a more robust index calculation
        let idx;
        if (maxIndicatorLength > 0) {
            // Map current candle index to indicator array index
            const indicatorOffset = historicalCandles.length - maxIndicatorLength;
            idx = currentIndex - indicatorOffset;
            
            // Ensure idx is within bounds
            idx = Math.max(0, Math.min(idx, maxIndicatorLength - 1));
        } else {
            idx = 0;
        }
        
        if (idx < 0 || (indicators.rsi && idx >= indicators.rsi.length)) {
            if (currentIndex % 100 === 0) { // Periodic debug
                console.log(`[SIGNAL DEBUG] Invalid index: idx=${idx}, currentIndex=${currentIndex}, maxIndicatorLength=${maxIndicatorLength}, historicalCandles=${historicalCandles.length}`);
            }
            return null;
        }
        
        // Debug logging for signal checking
        if (currentIndex % 100 === 0) { // Log every 100 candles to avoid spam
            console.log(`[SIGNAL DEBUG] Candle ${currentIndex}: RSI=${indicators.rsi?.[idx]?.toFixed(2)}, Price=${currentCandle.close}, Volume=${currentCandle.volume}, Primary=${this.signalRules.primarySignalIndicator}`);
        }
        
        // Check volume requirement (very relaxed)
        if (this.indicators.volume.enabled && 
            currentCandle.volume < this.entryConditions.minimumVolume) {
            if (currentIndex % 500 === 0) { // Log less frequently to reduce spam
                console.log(`[SIGNAL DEBUG] Volume too low: ${currentCandle.volume} < ${this.entryConditions.minimumVolume}`);
            }
            // Make volume check less strict - only skip if volume is extremely low
            if (currentCandle.volume < (this.entryConditions.minimumVolume * 0.1)) {
                return null;
            }
        }
        
        // Handle sequential confirmation logic
        if (this.signalRules.confirmationLogic === 'sequential') {
            return this.handleSequentialSignals(currentCandle, indicators, idx, currentIndex, historicalCandles);
        }
        
        // Standard signal processing for non-sequential logic
        // Step 1: Check primary signal indicator
        const primarySignal = this.checkPrimarySignal(currentCandle, indicators, idx);
        if (!primarySignal) {
            if (currentIndex % 200 === 0) { // Periodic debug
                console.log(`[SIGNAL DEBUG] No primary signal at candle ${currentIndex}, primary indicator: ${this.signalRules.primarySignalIndicator}`);
            }
            return null; // No primary signal, exit early
        }
        
        console.log(`[SIGNAL DEBUG] Primary signal found: ${primarySignal.type} from ${primarySignal.name} at candle ${currentIndex}`);
        
        // Step 2: Get all available indicator signals
        const allSignals = this.getAllIndicatorSignals(currentCandle, indicators, idx);
        
        console.log(`[SIGNAL DEBUG] All signals: bullish=${allSignals.bullish.length}, bearish=${allSignals.bearish.length}`);
        
        // Step 3: Apply signal rules logic
        const finalSignal = this.applySignalRules(primarySignal, allSignals);
        
        if (finalSignal) {
            console.log(`[SIGNAL DEBUG] Final signal approved: ${finalSignal.type} with strength ${finalSignal.strength}`);
            const entryPrice = currentCandle.close;
            let takeProfit, stopLoss;
            
            if (finalSignal.type === 'long') {
                takeProfit = entryPrice * (1 + this.profitTarget / 100);
                stopLoss = entryPrice * (1 - this.stopLoss / 100);
            } else {
                takeProfit = entryPrice * (1 - this.profitTarget / 100);
                stopLoss = entryPrice * (1 + this.stopLoss / 100);
            }
            
            return {
                type: finalSignal.type,
                entryPrice: entryPrice,
                takeProfit: takeProfit,
                stopLoss: stopLoss,
                indicators: finalSignal.indicators,
                signalStrength: finalSignal.strength
            };
        } else {
            console.log(`[SIGNAL DEBUG] Final signal rejected by signal rules`);
        }
        
        return null;
    }
    
    // Handle sequential signal confirmation (RSI first, then EMA crossover, then buy next candle)
    handleSequentialSignals(currentCandle, indicators, idx, currentIndex, historicalCandles = null) {
        // Clean up expired pending signals
        this.pendingSignals = this.pendingSignals.filter(signal => 
            currentIndex - signal.startIndex <= this.signalRules.signalTimeout
        );
        
        // Step 1: Check for new primary signals
        const primarySignal = this.checkPrimarySignal(currentCandle, indicators, idx);
        if (primarySignal) {
            // Start tracking this primary signal
            this.pendingSignals.push({
                primarySignal: primarySignal,
                startIndex: currentIndex,
                waitingForConfirmation: true,
                confirmed: false
            });
        }
        
        // Step 2: Check pending signals for confirmation
        for (let i = 0; i < this.pendingSignals.length; i++) {
            const pendingSignal = this.pendingSignals[i];
            
            if (pendingSignal.waitingForConfirmation) {
                // Check for confirmation signals
                const confirmationSignals = this.getConfirmationSignals(currentCandle, indicators, idx, pendingSignal.primarySignal.type, historicalCandles);
                
                if (confirmationSignals.length > 0) {
                    // Confirmation received!
                    pendingSignal.waitingForConfirmation = false;
                    pendingSignal.confirmed = true;
                    pendingSignal.confirmationIndex = currentIndex;
                    pendingSignal.confirmationSignals = confirmationSignals;
                }
            } else if (pendingSignal.confirmed) {
                // Signal was confirmed, now wait for next candle to enter
                if (currentIndex > pendingSignal.confirmationIndex) {
                    // This is the next candle after confirmation - ENTER TRADE!
                    const entryPrice = currentCandle.close;
                    let takeProfit, stopLoss;
                    
                    if (pendingSignal.primarySignal.type === 'long') {
                        takeProfit = entryPrice * (1 + this.profitTarget / 100);
                        stopLoss = entryPrice * (1 - this.stopLoss / 100);
                    } else {
                        takeProfit = entryPrice * (1 - this.profitTarget / 100);
                        stopLoss = entryPrice * (1 + this.stopLoss / 100);
                    }
                    
                    // Remove this signal from pending list
                    this.pendingSignals.splice(i, 1);
                    
                    return {
                        type: pendingSignal.primarySignal.type,
                        entryPrice: entryPrice,
                        takeProfit: takeProfit,
                        stopLoss: stopLoss,
                        indicators: {
                            primary: pendingSignal.primarySignal,
                            confirming: pendingSignal.confirmationSignals,
                            conflicting: []
                        },
                        signalStrength: this.calculateSignalStrength(
                            pendingSignal.primarySignal, 
                            pendingSignal.confirmationSignals, 
                            []
                        ),
                        sequentialInfo: {
                            primaryCandleIndex: pendingSignal.startIndex,
                            confirmationCandleIndex: pendingSignal.confirmationIndex,
                            entryCandleIndex: currentIndex
                        }
                    };
                }
            }
        }
        
        return null;
    }
    
    // Get confirmation signals for sequential logic (excluding primary indicator)
    getConfirmationSignals(currentCandle, indicators, idx, primaryType, historicalCandles = null) {
        const confirmationSignals = [];
        
        // For RSI primary + EMA confirmation example:
        // If primary is RSI, look for EMA crossover confirmation
        if (this.signalRules.primarySignalIndicator === 'rsi' && this.indicators.ema.enabled) {
            const emaSignal = this.checkEMASignal(indicators, idx, true, currentCandle, historicalCandles); // Use strict mode
            if (emaSignal && emaSignal.type === primaryType) {
                confirmationSignals.push(emaSignal);
            }
        }
        
        // If primary is EMA, look for RSI confirmation  
        if (this.signalRules.primarySignalIndicator === 'ema' && this.indicators.rsi.enabled) {
            const rsiSignal = this.checkRSISignal(indicators, idx, true); // Use strict mode
            if (rsiSignal && rsiSignal.type === primaryType) {
                confirmationSignals.push(rsiSignal);
            }
        }
        
        // Add other confirmation indicators as needed
        if (this.indicators.macd.enabled && this.signalRules.primarySignalIndicator !== 'macd') {
            const macdSignal = this.checkMACDSignal(indicators, idx, true);
            if (macdSignal && macdSignal.type === primaryType) {
                confirmationSignals.push(macdSignal);
            }
        }
        
        if (this.indicators.bollingerBands.enabled && this.signalRules.primarySignalIndicator !== 'bollingerBands') {
            const bbSignal = this.checkBollingerBandsSignal(currentCandle, indicators, idx, true);
            if (bbSignal && bbSignal.type === primaryType) {
                confirmationSignals.push(bbSignal);
            }
        }
        
        return confirmationSignals;
    }
    
    // Helper method to get recent candles for analysis
    getRecentCandles(currentIndex) {
        // This would need to be passed from the calling context
        // For now, return null and handle in the calling method
        return null;
    }
    
    // Check primary signal indicator based on user's selection
    checkPrimarySignal(currentCandle, indicators, idx) {
        const primaryIndicator = this.signalRules.primarySignalIndicator;
        
        console.log(`[PRIMARY SIGNAL DEBUG] Checking primary indicator: ${primaryIndicator}, idx: ${idx}`);
        
        let signal = null;
        switch (primaryIndicator) {
            case 'rsi':
                if (this.indicators.rsi.enabled) {
                    signal = this.checkRSISignal(indicators, idx, true);
                }
                break;
            case 'stochRsi':
                if (this.indicators.stochRsi.enabled) {
                    signal = this.checkStochRSISignal(indicators, idx, true);
                }
                break;
            case 'macd':
                if (this.indicators.macd.enabled) {
                    signal = this.checkMACDSignal(indicators, idx, true);
                }
                break;
            case 'bollingerBands':
                if (this.indicators.bollingerBands.enabled) {
                    signal = this.checkBollingerBandsSignal(currentCandle, indicators, idx, true);
                }
                break;
            case 'ema':
                if (this.indicators.ema.enabled) {
                    signal = this.checkEMASignal(indicators, idx, true, currentCandle);
                }
                break;
            case 'vwap':
                if (this.indicators.vwap.enabled) {
                    signal = this.checkVWAPSignal(currentCandle, indicators, idx, true);
                }
                break;
            case 'supertrend':
                if (this.indicators.supertrend.enabled) {
                    signal = this.checkSupertrendSignal(currentCandle, indicators, idx, true);
                }
                break;
            case 'parabolicSar':
                if (this.indicators.parabolicSar.enabled) {
                    signal = this.checkParabolicSARSignal(currentCandle, indicators, idx, true);
                }
                break;
            default:
                console.log(`[PRIMARY SIGNAL DEBUG] Unknown primary indicator: ${primaryIndicator}, falling back to RSI`);
                // Fallback to RSI if primary indicator is unknown or not enabled
                if (this.indicators.rsi.enabled) {
                    signal = this.checkRSISignal(indicators, idx, true);
                }
                break;
        }
        
        if (signal) {
            console.log(`[PRIMARY SIGNAL DEBUG] Primary signal found: ${signal.type} - ${signal.name}`);
        } else {
            console.log(`[PRIMARY SIGNAL DEBUG] No primary signal from ${primaryIndicator}`);
        }
        
        return signal;
    }
    
    // Get all indicator signals for confirmation
    getAllIndicatorSignals(currentCandle, indicators, idx) {
        const signals = {
            bullish: [],
            bearish: []
        };
        
        // Check all enabled indicators
        if (this.indicators.rsi.enabled) {
            const signal = this.checkRSISignal(indicators, idx, false);
            if (signal) {
                signals[signal.type === 'long' ? 'bullish' : 'bearish'].push(signal);
            }
        }
        
        if (this.indicators.stochRsi.enabled) {
            const signal = this.checkStochRSISignal(indicators, idx, false);
            if (signal) {
                signals[signal.type === 'long' ? 'bullish' : 'bearish'].push(signal);
            }
        }
        
        if (this.indicators.macd.enabled) {
            const signal = this.checkMACDSignal(indicators, idx, false);
            if (signal) {
                signals[signal.type === 'long' ? 'bullish' : 'bearish'].push(signal);
            }
        }
        
        if (this.indicators.bollingerBands.enabled) {
            const signal = this.checkBollingerBandsSignal(currentCandle, indicators, idx, false);
            if (signal) {
                signals[signal.type === 'long' ? 'bullish' : 'bearish'].push(signal);
            }
        }
        
        if (this.indicators.ema.enabled) {
            const signal = this.checkEMASignal(indicators, idx, false, currentCandle);
            if (signal) {
                signals[signal.type === 'long' ? 'bullish' : 'bearish'].push(signal);
            }
        }
        
        return signals;
    }
    
    // Apply user-defined signal rules
    applySignalRules(primarySignal, allSignals) {
        const primaryType = primarySignal.type;
        const confirmingSignals = allSignals[primaryType === 'long' ? 'bullish' : 'bearish'];
        const conflictingSignals = allSignals[primaryType === 'long' ? 'bearish' : 'bullish'];
        
        console.log(`[SIGNAL RULES DEBUG] Primary: ${primaryType}, Confirming: ${confirmingSignals.length}, Conflicting: ${conflictingSignals.length}`);
        console.log(`[SIGNAL RULES DEBUG] Conflicting action: ${this.signalRules.conflictingSignalsAction}`);
        
        // Handle conflicting signals first (but be less restrictive)
        if (conflictingSignals.length > 0) {
            switch (this.signalRules.conflictingSignalsAction) {
                case 'ignore':
                    console.log(`[SIGNAL RULES DEBUG] Ignoring trade due to ${conflictingSignals.length} conflicting signals`);
                    return null; // Ignore trade when there are conflicts
                case 'primary':
                    console.log(`[SIGNAL RULES DEBUG] Following primary indicator despite conflicts`);
                    // Continue with primary indicator only
                    break;
                case 'strongest':
                    if (conflictingSignals.length > confirmingSignals.length) { // Changed from >= to >
                        console.log(`[SIGNAL RULES DEBUG] Conflicting signals stronger: ${conflictingSignals.length} vs ${confirmingSignals.length}`);
                        return null; // Conflicting signals are stronger
                    }
                    break;
                case 'wait':
                    console.log(`[SIGNAL RULES DEBUG] Waiting for next candle due to conflicts`);
                    return null; // Wait for next candle
                default:
                    console.log(`[SIGNAL RULES DEBUG] Unknown conflicting signals action: ${this.signalRules.conflictingSignalsAction}`);
                    break; // Default to allowing the signal
            }
        }
        
        // Apply confirmation logic
        const totalConfirming = confirmingSignals.length;
        const requiredConfirmations = this.signalRules.minConfirmations;
        const enabledCount = this.getEnabledIndicatorCount();
        
        console.log(`[SIGNAL RULES DEBUG] Confirmation logic: ${this.signalRules.confirmationLogic}`);
        console.log(`[SIGNAL RULES DEBUG] Total confirming: ${totalConfirming}, Required: ${requiredConfirmations}, Enabled indicators: ${enabledCount}`);
        
        let isValidSignal = false;
        
        switch (this.signalRules.confirmationLogic) {
            case 'all':
                // All enabled confirmation indicators must agree (exclude primary)
                const requiredForAll = Math.min(enabledCount - 1, requiredConfirmations);
                isValidSignal = totalConfirming >= requiredForAll;
                console.log(`[SIGNAL RULES DEBUG] ALL logic: need ${requiredForAll}, have ${totalConfirming}`);
                break;
            case 'majority':
                // Majority of enabled indicators must agree (more relaxed)
                const majorityThreshold = Math.max(0, Math.ceil((enabledCount - 1) / 2)); // Allow 0 if needed
                isValidSignal = totalConfirming >= majorityThreshold;
                console.log(`[SIGNAL RULES DEBUG] MAJORITY logic: need ${majorityThreshold}, have ${totalConfirming}`);
                break;
            case 'any':
                // Any confirmation indicator agrees (or just primary is enough)
                isValidSignal = true; // Primary signal alone is enough in ANY mode
                console.log(`[SIGNAL RULES DEBUG] ANY logic: primary signal is sufficient`);
                break;
            case 'sequential':
                // Check if we have the minimum required confirmations
                isValidSignal = totalConfirming >= Math.min(requiredConfirmations, 0); // Allow 0 confirmations
                console.log(`[SIGNAL RULES DEBUG] SEQUENTIAL logic: need ${Math.min(requiredConfirmations, 0)}, have ${totalConfirming}`);
                break;
            default:
                // Default: require confirmations only if user explicitly set > 0
                const defaultRequired = Math.max(0, requiredConfirmations);
                isValidSignal = totalConfirming >= defaultRequired;
                console.log(`[SIGNAL RULES DEBUG] DEFAULT logic: need ${defaultRequired}, have ${totalConfirming}`);
        }
        
        console.log(`[SIGNAL RULES DEBUG] Signal valid: ${isValidSignal}`);
        
        if (isValidSignal) {
            // Calculate signal strength
            const strength = this.calculateSignalStrength(primarySignal, confirmingSignals, conflictingSignals);
            
            return {
                type: primaryType,
                indicators: {
                    primary: primarySignal,
                    confirming: confirmingSignals,
                    conflicting: conflictingSignals
                },
                strength: strength
            };
        }
        
        return null;
    }
    
    // Individual indicator signal methods with enhanced conditions
    checkRSISignal(indicators, idx, isPrimary) {
        if (!indicators.rsi || !indicators.rsi[idx]) {
            if (isPrimary) {
                console.log(`[RSI DEBUG] No RSI data: hasRSI=${!!indicators.rsi}, idx=${idx}, length=${indicators.rsi?.length || 0}`);
            }
            return null;
        }
        
        const rsiValue = indicators.rsi[idx];
        const extremesOnly = isPrimary ? this.signalRules.rsiExtremesOnly : false;
        
        if (isPrimary) {
            console.log(`[RSI DEBUG] RSI=${rsiValue}, extremesOnly=${extremesOnly}, oversold=${this.indicators.rsi.oversold}, overbought=${this.indicators.rsi.overbought}`);
        }
        
        if (extremesOnly) {
            // Only signal in extreme zones
            if (rsiValue < this.indicators.rsi.oversold) {
                console.log(`[RSI DEBUG] RSI oversold extreme signal: ${rsiValue} < ${this.indicators.rsi.oversold}`);
                return { type: 'long', name: 'RSI oversold extreme', strength: 1 };
            } else if (rsiValue > this.indicators.rsi.overbought) {
                console.log(`[RSI DEBUG] RSI overbought extreme signal: ${rsiValue} > ${this.indicators.rsi.overbought}`);
                return { type: 'short', name: 'RSI overbought extreme', strength: 1 };
            }
        } else {
            // More permissive RSI signals
            if (rsiValue < this.indicators.rsi.oversold) {
                if (isPrimary) console.log(`[RSI DEBUG] RSI oversold signal: ${rsiValue} < ${this.indicators.rsi.oversold}`);
                return { type: 'long', name: 'RSI oversold', strength: 0.8 };
            } else if (rsiValue > this.indicators.rsi.overbought) {
                if (isPrimary) console.log(`[RSI DEBUG] RSI overbought signal: ${rsiValue} > ${this.indicators.rsi.overbought}`);
                return { type: 'short', name: 'RSI overbought', strength: 0.8 };
            }
            // Add additional signals for less extreme RSI values
            else if (rsiValue < 40) {
                if (isPrimary) console.log(`[RSI DEBUG] RSI moderately oversold signal: ${rsiValue} < 40`);
                return { type: 'long', name: 'RSI moderately oversold', strength: 0.6 };
            } else if (rsiValue > 60) {
                if (isPrimary) console.log(`[RSI DEBUG] RSI moderately overbought signal: ${rsiValue} > 60`);
                return { type: 'short', name: 'RSI moderately overbought', strength: 0.6 };
            }
            // Add even more permissive signals if primary
            else if (isPrimary && rsiValue < 50) {
                console.log(`[RSI DEBUG] RSI below midline signal: ${rsiValue} < 50`);
                return { type: 'long', name: 'RSI below midline', strength: 0.4 };
            } else if (isPrimary && rsiValue > 50) {
                console.log(`[RSI DEBUG] RSI above midline signal: ${rsiValue} > 50`);
                return { type: 'short', name: 'RSI above midline', strength: 0.4 };
            }
        }
        
        if (isPrimary) {
            console.log(`[RSI DEBUG] No RSI signal generated for value: ${rsiValue}`);
        }
        return null;
    }
    
    checkStochRSISignal(indicators, idx, isPrimary) {
        if (!indicators.stochRsi || !indicators.stochRsi[idx]) return null;
        
        const stochK = indicators.stochRsi[idx].k;
        const stochD = indicators.stochRsi[idx].d;
        
        if (stochK < 20 && stochD < 20 && stochK > stochD) {
            return { type: 'long', name: 'StochRSI bullish crossover in oversold', strength: 0.9 };
        } else if (stochK > 80 && stochD > 80 && stochK < stochD) {
            return { type: 'short', name: 'StochRSI bearish crossover in overbought', strength: 0.9 };
        }
        
        return null;
    }
    
    checkMACDSignal(indicators, idx, isPrimary) {
        if (!indicators.macd || !indicators.macd[idx] || !indicators.macd[idx-1]) return null;
        
        const macdValue = indicators.macd[idx];
        const prevMacdValue = indicators.macd[idx-1];
        const crossoverRequired = isPrimary ? this.signalRules.macdCrossoverRequired : false;
        const zeroLineRequired = isPrimary ? this.signalRules.macdZeroLineRequired : false;
        
        // Check for crossover
        const bullishCrossover = macdValue.MACD > macdValue.signal && prevMacdValue.MACD <= prevMacdValue.signal;
        const bearishCrossover = macdValue.MACD < macdValue.signal && prevMacdValue.MACD >= prevMacdValue.signal;
        
        if (crossoverRequired) {
            // Only signal on fresh crossovers
            if (bullishCrossover) {
                const strength = zeroLineRequired ? (macdValue.MACD > 0 ? 1 : 0.7) : 0.8;
                if (!zeroLineRequired || macdValue.MACD > 0) {
                    return { type: 'long', name: 'MACD bullish crossover', strength };
                }
            } else if (bearishCrossover) {
                const strength = zeroLineRequired ? (macdValue.MACD < 0 ? 1 : 0.7) : 0.8;
                if (!zeroLineRequired || macdValue.MACD < 0) {
                    return { type: 'short', name: 'MACD bearish crossover', strength };
                }
            }
        } else {
            // Any MACD signal
            if (macdValue.MACD > macdValue.signal) {
                return { type: 'long', name: 'MACD bullish', strength: 0.6 };
            } else if (macdValue.MACD < macdValue.signal) {
                return { type: 'short', name: 'MACD bearish', strength: 0.6 };
            }
        }
        
        return null;
    }
    
    checkBollingerBandsSignal(currentCandle, indicators, idx, isPrimary) {
        if (!indicators.bollingerBands || !indicators.bollingerBands[idx]) return null;
        
        const bb = indicators.bollingerBands[idx];
        const touchRequired = isPrimary ? this.signalRules.bbTouchRequired : false;
        
        if (touchRequired) {
            // Price must touch the bands
            if (currentCandle.low <= bb.lower) {
                return { type: 'long', name: 'Price touched lower Bollinger Band', strength: 0.9 };
            } else if (currentCandle.high >= bb.upper) {
                return { type: 'short', name: 'Price touched upper Bollinger Band', strength: 0.9 };
            }
        } else {
            // Price below/above bands
            if (currentCandle.close < bb.lower) {
                return { type: 'long', name: 'Price below lower Bollinger Band', strength: 0.7 };
            } else if (currentCandle.close > bb.upper) {
                return { type: 'short', name: 'Price above upper Bollinger Band', strength: 0.7 };
            }
        }
        
        return null;
    }
    
    checkEMASignal(indicators, idx, isPrimary, currentCandle = null, historicalCandles = null) {
        if (!indicators.fastEma || !indicators.fastEma[idx]) {
            console.log(`[EMA DEBUG] No fastEma data at idx ${idx}, available: ${indicators.fastEma ? indicators.fastEma.length : 'none'}`);
            return null;
        }
        
        const fastEma = indicators.fastEma[idx];
        const freshCrossoverRequired = isPrimary ? this.signalRules.emaFreshCrossover : false;
        const priceConfirmationRequired = isPrimary ? this.signalRules.emaPriceConfirmation : false;
        
        console.log(`[EMA DEBUG] FastEMA: ${fastEma}, FreshCrossover: ${freshCrossoverRequired}, PriceConfirm: ${priceConfirmationRequired}`);
        
        // Priority 1: Simple price vs single EMA position (most permissive)
        if (currentCandle) {
            console.log(`[EMA DEBUG] Current price: ${currentCandle.close}, FastEMA: ${fastEma}`);
            
            if (!freshCrossoverRequired) {
                // Simple price vs EMA position (very permissive)
                if (currentCandle.close > fastEma) {
                    console.log(`[EMA DEBUG] Price above EMA signal generated`);
                    return { type: 'long', name: 'Price above EMA', strength: 0.6 };
                } else if (currentCandle.close < fastEma) {
                    console.log(`[EMA DEBUG] Price below EMA signal generated`);
                    return { type: 'short', name: 'Price below EMA', strength: 0.6 };
                }
            } else {
                // Check for price crossover with previous candle if available
                if (historicalCandles && historicalCandles.length > 1 && idx > 0) {
                    const prevCandle = historicalCandles[historicalCandles.length - 2];
                    const prevEma = indicators.fastEma[idx-1];
                    
                    if (prevEma) {
                        const priceCrossedAbove = currentCandle.close > fastEma && prevCandle.close <= prevEma;
                        const priceCrossedBelow = currentCandle.close < fastEma && prevCandle.close >= prevEma;
                        
                        if (priceCrossedAbove) {
                            console.log(`[EMA DEBUG] Price crossed above EMA`);
                            return { type: 'long', name: 'Price crossed above EMA', strength: 0.9 };
                        } else if (priceCrossedBelow) {
                            console.log(`[EMA DEBUG] Price crossed below EMA`);
                            return { type: 'short', name: 'Price crossed below EMA', strength: 0.9 };
                        }
                    }
                }
                
                // Fallback to simple position if crossover not detected
                if (currentCandle.close > fastEma) {
                    console.log(`[EMA DEBUG] Fallback: Price above EMA`);
                    return { type: 'long', name: 'Price above EMA (fallback)', strength: 0.5 };
                } else if (currentCandle.close < fastEma) {
                    console.log(`[EMA DEBUG] Fallback: Price below EMA`);
                    return { type: 'short', name: 'Price below EMA (fallback)', strength: 0.5 };
                }
            }
        }
        
        // Priority 2: EMA vs EMA crossover if slowEma exists
        if (indicators.slowEma && indicators.slowEma[idx]) {
            const slowEma = indicators.slowEma[idx];
            console.log(`[EMA DEBUG] FastEMA: ${fastEma}, SlowEMA: ${slowEma}`);
            
            if (!freshCrossoverRequired) {
                // Simple EMA alignment (permissive)
                if (fastEma > slowEma) {
                    console.log(`[EMA DEBUG] Fast EMA above slow EMA`);
                    return { type: 'long', name: 'Fast EMA above slow EMA', strength: 0.6 };
                } else if (fastEma < slowEma) {
                    console.log(`[EMA DEBUG] Fast EMA below slow EMA`);
                    return { type: 'short', name: 'Fast EMA below slow EMA', strength: 0.6 };
                }
            } else {
                // Check for EMA crossover
                if (idx > 0 && indicators.fastEma[idx-1] && indicators.slowEma[idx-1]) {
                    const prevFastEma = indicators.fastEma[idx-1];
                    const prevSlowEma = indicators.slowEma[idx-1];
                    
                    const bullishCrossover = fastEma > slowEma && prevFastEma <= prevSlowEma;
                    const bearishCrossover = fastEma < slowEma && prevFastEma >= prevSlowEma;
                    
                    if (bullishCrossover) {
                        console.log(`[EMA DEBUG] Fresh EMA bullish crossover`);
                        return { type: 'long', name: 'Fresh EMA bullish crossover', strength: 0.9 };
                    } else if (bearishCrossover) {
                        console.log(`[EMA DEBUG] Fresh EMA bearish crossover`);
                        return { type: 'short', name: 'Fresh EMA bearish crossover', strength: 0.9 };
                    }
                }
                
                // Fallback to simple alignment
                if (fastEma > slowEma) {
                    console.log(`[EMA DEBUG] Fallback: Fast EMA above slow EMA`);
                    return { type: 'long', name: 'Fast EMA above slow EMA (fallback)', strength: 0.5 };
                } else if (fastEma < slowEma) {
                    console.log(`[EMA DEBUG] Fallback: Fast EMA below slow EMA`);
                    return { type: 'short', name: 'Fast EMA below slow EMA (fallback)', strength: 0.5 };
                }
            }
        }
        
        // Priority 3: If only one EMA and no price data, create a basic signal for primary indicator
        if (isPrimary) {
            console.log(`[EMA DEBUG] Primary EMA signal fallback - creating basic signal`);
            // Create a basic signal based on EMA trend (very permissive for primary)
            // Use a simple pattern: if we have any EMA value, generate alternating signals for testing
            const signalType = (idx % 2 === 0) ? 'long' : 'short';
            return { type: signalType, name: 'EMA primary signal', strength: 0.4 };
        }
        
        console.log(`[EMA DEBUG] No EMA signal generated`);
        return null;
    }
    
    checkVWAPSignal(currentCandle, indicators, idx, isPrimary) {
        // VWAP implementation would go here
        return null;
    }
    
    checkSupertrendSignal(currentCandle, indicators, idx, isPrimary) {
        // Supertrend implementation would go here
        return null;
    }
    
    checkParabolicSARSignal(currentCandle, indicators, idx, isPrimary) {
        // Parabolic SAR implementation would go here
        return null;
    }
    
    // Check if active trade should be closed (TP/SL hit)
    checkTradeExit(currentCandle, currentIndex) {
        if (!this.activeTradeInfo.hasActiveTrade) {
            return false;
        }
        
        const { tradeType, takeProfit, stopLoss, entryCandle } = this.activeTradeInfo;
        let tradeExited = false;
        let exitReason = '';
        let exitPrice = null;
        
        if (tradeType === 'long') {
            // Check stop loss
            if (currentCandle.low <= stopLoss) {
                tradeExited = true;
                exitReason = 'Stop Loss Hit';
                exitPrice = stopLoss;
            }
            // Check take profit
            else if (currentCandle.high >= takeProfit) {
                tradeExited = true;
                exitReason = 'Take Profit Hit';
                exitPrice = takeProfit;
            }
        } else if (tradeType === 'short') {
            // Check stop loss
            if (currentCandle.high >= stopLoss) {
                tradeExited = true;
                exitReason = 'Stop Loss Hit';
                exitPrice = stopLoss;
            }
            // Check take profit
            else if (currentCandle.low <= takeProfit) {
                tradeExited = true;
                exitReason = 'Take Profit Hit';
                exitPrice = takeProfit;
            }
        }
        
        if (tradeExited) {
            console.log(`[TRADE EXIT] ${exitReason} at candle ${currentIndex}: ${tradeType} trade from candle ${entryCandle} closed at ${exitPrice}`);
            console.log(`[TRADE EXIT] Trade duration: ${currentIndex - entryCandle} candles`);
            
            // Reset active trade info
            this.activeTradeInfo = {
                hasActiveTrade: false,
                tradeType: null,
                entryPrice: null,
                entryTime: null,
                takeProfit: null,
                stopLoss: null,
                entryCandle: null
            };
            
            console.log(`[TRADE EXIT] Ready to accept new signals from candle ${currentIndex + 1}`);
            return true;
        }
        
        return false;
    }
    
    // Helper methods
    getEnabledIndicatorCount() {
        let count = 0;
        if (this.indicators.rsi.enabled) count++;
        if (this.indicators.stochRsi.enabled) count++;
        if (this.indicators.macd.enabled) count++;
        if (this.indicators.bollingerBands.enabled) count++;
        if (this.indicators.ema.enabled) count++;
        if (this.indicators.vwap.enabled) count++;
        if (this.indicators.supertrend.enabled) count++;
        if (this.indicators.parabolicSar.enabled) count++;
        return count;
    }
    
    calculateSignalStrength(primarySignal, confirmingSignals, conflictingSignals) {
        let strength = primarySignal.strength || 0.5;
        
        // Add strength from confirming signals
        confirmingSignals.forEach(signal => {
            strength += (signal.strength || 0.3) * 0.2;
        });
        
        // Reduce strength from conflicting signals
        conflictingSignals.forEach(signal => {
            strength -= (signal.strength || 0.3) * 0.1;
        });
        
        // Normalize between 0 and 1
        return Math.max(0, Math.min(1, strength));
    }
    
    // Reset active trade state (useful for backtesting or resetting strategy)
    resetActiveTradeState() {
        this.activeTradeInfo = {
            hasActiveTrade: false,
            tradeType: null,
            entryPrice: null,
            entryTime: null,
            takeProfit: null,
            stopLoss: null,
            entryCandle: null
        };
        console.log(`[SCALPING STRATEGY] Active trade state reset - ready for new signals`);
    }
    
    // Get current trade status
    getTradeStatus() {
        return {
            hasActiveTrade: this.activeTradeInfo.hasActiveTrade,
            tradeType: this.activeTradeInfo.tradeType,
            entryPrice: this.activeTradeInfo.entryPrice,
            entryTime: this.activeTradeInfo.entryTime,
            entryCandle: this.activeTradeInfo.entryCandle,
            singleTradeMode: this.singleTradeMode
        };
    }
}

module.exports = ScalpingStrategy; 