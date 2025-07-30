const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs/promises');
const crypto = require('crypto');

const chunkSize = 100;

async function createTempFilePath() {
    const uniqueId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const fileName = `btc_chunk_${uniqueId}_${timestamp}.json`;
    return path.join(os.tmpdir(), fileName).replace(/\\/g, '/');
}

async function safeDeleteFile(filePath, maxRetries = 3) {
    console.log(`Attempting to delete file: ${filePath}`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            try {
                await fs.access(filePath);
                console.log(`File exists, proceeding with deletion: ${filePath}`);
            } catch (accessError) {
                console.log(`File doesn't exist: ${filePath}`);
                return;
            }

            await fs.unlink(filePath);
            console.log(`Successfully deleted file: ${filePath}`);
            return;
        } catch (error) {
            console.error(`Attempt ${attempt + 1} failed to delete ${filePath}:`, error);

            if (error.code === 'ENOENT') {
                return;
            }

            if (attempt === maxRetries - 1) {
                console.warn(`Warning: Failed to delete temp file ${filePath} after ${maxRetries} attempts:`, error.message);
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        }
    }
}

async function processChunk(chunk, index) {
    let tempFile = null;

    try {
        tempFile = await createTempFilePath();
        console.log(`Created temp file for chunk ${index}: ${tempFile}`);

        try {
            await fs.writeFile(tempFile, JSON.stringify({ candleData: chunk }));
            console.log(`Successfully wrote data to temp file: ${tempFile}`);
        } catch (writeError) {
            throw new Error(`Failed to write temporary file: ${writeError.message}`);
        }

        const result = await new Promise((resolve, reject) => {
            const scriptPath = path.join(__dirname, 'btc_strategy.py').replace(/\\/g, '/');
            console.log(`Executing Python script: ${scriptPath} with temp file: ${tempFile}`);

            const pythonProcess = spawn('python', [scriptPath, tempFile]);

            let dataString = '';
            let errorString = '';

            pythonProcess.stdout.on('data', (data) => {
                dataString += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorString += data.toString();
                console.error('Python Error:', data.toString());
            });

            pythonProcess.on('close', async (code) => {
                console.log(`Python process exited with code ${code}`);
                if (code !== 0) {
                    reject(new Error(errorString || 'Python process failed'));
                } else {
                    try {
                        const parsedData = JSON.parse(dataString);
                        resolve(parsedData);
                    } catch (e) {
                        reject(new Error(`Failed to parse Python output: ${e.message}`));
                    }
                }
            });

            pythonProcess.on('error', (error) => {
                console.error('Failed to spawn Python process:', error);
                reject(new Error(`Failed to spawn Python process: ${error.message}`));
            });

            setTimeout(() => {
                pythonProcess.kill();
                reject(new Error('Python process timed out'));
            }, 30000);
        });

        return result;
    } catch (error) {
        console.error(`Error processing chunk ${index}:`, error);
        throw error;
    } finally {
        if (tempFile) {
            try {
                await safeDeleteFile(tempFile);
            } catch (deleteError) {
                console.warn(`Warning: Failed to delete temp file ${tempFile}:`, deleteError);
            }
        }
    }
}

router.post('/:strategyId/analyze', async (req, res) => {
    try {
        console.log('Starting strategy analysis');
        const { candleData } = req.body;

        if (!candleData || !Array.isArray(candleData)) {
            console.error('Invalid candle data format received');
            return res.status(400).json({
                success: false,
                error: 'Invalid candle data format'
            });
        }

        const chunks = [];
        for (let i = 0; i < candleData.length; i += chunkSize) {
            chunks.push(candleData.slice(i, i + chunkSize));
        }
        console.log(`Split data into ${chunks.length} chunks`);

        let allSignals = [];
        let errors = [];

        for (let i = 0; i < chunks.length; i++) {
            try {
                console.log(`Processing chunk ${i + 1}/${chunks.length}`);
                const result = await processChunk(chunks[i], i);
                if (Array.isArray(result)) {
                    allSignals = allSignals.concat(result);
                    console.log(`Successfully processed chunk ${i + 1}, got ${result.length} signals`);
                }
            } catch (error) {
                console.error(`Error processing chunk ${i}:`, error);
                errors.push({
                    chunk: i,
                    error: error.message
                });
            }
        }

        allSignals.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`Analysis complete. Total signals: ${allSignals.length}`);

        res.json({
            success: true,
            signals: allSignals,
            metadata: {
                totalSignals: allSignals.length,
                processedCandles: candleData.length,
                errors: errors.length > 0 ? errors : undefined
            }
        });

    } catch (error) {
        console.error('Strategy error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/analyze', async (req, res) => {
    // Use a dummy strategyId since it's not used in the handler
    req.params.strategyId = req.params.strategyId || 'dynamic';
    // Call the main handler
    const mainHandler = router.stack.find(layer => layer.route && layer.route.path === '/:strategyId/analyze' && layer.route.methods.post);
    if (mainHandler) {
        // Express layer handle expects (req, res, next), but we can call with (req, res)
        return mainHandler.handle(req, res);
    } else {
        return res.status(500).json({ success: false, error: 'Analyze handler not found' });
    }
});

module.exports = router;