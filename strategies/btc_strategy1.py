import numpy as np
import pandas as pd
import json
import sys

class BTCStrategy:
    def __init__(self, data):
        self.data = pd.DataFrame(data)
        self.initial_amount = 10000.0
        self.current_amount = self.initial_amount
        self.normal_bet = 200  # initial_sum
        self.increased_bet = 600  # triple_sum
        self.current_bet = self.normal_bet

    def calculate(self):
        self.data['entry_price'] = np.nan
        self.data['take_profit'] = np.nan
        self.data['stop_loss'] = np.nan
        self.data['in_position'] = False
        self.data['position_size'] = 0.0
        self.data['trade_profit'] = 0.0
        self.data['price_up'] = self.data['close'] > self.data['open']
        self.data['price_down'] = self.data['close'] < self.data['open']
        self.data['volume_usd_hundreds_millions'] = self.data['volume'] / 1000000

        signals = []
        for i in range(1, len(self.data)):
            last_candle_change = ((self.data['close'].iloc[i-1] - self.data['open'].iloc[i-1]) / 
                                 self.data['open'].iloc[i-1] * 100).round(2)
            last_volume = self.data['volume_usd_hundreds_millions'].iloc[i-1]

            if (0.48 <= abs(last_candle_change) <= 0.72) and last_volume >= 10:
                entry_price = self.data['open'].iloc[i]
                
                if self.data['price_down'].iloc[i-1]:
                    signals.append({
                        'timestamp': self.data.index[i],
                        'type': 'short',
                        'entry_price': entry_price,
                        'tp': entry_price * 0.990,
                        'sl': entry_price * 1.005,
                        'position_size': self.get_position_size(last_volume)
                    })
                
                elif self.data['price_up'].iloc[i-1]:
                    signals.append({
                        'timestamp': self.data.index[i],
                        'type': 'long',
                        'entry_price': entry_price,
                        'tp': entry_price * 1.010,
                        'sl': entry_price * 0.995,
                        'position_size': self.get_position_size(last_volume)
                    })

        return signals

    def get_position_size(self, volume):
        if volume >= 40:
            return 200
        elif volume >= 30:
            return 250
        else:
            return 335

if __name__ == "__main__":
    # Read input data from command line argument
    input_data = json.loads(sys.argv[1])
    
    # Create strategy instance and calculate signals
    strategy = BTCStrategy(input_data)
    signals = strategy.calculate()
    
    # Print results as JSON
    print(json.dumps(signals))