require('dotenv').config();
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const config = require('./config');
// Email configuration for backend
const EMAIL_CONFIG = {
    FROM_ADDRESS: 'ProfitCraft <onboarding@resend.dev>',
    COMPANY_NAME: 'ProfitCraft',
    SUPPORT_EMAIL: 'onboarding@resend.dev'
};

// Email URLs for backend templates
const API_BASE_URL = 'https://profitcraft-backend-v2-bmb6fbg3bae5dje5.northeurope-01.azurewebsites.net';
const EMAIL_URLS = {
    VERIFY_EMAIL: (token) => `${API_BASE_URL}/api/verify-email?token=${token}`,
    RESET_PASSWORD: (token) => `${API_BASE_URL}/reset-password?token=${token}`,
    VERIFICATION_SUCCESS: `${API_BASE_URL}/verification-success`,
    APP_URL: API_BASE_URL
};
const strategyRoutes = require('./strategies/BTC_Strategy');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Resend } = require('resend');
const btcStrategyRouter = require('./strategies/BTC_Strategy');
const scalpingStrategyRouter = require('./strategies/ScalpingStrategyHandler');
const axios = require('axios');

const app = express();

app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(200).send();
});

app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    if (req.method === 'PUT' && req.url.includes('strategy')) {
        console.log(`[REQUEST TRACKER] PUT strategy request - URL: ${req.url}, Params:`, req.params);
    }
    next();
});

if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(`https://${req.headers.host}${req.url}`);
        }
        next();
    });
}

async function connectDB() {
    try {
        await sql.connect(config);
        console.log('Connected to SQL Server');
    } catch (err) {
        console.error('Database connection failed:', err);
    }
}
connectDB();

console.log('=== RESEND CONFIGURATION ===');
console.log('RESEND_API_KEY present:', !!process.env.RESEND_API_KEY);
console.log('RESEND_API_KEY starts with re_:', process.env.RESEND_API_KEY?.startsWith('re_'));
console.log('NODE_ENV:', process.env.NODE_ENV);

if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'your-resend-api-key-here') {
    console.error('❌ WARNING: RESEND_API_KEY not properly configured in .env file');
    console.error('Please add your actual Resend API key to the .env file');
}

const resend = new Resend(process.env.RESEND_API_KEY || 'your-resend-api-key-here');


const sendVerificationEmail = async (email, verificationToken) => {
    const verificationUrl = EMAIL_URLS.VERIFY_EMAIL(verificationToken);
    
    console.log('=== SENDING VERIFICATION EMAIL ===');
    console.log('To:', email);
    console.log('Verification URL:', verificationUrl);
    console.log('From address:', EMAIL_CONFIG.FROM_ADDRESS);
    
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'your-resend-api-key-here') {
        console.error('❌ Cannot send email: RESEND_API_KEY not configured');
        throw new Error('Email service not configured. Please add RESEND_API_KEY to .env file');
    }
    
    try {
        const { data, error } = await resend.emails.send({
            from: EMAIL_CONFIG.FROM_ADDRESS,
            to: [email],
            subject: 'ProfitCraft - Verify Your Email',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #4a69bd; margin-bottom: 10px;">Welcome to ${EMAIL_CONFIG.COMPANY_NAME}!</h1>
                        <p style="color: #666; font-size: 16px;">Thank you for registering with us</p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
                        <p style="margin: 0; color: #333; font-size: 16px;">
                            Please verify your email address to activate your account and start trading with confidence.
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-bottom: 30px;">
                        <a href="${verificationUrl}" 
                           style="display: inline-block; background-color: #4a69bd; color: white; 
                                  padding: 12px 30px; text-decoration: none; border-radius: 6px; 
                                  font-weight: bold; font-size: 16px;">
                            Verify Email Address
                        </a>
                    </div>
                    
                    <div style="border-top: 1px solid #eee; padding-top: 20px; color: #666; font-size: 14px;">
                        <p>If you didn't create an account with ${EMAIL_CONFIG.COMPANY_NAME}, you can safely ignore this email.</p>
                        <p>This verification link will expire in 24 hours for security reasons.</p>
                        <p style="margin-top: 20px;">
                            Best regards,<br>
                            <strong>The ${EMAIL_CONFIG.COMPANY_NAME} Team</strong>
                        </p>
                        <p style="margin-top: 15px; font-size: 12px;">
                            Need help? Contact us at <a href="mailto:${EMAIL_CONFIG.SUPPORT_EMAIL}" style="color: #4a69bd;">${EMAIL_CONFIG.SUPPORT_EMAIL}</a>
                        </p>
                    </div>
                </div>
            `
        });

        if (error) {
            console.error('❌ Resend email error:', error);
            throw new Error(error.message || 'Failed to send email via Resend');
        }

        console.log('✅ Verification email sent successfully!');
        console.log('Email ID:', data?.id);
        console.log('From:', data?.from);
        console.log('To:', data?.to);
        return data;
    } catch (error) {
        console.error('❌ Error sending verification email:', error.message);
        console.error('Full error:', error);
        throw error;
    }
};


const sendPasswordResetEmail = async (email, resetToken) => {
    const resetUrl = EMAIL_URLS.RESET_PASSWORD(resetToken);
    
    try {
        const { data, error } = await resend.emails.send({
            from: EMAIL_CONFIG.FROM_ADDRESS,
            to: [email],
            subject: 'ProfitCraft - Reset Your Password',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #4a69bd; margin-bottom: 10px;">Reset Your Password</h1>
                        <p style="color: #666; font-size: 16px;">We received a request to reset your password</p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
                        <p style="margin: 0; color: #333; font-size: 16px;">
                            To reset your password in the ProfitCraft mobile app, please use the following reset code:
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-bottom: 30px;">
                        <div style="background-color: #f8f9fa; border: 2px solid #dc3545; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <p style="margin: 0; color: #333; font-size: 14px; font-weight: bold;">Reset Code:</p>
                            <p style="margin: 5px 0 0 0; color: #dc3545; font-size: 18px; font-weight: bold; letter-spacing: 2px;">${resetToken}</p>
                        </div>
                        <p style="color: #666; font-size: 14px; margin: 0;">
                            1. Open the ProfitCraft app<br>
                            2. Go to Login → Forgot Password<br>
                            3. Enter your email and request a reset<br>
                            4. Use the code above when prompted
                        </p>
                    </div>
                    
                    <div style="text-align: center; margin-bottom: 30px;">
                        <a href="${resetUrl}" 
                           style="display: inline-block; background-color: #dc3545; color: white; 
                                  padding: 12px 30px; text-decoration: none; border-radius: 6px; 
                                  font-weight: bold; font-size: 16px;">
                            Reset Password (Web)
                        </a>
                    </div>
                    
                    <div style="border-top: 1px solid #eee; padding-top: 20px; color: #666; font-size: 14px;">
                        <p>If you didn't request a password reset, you can safely ignore this email.</p>
                        <p>For security reasons, this link will expire in 1 hour.</p>
                        <p style="margin-top: 20px;">
                            Best regards,<br>
                            <strong>The ${EMAIL_CONFIG.COMPANY_NAME} Team</strong>
                        </p>
                        <p style="margin-top: 15px; font-size: 12px;">
                            Need help? Contact us at <a href="mailto:${EMAIL_CONFIG.SUPPORT_EMAIL}" style="color: #4a69bd;">${EMAIL_CONFIG.SUPPORT_EMAIL}</a>
                        </p>
                    </div>
                </div>
            `
        });

        if (error) {
            console.error('Resend password reset email error:', error);
            throw new Error(error.message);
        }

        console.log('Password reset email sent successfully:', data);
        return data;
    } catch (error) {
        console.error('Error sending password reset email:', error);
        throw error;
    }
};

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('\n=== LOGIN REQUEST ===');
        console.log('Email:', email);
        console.log('Password length:', password ? password.length : 'undefined');
        console.log('Request headers:', req.headers);
        
        const pool = await sql.connect(config);
        
        const userResult = await pool.request()
            .input('Email', sql.VarChar, email)
            .query('SELECT * FROM Users WHERE Email = @Email');
            
        console.log('Database query result:', {
            recordCount: userResult.recordset?.length || 0,
            userFound: userResult.recordset?.length > 0
        });
            
        if (userResult.recordset && userResult.recordset.length > 0) {
            const user = userResult.recordset[0];
            console.log('User found in database:', {
                UserId: user.UserId,
                Email: user.Email,
                FirstName: user.FirstName,
                LastName: user.LastName,
                IsVerified: user.IsVerified,
                HasPassword: !!user.Password,
                PasswordLength: user.Password ? user.Password.length : 0
            });
            
            // First check email verification status before password verification
            console.log('Checking email verification status:', user.IsVerified);
            if (user.IsVerified === 0 || user.IsVerified === false) {
                console.log('❌ Email not verified - generating new token');
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
            
            // Now check password after email verification is confirmed
            console.log('Comparing passwords...');
            console.log('Provided password:', password);
            console.log('Stored hash (first 20 chars):', user.Password ? user.Password.substring(0, 20) + '...' : 'No password');
            
            const passwordMatch = await bcrypt.compare(password, user.Password);
            console.log('Password match result:', passwordMatch);
            
            if (!passwordMatch) {
                console.log('❌ Password mismatch - returning invalid credentials');
                return res.status(401).json({ 
                    success: false, 
                    message: 'Invalid credentials' 
                });
            }
            
            console.log('✅ Login successful for user:', user.Email);
            delete user.Password;
            res.json({ success: true, user: user });
        } else {
            console.log('❌ No user found with email:', email);
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error('❌ Login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Register endpoint
app.post('/api/register', async (req, res) => {
    try {
        console.log('\n=== REGISTRATION REQUEST ===');
        console.log('Registration attempt for email:', req.body.email);
        
        const { email, password, firstName, lastName } = req.body;
        
        // Validate input
        if (!email || !password || !firstName || !lastName) {
            console.error('❌ Missing required fields');
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.error('❌ Invalid email format:', email);
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        const pool = await sql.connect(config);
        
        // First check if email already exists
        console.log('🔍 Checking if email already exists...');
        const existingUser = await pool.request()
            .input('Email', sql.VarChar, email)
            .query('SELECT UserId, IsVerified FROM Users WHERE Email = @Email');

        if (existingUser.recordset && existingUser.recordset.length > 0) {
            const user = existingUser.recordset[0];
            console.log('⚠️  Email already exists. User verified:', user.IsVerified);
            
            if (user.IsVerified === 0 || user.IsVerified === false) {
                // User exists but not verified - generate new token and allow resend
                console.log('📧 User exists but not verified, generating new verification token...');
                const verificationToken = crypto.randomBytes(32).toString('hex');
                
                await pool.request()
                    .input('UserId', sql.Int, user.UserId)
                    .input('VerificationToken', sql.VarChar(255), verificationToken)
                    .execute('sp_UpdateVerificationToken');
                
                // Try to send verification email
                try {
                    await sendVerificationEmail(email, verificationToken);
                    console.log('✅ New verification email sent for existing unverified user');
                    return res.json({
                        success: false,
                        message: 'This email is already registered but not verified. A new verification email has been sent.',
                        requiresVerification: true,
                        email: email,
                        isExistingUnverified: true
                    });
                } catch (emailError) {
                    console.error('❌ Failed to send verification email for existing user:', emailError.message);
                    return res.json({
                        success: false,
                        message: 'This email is already registered but not verified. Please use the resend verification option.',
                        requiresVerification: true,
                        email: email,
                        isExistingUnverified: true
                    });
                }
            } else {
                // User exists and is verified
                console.log('❌ Email already exists and is verified');
                return res.status(409).json({
                    success: false,
                    message: 'An account with this email already exists. Please use a different email or try logging in.',
                    isExistingVerified: true
                });
            }
        }
        
        // Email doesn't exist, proceed with registration
        console.log('✅ Email is available, proceeding with registration...');
        
        // Hash the password with bcrypt (10 rounds of salt)
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        const result = await pool.request()
            .input('Email', sql.VarChar, email)
            .input('Password', sql.VarChar, hashedPassword) // Store the hashed password
            .input('FirstName', sql.VarChar, firstName)
            .input('LastName', sql.VarChar, lastName)
            .input('VerificationToken', sql.VarChar(255), verificationToken)
            .input('IsVerified', sql.Bit, 0) // Set initial verification status to false
            .execute('sp_CreateUser');

        if (result.recordset[0].Success === 1) {
            // Send verification email using Resend
            try {
                await sendVerificationEmail(email, verificationToken);
                console.log('✅ Registration successful and verification email sent');
                res.json({
                    success: true,
                    message: 'Account created! Please check your email to verify your account.',
                    requiresVerification: true,
                    email: email
                });
            } catch (emailError) {
                console.error('❌ Registration successful but email sending failed:', emailError.message);
                res.json({
                    success: true,
                    message: 'Account created, but we could not send a verification email. Please use the resend option or contact support.',
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
        console.log('\n=== RESEND VERIFICATION REQUEST ===');
        console.log('Request body:', req.body);
        
        const { email } = req.body;
        
        if (!email) {
            console.error('❌ Missing email parameter');
            return res.status(400).json({ 
                success: false, 
                message: 'Email is required' 
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.error('❌ Invalid email format:', email);
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        console.log('📧 Processing resend request for:', email);
        
        // Generate a new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        console.log('🔑 Generated new verification token');
        
        const pool = await sql.connect(config);
        
        // Update the token in the database
        const result = await pool.request()
            .input('Email', sql.VarChar, email)
            .input('VerificationToken', sql.VarChar(255), verificationToken)
            .execute('sp_UpdateVerificationTokenByEmail');
            
        console.log('Database update result:', result.recordset[0]);
            
        if (result.recordset && result.recordset[0].Success === 1) {
            // Send verification email using Resend
            try {
                await sendVerificationEmail(email, verificationToken);
                console.log('✅ Resend verification completed successfully');
                res.json({
                    success: true,
                    message: 'Verification email sent! Please check your inbox and spam folder.'
                });
            } catch (emailError) {
                console.error('❌ Error sending verification email:', emailError.message);
                
                // Provide more specific error messages based on the error type
                let errorMessage = 'Failed to send verification email. Please try again.';
                if (emailError.message.includes('not configured')) {
                    errorMessage = 'Email service is not properly configured. Please contact support.';
                } else if (emailError.message.includes('rate limit')) {
                    errorMessage = 'Too many email requests. Please wait a moment before trying again.';
                } else if (emailError.message.includes('invalid email')) {
                    errorMessage = 'The email address appears to be invalid.';
                }
                
                res.status(500).json({
                    success: false,
                    message: errorMessage
                });
            }
        } else {
            console.error('❌ Email not found in database:', email);
            res.status(404).json({
                success: false,
                message: 'Email address not found. Please check your email or create a new account.'
            });
        }
    } catch (err) {
        console.error('❌ Error resending verification:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Network error. Please check your connection and try again.'
        });
    }
});

// Add this to your server.js
app.post('/api/portfolio/add', async (req, res) => {
    try {
        console.log('\n=== PORTFOLIO ADD REQUEST ===');
        console.log('Received request body:', JSON.stringify(req.body, null, 2));
        console.log('Request headers:', req.headers);
        
        const { userId, symbol, quantity, purchasePrice, checkDuplicate } = req.body;
        
        // Validate required parameters
        if (!userId || !symbol || !quantity || !purchasePrice) {
            console.error('Missing required parameters:', { userId, symbol, quantity, purchasePrice });
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required parameters: userId, symbol, quantity, or purchasePrice' 
            });
        }
        
        // Validate data types
        const numUserId = parseInt(userId);
        const numQuantity = parseFloat(quantity);
        const numPrice = parseFloat(purchasePrice);
        
        if (isNaN(numUserId) || isNaN(numQuantity) || isNaN(numPrice)) {
            console.error('Invalid data types:', { userId: numUserId, quantity: numQuantity, price: numPrice });
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid data types for userId, quantity, or purchasePrice' 
            });
        }
        
        console.log('Validated parameters:', {
            userId: numUserId,
            symbol,
            quantity: numQuantity,
            purchasePrice: numPrice,
            checkDuplicate
        });

        const pool = await sql.connect(config);
        console.log('Database connection established');

        // Check for existing cryptocurrency in portfolio if checkDuplicate is true
        if (checkDuplicate) {
            console.log('Checking for duplicate cryptocurrency...');
            const existingCheck = await pool.request()
                .input('UserId', sql.Int, numUserId)
                .input('Symbol', sql.VarChar, symbol)
                .query('SELECT * FROM UserPortfolio WHERE UserId = @UserId AND Symbol = @Symbol');
                
            console.log('Existing crypto check result:', existingCheck.recordset);
            
            if (existingCheck.recordset && existingCheck.recordset.length > 0) {
                // Cryptocurrency already exists - update the quantity
                console.log('Cryptocurrency exists, updating quantity...');
                const existingCrypto = existingCheck.recordset[0];
                const newQuantity = parseFloat(existingCrypto.Quantity) + numQuantity;
                
                // Calculate weighted average price
                const existingValue = parseFloat(existingCrypto.Quantity) * parseFloat(existingCrypto.PurchasePrice);
                const newValue = numQuantity * numPrice;
                const totalValue = existingValue + newValue;
                const weightedAvgPrice = totalValue / newQuantity;
                
                console.log('Price calculation:', {
                    existingQuantity: existingCrypto.Quantity,
                    existingPrice: existingCrypto.PurchasePrice,
                    newQuantity: numQuantity,
                    newPrice: numPrice,
                    weightedAvgPrice: weightedAvgPrice
                });
                
                const updateResult = await pool.request()
                    .input('UserId', sql.Int, numUserId)
                    .input('Symbol', sql.VarChar, symbol)
                    .input('NewQuantity', sql.Decimal(18, 8), newQuantity)
                    .input('NewAvgPrice', sql.Decimal(18, 8), weightedAvgPrice)
                    .query(`
                        UPDATE UserPortfolio 
                        SET Quantity = @NewQuantity, 
                            PurchasePrice = @NewAvgPrice,
                            LastUpdated = GETDATE()
                        WHERE UserId = @UserId AND Symbol = @Symbol;
                        
                        SELECT 1 as Success, 'Cryptocurrency quantity updated successfully' as Message;
                    `);
                    
                console.log('Update result:', updateResult.recordset);
                
                return res.json({
                    success: true,
                    message: `Successfully added ${numQuantity} ${symbol} to your existing holdings. New total: ${newQuantity.toFixed(8)} ${symbol}`,
                    updated: true,
                    newQuantity: newQuantity,
                    newAvgPrice: weightedAvgPrice
                });
            }
        }

        // No existing crypto found or checkDuplicate is false - create new entry
        console.log('Creating new portfolio entry...');
        const result = await pool.request()
            .input('UserId', sql.Int, numUserId)
            .input('Symbol', sql.VarChar, symbol)
            .input('Quantity', sql.Decimal(18, 8), numQuantity)
            .input('PurchasePrice', sql.Decimal(18, 8), numPrice)
            .execute('sp_AddCryptoToPortfolio');

        console.log('Stored procedure executed');
        console.log('Result recordset:', result.recordset);
        
        if (result.recordset && result.recordset.length > 0) {
            const success = result.recordset[0].Success === 1;
            const message = result.recordset[0].Message;
            
            console.log('Operation result:', { success, message });
            
            res.json({
                success: success,
                message: message,
                updated: false
            });
        } else {
            console.error('No result from stored procedure');
            res.status(500).json({ 
                success: false, 
                message: 'No response from database procedure' 
            });
        }
    } catch (err) {
        console.error('=== PORTFOLIO ADD ERROR ===');
        console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            sqlState: err.sqlState
        });
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + err.message 
        });
    }
});

// Remove crypto from portfolio endpoint
app.delete('/api/portfolio/remove', async (req, res) => {
    try {
        console.log('\n=== PORTFOLIO REMOVE REQUEST ===');
        console.log('Received request body:', JSON.stringify(req.body, null, 2));
        console.log('Request headers:', req.headers);
        
        const { userId, symbol, portfolioId } = req.body;
        
        // Validate required parameters
        if (!userId || !symbol) {
            console.error('Missing required parameters:', { userId, symbol });
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required parameters: userId or symbol' 
            });
        }
        
        const numUserId = parseInt(userId);
        if (isNaN(numUserId)) {
            console.error('Invalid userId:', userId);
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid userId format' 
            });
        }
        
        console.log('Validated parameters:', {
            userId: numUserId,
            symbol,
            portfolioId
        });

        const pool = await sql.connect(config);
        console.log('Database connection established');

        const result = await pool.request()
            .input('UserId', sql.Int, numUserId)
            .input('Symbol', sql.NVarChar(10), symbol)
            .input('PortfolioId', sql.Int, portfolioId ? parseInt(portfolioId) : null)
            .execute('sp_RemoveCryptoFromPortfolio');

        console.log('Stored procedure executed');
        console.log('Result recordset:', result.recordset);
        
        if (result.recordset && result.recordset.length > 0) {
            const response = result.recordset[0];
            const success = response.Success === 1;
            
            console.log('Operation result:', { success, message: response.Message });
            
            res.json({
                success: success,
                message: response.Message,
                deletedQuantity: response.DeletedQuantity,
                symbol: response.Symbol
            });
        } else {
            console.error('No result from stored procedure');
            res.status(500).json({ 
                success: false, 
                message: 'No response from database procedure' 
            });
        }
    } catch (err) {
        console.error('=== PORTFOLIO REMOVE ERROR ===');
        console.error('Error details:', {
            message: err.message,
            stack: err.stack,
            code: err.code,
            sqlState: err.sqlState
        });
        res.status(500).json({ 
            success: false, 
            message: 'Server error: ' + err.message 
        });
    }
});

app.use('/api/strategies', strategyRoutes);

// Create new strategy
app.post('/api/strategy/create', async (req, res) => {
    try {
        const {
            userId, cryptoId, strategyName, description,
            entryConditions, exitConditions, timeFrame,
            riskPercentage, takeProfit, stopLoss, handlerType
        } = req.body;

        // Validate required parameters
        if (!userId || !cryptoId || !strategyName) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: userId, cryptoId, or strategyName'
            });
        }

        const parsedUserId = parseInt(userId);
        const parsedCryptoId = parseInt(cryptoId);

        if (isNaN(parsedUserId) || isNaN(parsedCryptoId)) {
            return res.status(400).json({
                success: false,
                message: 'userId and cryptoId must be valid numbers'
            });
        }

        console.log(`[CREATE STRATEGY] Creating strategy for user ${parsedUserId}:`, {
            strategyName,
            handlerType,
            cryptoId: parsedCryptoId
        });

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('UserId', sql.Int, parsedUserId)
            .input('CryptoId', sql.Int, parsedCryptoId)
            .input('StrategyName', sql.VarChar(100), strategyName)
            .input('Description', sql.NVarChar(sql.MAX), description)
            .input('EntryConditions', sql.NVarChar(sql.MAX), entryConditions)
            .input('ExitConditions', sql.NVarChar(sql.MAX), exitConditions)
            .input('TimeFrame', sql.VarChar(20), timeFrame)
            .input('RiskPercentage', sql.Decimal(5, 2), parseFloat(riskPercentage) || 0)
            .input('TakeProfit', sql.Decimal(18, 8), parseFloat(takeProfit) || 0)
            .input('StopLoss', sql.Decimal(18, 8), parseFloat(stopLoss) || 0)
            .input('HandlerType', sql.NVarChar(50), handlerType || 'scalping') // Default to scalping for new strategies
            .execute('sp_CreateStrategy');

        console.log(`[CREATE STRATEGY] Strategy created with ID: ${result.recordset[0]?.StrategyId}`);

        res.json({
            success: true,
            message: result.recordset[0].Message,
            strategyId: result.recordset[0].StrategyId
        });
    } catch (err) {
        console.error('[CREATE STRATEGY] Error creating strategy:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while creating strategy',
            error: err.message 
        });
    }
});

// Update existing strategy
app.put('/api/strategy/create/:strategyId', async (req, res) => {
    try {
        const { strategyId } = req.params;
        const {
            userId, cryptoId, strategyName, description,
            entryConditions, exitConditions, timeFrame,
            riskPercentage, takeProfit, stopLoss, handlerType
        } = req.body;

        console.log(`[UPDATE STRATEGY] Full URL: ${req.url}`);
        console.log(`[UPDATE STRATEGY] Method: ${req.method}`);
        console.log(`[UPDATE STRATEGY] Params:`, req.params);
        console.log(`[UPDATE STRATEGY] Raw strategyId from params: "${strategyId}"`);
        console.log(`[UPDATE STRATEGY] Request body:`, JSON.stringify(req.body, null, 2));

        // Validate strategyId parameter
        if (!strategyId || strategyId === 'undefined' || strategyId === 'null') {
            console.error('[UPDATE STRATEGY] Invalid strategyId parameter');
            console.error('[UPDATE STRATEGY] All req.params:', req.params);
            console.error('[UPDATE STRATEGY] req.url:', req.url);
            return res.status(400).json({
                success: false,
                message: 'Invalid strategy ID parameter'
            });
        }

        const parsedStrategyId = parseInt(strategyId);
        if (isNaN(parsedStrategyId)) {
            console.error(`[UPDATE STRATEGY] Could not parse strategyId: "${strategyId}"`);
            return res.status(400).json({
                success: false,
                message: 'Strategy ID must be a valid number'
            });
        }

        // Validate other required parameters
        if (!userId || !cryptoId || !strategyName) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: userId, cryptoId, or strategyName'
            });
        }

        console.log(`[UPDATE STRATEGY] Updating strategy ${parsedStrategyId} for user ${userId}`);

        const pool = await sql.connect(config);
        
        console.log(`[UPDATE STRATEGY] SP Parameters:`, {
            StrategyId: parsedStrategyId,
            UserId: parseInt(userId),
            CryptoId: parseInt(cryptoId),
            StrategyName: strategyName
        });
        
        const result = await pool.request()
            .input('StrategyId', sql.Int, parsedStrategyId)
            .input('UserId', sql.Int, parseInt(userId))
            .input('CryptoId', sql.Int, parseInt(cryptoId))
            .input('StrategyName', sql.NVarChar(100), strategyName)
            .input('Description', sql.NVarChar(sql.MAX), description)
            .input('EntryConditions', sql.NVarChar(sql.MAX), entryConditions)
            .input('ExitConditions', sql.NVarChar(sql.MAX), exitConditions)
            .input('TimeFrame', sql.NVarChar(20), timeFrame)
            .input('RiskPercentage', sql.Decimal(5, 2), parseFloat(riskPercentage))
            .input('TakeProfit', sql.Decimal(18, 8), parseFloat(takeProfit))
            .input('StopLoss', sql.Decimal(18, 8), parseFloat(stopLoss))
            .input('HandlerType', sql.NVarChar(50), handlerType || 'scalping') // Default to scalping for updates
            .execute('sp_UpdateStrategy');

        console.log(`[UPDATE STRATEGY] Result:`, result.recordset[0]);

        if (result.recordset && result.recordset[0].Success) {
            res.json({
                success: true,
                message: result.recordset[0].Message,
                strategyId: result.recordset[0].StrategyId
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.recordset[0].Message || 'Failed to update strategy'
            });
        }
    } catch (err) {
        console.error('[UPDATE STRATEGY] Error updating strategy:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while updating strategy' 
        });
    }
});

// Alternative update strategy route patterns in case frontend is using different URL
app.put('/api/strategy/:strategyId', async (req, res) => {
    try {
        console.log('[UPDATE STRATEGY ALT1] Alternative route called with strategyId:', req.params.strategyId);
        const { strategyId } = req.params;
        const {
            userId, cryptoId, strategyName, description,
            entryConditions, exitConditions, timeFrame,
            riskPercentage, takeProfit, stopLoss, handlerType
        } = req.body;

        console.log(`[UPDATE STRATEGY ALT1] strategyId: "${strategyId}"`);

        // Validate strategyId parameter
        if (!strategyId || strategyId === 'undefined' || strategyId === 'null') {
            console.error('[UPDATE STRATEGY ALT1] Invalid strategyId parameter');
            return res.status(400).json({
                success: false,
                message: 'Invalid strategy ID parameter'
            });
        }

        const parsedStrategyId = parseInt(strategyId);
        if (isNaN(parsedStrategyId)) {
            console.error(`[UPDATE STRATEGY ALT1] Could not parse strategyId: "${strategyId}"`);
            return res.status(400).json({
                success: false,
                message: 'Strategy ID must be a valid number'
            });
        }

        // Validate other required parameters
        if (!userId || !cryptoId || !strategyName) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: userId, cryptoId, or strategyName'
            });
        }

        const pool = await sql.connect(config);
        
        const result = await pool.request()
            .input('StrategyId', sql.Int, parsedStrategyId)
            .input('UserId', sql.Int, parseInt(userId))
            .input('CryptoId', sql.Int, parseInt(cryptoId))
            .input('StrategyName', sql.NVarChar(100), strategyName)
            .input('Description', sql.NVarChar(sql.MAX), description)
            .input('EntryConditions', sql.NVarChar(sql.MAX), entryConditions)
            .input('ExitConditions', sql.NVarChar(sql.MAX), exitConditions)
            .input('TimeFrame', sql.NVarChar(20), timeFrame)
            .input('RiskPercentage', sql.Decimal(5, 2), parseFloat(riskPercentage))
            .input('TakeProfit', sql.Decimal(18, 8), parseFloat(takeProfit))
            .input('StopLoss', sql.Decimal(18, 8), parseFloat(stopLoss))
            .input('HandlerType', sql.NVarChar(50), handlerType || 'scalping') // Default to scalping for ALT1 update
            .execute('sp_UpdateStrategy');

        if (result.recordset && result.recordset[0].Success) {
            res.json({
                success: true,
                message: result.recordset[0].Message,
                strategyId: result.recordset[0].StrategyId
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.recordset[0].Message || 'Failed to update strategy'
            });
        }
    } catch (err) {
        console.error('[UPDATE STRATEGY ALT1] Error updating strategy:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while updating strategy' 
        });
    }
});

app.put('/api/strategies/:strategyId', async (req, res) => {
    try {
        console.log('[UPDATE STRATEGY ALT2] Alternative route called with strategyId:', req.params.strategyId);
        const { strategyId } = req.params;
        const {
            userId, cryptoId, strategyName, description,
            entryConditions, exitConditions, timeFrame,
            riskPercentage, takeProfit, stopLoss, handlerType
        } = req.body;

        console.log(`[UPDATE STRATEGY ALT2] strategyId: "${strategyId}"`);

        // Validate strategyId parameter
        if (!strategyId || strategyId === 'undefined' || strategyId === 'null') {
            console.error('[UPDATE STRATEGY ALT2] Invalid strategyId parameter');
            return res.status(400).json({
                success: false,
                message: 'Invalid strategy ID parameter'
            });
        }

        const parsedStrategyId = parseInt(strategyId);
        if (isNaN(parsedStrategyId)) {
            console.error(`[UPDATE STRATEGY ALT2] Could not parse strategyId: "${strategyId}"`);
            return res.status(400).json({
                success: false,
                message: 'Strategy ID must be a valid number'
            });
        }

        // Validate other required parameters
        if (!userId || !cryptoId || !strategyName) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: userId, cryptoId, or strategyName'
            });
        }

        const pool = await sql.connect(config);
        
        const result = await pool.request()
            .input('StrategyId', sql.Int, parsedStrategyId)
            .input('UserId', sql.Int, parseInt(userId))
            .input('CryptoId', sql.Int, parseInt(cryptoId))
            .input('StrategyName', sql.NVarChar(100), strategyName)
            .input('Description', sql.NVarChar(sql.MAX), description)
            .input('EntryConditions', sql.NVarChar(sql.MAX), entryConditions)
            .input('ExitConditions', sql.NVarChar(sql.MAX), exitConditions)
            .input('TimeFrame', sql.NVarChar(20), timeFrame)
            .input('RiskPercentage', sql.Decimal(5, 2), parseFloat(riskPercentage))
            .input('TakeProfit', sql.Decimal(18, 8), parseFloat(takeProfit))
            .input('StopLoss', sql.Decimal(18, 8), parseFloat(stopLoss))
            .input('HandlerType', sql.NVarChar(50), handlerType || 'scalping') // Default to scalping for ALT2 update
            .execute('sp_UpdateStrategy');

        if (result.recordset && result.recordset[0].Success) {
            res.json({
                success: true,
                message: result.recordset[0].Message,
                strategyId: result.recordset[0].StrategyId
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.recordset[0].Message || 'Failed to update strategy'
            });
        }
    } catch (err) {
        console.error('[UPDATE STRATEGY ALT2] Error updating strategy:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while updating strategy' 
        });
    }
});

// Get user's strategies
app.get('/api/strategies/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Validate userId parameter
        if (!userId || userId === 'undefined' || userId === 'null') {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID parameter'
            });
        }

        const parsedUserId = parseInt(userId);
        if (isNaN(parsedUserId)) {
            return res.status(400).json({
                success: false,
                message: 'User ID must be a valid number'
            });
        }

        console.log(`[GET STRATEGIES] Fetching strategies for user: ${parsedUserId}`);

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('UserId', sql.Int, parsedUserId)
            .query(`
                SELECT 
                    StrategyId,
                    UserId,
                    CryptoId,
                    StrategyName,
                    Description,
                    EntryConditions,
                    ExitConditions,
                    TimeFrame,
                    RiskPercentage,
                    TakeProfit,
                    StopLoss,
                    HandlerType,
                    CreatedAt,
                    IsActive
                FROM Strategies 
                WHERE UserId = @UserId AND IsActive = 1
                ORDER BY CreatedAt DESC
            `);

        console.log(`[GET STRATEGIES] Found ${result.recordset?.length || 0} strategies for user ${parsedUserId}`);

        res.json({
            success: true,
            strategies: result.recordset || []
        });
    } catch (err) {
        console.error(`[GET STRATEGIES] Error fetching strategies:`, err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while fetching strategies',
            error: err.message 
        });
    }
});

// Record strategy trade
app.post('/api/strategy/trade', async (req, res) => {
    try {
        const { strategyId, entryPrice, quantity, direction, userId } = req.body;
        
        // Validate required parameters
        if (!strategyId || !entryPrice || !quantity || !direction) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: strategyId, entryPrice, quantity, or direction'
            });
        }

        const parsedStrategyId = parseInt(strategyId);
        if (isNaN(parsedStrategyId)) {
            return res.status(400).json({
                success: false,
                message: 'strategyId must be a valid number'
            });
        }

        console.log(`[RECORD TRADE] Recording trade for strategy ${parsedStrategyId}:`, {
            entryPrice,
            quantity,
            direction
        });

        const pool = await sql.connect(config);
        
        const result = await pool.request()
            .input('StrategyId', sql.Int, parsedStrategyId)
            .input('EntryPrice', sql.Decimal(18, 8), parseFloat(entryPrice))
            .input('Quantity', sql.Decimal(18, 8), parseFloat(quantity))
            .input('Direction', sql.VarChar(10), direction)
            .execute('sp_RecordStrategyTrade');

        console.log(`[RECORD TRADE] Trade recorded with ID: ${result.recordset[0]?.TradeId}`);

        res.json({
            success: true,
            message: result.recordset[0].Message,
            tradeId: result.recordset[0].TradeId
        });
    } catch (err) {
        console.error('[RECORD TRADE] Error recording trade:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while recording trade',
            error: err.message 
        });
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
        const { tradeId, exitPrice, userId } = req.body;
        
        // Validate required parameters
        if (!tradeId || !exitPrice) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: tradeId or exitPrice'
            });
        }

        const parsedTradeId = parseInt(tradeId);
        if (isNaN(parsedTradeId)) {
            return res.status(400).json({
                success: false,
                message: 'tradeId must be a valid number'
            });
        }

        console.log(`[CLOSE TRADE] Closing trade ${parsedTradeId} with exit price: ${exitPrice}`);

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('TradeId', sql.Int, parsedTradeId)
            .input('ExitPrice', sql.Decimal(18, 8), parseFloat(exitPrice))
            .execute('sp_CloseStrategyTrade');

        console.log(`[CLOSE TRADE] Trade ${parsedTradeId} closed successfully`);

        res.json({
            success: true,
            message: result.recordset[0].Message
        });
    } catch (err) {
        console.error('[CLOSE TRADE] Error closing trade:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error while closing trade',
            error: err.message 
        });
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

// Get user by ID endpoint
app.get('/api/users/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('UserId', sql.Int, userId)
            .execute('sp_GetUserById');

        if (result.recordset && result.recordset.length > 0) {
            res.json({
                success: true,
                user: result.recordset[0]
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({
            success: false,
            message: 'Error fetching user'
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
        
        // Validate strategyId parameter
        if (!strategyId || strategyId === 'undefined' || strategyId === 'null') {
            return res.status(400).json({ success: false, message: 'Invalid strategy ID parameter' });
        }

        const parsedStrategyId = parseInt(strategyId);
        if (isNaN(parsedStrategyId)) {
            return res.status(400).json({ success: false, message: 'Strategy ID must be a valid number' });
        }
        
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('StrategyId', sql.Int, parsedStrategyId)
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

// Delete strategy endpoint
app.delete('/api/strategy/create/:strategyId', async (req, res) => {
    try {
        const { strategyId } = req.params;
        const { userId } = req.body;
        
        console.log(`[DELETE STRATEGY] Raw strategyId: "${strategyId}"`);
        
        // Validate strategyId parameter
        if (!strategyId || strategyId === 'undefined' || strategyId === 'null') {
            return res.status(400).json({
                success: false,
                message: 'Invalid strategy ID parameter'
            });
        }

        const parsedStrategyId = parseInt(strategyId);
        if (isNaN(parsedStrategyId)) {
            return res.status(400).json({
                success: false,
                message: 'Strategy ID must be a valid number'
            });
        }
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        console.log(`[DELETE STRATEGY] Attempting to delete strategy ${parsedStrategyId} for user ${userId}`);

        const pool = await sql.connect(config);
        
        // Call the stored procedure to delete the strategy
        const deleteResult = await pool.request()
            .input('StrategyId', sql.Int, parsedStrategyId)
            .input('UserId', sql.Int, parseInt(userId))
            .execute('sp_DeleteStrategy');

        console.log(`[DELETE STRATEGY] Result:`, deleteResult.recordset[0]);

        if (deleteResult.recordset && deleteResult.recordset[0].Success) {
            res.json({
                success: true,
                message: deleteResult.recordset[0].Message || 'Strategy deleted successfully'
            });
        } else {
            res.status(400).json({
                success: false,
                message: deleteResult.recordset[0].Message || 'Failed to delete strategy'
            });
        }
    } catch (err) {
        console.error('[DELETE STRATEGY] Error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting strategy'
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
        
        // Send password reset email using Resend
        try {
            await sendPasswordResetEmail(email, resetToken);
            res.json({
                success: true,
                message: 'If your email is registered, you will receive a password reset link.'
            });
        } catch (emailError) {
            console.error('Error sending password reset email:', emailError);
            res.status(500).json({
                success: false,
                message: 'Failed to send password reset email'
            });
        }
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

// Endpoint prietenos pentru ruta de bază
app.get('/', (req, res) => {
    res.send('<h2>ProfitCraft Backend API</h2><p>Backend-ul funcționează! Pentru a folosi API-ul, accesează rutele /api/...</p>');
});

// Test endpoint to verify database structure
app.get('/api/test/database-structure', async (req, res) => {
    try {
        const pool = await sql.connect(config);
        
        // Check UserPortfolio table structure
        const tableStructure = await pool.request()
            .query(`
                SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE,
                    COLUMN_DEFAULT
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'UserPortfolio'
                ORDER BY ORDINAL_POSITION
            `);
        
        // Check if stored procedures exist
        const procedures = await pool.request()
            .query(`
                SELECT ROUTINE_NAME 
                FROM INFORMATION_SCHEMA.ROUTINES 
                WHERE ROUTINE_NAME IN ('sp_AddCryptoToPortfolio', 'sp_GetUserPortfolio')
            `);
        
        // Check sample data from UserPortfolio
        const sampleData = await pool.request()
            .query(`SELECT TOP 5 * FROM UserPortfolio`);
        
        res.json({
            success: true,
            tableStructure: tableStructure.recordset,
            procedures: procedures.recordset,
            sampleData: sampleData.recordset
        });
    } catch (err) {
        console.error('Error checking database structure:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error checking database structure: ' + err.message,
            error: err.message
        });
    }
});

// Test endpoint to verify stored procedure exists
app.get('/api/test/portfolio-procedure', async (req, res) => {
    try {
        const pool = await sql.connect(config);
        
        // Check if the stored procedure exists
        const checkProcedure = await pool.request()
            .query(`
                SELECT ROUTINE_NAME, ROUTINE_TYPE 
                FROM INFORMATION_SCHEMA.ROUTINES 
                WHERE ROUTINE_NAME = 'sp_AddCryptoToPortfolio'
            `);
        
        if (checkProcedure.recordset.length === 0) {
            return res.json({
                success: false,
                message: 'Stored procedure sp_AddCryptoToPortfolio does not exist',
                suggestion: 'Create the stored procedure in your database'
            });
        }
        
        // Try to get procedure definition
        const procedureInfo = await pool.request()
            .query(`
                SELECT 
                    p.name AS procedure_name,
                    pr.parameter_id,
                    pr.name AS parameter_name,
                    t.name AS data_type,
                    pr.max_length,
                    pr.precision,
                    pr.scale
                FROM sys.procedures p
                LEFT JOIN sys.parameters pr ON p.object_id = pr.object_id
                LEFT JOIN sys.types t ON pr.user_type_id = t.user_type_id
                WHERE p.name = 'sp_AddCryptoToPortfolio'
                ORDER BY pr.parameter_id
            `);
        
        res.json({
            success: true,
            message: 'Stored procedure exists',
            procedureExists: true,
            parameters: procedureInfo.recordset
        });
    } catch (err) {
        console.error('Error checking stored procedure:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error checking stored procedure: ' + err.message 
        });
    }
});

// Test endpoint to generate password hashes (REMOVE IN PRODUCTION!)
app.get('/api/test/hash/:password', async (req, res) => {
    try {
        const { password } = req.params;
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        
        res.json({
            success: true,
            plaintext: password,
            hash: hashedPassword,
            note: 'This is for testing only - remove in production!'
        });
    } catch (err) {
        console.error('Error generating hash:', err);
        res.status(500).json({ success: false, message: 'Error generating hash' });
    }
});

// MEXC API Proxy endpoint to handle CORS issues
app.get('/api/mexc/kline/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { interval, start, end } = req.query;
        
        console.log(`[MEXC PROXY] Fetching kline data for ${symbol} with interval ${interval}`);
        
        const mexcUrl = `https://contract.mexc.com/api/v1/contract/kline/${symbol}`;
        const response = await axios.get(mexcUrl, {
            params: { interval, start, end },
            timeout: 10000
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('[MEXC PROXY] Error fetching data:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch market data',
            error: error.message 
        });
    }
});

// Admin authentication endpoint for web protection
app.post('/api/admin-login', async (req, res) => {
    try {
        const { password } = req.body;
        
        // Store your admin password in environment variable for security
        const ADMIN_PASSWORD = process.env.ADMIN_WEB_PASSWORD || 'admin123'; // Change this!
        
        if (!password) {
            return res.status(400).json({
                success: false,
                message: 'Password is required'
            });
        }
        
        if (password === ADMIN_PASSWORD) {
            // Generate a simple session token
            const sessionToken = crypto.randomBytes(32).toString('hex');
            
            return res.json({
                success: true,
                message: 'Authentication successful',
                token: sessionToken
            });
        } else {
            return res.status(401).json({
                success: false,
                message: 'Invalid password'
            });
        }
    } catch (error) {
        console.error('Admin login error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log('\n🚀 =================================');
    console.log('🚀 ProfitCraft Backend Server Started');
    console.log('🚀 =================================');
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🚀 Resend Email: ${process.env.RESEND_API_KEY ? '✅ Configured' : '❌ Not Configured'}`);
    console.log('🚀 =================================\n');
    
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 'your-resend-api-key-here') {
        console.log('⚠️  EMAIL SETUP REMINDER:');
        console.log('⚠️  1. Create your .env file in the backend folder');
        console.log('⚠️  2. Add: RESEND_API_KEY=your_actual_api_key_here');
        console.log('⚠️  3. Get your API key from: https://resend.com/api-keys');
        console.log('⚠️  4. Restart the server after adding the key\n');
    }
});

const strategyHandlerMap = {
    btc: btcStrategyRouter,
    scalping: scalpingStrategyRouter
};

// Dynamic strategy analyze endpoint
app.post('/api/strategy/:strategyId/analyze', async (req, res) => {
    try {
        const { strategyId } = req.params;
        
        console.log(`[ANALYZE] Received request for strategyId: "${strategyId}"`);
        console.log(`[ANALYZE] Request method: ${req.method}`);
        console.log(`[ANALYZE] Request URL: ${req.url}`);
        console.log(`[ANALYZE] Request body:`, JSON.stringify(req.body, null, 2));
        
        // Validate strategyId parameter
        if (!strategyId || strategyId === 'undefined' || strategyId === 'null') {
            console.error('[ANALYZE] Invalid strategyId parameter');
            return res.status(400).json({ success: false, message: 'Invalid strategy ID parameter' });
        }

        const parsedStrategyId = parseInt(strategyId);
        if (isNaN(parsedStrategyId)) {
            console.error(`[ANALYZE] Could not parse strategyId: "${strategyId}"`);
            return res.status(400).json({ success: false, message: 'Strategy ID must be a valid number' });
        }
        
        console.log(`[ANALYZE] Parsed strategyId: ${parsedStrategyId}`);
        
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('StrategyId', sql.Int, parsedStrategyId)
            .execute('sp_GetStrategyById');

        console.log(`[ANALYZE] Database query result: ${result.recordset?.length || 0} records found`);

        if (!result.recordset || result.recordset.length === 0) {
            console.error(`[ANALYZE] Strategy not found for id: ${parsedStrategyId}`);
            return res.status(404).json({ success: false, message: 'Strategy not found' });
        }

        const strategy = result.recordset[0];
        const handlerType = strategy.HandlerType; // e.g., 'btc', 'scalping'
        const handlerRouter = strategyHandlerMap[handlerType];

        // Detailed logging
        console.log(`[ANALYZE] Strategy found:`, {
            StrategyId: strategy.StrategyId,
            StrategyName: strategy.StrategyName,
            HandlerType: handlerType,
            UserId: strategy.UserId
        });
        console.log(`[ANALYZE] HandlerRouter exists: ${!!handlerRouter}`);
        console.log(`[ANALYZE] Available handlers:`, Object.keys(strategyHandlerMap));

        if (!handlerRouter) {
            console.error(`[ANALYZE] Unknown strategy handler type: ${handlerType}`);
            return res.status(400).json({ success: false, message: `Unknown strategy handler type: ${handlerType}` });
        }

        // Forward the request to the correct handler's /analyze endpoint
        // Use Express router's handle method
        if (handlerType === 'scalping') {
            // For scalping, use the new per-user, per-strategy endpoint
            const userId = strategy.UserId;
            req.url = `/analyze/${userId}/${parsedStrategyId}`;
            console.log(`[ANALYZE] Forwarding to scalping handler with URL: ${req.url}`);
        } else {
            // For btc and others, use the old endpoint
            req.url = '/analyze';
            console.log(`[ANALYZE] Forwarding to ${handlerType} handler with URL: ${req.url}`);
        }
        
        // Add the strategy data to the request for the handler
        req.strategy = strategy;
        
        handlerRouter.handle(req, res);
    } catch (err) {
        console.error('[ANALYZE] Error in dynamic strategy analyze endpoint:', err);
        console.error('[ANALYZE] Error stack:', err.stack);
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

// Endpoint to initialize a scalping strategy for a user and strategyId
app.post('/api/strategies/initialize/:userId/:strategyId', (req, res) => {
    // Forward to the scalping handler's initialize endpoint
    req.url = `/initialize/${req.params.userId}/${req.params.strategyId}`;
    scalpingStrategyRouter.handle(req, res);
});

// Endpoint to update existing strategies to use scalping handler by default
app.post('/api/strategies/update-handler-type', async (req, res) => {
    try {
        console.log('[UPDATE HANDLER TYPE] Updating existing strategies to use scalping handler');
        
        const pool = await sql.connect(config);
        
        // Update all strategies that don't have a HandlerType or have null/empty HandlerType
        const result = await pool.request()
            .query(`
                UPDATE Strategies 
                SET HandlerType = 'scalping' 
                WHERE HandlerType IS NULL OR HandlerType = '' OR HandlerType = 'btc'
            `);
        
        console.log(`[UPDATE HANDLER TYPE] Updated ${result.rowsAffected[0]} strategies to use scalping handler`);
        
        res.json({
            success: true,
            message: `Updated ${result.rowsAffected[0]} strategies to use scalping handler`,
            updatedCount: result.rowsAffected[0]
        });
        
    } catch (err) {
        console.error('[UPDATE HANDLER TYPE] Error updating handler types:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error updating handler types: ' + err.message 
        });
    }
});

// Strategy Results Endpoints

// Save strategy result
app.post('/api/strategy-results', async (req, res) => {
    try {
        const {
            userId,
            strategyId,
            strategyName,
            crypto,
            timeframe,
            period,
            totalPnL,
            tradingAmount,
            returnPercentage,
            signalsCount,
            winRate,
            signalsData,
            animationsData,
            tradingMetrics
        } = req.body;

        // Validate required parameters
        if (!userId || !strategyName || !crypto) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: userId, strategyName, or crypto'
            });
        }

        console.log(`[SAVE STRATEGY RESULT] Saving result for user ${userId}:`, {
            strategyName,
            crypto,
            totalPnL,
            returnPercentage
        });

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('UserId', sql.Int, parseInt(userId))
            .input('StrategyId', sql.Int, strategyId ? parseInt(strategyId) : null)
            .input('StrategyName', sql.NVarChar(100), strategyName)
            .input('Cryptocurrency', sql.NVarChar(10), crypto)
            .input('Timeframe', sql.NVarChar(10), timeframe || '15m')
            .input('Period', sql.NVarChar(10), period || '1D')
            .input('TotalPnL', sql.Decimal(18, 8), parseFloat(totalPnL) || 0)
            .input('TradingAmount', sql.Decimal(18, 8), parseFloat(tradingAmount) || 0)
            .input('ReturnPercentage', sql.Decimal(8, 4), parseFloat(returnPercentage) || 0)
            .input('SignalsCount', sql.Int, parseInt(signalsCount) || 0)
            .input('WinRate', sql.Decimal(5, 2), parseFloat(winRate) || 0)
            .input('SignalsData', sql.NVarChar(sql.MAX), signalsData ? JSON.stringify(signalsData) : null)
            .input('AnimationsData', sql.NVarChar(sql.MAX), animationsData ? JSON.stringify(animationsData) : null)
            .input('TradingMetrics', sql.NVarChar(sql.MAX), tradingMetrics ? JSON.stringify(tradingMetrics) : null)
            .execute('SP_InsertStrategyResult');

        const insertResult = result.recordset[0];
        
        if (insertResult.Success === 1) {
            console.log(`[SAVE STRATEGY RESULT] Result saved with ID: ${insertResult.ResultId}`);
            res.json({
                success: true,
                message: insertResult.Message,
                resultId: insertResult.ResultId
            });
        } else {
            res.status(400).json({
                success: false,
                message: insertResult.Message
            });
        }
    } catch (err) {
        console.error('[SAVE STRATEGY RESULT] Error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error while saving strategy result',
            error: err.message
        });
    }
});

// Get strategy results for a user
app.get('/api/strategy-results/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { 
            strategyName, 
            crypto, 
            startDate, 
            endDate, 
            pageNumber = 1, 
            pageSize = 50 
        } = req.query;

        // Validate userId parameter
        if (!userId || userId === 'undefined' || userId === 'null') {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID parameter'
            });
        }

        const parsedUserId = parseInt(userId);
        if (isNaN(parsedUserId)) {
            return res.status(400).json({
                success: false,
                message: 'User ID must be a valid number'
            });
        }

        console.log(`[GET STRATEGY RESULTS] Fetching results for user: ${parsedUserId}`);

        const pool = await sql.connect(config);
        
        // First check if the stored procedure exists
        const checkProcedure = await pool.request()
            .query(`
                SELECT ROUTINE_NAME 
                FROM INFORMATION_SCHEMA.ROUTINES 
                WHERE ROUTINE_NAME = 'SP_GetStrategyResults' 
                AND ROUTINE_TYPE = 'PROCEDURE'
            `);

        if (checkProcedure.recordset.length === 0) {
            console.error('[GET STRATEGY RESULTS] Stored procedure SP_GetStrategyResults does not exist');
            return res.status(500).json({
                success: false,
                message: 'Stored procedure SP_GetStrategyResults does not exist. Please create it first.'
            });
        }

        console.log('[GET STRATEGY RESULTS] Stored procedure exists, executing...');

        // Use simpler parameter set that matches existing procedure
        const result = await pool.request()
            .input('UserId', sql.Int, parsedUserId)
            .input('PageNumber', sql.Int, parseInt(pageNumber))
            .input('PageSize', sql.Int, parseInt(pageSize))
            .execute('SP_GetStrategyResults');

        console.log(`[GET STRATEGY RESULTS] Found ${result.recordset?.length || 0} results for user ${parsedUserId}`);

        res.json({
            success: true,
            results: result.recordset || [],
            pagination: {
                pageNumber: parseInt(pageNumber),
                pageSize: parseInt(pageSize),
                totalRecords: result.recordset?.length || 0
            }
        });
    } catch (err) {
        console.error(`[GET STRATEGY RESULTS] Detailed Error:`, {
            message: err.message,
            stack: err.stack,
            code: err.code,
            sqlState: err.sqlState,
            serverName: err.serverName,
            procName: err.procName,
            lineNumber: err.lineNumber
        });
        res.status(500).json({
            success: false,
            message: 'Server error while fetching strategy results: ' + err.message,
            error: err.message,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Delete strategy result
app.delete('/api/strategy-results/:resultId', async (req, res) => {
    try {
        const { resultId } = req.params;
        const { userId, softDelete = true } = req.body;

        // Validate parameters
        if (!resultId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters: resultId or userId'
            });
        }

        const parsedResultId = parseInt(resultId);
        const parsedUserId = parseInt(userId);

        if (isNaN(parsedResultId) || isNaN(parsedUserId)) {
            return res.status(400).json({
                success: false,
                message: 'ResultId and UserId must be valid numbers'
            });
        }

        console.log(`[DELETE STRATEGY RESULT] Deleting result ${parsedResultId} for user ${parsedUserId}, softDelete: ${softDelete}`);

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('ResultId', sql.Int, parsedResultId)
            .input('UserId', sql.Int, parsedUserId)
            .input('SoftDelete', sql.Bit, softDelete ? 1 : 0)
            .execute('SP_DeleteStrategyResult');

        const deleteResult = result.recordset[0];

        if (deleteResult.Success === 1) {
            console.log(`[DELETE STRATEGY RESULT] Result ${parsedResultId} deleted successfully`);
            res.json({
                success: true,
                message: deleteResult.Message
            });
        } else {
            res.status(400).json({
                success: false,
                message: deleteResult.Message
            });
        }
    } catch (err) {
        console.error('[DELETE STRATEGY RESULT] Error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting strategy result',
            error: err.message
        });
    }
});

// Clear all strategy results for a user
app.delete('/api/strategy-results/clear-all/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { softDelete = true } = req.body;

        // Validate userId parameter
        if (!userId || userId === 'undefined' || userId === 'null') {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID parameter'
            });
        }

        const parsedUserId = parseInt(userId);
        if (isNaN(parsedUserId)) {
            return res.status(400).json({
                success: false,
                message: 'User ID must be a valid number'
            });
        }

        console.log(`[CLEAR ALL STRATEGY RESULTS] Clearing all results for user ${parsedUserId}, softDelete: ${softDelete}`);

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('UserId', sql.Int, parsedUserId)
            .input('SoftDelete', sql.Bit, softDelete ? 1 : 0)
            .execute('SP_ClearAllStrategyResults');

        const clearResult = result.recordset[0];

        if (clearResult.Success === 1) {
            console.log(`[CLEAR ALL STRATEGY RESULTS] Cleared ${clearResult.DeletedCount} results for user ${parsedUserId}`);
            res.json({
                success: true,
                message: clearResult.Message,
                deletedCount: clearResult.DeletedCount
            });
        } else {
            res.status(400).json({
                success: false,
                message: clearResult.Message
            });
        }
    } catch (err) {
        console.error('[CLEAR ALL STRATEGY RESULTS] Error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error while clearing strategy results',
            error: err.message
        });
    }
});

// Get strategy statistics for a user
app.get('/api/strategy-results/statistics/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Validate userId parameter
        if (!userId || userId === 'undefined' || userId === 'null') {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID parameter'
            });
        }

        const parsedUserId = parseInt(userId);
        if (isNaN(parsedUserId)) {
            return res.status(400).json({
                success: false,
                message: 'User ID must be a valid number'
            });
        }

        console.log(`[GET STRATEGY STATISTICS] Fetching statistics for user: ${parsedUserId}`);

        const pool = await sql.connect(config);
        
        // First check if the stored procedure exists
        const checkProcedure = await pool.request()
            .query(`
                SELECT ROUTINE_NAME 
                FROM INFORMATION_SCHEMA.ROUTINES 
                WHERE ROUTINE_NAME = 'SP_GetStrategyStatistics' 
                AND ROUTINE_TYPE = 'PROCEDURE'
            `);

        if (checkProcedure.recordset.length === 0) {
            console.error('[GET STRATEGY STATISTICS] Stored procedure SP_GetStrategyStatistics does not exist');
            return res.status(500).json({
                success: false,
                message: 'Stored procedure SP_GetStrategyStatistics does not exist. Please create it first.'
            });
        }

        console.log('[GET STRATEGY STATISTICS] Stored procedure exists, executing...');

        // Use simpler parameter set - just UserId
        const result = await pool.request()
            .input('UserId', sql.Int, parsedUserId)
            .execute('SP_GetStrategyStatistics');

        console.log(`[GET STRATEGY STATISTICS] Retrieved statistics for user ${parsedUserId}`);

        const statistics = result.recordset[0] || {};

        res.json({
            success: true,
            statistics: {
                totalResults: statistics.TotalResults || 0,
                totalPnL: parseFloat(statistics.TotalPnL) || 0,
                avgPnL: parseFloat(statistics.AvgPnL) || 0,
                totalTradingAmount: parseFloat(statistics.TotalTradingAmount) || 0,
                avgReturnPercentage: parseFloat(statistics.AvgReturnPercentage) || 0,
                totalSignals: statistics.TotalSignals || 0,
                avgSignalsPerResult: parseFloat(statistics.AvgSignalsPerResult) || 0,
                avgWinRate: parseFloat(statistics.AvgWinRate) || 0,
                bestResult: parseFloat(statistics.BestResult) || 0,
                worstResult: parseFloat(statistics.WorstResult) || 0,
                profitableResults: statistics.ProfitableResults || 0,
                profitabilityPercentage: parseFloat(statistics.ProfitabilityPercentage) || 0,
                firstResultDate: statistics.FirstResultDate,
                lastResultDate: statistics.LastResultDate,
                totalDaysActive: statistics.TotalDaysActive || 0
            }
        });
    } catch (err) {
        console.error(`[GET STRATEGY STATISTICS] Detailed Error:`, {
            message: err.message,
            stack: err.stack,
            code: err.code,
            sqlState: err.sqlState,
            serverName: err.serverName,
            procName: err.procName,
            lineNumber: err.lineNumber
        });
        res.status(500).json({
            success: false,
            message: 'Server error while fetching strategy statistics: ' + err.message,
            error: err.message,
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
});

// Test endpoint to check if strategy results stored procedures exist
app.get('/api/test/strategy-results-procedures', async (req, res) => {
    try {
        const pool = await sql.connect(config);
        
        console.log('[TEST PROCEDURES] Checking for strategy results stored procedures...');
        
        // Check for all required stored procedures
        const procedureNames = [
            'SP_InsertStrategyResult',
            'SP_GetStrategyResults', 
            'SP_DeleteStrategyResult',
            'SP_ClearAllStrategyResults',
            'SP_GetStrategyStatistics'
        ];
        
        const results = {};
        
        for (const procName of procedureNames) {
            const checkResult = await pool.request()
                .query(`
                    SELECT 
                        ROUTINE_NAME,
                        ROUTINE_TYPE,
                        CREATED,
                        LAST_ALTERED
                    FROM INFORMATION_SCHEMA.ROUTINES 
                    WHERE ROUTINE_NAME = '${procName}' 
                    AND ROUTINE_TYPE = 'PROCEDURE'
                `);
                
            results[procName] = {
                exists: checkResult.recordset.length > 0,
                details: checkResult.recordset[0] || null
            };
        }
        
        // Check if StrategyResults table exists
        const tableCheck = await pool.request()
            .query(`
                SELECT 
                    TABLE_NAME,
                    TABLE_TYPE
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_NAME = 'StrategyResults'
            `);
            
        const strategyResultsTable = {
            exists: tableCheck.recordset.length > 0,
            details: tableCheck.recordset[0] || null
        };
        
        // Check table structure if it exists
        let tableStructure = null;
        if (strategyResultsTable.exists) {
            const structureResult = await pool.request()
                .query(`
                    SELECT 
                        COLUMN_NAME,
                        DATA_TYPE,
                        IS_NULLABLE,
                        COLUMN_DEFAULT,
                        CHARACTER_MAXIMUM_LENGTH
                    FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_NAME = 'StrategyResults'
                    ORDER BY ORDINAL_POSITION
                `);
            tableStructure = structureResult.recordset;
        }
        
        const allProceduresExist = Object.values(results).every(proc => proc.exists);
        
        console.log('[TEST PROCEDURES] Results:', {
            allProceduresExist,
            tableExists: strategyResultsTable.exists,
            procedureResults: results
        });
        
        res.json({
            success: true,
            allProceduresExist,
            strategyResultsTable,
            tableStructure,
            procedures: results,
            message: allProceduresExist && strategyResultsTable.exists 
                ? 'All stored procedures and table exist - database is ready!'
                : 'Some stored procedures or table are missing - please create them first.',
            recommendations: !allProceduresExist || !strategyResultsTable.exists 
                ? [
                    'Please run the SQL scripts provided earlier to create:',
                    '1. StrategyResults table',
                    '2. All 5 stored procedures (SP_InsertStrategyResult, SP_GetStrategyResults, etc.)',
                    'You can find the complete SQL in the conversation history.'
                ]
                : ['Database is properly configured for strategy results!']
        });
        
    } catch (err) {
        console.error('[TEST PROCEDURES] Error:', err);
        res.status(500).json({
            success: false,
            message: 'Error checking stored procedures: ' + err.message,
            error: err.message
        });
    }
});

// Test endpoint to check stored procedure parameters
app.get('/api/test/procedure-parameters/:procedureName', async (req, res) => {
    try {
        const { procedureName } = req.params;
        const pool = await sql.connect(config);
        
        console.log(`[TEST PARAMETERS] Checking parameters for: ${procedureName}`);
        
        // Get procedure parameters
        const result = await pool.request()
            .query(`
                SELECT 
                    p.name AS procedure_name,
                    pr.parameter_id,
                    pr.name AS parameter_name,
                    t.name AS data_type,
                    pr.max_length,
                    pr.precision,
                    pr.scale,
                    pr.is_output
                FROM sys.procedures p
                INNER JOIN sys.parameters pr ON p.object_id = pr.object_id
                INNER JOIN sys.types t ON pr.user_type_id = t.user_type_id
                WHERE p.name = '${procedureName}'
                ORDER BY pr.parameter_id
            `);
            
        console.log(`[TEST PARAMETERS] Found ${result.recordset.length} parameters for ${procedureName}`);
        
        res.json({
            success: true,
            procedureName,
            parameterCount: result.recordset.length,
            parameters: result.recordset,
            message: result.recordset.length > 0 
                ? `Found ${result.recordset.length} parameters for ${procedureName}`
                : `No parameters found for ${procedureName} - it might not exist or have no parameters`
        });
        
    } catch (err) {
        console.error('[TEST PARAMETERS] Error:', err);
        res.status(500).json({
            success: false,
            message: 'Error checking procedure parameters: ' + err.message,
            error: err.message
        });
    }
});

// Mount the scalping strategy router to expose all its endpoints
app.use('/api/scalping-strategy', scalpingStrategyRouter);