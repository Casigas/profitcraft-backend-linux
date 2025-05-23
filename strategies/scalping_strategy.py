import pandas as pd
import numpy as np
from datetime import datetime

class ScalpingStrategy:
    def __init__(self, config=None):
        if config is None:
            config = {}
            
        # Core settings
        self.timeframe = config.get('timeframe', '1m')
        self.entry_type = config.get('entryType', 'market')
        self.trading_pair = config.get('tradingPair', 'BTC/USDT')
        
        # Risk management
        self.profit_target = float(config.get('profitTarget', 0.5))
        self.stop_loss = float(config.get('stopLoss', 0.3))
        self.risk_per_trade = float(config.get('riskPerTrade', 1))
        self.max_open_trades = int(config.get('maxOpenTrades', 2))
        self.use_trailing_stop = config.get('useTrailingStop', False)
        self.trailing_stop_distance = float(config.get('trailingStopDistance', 0.2))
        
        # Technical indicators configuration
        self.indicators = {
            'rsi': {
                'enabled': config.get('useRSI', True),
                'period': int(config.get('rsiPeriod', 14)),
                'overbought': int(config.get('rsiOverbought', 70)),
                'oversold': int(config.get('rsiOversold', 30))
            },
            'stoch_rsi': {
                'enabled': config.get('useStochRSI', False),
                'rsi_period': int(config.get('stochRSIPeriod', 14)),
                'k_period': int(config.get('stochRSIKPeriod', 3)),
                'd_period': int(config.get('stochRSIDPeriod', 3))
            },
            'macd': {
                'enabled': config.get('useMACD', False),
                'fast_period': int(config.get('macdFastPeriod', 12)),
                'slow_period': int(config.get('macdSlowPeriod', 26)),
                'signal_period': int(config.get('macdSignalPeriod', 9)),
                'use_histogram': config.get('useMACDHistogram', False)
            },
            'bollinger_bands': {
                'enabled': config.get('useBollingerBands', True),
                'period': int(config.get('bbPeriod', 20)),
                'std_dev': float(config.get('bbDeviation', 2))
            },
            'ema': {
                'enabled': config.get('useEMA', True),
                'fast_period': int(config.get('fastEMA', 9)),
                'slow_period': int(config.get('slowEMA', 21))
            },
            'vwap': {
                'enabled': config.get('useVWAP', False),
                'period': int(config.get('vwapPeriod', 14))
            },
            'supertrend': {
                'enabled': config.get('useSupertrend', False),
                'period': int(config.get('supertrendPeriod', 10)),
                'multiplier': float(config.get('supertrendMultiplier', 3))
            },
            'atr': {
                'enabled': config.get('useATR', False),
                'period': int(config.get('atrPeriod', 14))
            },
            'choppiness_index': {
                'enabled': config.get('useChoppinessIndex', False),
                'period': int(config.get('choppinessPeriod', 14))
            },
            'parabolic_sar': {
                'enabled': config.get('useParabolicSAR', False),
                'step': float(config.get('sarStep', 0.02)),
                'max_step': float(config.get('sarMaxStep', 0.2))
            },
            'donchian_channel': {
                'enabled': config.get('useDonchianChannel', False),
                'period': int(config.get('donchianPeriod', 20))
            },
            'pivot_points': {
                'enabled': config.get('usePivotPoints', False),
                'type': config.get('pivotPointsType', 'standard')
            },
            'heikin_ashi': {
                'enabled': config.get('useHeikinAshi', False)
            },
            'volume': {
                'enabled': config.get('useVolume', True),
                'multiplier': float(config.get('volumeMultiplier', 1.5))
            }
        }
        
        # Entry conditions
        self.entry_conditions = {
            'price_action': config.get('priceAction', 'breakout'),
            'minimum_volume': int(config.get('minimumVolume', 1000)),
            'spread_limit': float(config.get('spreadLimit', 0.1))
        }
        
        # State tracking
        self.positions = []
        self.signals = []
        self.last_candle = None
    
    # Technical Indicator Helper Methods
    def _calculate_rsi(self, data, period=14):
        """
        Calculate RSI (Relative Strength Index)
        """
        # Calculate price changes
        delta = data.diff()
        
        # Get gains and losses
        gain = delta.copy()
        loss = delta.copy()
        gain[gain < 0] = 0
        loss[loss > 0] = 0
        loss = -loss  # Make losses positive
        
        # First calculations
        avg_gain = gain.rolling(window=period).mean()
        avg_loss = loss.rolling(window=period).mean()
        
        # Calculate RS and RSI
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        
        return rsi
    
    def _calculate_ema(self, data, period):
        """
        Calculate EMA (Exponential Moving Average)
        """
        return data.ewm(span=period, adjust=False).mean()
    
    def _calculate_sma(self, data, period):
        """
        Calculate SMA (Simple Moving Average)
        """
        return data.rolling(window=period).mean()
    
    def _calculate_true_range(self, high, low, close):
        """
        Calculate True Range
        """
        # Create high-low, high-prev_close, and prev_close-low series
        prev_close = close.shift(1)
        tr1 = high - low
        tr2 = (high - prev_close).abs()
        tr3 = (low - prev_close).abs()
        
        # Get the maximum value at each point
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        return tr
    
    def _calculate_atr(self, high, low, close, period):
        """
        Calculate ATR (Average True Range)
        """
        tr = self._calculate_true_range(high, low, close)
        return tr.rolling(window=period).mean()
    
    def _calculate_macd(self, close, fast_period=12, slow_period=26, signal_period=9):
        """
        Calculate MACD (Moving Average Convergence Divergence)
        """
        # Calculate EMAs
        fast_ema = self._calculate_ema(close, fast_period)
        slow_ema = self._calculate_ema(close, slow_period)
        
        # Calculate MACD line
        macd_line = fast_ema - slow_ema
        
        # Calculate signal line
        signal_line = self._calculate_ema(macd_line, signal_period)
        
        # Calculate histogram
        histogram = macd_line - signal_line
        
        return macd_line, signal_line, histogram
    
    def _calculate_bollinger_bands(self, close, period=20, std_dev=2):
        """
        Calculate Bollinger Bands
        """
        # Calculate middle band (SMA)
        middle_band = self._calculate_sma(close, period)
        
        # Calculate standard deviation
        rolling_std = close.rolling(window=period).std()
        
        # Calculate upper and lower bands
        upper_band = middle_band + (rolling_std * std_dev)
        lower_band = middle_band - (rolling_std * std_dev)
        
        return upper_band, middle_band, lower_band
    
    def _calculate_stoch_rsi(self, close, rsi_period=14, k_period=3, d_period=3):
        """
        Calculate Stochastic RSI
        """
        # Calculate RSI
        rsi = self._calculate_rsi(close, rsi_period)
        
        # Calculate Stochastic RSI
        stoch_rsi = (rsi - rsi.rolling(window=k_period).min()) / (
            rsi.rolling(window=k_period).max() - rsi.rolling(window=k_period).min()
        )
        
        # Calculate %K and %D lines
        k = stoch_rsi.rolling(window=k_period).mean() * 100
        d = k.rolling(window=d_period).mean()
        
        return k, d
    
    def _calculate_parabolic_sar(self, high, low, close, step=0.02, max_step=0.2):
        """
        Calculate Parabolic SAR manually
        """
        length = len(high)
        if length < 2:
            return pd.Series([np.nan] * length, index=close.index)
        
        # Initialize series
        psar = pd.Series([np.nan] * length, index=close.index)
        psarbull = [False] * length
        psarbear = [False] * length
        af = step  # Acceleration factor
        
        # Set initial values
        ep_bull = low.iloc[0]  # Extreme point for bulls
        ep_bear = high.iloc[0]  # Extreme point for bears
        
        # Assume we start with a bull trend
        psar.iloc[0] = low.iloc[0]
        psarbull[0] = True
        
        for i in range(1, length):
            # Previous SAR value
            prev_psar = psar.iloc[i-1]
            
            # Bull trend
            if psarbull[i-1]:
                psar.iloc[i] = prev_psar + af * (ep_bull - prev_psar)
                
                # Make sure SAR is below the previous two lows
                psar.iloc[i] = min(psar.iloc[i], low.iloc[i-1], low.iloc[max(0, i-2)])
                
                # If SAR crosses above the current low, switch to bear trend
                if psar.iloc[i] > low.iloc[i]:
                    psarbull[i] = False
                    psarbear[i] = True
                    psar.iloc[i] = ep_bull
                    ep_bear = high.iloc[i]
                    af = step
                else:
                    psarbull[i] = True
                    psarbear[i] = False
                    # If we have a new extreme point, increase af
                    if high.iloc[i] > ep_bull:
                        ep_bull = high.iloc[i]
                        af = min(af + step, max_step)
            
            # Bear trend
            else:
                psar.iloc[i] = prev_psar - af * (prev_psar - ep_bear)
                
                # Make sure SAR is above the previous two highs
                psar.iloc[i] = max(psar.iloc[i], high.iloc[i-1], high.iloc[max(0, i-2)])
                
                # If SAR crosses below the current high, switch to bull trend
                if psar.iloc[i] < high.iloc[i]:
                    psarbull[i] = True
                    psarbear[i] = False
                    psar.iloc[i] = ep_bear
                    ep_bull = low.iloc[i]
                    af = step
                else:
                    psarbull[i] = False
                    psarbear[i] = True
                    # If we have a new extreme point, increase af
                    if low.iloc[i] < ep_bear:
                        ep_bear = low.iloc[i]
                        af = min(af + step, max_step)
        
        return psar
    
    def analyze(self, candle_data):
        """Main strategy analysis function"""
        if not candle_data or len(candle_data) < 50:
            print('Insufficient data for analysis, minimum 50 candles required')
            return {'success': False, 'message': 'Insufficient data for analysis'}
        
        try:
            # Convert candle data to pandas DataFrame
            df = self._prepare_dataframe(candle_data)
            
            # Calculate all enabled indicators
            df = self._calculate_indicators(df)
            
            # Generate signals
            signals = self._generate_signals(df)
            
            # Convert dataframe index to timestamp for serialization
            indicator_data = df.to_dict(orient='index')
            
            return {
                'success': True,
                'signals': signals,
                'indicators': indicator_data
            }
        except Exception as e:
            print(f'Error analyzing candle data: {str(e)}')
            return {
                'success': False,
                'message': f'Analysis error: {str(e)}'
            }
    
    def _prepare_dataframe(self, candle_data):
        """Convert candle data to pandas DataFrame"""
        df = pd.DataFrame(candle_data)
        # Ensure all required columns are present
        required_columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        for col in required_columns:
            if col not in df.columns:
                raise ValueError(f"Required column '{col}' not found in candle data")
        
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        return df
    
    def _calculate_indicators(self, df):
        """Calculate all enabled indicators"""
        # RSI
        if self.indicators['rsi']['enabled']:
            df['rsi'] = self._calculate_rsi(df['close'], self.indicators['rsi']['period'])
        
        # Stochastic RSI
        if self.indicators['stoch_rsi']['enabled']:
            k, d = self._calculate_stoch_rsi(
                df['close'], 
                self.indicators['stoch_rsi']['rsi_period'],
                self.indicators['stoch_rsi']['k_period'],
                self.indicators['stoch_rsi']['d_period']
            )
            df['stoch_rsi_k'] = k
            df['stoch_rsi_d'] = d
        
        # MACD
        if self.indicators['macd']['enabled']:
            macd, signal, hist = self._calculate_macd(
                df['close'],
                self.indicators['macd']['fast_period'],
                self.indicators['macd']['slow_period'],
                self.indicators['macd']['signal_period']
            )
            df['macd'] = macd
            df['macd_signal'] = signal
            df['macd_hist'] = hist
        
        # Bollinger Bands
        if self.indicators['bollinger_bands']['enabled']:
            upper, middle, lower = self._calculate_bollinger_bands(
                df['close'],
                self.indicators['bollinger_bands']['period'],
                self.indicators['bollinger_bands']['std_dev']
            )
            df['bb_upper'] = upper
            df['bb_middle'] = middle
            df['bb_lower'] = lower
        
        # EMAs
        if self.indicators['ema']['enabled']:
            df['ema_fast'] = self._calculate_ema(df['close'], self.indicators['ema']['fast_period'])
            df['ema_slow'] = self._calculate_ema(df['close'], self.indicators['ema']['slow_period'])
        
        # ATR
        if self.indicators['atr']['enabled']:
            df['atr'] = self._calculate_atr(
                df['high'],
                df['low'],
                df['close'],
                self.indicators['atr']['period']
            )
        
        # Parabolic SAR
        if self.indicators['parabolic_sar']['enabled']:
            df['psar'] = self._calculate_parabolic_sar(
                df['high'],
                df['low'],
                df['close'],
                self.indicators['parabolic_sar']['step'],
                self.indicators['parabolic_sar']['max_step']
            )
        
        # Calculate VWAP
        if self.indicators['vwap']['enabled']:
            df = self._calculate_vwap(df)
        
        # Calculate Supertrend
        if self.indicators['supertrend']['enabled']:
            df = self._calculate_supertrend(df)
        
        # Calculate Donchian Channel
        if self.indicators['donchian_channel']['enabled']:
            df = self._calculate_donchian_channel(df)
        
        # Calculate Choppiness Index
        if self.indicators['choppiness_index']['enabled']:
            df = self._calculate_choppiness_index(df)
        
        # Calculate Pivot Points if enabled
        if self.indicators['pivot_points']['enabled']:
            df = self._calculate_pivot_points(df)
        
        # Calculate Heikin-Ashi candles if enabled
        if self.indicators['heikin_ashi']['enabled']:
            df = self._calculate_heikin_ashi(df)
        
        return df
    
    def _calculate_vwap(self, df):
        """Calculate VWAP manually"""
        df['vwap'] = np.cumsum(df['volume'] * df['close']) / np.cumsum(df['volume'])
        return df
    
    def _calculate_supertrend(self, df):
        """Calculate Supertrend indicator"""
        period = self.indicators['supertrend']['period']
        multiplier = self.indicators['supertrend']['multiplier']
        
        # Calculate ATR if not already calculated
        if 'atr' not in df.columns:
            df['atr'] = self._calculate_atr(
                df['high'],
                df['low'],
                df['close'],
                period
            )
        
        # Calculate Basic Upper and Lower Bands
        df['basic_upper'] = ((df['high'] + df['low']) / 2) + (multiplier * df['atr'])
        df['basic_lower'] = ((df['high'] + df['low']) / 2) - (multiplier * df['atr'])
        
        # Calculate Supertrend
        df['supertrend'] = 0.0
        df['supertrend_direction'] = 1  # 1 for uptrend, -1 for downtrend
        
        # First value of Supertrend is set to basic upper/lower based on first close vs first pivotpoint
        if df['close'].iloc[0] <= df['basic_upper'].iloc[0]:
            df.loc[df.index[0], 'supertrend'] = df['basic_upper'].iloc[0]
            df.loc[df.index[0], 'supertrend_direction'] = -1
        else:
            df.loc[df.index[0], 'supertrend'] = df['basic_lower'].iloc[0]
            df.loc[df.index[0], 'supertrend_direction'] = 1
        
        # Calculate Supertrend values
        for i in range(1, len(df)):
            curr_close = df['close'].iloc[i]
            prev_supertrend = df['supertrend'].iloc[i-1]
            curr_basic_upper = df['basic_upper'].iloc[i]
            curr_basic_lower = df['basic_lower'].iloc[i]
            prev_basic_upper = df['basic_upper'].iloc[i-1]
            prev_basic_lower = df['basic_lower'].iloc[i-1]
            prev_direction = df['supertrend_direction'].iloc[i-1]
            
            # Uptrend
            if prev_supertrend == prev_basic_lower:
                if curr_close <= curr_basic_lower:
                    df.loc[df.index[i], 'supertrend'] = curr_basic_upper
                    df.loc[df.index[i], 'supertrend_direction'] = -1
                else:
                    df.loc[df.index[i], 'supertrend'] = curr_basic_lower
                    df.loc[df.index[i], 'supertrend_direction'] = 1
            # Downtrend
            else:
                if curr_close >= curr_basic_upper:
                    df.loc[df.index[i], 'supertrend'] = curr_basic_lower
                    df.loc[df.index[i], 'supertrend_direction'] = 1
                else:
                    df.loc[df.index[i], 'supertrend'] = curr_basic_upper
                    df.loc[df.index[i], 'supertrend_direction'] = -1
        
        return df
    
    def _calculate_donchian_channel(self, df):
        """Calculate Donchian Channel"""
        period = self.indicators['donchian_channel']['period']
        
        df['donchian_high'] = df['high'].rolling(window=period).max()
        df['donchian_low'] = df['low'].rolling(window=period).min()
        df['donchian_mid'] = (df['donchian_high'] + df['donchian_low']) / 2
        
        return df
    
    def _calculate_choppiness_index(self, df):
        """Calculate Choppiness Index"""
        period = self.indicators['choppiness_index']['period']
        
        # Calculate True Range if not already calculated
        if 'atr' not in df.columns:
            tr = self._calculate_true_range(df['high'], df['low'], df['close'])
        else:
            tr = df['atr'] * period  # Approximate TR from ATR
        
        # Sum of true ranges
        df['tr_sum'] = tr.rolling(window=period).sum()
        
        # Highest high - lowest low over period
        df['highest_high'] = df['high'].rolling(window=period).max()
        df['lowest_low'] = df['low'].rolling(window=period).min()
        df['range'] = df['highest_high'] - df['lowest_low']
        
        # Calculate Choppiness Index
        df['choppiness'] = 100 * np.log10(df['tr_sum'] / df['range']) / np.log10(period)
        
        return df
    
    def _calculate_pivot_points(self, df):
        """Calculate Pivot Points"""
        # This implementation uses the standard pivot point calculation method
        # For daily pivot points based on the previous day
        
        # Skip if we don't have enough data
        if len(df) < 2:
            return df
        
        # Get previous day's data
        prev_high = df['high'].shift(1)
        prev_low = df['low'].shift(1)
        prev_close = df['close'].shift(1)
        
        # Calculate pivot point
        df['pivot'] = (prev_high + prev_low + prev_close) / 3
        
        # Calculate support and resistance levels
        if self.indicators['pivot_points']['type'] == 'standard':
            # Standard pivot points
            df['r1'] = (2 * df['pivot']) - prev_low
            df['s1'] = (2 * df['pivot']) - prev_high
            df['r2'] = df['pivot'] + (prev_high - prev_low)
            df['s2'] = df['pivot'] - (prev_high - prev_low)
            df['r3'] = df['pivot'] + 2 * (prev_high - prev_low)
            df['s3'] = df['pivot'] - 2 * (prev_high - prev_low)
        
        elif self.indicators['pivot_points']['type'] == 'fibonacci':
            # Fibonacci pivot points
            df['r1'] = df['pivot'] + 0.382 * (prev_high - prev_low)
            df['s1'] = df['pivot'] - 0.382 * (prev_high - prev_low)
            df['r2'] = df['pivot'] + 0.618 * (prev_high - prev_low)
            df['s2'] = df['pivot'] - 0.618 * (prev_high - prev_low)
            df['r3'] = df['pivot'] + 1.0 * (prev_high - prev_low)
            df['s3'] = df['pivot'] - 1.0 * (prev_high - prev_low)
        
        elif self.indicators['pivot_points']['type'] == 'camarilla':
            # Camarilla pivot points
            df['r1'] = prev_close + 1.1 * (prev_high - prev_low) / 12
            df['s1'] = prev_close - 1.1 * (prev_high - prev_low) / 12
            df['r2'] = prev_close + 1.1 * (prev_high - prev_low) / 6
            df['s2'] = prev_close - 1.1 * (prev_high - prev_low) / 6
            df['r3'] = prev_close + 1.1 * (prev_high - prev_low) / 4
            df['s3'] = prev_close - 1.1 * (prev_high - prev_low) / 4
        
        elif self.indicators['pivot_points']['type'] == 'woodie':
            # Woodie pivot points
            df['pivot'] = (prev_high + prev_low + 2 * prev_close) / 4
            df['r1'] = (2 * df['pivot']) - prev_low
            df['s1'] = (2 * df['pivot']) - prev_high
            df['r2'] = df['pivot'] + (prev_high - prev_low)
            df['s2'] = df['pivot'] - (prev_high - prev_low)
        
        return df
    
    def _calculate_heikin_ashi(self, df):
        """Calculate Heikin-Ashi candles"""
        df_ha = df.copy()
        
        # Calculate Heikin-Ashi candles
        df_ha['ha_close'] = (df['open'] + df['high'] + df['low'] + df['close']) / 4
        
        # Calculate first Heikin-Ashi open
        df_ha['ha_open'] = df['open'].copy()
        
        # Calculate remaining Heikin-Ashi open values
        for i in range(1, len(df)):
            df_ha.loc[df.index[i], 'ha_open'] = (df_ha['ha_open'].iloc[i-1] + df_ha['ha_close'].iloc[i-1]) / 2
        
        # Calculate Heikin-Ashi high and low
        df_ha['ha_high'] = df[['high', 'ha_open', 'ha_close']].max(axis=1)
        df_ha['ha_low'] = df[['low', 'ha_open', 'ha_close']].min(axis=1)
        
        # Add the new columns to original dataframe
        df['ha_open'] = df_ha['ha_open']
        df['ha_high'] = df_ha['ha_high']
        df['ha_low'] = df_ha['ha_low']
        df['ha_close'] = df_ha['ha_close']
        
        return df
    
    def _generate_signals(self, df):
        """Generate trading signals based on indicator values"""
        signals = []
        
        # Start from the 50th row to ensure we have enough data for all indicators
        start_idx = 50
        
        # Process each candle for signals
        for i in range(start_idx, len(df)):
            current_candle = df.iloc[i].to_dict()
            signal = self._check_for_signal(df, i)
            
            if signal:
                # Add timestamp from DataFrame index
                signal['timestamp'] = df.index[i].timestamp() * 1000  # Convert to milliseconds
                signal['candle_index'] = i
                signals.append(signal)
        
        return signals
    
    def _check_for_signal(self, df, idx):
        """Check for a trading signal at a specific index"""
        # Minimum index required for all indicators
        if idx < 50:
            return None
        
        current_candle = df.iloc[idx]
        
        # Check volume requirement
        if self.indicators['volume']['enabled'] and current_candle['volume'] < self.entry_conditions['minimum_volume']:
            return None
        
        # Initialize signal tracking
        bullish_signals = []
        bearish_signals = []
        
        # Check RSI
        if self.indicators['rsi']['enabled'] and 'rsi' in df.columns and not np.isnan(current_candle['rsi']):
            rsi_value = current_candle['rsi']
            if rsi_value < self.indicators['rsi']['oversold']:
                bullish_signals.append('RSI oversold')
            elif rsi_value > self.indicators['rsi']['overbought']:
                bearish_signals.append('RSI overbought')
        
        # Check Stochastic RSI
        if self.indicators['stoch_rsi']['enabled'] and 'stoch_rsi_k' in df.columns and 'stoch_rsi_d' in df.columns:
            stoch_k = current_candle['stoch_rsi_k']
            stoch_d = current_candle['stoch_rsi_d']
            prev_k = df.iloc[idx-1]['stoch_rsi_k']
            prev_d = df.iloc[idx-1]['stoch_rsi_d']
            
            if not np.isnan(stoch_k) and not np.isnan(stoch_d):
                if stoch_k < 20 and stoch_d < 20 and stoch_k > stoch_d and prev_k <= prev_d:
                    bullish_signals.append('StochRSI bullish crossover in oversold')
                elif stoch_k > 80 and stoch_d > 80 and stoch_k < stoch_d and prev_k >= prev_d:
                    bearish_signals.append('StochRSI bearish crossover in overbought')
        
        # Check MACD
        if self.indicators['macd']['enabled'] and all(col in df.columns for col in ['macd', 'macd_signal', 'macd_hist']):
            macd = current_candle['macd']
            signal = current_candle['macd_signal']
            hist = current_candle['macd_hist']
            
            prev_macd = df.iloc[idx-1]['macd']
            prev_signal = df.iloc[idx-1]['macd_signal']
            prev_hist = df.iloc[idx-1]['macd_hist']
            
            if not np.isnan(macd) and not np.isnan(signal):
                if macd > signal and prev_macd <= prev_signal:
                    bullish_signals.append('MACD bullish crossover')
                elif macd < signal and prev_macd >= prev_signal:
                    bearish_signals.append('MACD bearish crossover')
                
                if self.indicators['macd']['use_histogram'] and not np.isnan(hist) and not np.isnan(prev_hist):
                    if hist > 0 and prev_hist <= 0:
                        bullish_signals.append('MACD histogram turned positive')
                    elif hist < 0 and prev_hist >= 0:
                        bearish_signals.append('MACD histogram turned negative')
        
        # Check Bollinger Bands
        if self.indicators['bollinger_bands']['enabled'] and all(col in df.columns for col in ['bb_upper', 'bb_middle', 'bb_lower']):
            bb_upper = current_candle['bb_upper']
            bb_lower = current_candle['bb_lower']
            close = current_candle['close']
            
            if not np.isnan(bb_upper) and not np.isnan(bb_lower):
                if close < bb_lower:
                    bullish_signals.append('Price below lower Bollinger Band')
                elif close > bb_upper:
                    bearish_signals.append('Price above upper Bollinger Band')
        
        # Check EMA crossover
        if self.indicators['ema']['enabled'] and all(col in df.columns for col in ['ema_fast', 'ema_slow']):
            fast_ema = current_candle['ema_fast']
            slow_ema = current_candle['ema_slow']
            
            prev_fast_ema = df.iloc[idx-1]['ema_fast']
            prev_slow_ema = df.iloc[idx-1]['ema_slow']
            
            if not np.isnan(fast_ema) and not np.isnan(slow_ema) and not np.isnan(prev_fast_ema) and not np.isnan(prev_slow_ema):
                if fast_ema > slow_ema and prev_fast_ema <= prev_slow_ema:
                    bullish_signals.append('Fast EMA crossed above slow EMA')
                elif fast_ema < slow_ema and prev_fast_ema >= prev_slow_ema:
                    bearish_signals.append('Fast EMA crossed below slow EMA')
        
        # Check Supertrend
        if self.indicators['supertrend']['enabled'] and 'supertrend_direction' in df.columns:
            curr_direction = current_candle['supertrend_direction']
            prev_direction = df.iloc[idx-1]['supertrend_direction']
            
            if not np.isnan(curr_direction) and not np.isnan(prev_direction):
                if curr_direction == 1 and prev_direction == -1:
                    bullish_signals.append('Supertrend changed to uptrend')
                elif curr_direction == -1 and prev_direction == 1:
                    bearish_signals.append('Supertrend changed to downtrend')
        
        # Determine final signal based on entry conditions and combined indicators
        # A minimum number of confirming signals required (can be adjusted)
        min_confirming_signals = 2
        
        if len(bullish_signals) >= min_confirming_signals and len(bearish_signals) == 0:
            entry_price = current_candle['close']
            take_profit = entry_price * (1 + self.profit_target / 100)
            stop_loss = entry_price * (1 - self.stop_loss / 100)
            
            return {
                'type': 'long',
                'entry_price': entry_price,
                'tp': take_profit,
                'sl': stop_loss,
                'indicators': {
                    'bullish': bullish_signals,
                    'bearish': bearish_signals
                }
            }
        elif len(bearish_signals) >= min_confirming_signals and len(bullish_signals) == 0:
            entry_price = current_candle['close']
            take_profit = entry_price * (1 - self.profit_target / 100)
            stop_loss = entry_price * (1 + self.stop_loss / 100)
            
            return {
                'type': 'short',
                'entry_price': entry_price,
                'tp': take_profit,
                'sl': stop_loss,
                'indicators': {
                    'bullish': bullish_signals,
                    'bearish': bearish_signals
                }
            }
        
        return None

# Example usage
if __name__ == "__main__":
    # Sample configuration
    config = {
        'timeframe': '5m',
        'tradingPair': 'BTC/USDT',
        'profitTarget': '0.5',
        'stopLoss': '0.3',
        'useRSI': True,
        'rsiPeriod': '14',
        'useBollingerBands': True,
        'bbPeriod': '20',
        'useEMA': True,
        'fastEMA': '9',
        'slowEMA': '21'
    }
    
    # Initialize strategy
    strategy = ScalpingStrategy(config)
    
    # Sample candle data (would be replaced with actual data)
    import json
    try:
        with open('sample_candle_data.json', 'r') as f:
            candle_data = json.load(f)
        
        # Analyze
        result = strategy.analyze(candle_data)
        print(f"Analysis found {len(result['signals'])} signals")
    except FileNotFoundError:
        print("Sample data file not found. Please provide candle data to test the strategy.") 