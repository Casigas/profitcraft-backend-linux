const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const config = require('./config');
const strategyRoutes = require('./strategies/BTC_Strategy');
const crypto = require('crypto'); // For generating verification tokens
const nodemailer = require('nodemailer'); // For sending emails
const bcrypt = require('bcrypt'); // For password hashing


const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Add this near the top of your server.js
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Pentru redirecționare HTTPS în producție
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(`https://${req.headers.host}${req.url}`);
        }
        next();
    });
}

// Database connection
function connectDB() {
    sql.connect(config)
        .then(() => {
            console.log('Connected to SQL Server');
        })
        .catch(err => {
            console.error('Database connection failed:', err);
        });
}
connectDB();

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail', // or another email service
    auth: {
        user: 'your-email@gmail.com', // replace with your actual email
        pass: 'your-app-password' // replace with your app password
    }
});

// Function to send verification email
const sendVerificationEmail = async (email, verificationToken) => {
    const verificationUrl = `http://192.168.1.8:3000/api/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
        from: 'your-email@gmail.com', // replace with your email
        to: email,
        subject: 'ProfitCraft - Verify Your Email',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4a69bd;">Welcome to ProfitCraft!</h2>
                <p>Thank you for registering. Please verify your email address to activate your account.</p>
                <a href="${verificationUrl}" style="display: inline-block; background-color: #4a69bd; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 20px 0;">Verify Email</a>
                <p>If you didn't create an account, you can safely ignore this email.</p>
                <p>Best Regards,<br>The ProfitCraft Team</p>
            </div>
        `
    };
    
    return transporter.sendMail(mailOptions);
};

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const pool = await sql.connect(config);
        
        // First, get the user by email only
        const userResult = await pool.request()
            .input('Email', sql.VarChar, email)
            .query('SELECT * FROM Users WHERE Email = @Email');
            
        if (userResult.recordset && userResult.recordset.length > 0) {
            const user = userResult.recordset[0];
            
            // Compare the provided password with the stored hash
            const passwordMatch = await bcrypt.compare(password, user.Password);
            
            if (!passwordMatch) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Invalid credentials' 
                });
            }
            
            // Check if email is verified
            if (user.IsVerified === 0) {
                // Generate a new verification token
                const verificationToken = crypto.randomBytes(32).toString('hex');
                
                // Update the verification token in database
                await pool.request()
                    .input('UserId', sql.Int, user.UserId)
                    .input('VerificationToken', sql.VarChar(255), verificationToken)
                    .execute('sp_UpdateVerificationToken');
                
                // Return error with requiresVerification flag
                return res.status(403).json({
                    success: false,
                    requiresVerification: true,
                    message: 'Please verify your email before logging in. A new verification email has been sent.',
                    email: email
                });
            }
            
            // Don't send password back to client
            delete user.Password;
            res.json({ success: true, user: user });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Register endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName } = req.body;
        
        // Hash the password with bcrypt (10 rounds of salt)
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('Email', sql.VarChar, email)
            .input('Password', sql.VarChar, hashedPassword) // Store the hashed password
            .input('FirstName', sql.VarChar, firstName)
            .input('LastName', sql.VarChar, lastName)
            .input('VerificationToken', sql.VarChar(255), verificationToken)
            .input('IsVerified', sql.Bit, 0) // Set initial verification status to false
            .execute('sp_CreateUser');

        if (result.recordset[0].Success === 1) {
            // Send verification email
            try {
                await sendVerificationEmail(email, verificationToken);
                res.json({
                    success: true,
                    message: 'Account created! Please check your email to verify your account.',
                    requiresVerification: true,
                    email: email
                });
            } catch (emailError) {
                console.error('Error sending verification email:', emailError);
                res.json({
                    success: true,
                    message: 'Account created, but we could not send a verification email. Please contact support.',
                    requiresVerification: true,
                    email: email
                });
            }
        } else {
            res.json({
                success: false,
                message: result.recordset[0].Message
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Email verification endpoint
app.get('/api/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).send('Verification token is required');
        }
        
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('VerificationToken', sql.VarChar(255), token)
            .execute('sp_VerifyEmail');
            
        if (result.recordset && result.recordset[0].Success === 1) {
            // Redirect to a success page or return success HTML
            res.send(`
                <html>
                <head>
                    <title>Email Verified</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px 20px; }
                        .container { max-width: 600px; margin: 0 auto; }
                        h1 { color: #4a69bd; }
                        .success-icon { font-size: 64px; color: #28a745; margin-bottom: 20px; }
                        .btn { display: inline-block; background-color: #4a69bd; color: white; 
                               padding: 10px 20px; text-decoration: none; border-radius: 5px; 
                               margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="success-icon">✓</div>
                        <h1>Email Verified Successfully!</h1>
                        <p>Your account has been activated. You can now login to the ProfitCraft app.</p>
                        <a href="profitcraft://login" class="btn">Open ProfitCraft App</a>
                    </div>
                </body>
                </html>
            `);
        } else {
            res.status(400).send(`
                <html>
                <head>
                    <title>Verification Failed</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px 20px; }
                        .container { max-width: 600px; margin: 0 auto; }
                        h1 { color: #dc3545; }
                        .error-icon { font-size: 64px; color: #dc3545; margin-bottom: 20px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="error-icon">✗</div>
                        <h1>Verification Failed</h1>
                        <p>The verification link is invalid or has expired.</p>
                    </div>
                </body>
                </html>
            `);
        }
    } catch (err) {
        console.error('Error verifying email:', err);
        res.status(500).send('Server error during verification');
    }
});

// Resend verification email endpoint
app.post('/api/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email is required' 
            });
        }
        
        // Generate a new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        const pool = await sql.connect(config);
        
        // Update the token in the database
        const result = await pool.request()
            .input('Email', sql.VarChar, email)
            .input('VerificationToken', sql.VarChar(255), verificationToken)
            .execute('sp_UpdateVerificationTokenByEmail');
            
        if (result.recordset && result.recordset[0].Success === 1) {
            // Send verification email
            try {
                await sendVerificationEmail(email, verificationToken);
                res.json({
                    success: true,
                    message: 'Verification email sent successfully'
                });
            } catch (emailError) {
                console.error('Error sending verification email:', emailError);
                res.status(500).json({
                    success: false,
                    message: 'Failed to send verification email'
                });
            }
        } else {
            res.status(404).json({
                success: false,
                message: 'Email not found'
            });
        }
    } catch (err) {
        console.error('Error resending verification:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error'
        });
    }
});

// Add this to your server.js
app.post('/api/portfolio/add', async (req, res) => {
    try {
        console.log('Received request:', req.body);  // Debug log
        const { userId, symbol, quantity, purchasePrice } = req.body;
        const pool = await sql.connect(config);

        const result = await pool.request()
            .input('UserId', sql.Int, userId)
            .input('Symbol', sql.VarChar, symbol)
            .input('Quantity', sql.Decimal(18, 8), quantity)
            .input('PurchasePrice', sql.Decimal(18, 8), purchasePrice)
            .execute('sp_AddCryptoToPortfolio');

        res.json({
            success: result.recordset[0].Success === 1,
            message: result.recordset[0].Message
        });
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.use('/api/strategies', strategyRoutes);

// Create new strategy
app.post('/api/strategy/create', async (req, res) => {
    try {
        const {
            userId, cryptoId, strategyName, description,
            entryConditions, exitConditions, timeFrame,
            riskPercentage, takeProfit, stopLoss
        } = req.body;

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('UserId', sql.Int, userId)
            .input('CryptoId', sql.Int, cryptoId)
            .input('StrategyName', sql.VarChar(100), strategyName)
            .input('Description', sql.NVarChar(sql.MAX), description)
            .input('EntryConditions', sql.NVarChar(sql.MAX), entryConditions)
            .input('ExitConditions', sql.NVarChar(sql.MAX), exitConditions)
            .input('TimeFrame', sql.VarChar(20), timeFrame)
            .input('RiskPercentage', sql.Decimal(5, 2), riskPercentage)
            .input('TakeProfit', sql.Decimal(18, 8), takeProfit)
            .input('StopLoss', sql.Decimal(18, 8), stopLoss)
            .execute('sp_CreateStrategy');

        res.json({
            success: true,
            message: result.recordset[0].Message,
            strategyId: result.recordset[0].StrategyId
        });
    } catch (err) {
        console.error('Error creating strategy:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get user's strategies
app.get('/api/strategies/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('UserId', sql.Int, userId)
            .execute('sp_GetUserStrategies');

        res.json({
            success: true,
            strategies: result.recordset
        });
    } catch (err) {
        console.error('Error fetching strategies:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Record strategy trade
app.post('/api/strategy/trade', async (req, res) => {
    try {
        const { strategyId, entryPrice, quantity, direction } = req.body;
        const pool = await sql.connect(config);
        
        const result = await pool.request()
            .input('StrategyId', sql.Int, strategyId)
            .input('EntryPrice', sql.Decimal(18, 8), entryPrice)
            .input('Quantity', sql.Decimal(18, 8), quantity)
            .input('Direction', sql.VarChar(10), direction)
            .execute('sp_RecordStrategyTrade');

        res.json({
            success: true,
            message: result.recordset[0].Message,
            tradeId: result.recordset[0].TradeId
        });
    } catch (err) {
        console.error('Error recording trade:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get user indicators endpoint
app.get('/api/user/indicators/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('UserId', sql.Int, userId)
            .query(`SELECT UserIndicatorId, UserId, IndicatorId, Name, Type, Settings, IsActive 
                   FROM UserIndicators 
                   WHERE UserId = @UserId`);

        res.json({
            success: true,
            indicators: result.recordset
        });
    } catch (err) {
        console.error('Error fetching user indicators:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching indicators',
            error: err.message 
        });
    }
});

// Save user indicator endpoint
app.post('/api/user/indicators', async (req, res) => {
    try {
        const { userId, indicatorId, name, type, settings } = req.body;
        
        // Add detailed logging
        console.log('Save Indicator Request:', {
            userId,
            indicatorId,
            name,
            type,
            settings
        });

        const pool = await sql.connect(config);
        
        // Log before executing stored procedure
        console.log('Executing sp_SaveUserIndicator with params:', {
            UserId: userId,
            IndicatorId: indicatorId,
            Name: name,
            Type: type,
            Settings: settings
        });

        const result = await pool.request()
            .input('UserId', sql.Int, parseInt(userId))
            .input('IndicatorId', sql.VarChar(50), indicatorId)
            .input('Name', sql.NVarChar(100), name)
            .input('Type', sql.VarChar(50), type)
            .input('Settings', sql.NVarChar(sql.MAX), settings)
            .execute('sp_SaveUserIndicator');

        // Log the result
        console.log('Stored procedure result:', result);

        res.json({
            success: true,
            message: result.recordset[0].Message,
            userIndicatorId: result.recordset[0].UserIndicatorId
        });
    } catch (err) {
        console.error('Detailed error in save indicator:', {
            message: err.message,
            stack: err.stack,
            sqlState: err.sqlState,
            code: err.code
        });
        res.status(500).json({
            success: false,
            message: 'Error saving indicator',
            error: err.message
        });
    }
});

// Delete user indicator endpoint
app.delete('/api/user/indicators/:userIndicatorId', async (req, res) => {
    try {
        const userIndicatorId = req.params.userIndicatorId;
        const { userId } = req.body; // Extract userId from request body
        
        // Debug logging
        console.log('Delete indicator request:', {
            userIndicatorId,
            userId,
            body: req.body
        });
        
        // Validate inputs
        if (!userIndicatorId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: userIndicatorId or userId'
            });
        }
        
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('UserIndicatorId', sql.Int, parseInt(userIndicatorId))
            .input('UserId', sql.Int, parseInt(userId))
            .execute('sp_DeleteUserIndicator');
            
        console.log('Delete indicator result:', result);

        // Check if the deletion was successful
        if (result.recordset && result.recordset.length > 0) {
            const success = result.recordset[0].Success === 1 || result.recordset[0].Success === true;
            if (success) {
                return res.json({
                    success: true,
                    message: result.recordset[0].Message || 'Indicator deleted successfully'
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: result.recordset[0].Message || 'Failed to delete indicator'
                });
            }
        }
        
        // If we got here, assume success
        res.json({
            success: true,
            message: 'Indicator deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting user indicator:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error deleting indicator',
            error: err.message 
        });
    }
});

// Close strategy trade
app.post('/api/strategy/trade/close', async (req, res) => {
    try {
        const { tradeId, exitPrice } = req.body;
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('TradeId', sql.Int, tradeId)
            .input('ExitPrice', sql.Decimal(18, 8), exitPrice)
            .execute('sp_CloseStrategyTrade');

        res.json({
            success: true,
            message: result.recordset[0].Message
        });
    } catch (err) {
        console.error('Error closing trade:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});
// Get user's portfolio endpoint
app.get('/api/portfolio/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('UserId', sql.Int, userId)
            .execute('sp_GetUserPortfolio');

        if (result.recordset) {
            res.json({
                success: true,
                portfolio: result.recordset
            });
        } else {
            res.json({
                success: true,
                portfolio: []
            });
        }
    } catch (err) {
        console.error('Error fetching portfolio:', err);
        res.status(500).json({
            success: false,
            message: 'Error fetching portfolio'
        });
    }
});

// Get all available cryptocurrencies
app.get('/api/cryptocurrencies', async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request()
            .query('SELECT * FROM Cryptocurrencies WHERE IsActive = 1 ORDER BY MarketCap DESC');

        res.json({
            success: true,
            cryptocurrencies: result.recordset
        });
    } catch (err) {
        console.error('Error fetching cryptocurrencies:', err);
        res.status(500).json({
            success: false,
            message: 'Error fetching cryptocurrencies'
        });
    }
});

// Get strategy by ID
app.get('/api/strategy/:id', async (req, res) => {
    try {
        const strategyId = req.params.id;
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('StrategyId', sql.Int, strategyId)
            .execute('sp_GetStrategyById');

        if (result.recordset && result.recordset.length > 0) {
            const strategy = result.recordset[0];
            res.json({
                success: true,
                strategy: {
                    id: strategy.StrategyId,
                    name: strategy.StrategyName,
                    description: strategy.Description,
                    userId: strategy.UserId,
                    cryptoId: strategy.CryptoId,
                    entryConditions: JSON.parse(strategy.EntryConditions),
                    exitConditions: JSON.parse(strategy.ExitConditions),
                    timeFrame: strategy.TimeFrame,
                    riskPercentage: strategy.RiskPercentage,
                    takeProfit: strategy.TakeProfit,
                    stopLoss: strategy.StopLoss,
                    createdAt: strategy.CreatedAt,
                    isActive: strategy.IsActive
                }
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Strategy not found'
            });
        }
    } catch (err) {
        console.error('Error fetching strategy:', err);
        res.status(500).json({
            success: false,
            message: 'Error fetching strategy'
        });
    }
});

// Get all available indicators
app.get('/api/indicators', async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request()
            .execute('sp_GetAllIndicators');

        res.json({
            success: true,
            indicators: result.recordset
        });
    } catch (err) {
        console.error('Error fetching indicators:', err);
        res.status(500).json({
            success: false,
            message: 'Error fetching indicators',
            error: err.message
        });
    }
});

// Add this endpoint to handle indicator reactivation
// Updated PUT endpoint for reactivating indicators
app.put('/api/user/indicators/:userIndicatorId', async (req, res) => {
    try {
        const userIndicatorId = req.params.userIndicatorId;
        const { userId, isActive } = req.body;
        
        // Add detailed logging for debugging
        console.log('Update indicator request:', {
            userIndicatorId,
            userId,
            isActive,
            body: req.body
        });
        
        // Validate inputs
        if (!userIndicatorId || userId === undefined || isActive === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: userIndicatorId, userId, or isActive'
            });
        }
        
        const pool = await sql.connect(config);
        
        // First, get the current indicator data to properly update it
        const getResult = await pool.request()
            .input('UserIndicatorId', sql.Int, parseInt(userIndicatorId))
            .input('UserId', sql.Int, parseInt(userId))
            .query(`
                SELECT IndicatorId, Name, Type, Settings
                FROM UserIndicators
                WHERE UserIndicatorId = @UserIndicatorId
                AND UserId = @UserId
            `);
            
        if (getResult.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Indicator not found'
            });
        }
        
        const indicator = getResult.recordset[0];
        
        // Option 1: Use the existing sp_SaveUserIndicator stored procedure
        // This is recommended if it already has proper reactivation logic
        const result = await pool.request()
            .input('UserId', sql.Int, parseInt(userId))
            .input('IndicatorId', sql.VarChar(50), indicator.IndicatorId)
            .input('Name', sql.NVarChar(100), indicator.Name)
            .input('Type', sql.VarChar(50), indicator.Type)
            .input('Settings', sql.NVarChar(sql.MAX), indicator.Settings)
            .execute('sp_SaveUserIndicator');
            
        console.log('Reactivation result:', result);
        
        // Option 2 (Alternative): Update directly with query
        // Uncomment this if the stored procedure approach doesn't work
        /*
        const result = await pool.request()
            .input('UserIndicatorId', sql.Int, parseInt(userIndicatorId))
            .input('UserId', sql.Int, parseInt(userId))
            .input('IsActive', sql.Bit, isActive ? 1 : 0)
            .query(`
                UPDATE UserIndicators
                SET IsActive = @IsActive,
                    ModifiedDate = GETDATE()
                WHERE UserIndicatorId = @UserIndicatorId 
                AND UserId = @UserId;
                
                SELECT 'Indicator updated successfully' as Message,
                       1 as Success;
            `);
        */

        // Send appropriate response based on result
        if (result.recordset && result.recordset.length > 0) {
            return res.json({
                success: true,
                message: result.recordset[0].Message || 'Indicator updated successfully',
                userIndicatorId: result.recordset[0].UserIndicatorId || userIndicatorId
            });
        } else {
            return res.json({
                success: true,
                message: 'Indicator updated successfully'
            });
        }
    } catch (err) {
        console.error('Error updating indicator:', err);
        res.status(500).json({
            success: false,
            message: 'Error updating indicator',
            error: err.message
        });
    }
});

// Update the settings endpoint with better error handling
app.put('/api/user/indicators/:userIndicatorId/settings', async (req, res) => {
    try {
        const userIndicatorId = req.params.userIndicatorId;
        const { userId, settings } = req.body;
        
        // Add detailed logging
        console.log('Update settings request:', {
            userIndicatorId,
            userId,
            settings,
            body: req.body
        });
        
        // Validate inputs
        if (!userIndicatorId || !userId || !settings) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: userIndicatorId, userId, or settings'
            });
        }

        const pool = await sql.connect(config);

        // Ensure settings is a valid JSON string
        let settingsString;
        try {
            settingsString = typeof settings === 'string' ? settings : JSON.stringify(settings);
            // Validate JSON format
            JSON.parse(settingsString);
        } catch (parseError) {
            console.error('Settings parse error:', parseError);
            return res.status(400).json({
                success: false,
                message: 'Invalid settings format'
            });
        }

        // Execute the update procedure
        const result = await pool.request()
            .input('UserIndicatorId', sql.Int, parseInt(userIndicatorId))
            .input('UserId', sql.Int, parseInt(userId))
            .input('Settings', sql.NVarChar(sql.MAX), settingsString)
            .execute('sp_UpdateUserIndicatorSettings');
            
        console.log('Settings update result:', result);

        // Check if the procedure executed successfully
        if (result.recordset && result.recordset.length > 0) {
            if (result.recordset[0].Success === 1) {
                return res.json({
                    success: true,
                    message: result.recordset[0].Message,
                    userIndicatorId: result.recordset[0].UserIndicatorId
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: result.recordset[0].Message
                });
            }
        }

        // If we get here, something went wrong
        throw new Error('No response from stored procedure');
    } catch (err) {
        console.error('Detailed error in update settings:', {
            message: err.message,
            stack: err.stack,
            sqlState: err.sqlState,
            code: err.code
        });
        return res.status(500).json({
            success: false,
            message: 'Error updating indicator settings',
            error: err.message
        });
    }
});

// Utility endpoint to run the email verification setup SQL script
// This should be secured in production
app.get('/api/setup/email-verification', async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        
        // Read the SQL file
        const sqlFilePath = path.join(__dirname, 'db/email_verification_setup.sql');
        const sqlScript = fs.readFileSync(sqlFilePath, 'utf8');
        
        // Split the script into separate commands by GO statements
        const commands = sqlScript.split(/\r?\nGO\r?\n/);
        
        const pool = await sql.connect(config);
        
        // Execute each command
        for (const command of commands) {
            if (command.trim()) {
                await pool.request().query(command);
            }
        }
        
        res.json({
            success: true,
            message: 'Email verification database setup completed successfully'
        });
    } catch (err) {
        console.error('Error setting up email verification:', err);
        res.status(500).json({
            success: false,
            message: 'Error setting up email verification database',
            error: err.message
        });
    }
});

// Password reset request endpoint
app.post('/api/request-password-reset', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email is required' 
            });
        }
        
        // Generate a reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
        
        const pool = await sql.connect(config);
        
        // Check if user exists
        const userResult = await pool.request()
            .input('Email', sql.VarChar, email)
            .query('SELECT UserId FROM Users WHERE Email = @Email');
            
        if (!userResult.recordset || userResult.recordset.length === 0) {
            // Don't reveal that the user doesn't exist for security
            return res.json({
                success: true,
                message: 'If your email is registered, you will receive a password reset link.'
            });
        }
        
        // Store the reset token in the database
        await pool.request()
            .input('UserId', sql.Int, userResult.recordset[0].UserId)
            .input('ResetToken', sql.VarChar(255), resetToken)
            .input('ResetTokenExpiry', sql.DateTime, resetTokenExpiry)
            .query(`
                UPDATE Users 
                SET ResetToken = @ResetToken, 
                    ResetTokenExpiry = @ResetTokenExpiry 
                WHERE UserId = @UserId
            `);
        
        // Send password reset email
        const resetUrl = `http://192.168.1.8:3000/reset-password?token=${resetToken}`;
        
        const mailOptions = {
            from: 'your-email@gmail.com', // replace with your email
            to: email,
            subject: 'ProfitCraft - Password Reset',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4a69bd;">Reset Your Password</h2>
                    <p>You have requested to reset your password. Click the button below to proceed:</p>
                    <a href="${resetUrl}" style="display: inline-block; background-color: #4a69bd; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 20px 0;">Reset Password</a>
                    <p>If you didn't request this, you can safely ignore this email.</p>
                    <p>This link will expire in 1 hour.</p>
                    <p>Best Regards,<br>The ProfitCraft Team</p>
                </div>
            `
        };
        
        await transporter.sendMail(mailOptions);
        
        res.json({
            success: true,
            message: 'If your email is registered, you will receive a password reset link.'
        });
    } catch (err) {
        console.error('Error requesting password reset:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error'
        });
    }
});

// Reset password endpoint
app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Token and new password are required' 
            });
        }
        
        const pool = await sql.connect(config);
        
        // Find user with this token that hasn't expired
        const userResult = await pool.request()
            .input('ResetToken', sql.VarChar(255), token)
            .query(`
                SELECT UserId 
                FROM Users 
                WHERE ResetToken = @ResetToken 
                AND ResetTokenExpiry > GETDATE()
            `);
            
        if (!userResult.recordset || userResult.recordset.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }
        
        // Hash the new password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        
        // Update the user's password and clear the reset token
        await pool.request()
            .input('UserId', sql.Int, userResult.recordset[0].UserId)
            .input('NewPassword', sql.VarChar(255), hashedPassword)
            .execute('sp_UpdateUserPassword');
        
        // Clear the reset token
        await pool.request()
            .input('UserId', sql.Int, userResult.recordset[0].UserId)
            .query(`
                UPDATE Users 
                SET ResetToken = NULL, 
                    ResetTokenExpiry = NULL 
                WHERE UserId = @UserId
            `);
        
        res.json({
            success: true,
            message: 'Password has been reset successfully'
        });
    } catch (err) {
        console.error('Error resetting password:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error'
        });
    }
});

app.get('/api/node-version', (req, res) => {
  res.send(process.version);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});