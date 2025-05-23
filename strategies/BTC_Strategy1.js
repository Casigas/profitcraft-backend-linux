const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');

router.post('/:strategyId/analyze', async (req, res) => {
    try {
        const { strategyId } = req.params;
        const { candleData } = req.body;

        const pythonProcess = spawn('python', [
            path.join(__dirname, 'btc_strategy.py'),
            JSON.stringify({
                strategyId: strategyId,
                candleData: candleData
            })
        ]);

        let dataString = '';

        pythonProcess.stdout.on('data', (data) => {
            dataString += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`Python Error: ${data}`);
        });

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                return res.status(500).json({ success: false, error: 'Python process failed' });
            }
            try {
                const signals = JSON.parse(dataString);
                res.json({ success: true, signals });
            } catch (error) {
                res.status(500).json({ success: false, error: 'Failed to parse Python output' });
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;