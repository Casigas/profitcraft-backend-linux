import numpy as np
import pandas as pd
import json
import sys
from datetime import datetime

class BTCStrategy:
    def __init__(self, data):
        self.data = pd.DataFrame(data)
        self.data['timestamp'] = pd.to_numeric(self.data['timestamp'])
        self.timeframe = self._detect_timeframe()
        self.setup_indicators()

    def _detect_timeframe(self):
        # Calculate average time difference between candles in minutes
        time_diff = np.diff(self.data['timestamp']) / (1000 * 60)  # Convert to minutes
        avg_diff = np.mean(time_diff)
        
        # Map average difference to timeframe
        if avg_diff <= 1:
            return '1m'
        elif avg_diff <= 5:
            return '5m'
        elif avg_diff <= 15:
            return '15m'
        elif avg_diff <= 60:
            return '1h'
        elif avg_diff <= 240:
            return '4h'
        else:
            return '1d'

    def _adjust_parameters(self):
        # Adjust parameters based on timeframe
        params = {
            '1m': {
                'volume_threshold': 1.3,
                'price_change_threshold': 0.2,
                'sma_period': 20,
                'volume_sma_period': 5,
                'tp_percentage': 0.005,
                'sl_percentage': 0.003
            },
            '5m': {
                'volume_threshold': 1.4,
                'price_change_threshold': 0.3,
                'sma_period': 20,
                'volume_sma_period': 5,
                'tp_percentage': 0.007,
                'sl_percentage': 0.004
            },
            '15m': {
                'volume_threshold': 1.5,
                'price_change_threshold': 0.5,
                'sma_period': 20,
                'volume_sma_period': 5,
                'tp_percentage': 0.01,
                'sl_percentage': 0.005
            },
            '1h': {
                'volume_threshold': 1.6,
                'price_change_threshold': 0.8,
                'sma_period': 24,
                'volume_sma_period': 6,
                'tp_percentage': 0.015,
                'sl_percentage': 0.008
            },
            '4h': {
                'volume_threshold': 1.7,
                'price_change_threshold': 1.2,
                'sma_period': 30,
                'volume_sma_period': 7,
                'tp_percentage': 0.02,
                'sl_percentage': 0.01
            },
            '1d': {
                'volume_threshold': 2.0,
                'price_change_threshold': 2.0,
                'sma_period': 20,
                'volume_sma_period': 5,
                'tp_percentage': 0.03,
                'sl_percentage': 0.015
            }
        }
        return params[self.timeframe]

    def setup_indicators(self):
        params = self._adjust_parameters()
        
        # Calculate basic indicators
        self.data['price_change'] = self.data['close'].pct_change() * 100
        self.data['volume_sma'] = self.data['volume'].rolling(
            window=params['volume_sma_period']).mean()
        self.data['price_sma'] = self.data['close'].rolling(
            window=params['sma_period']).mean()
        
        # Volume conditions
        self.data['volume_spike'] = self.data['volume'] > self.data['volume_sma'] * params['volume_threshold']
        
        # Trend conditions
        self.data['above_sma'] = self.data['close'] > self.data['price_sma']
        self.data['below_sma'] = self.data['close'] < self.data['price_sma']
        
        self.params = params

    def calculate(self):
        params = self.params
        min_periods = max(params['sma_period'], params['volume_sma_period'])
        
        if len(self.data) < min_periods:
            return []

        signals = []
        
        for i in range(min_periods, len(self.data)):
            row = self.data.iloc[i]
            prev_row = self.data.iloc[i-1]
            
            # Long conditions
            long_conditions = (
                prev_row['price_change'] < -params['price_change_threshold'] and
                row['volume_spike'] and
                row['below_sma']
            )
            
            # Short conditions
            short_conditions = (
                prev_row['price_change'] > params['price_change_threshold'] and
                row['volume_spike'] and
                row['above_sma']
            )
            
            if long_conditions or short_conditions:
                entry_price = float(row['close'])
                timestamp = int(row['timestamp'])
                
                if long_conditions:
                    signals.append({
                        'timestamp': timestamp,
                        'type': 'long',
                        'entry_price': entry_price,
                        'tp': entry_price * (1 + params['tp_percentage']),
                        'sl': entry_price * (1 - params['sl_percentage'])
                    })
                elif short_conditions:
                    signals.append({
                        'timestamp': timestamp,
                        'type': 'short',
                        'entry_price': entry_price,
                        'tp': entry_price * (1 - params['tp_percentage']),
                        'sl': entry_price * (1 + params['sl_percentage'])
                    })
        
        return signals

if __name__ == "__main__":
    try:
        # Read input from temporary file
        with open(sys.argv[1], 'r') as f:
            input_data = json.load(f)
        
        candleData = input_data['candleData']
        
        # Run strategy
        strategy = BTCStrategy(candleData)
        signals = strategy.calculate()
        
        # Output results
        print(json.dumps(signals))
        
    except Exception as e:
        print(json.dumps({
            "error": str(e),
            "details": {
                "message": str(e),
                "type": type(e).__name__
            }
        }))