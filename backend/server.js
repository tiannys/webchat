// Complete Backend Application - server.js
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const helmet = require('helmet');
const morgan = require('morgan');
const winston = require('winston');
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// Import Email Service
const EmailService = require('./services/emailService');

// Load configuration
const config = require('./config.json');

// Create logs directory
const logsDir = path.dirname(config.logging.logFile);
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Winston logger
const logger = winston.createLogger({
    level: config.logging.level,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({
            filename: config.logging.logFile,
            maxsize: config.logging.maxFileSize,
            maxFiles: config.logging.maxFiles
        }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Database connection
const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.username,
    password: config.database.password,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        logger.error('Database connection failed:', err);
    } else {
        logger.info('Database connected successfully');
    }
});

// Initialize Email Service
const emailService = new EmailService(config, logger);

// Initialize Auth routes with dependencies
const authRouter = require('./auth')(config, pool, emailService, logger);

const app = express();

// HTTP server and WebSocket setup
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: config.cors.origins.includes('*') ? '*' : config.cors.origins,
        methods: ['GET', 'POST'],
        credentials: true
    }
});

io.on('connection', (socket) => {
    logger.info('WebSocket client connected');

    socket.on('joinSession', (sessionId) => {
        socket.join(`session_${sessionId}`);
    });

    socket.on('disconnect', () => {
        logger.info('WebSocket client disconnected');
    });
});

// Security middleware
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false
}));

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (config.cors.origins.includes('*') || config.cors.origins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Access logging
app.use(async (req, res, next) => {
    const startTime = Date.now();
    res.on('finish', async () => {
        const responseTime = Date.now() - startTime;
        const userId = req.user ? req.user.id : null;
        logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${responseTime}ms`);
        
        if (config.features.accessLogging) {
            try {
                await pool.query(
                    `INSERT INTO access_logs (user_id, ip_address, user_agent, endpoint, method, status_code, response_time_ms)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [userId, req.ip, req.get('User-Agent'), req.originalUrl, req.method, res.statusCode, responseTime]
                );
            } catch (error) {
                logger.error('Failed to log access:', error);
            }
        }
    });
    next();
});

app.use(morgan('combined', {
    stream: { write: message => logger.info(message.trim()) }
}));

app.use('/api/auth', authRouter);

// JWT Authentication middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    try {
        const decoded = jwt.verify(token, config.auth.jwtSecret);
        const userResult = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.userId]);
        
        if (userResult.rows.length === 0) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        
        const user = userResult.rows[0];
        
        if (config.auth.requireEmailVerification && !user.email_verified) {
            return res.status(403).json({ 
                error: 'Email verification required',
                code: 'EMAIL_NOT_VERIFIED'
            });
        }
        
        req.user = user;
        next();
    } catch (error) {
        logger.error('Token verification failed:', error);
        return res.status(403).json({ error: 'Invalid token' });
    }
};

// Utility functions
const generateVerificationToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

const isEmailDomainAllowed = (email) => {
    const domain = email.split('@')[1];
    return config.allowedEmailDomains.includes(domain);
};

const logAudit = async (userId, action, tableName = null, recordId = null, oldValues = null, newValues = null, req = null) => {
    if (!config.features.auditLogging) return;
    try {
        await pool.query(
            `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [userId, action, tableName, recordId, oldValues ? JSON.stringify(oldValues) : null, newValues ? JSON.stringify(newValues) : null, req ? req.ip : null, req ? req.get('User-Agent') : null]
        );
    } catch (error) {
        logger.error('Failed to log audit:', error);
    }
};

const logUserActivity = async (userId, activityType, details = null, req = null) => {
    if (!config.features.userActivityLogging) return;
    try {
        await pool.query(
            `INSERT INTO user_activity_logs (user_id, activity_type, activity_details, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5)`,
            [userId, activityType, details ? JSON.stringify(details) : null, req ? req.ip : null, req ? req.get('User-Agent') : null]
        );
    } catch (error) {
        logger.error('Failed to log user activity:', error);
    }
};

// Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, firstName, lastName } = req.body;

        if (!email || !password || !firstName || !lastName) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (!isEmailDomainAllowed(email)) {
            return res.status(400).json({ error: 'Email domain not allowed' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters long' });
        }

        const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists' });
        }

        const passwordHash = await bcrypt.hash(password, config.auth.bcryptSaltRounds);

        const result = await pool.query(
            `INSERT INTO users (email, password_hash, first_name, last_name, email_verified)
             VALUES ($1, $2, $3, $4, $5) RETURNING id, email, first_name, last_name, created_at`,
            [email, passwordHash, firstName, lastName, !config.auth.requireEmailVerification]
        );

        const user = result.rows[0];

        // Send verification email if enabled
        if (config.features.emailVerification && config.auth.requireEmailVerification) {
            const token = generateVerificationToken();
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + config.email.templates.verification.expiryHours);

            await pool.query(
                `INSERT INTO email_verification_tokens (user_id, token, expires_at)
                 VALUES ($1, $2, $3)`,
                [user.id, token, expiresAt]
            );

            const emailSent = await emailService.sendVerificationEmail(user, token);
            if (!emailSent) {
                logger.warn(`Failed to send verification email to ${email}`);
            }
        }

        await logAudit(user.id, 'USER_CREATED', 'users', user.id, null, { email, firstName, lastName }, req);
        await logUserActivity(user.id, 'registration', { email }, req);

        res.status(201).json({
            message: config.auth.requireEmailVerification ? 
                'User registered successfully. Please check your email to verify your account.' :
                'User registered successfully',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                createdAt: user.created_at,
                emailVerificationRequired: config.auth.requireEmailVerification
            }
        });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const result = await pool.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        if (config.auth.requireEmailVerification && !user.email_verified) {
            return res.status(403).json({ 
                error: 'Please verify your email before logging in',
                code: 'EMAIL_NOT_VERIFIED',
                email: user.email
            });
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

        const token = jwt.sign({ userId: user.id }, config.auth.jwtSecret, { expiresIn: config.auth.jwtExpiresIn });

        await logUserActivity(user.id, 'login', { email }, req);

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                themePreference: user.theme_preference,
                emailVerified: user.email_verified
            }
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get user profile
app.get('/api/user/profile', authenticateToken, (req, res) => {
    res.json({
        id: req.user.id,
        email: req.user.email,
        firstName: req.user.first_name,
        lastName: req.user.last_name,
        themePreference: req.user.theme_preference,
        emailVerified: req.user.email_verified,
        createdAt: req.user.created_at,
        lastLogin: req.user.last_login
    });
});

// Update verify-email endpoint to respect config.json

app.get('/api/auth/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        // Use frontend.publicUrl from config.json
        const frontendUrl = config.frontend?.publicUrl || config.server.publicUrl;
        const loginUrl = `${frontendUrl}/login`;

        if (!token) {
            return res.redirect(`${loginUrl}?error=missing_token&message=${encodeURIComponent('Verification token is required')}`);
        }

        // Find the verification token
        const tokenResult = await pool.query(
            `SELECT evt.*, u.email, u.first_name, u.last_name 
             FROM email_verification_tokens evt
             JOIN users u ON evt.user_id = u.id
             WHERE evt.token = $1 AND evt.expires_at > NOW() AND evt.used_at IS NULL`,
            [token]
        );

        if (tokenResult.rows.length === 0) {
            return res.redirect(`${loginUrl}?error=invalid_token&message=${encodeURIComponent('Invalid or expired verification token')}`);
        }

        const verification = tokenResult.rows[0];

        // Mark email as verified
        await pool.query(
            'UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE id = $1',
            [verification.user_id]
        );

        // Mark token as used
        await pool.query(
            'UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1',
            [verification.id]
        );

        await logAudit(verification.user_id, 'EMAIL_VERIFIED', 'users', verification.user_id, 
                       { email_verified: false }, { email_verified: true }, req);
        await logUserActivity(verification.user_id, 'email_verified', 
                              { email: verification.email }, req);

        logger.info(`Email verified for user: ${verification.email}`);

        // Redirect to login page with success message
        return res.redirect(`${loginUrl}?verified=true&email=${encodeURIComponent(verification.email)}&message=${encodeURIComponent('Email verified successfully! You can now log in.')}`);

    } catch (error) {
        logger.error('Email verification error:', error);
        
        const frontendUrl = config.frontend?.publicUrl || config.server.publicUrl;
        const loginUrl = `${frontendUrl}/login`;
        
        return res.redirect(`${loginUrl}?error=server_error&message=${encodeURIComponent('An error occurred during verification')}`);
    }
});

app.get('/api/auth/verify-email-page', async (req, res) => {
    try {
        const { token } = req.query;
        const frontendUrl = config.frontend?.publicUrl || config.server.publicUrl;

        if (!token) {
            return res.status(400).send(`
                <html>
                    <head>
                        <title>Email Verification</title>
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; margin: 0; }
                            .container { background: white; max-width: 500px; margin: 0 auto; padding: 40px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
                            .error { color: #dc3545; }
                            .btn { background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1 class="error">❌ Verification Failed</h1>
                            <p>Verification token is required.</p>
                            <a href="${frontendUrl}/login" class="btn">Go to Login</a>
                        </div>
                    </body>
                </html>
            `);
        }

        // Find the verification token
        const tokenResult = await pool.query(
            `SELECT evt.*, u.email, u.first_name, u.last_name 
             FROM email_verification_tokens evt
             JOIN users u ON evt.user_id = u.id
             WHERE evt.token = $1 AND evt.expires_at > NOW() AND evt.used_at IS NULL`,
            [token]
        );

        if (tokenResult.rows.length === 0) {
            return res.status(400).send(`
                <html>
                    <head>
                        <title>Email Verification</title>
                        <meta name="viewport" content="width=device-width, initial-scale=1">
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; margin: 0; }
                            .container { background: white; max-width: 500px; margin: 0 auto; padding: 40px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
                            .error { color: #dc3545; }
                            .btn { background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h1 class="error">❌ Verification Failed</h1>
                            <p>Invalid or expired verification token.</p>
                            <p>Please request a new verification email.</p>
                            <a href="${frontendUrl}/login" class="btn">Go to Login</a>
                        </div>
                    </body>
                </html>
            `);
        }

        const verification = tokenResult.rows[0];

        // Mark email as verified
        await pool.query(
            'UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE id = $1',
            [verification.user_id]
        );

        // Mark token as used
        await pool.query(
            'UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1',
            [verification.id]
        );

        await logAudit(verification.user_id, 'EMAIL_VERIFIED', 'users', verification.user_id, 
                       { email_verified: false }, { email_verified: true }, req);
        await logUserActivity(verification.user_id, 'email_verified', 
                              { email: verification.email }, req);

        logger.info(`Email verified for user: ${verification.email}`);

        // Show success page with auto-redirect
        return res.send(`
            <html>
                <head>
                    <title>Email Verification Successful</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <meta http-equiv="refresh" content="5;url=${frontendUrl}/login">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; margin: 0; }
                        .container { background: white; max-width: 500px; margin: 0 auto; padding: 40px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
                        .success { color: #28a745; }
                        .btn { background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
                        .countdown { color: #666; font-size: 14px; margin-top: 15px; }
                    </style>
                    <script>
                        let countdown = 5;
                        function updateCountdown() {
                            document.getElementById('countdown').textContent = countdown;
                            countdown--;
                            if (countdown < 0) {
                                window.location.href = '${frontendUrl}/login';
                            }
                        }
                        setInterval(updateCountdown, 1000);
                    </script>
                </head>
                <body>
                    <div class="container">
                        <h1 class="success">✅ Email Verified Successfully!</h1>
                        <p>Welcome, <strong>${verification.first_name}</strong>!</p>
                        <p>Your email <strong>${verification.email}</strong> has been verified.</p>
                        <div class="countdown">
                            Redirecting to login in <span id="countdown">5</span> seconds...
                        </div>
                        <a href="${frontendUrl}/login" class="btn">Go to Login Now</a>
                    </div>
                </body>
            </html>
        `);

    } catch (error) {
        logger.error('Email verification error:', error);
        const frontendUrl = config.frontend?.publicUrl || config.server.publicUrl;
        
        return res.status(500).send(`
            <html>
                <head>
                    <title>Email Verification Error</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; margin: 0; }
                        .container { background: white; max-width: 500px; margin: 0 auto; padding: 40px; border-radius: 10px; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
                        .error { color: #dc3545; }
                        .btn { background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1 class="error">❌ Verification Error</h1>
                        <p>An error occurred during verification.</p>
                        <p>Please try again later or contact support.</p>
                        <a href="${frontendUrl}/login" class="btn">Go to Login</a>
                    </div>
                </body>
            </html>
        `);
    }
});

// Resend verification email
app.post('/api/auth/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const userResult = await pool.query(
            'SELECT * FROM users WHERE email = $1 AND is_active = true',
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        if (user.email_verified) {
            return res.status(400).json({ 
                error: 'Email is already verified',
                code: 'ALREADY_VERIFIED'
            });
        }

        // Delete any existing unused tokens for this user
        await pool.query(
            'DELETE FROM email_verification_tokens WHERE user_id = $1 AND used_at IS NULL',
            [user.id]
        );

        // Generate new verification token
        const token = generateVerificationToken();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + config.email.templates.verification.expiryHours);

        await pool.query(
            `INSERT INTO email_verification_tokens (user_id, token, expires_at)
             VALUES ($1, $2, $3)`,
            [user.id, token, expiresAt]
        );

        // Send verification email
        const emailSent = await emailService.sendVerificationEmail(user, token);
        
        if (!emailSent) {
            logger.error(`Failed to resend verification email to ${email}`);
            return res.status(500).json({ error: 'Failed to send verification email' });
        }

        await logUserActivity(user.id, 'verification_email_resent', { email }, req);

        res.json({
            message: 'Verification email sent successfully',
            email: user.email
        });

    } catch (error) {
        logger.error('Resend verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get verification status
app.get('/api/auth/verification-status/:email', async (req, res) => {
    try {
        const { email } = req.params;

        const userResult = await pool.query(
            'SELECT email_verified, email_verified_at FROM users WHERE email = $1',
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        res.json({
            email,
            emailVerified: user.email_verified,
            emailVerifiedAt: user.email_verified_at
        });

    } catch (error) {
        logger.error('Get verification status error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update user theme
app.put('/api/user/theme', authenticateToken, async (req, res) => {
    try {
        const { theme } = req.body;
        const userId = req.user.id;

        if (!theme) {
            return res.status(400).json({ error: 'Theme is required' });
        }

        const themeResult = await pool.query('SELECT name FROM themes WHERE name = $1 AND is_active = true', [theme]);
        if (themeResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid theme' });
        }

        const oldTheme = req.user.theme_preference;
        await pool.query('UPDATE users SET theme_preference = $1 WHERE id = $2', [theme, userId]);

        await logAudit(userId, 'THEME_UPDATED', 'users', userId, { theme: oldTheme }, { theme }, req);
        await logUserActivity(userId, 'theme_changed', { oldTheme, newTheme: theme }, req);

        res.json({ message: 'Theme updated successfully', theme });
    } catch (error) {
        logger.error('Theme update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get themes
app.get('/api/themes', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM themes WHERE is_active = true ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        logger.error('Get themes error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Chat sessions
app.post('/api/chat/sessions', authenticateToken, async (req, res) => {
    try {
        const { sessionName } = req.body;
        const userId = req.user.id;

        const result = await pool.query(
            `INSERT INTO chat_sessions (user_id, session_name)
             VALUES ($1, $2) RETURNING *`,
            [userId, sessionName || `Chat ${new Date().toISOString()}`]
        );

        const session = result.rows[0];
        await logUserActivity(userId, 'chat_session_created', { sessionId: session.id, sessionName: session.session_name }, req);

        res.status(201).json(session);
    } catch (error) {
        logger.error('Create session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/chat/sessions', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            `SELECT cs.*, COUNT(m.id) as message_count
             FROM chat_sessions cs
             LEFT JOIN messages m ON cs.id = m.session_id
             WHERE cs.user_id = $1 AND cs.is_active = true
             GROUP BY cs.id
             ORDER BY cs.updated_at DESC`,
            [userId]
        );

        res.json(result.rows);
    } catch (error) {
        logger.error('Get sessions error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/chat/sessions/:sessionId', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;

        const result = await pool.query(
            `UPDATE chat_sessions SET is_active = false, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND user_id = $2 AND is_active = true RETURNING *`,
            [sessionId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        await logUserActivity(userId, 'chat_session_deleted', { sessionId }, req);
        res.json({ success: true });
    } catch (error) {
        logger.error('Delete session error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Send message
app.post('/api/chat/message', authenticateToken, async (req, res) => {
    try {
        const { sessionId, message } = req.body;
        const userId = req.user.id;

        if (!sessionId || !message) {
            return res.status(400).json({ error: 'Session ID and message are required' });
        }

        const sessionResult = await pool.query(
            'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2 AND is_active = true',
            [sessionId, userId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const messageResult = await pool.query(
            `INSERT INTO messages (session_id, user_id, message_text, message_type)
             VALUES ($1, $2, $3, 'user') RETURNING *`,
            [sessionId, userId, message]
        );

        const userMessage = messageResult.rows[0];
        io.to(`session_${sessionId}`).emit('newMessage', userMessage);
        let webhookResponse = null;
        let responseTime = null;

        if (config.webhook.enabled && config.webhook.url) {
            const startTime = Date.now();
            try {
                const payload = {
                    message,
                    userId,
                    sessionId,
                    user: {
                        id: req.user.id,
                        email: req.user.email,
                        firstName: req.user.first_name,
                        lastName: req.user.last_name
                    },
                    timestamp: new Date().toISOString()
                };

                const response = await axios({
                    method: config.webhook.method,
                    url: config.webhook.url,
                    data: payload,
                    timeout: config.webhook.timeoutMs,
                    headers: config.webhook.headers,
                    validateStatus: function (status) {
                        return status < 500;
                    }
                });

                responseTime = Date.now() - startTime;
                webhookResponse = response.data;

                const botMessageText = typeof webhookResponse === 'string' 
                    ? webhookResponse 
                    : (webhookResponse.text || webhookResponse.response || JSON.stringify(webhookResponse, null, 2));

                const botMessageResult = await pool.query(
                    `INSERT INTO messages (session_id, user_id, message_text, message_type, webhook_response, response_time_ms)
                     VALUES ($1, $2, $3, 'bot', $4, $5) RETURNING *`,
                    [sessionId, userId, botMessageText, JSON.stringify(webhookResponse), responseTime]
                );
                const botMessage = botMessageResult.rows[0];
                io.to(`session_${sessionId}`).emit('newMessage', botMessage);

            } catch (error) {
                responseTime = Date.now() - startTime;
                logger.error('Webhook error:', error);
                webhookResponse = { error: 'Failed to get response from webhook' };
            }
        }

        await pool.query('UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [sessionId]);
        await logUserActivity(userId, 'message_sent', { sessionId, messageLength: message.length }, req);

        res.json({
            userMessage,
            webhookResponse,
            responseTime
        });

    } catch (error) {
        logger.error('Send message error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get messages
app.get('/api/chat/sessions/:sessionId/messages', authenticateToken, async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.id;
        const { page = 1, limit = 50 } = req.query;

        const sessionResult = await pool.query(
            'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
            [sessionId, userId]
        );

        if (sessionResult.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }

        const offset = (page - 1) * limit;
        const result = await pool.query(
            `SELECT * FROM messages 
             WHERE session_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2 OFFSET $3`,
            [sessionId, limit, offset]
        );

        res.json(result.rows.reverse());
    } catch (error) {
        logger.error('Get messages error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Error handling
app.use((error, req, res, next) => {
    logger.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
const PORT = config.server.port;
server.listen(PORT, config.server.host, async () => {
    logger.info(`Server running on ${config.server.host}:${PORT}`);
    logger.info(`Public URL: ${config.server.publicUrl}`);
    
    if (config.email && config.email.enabled) {
        const emailWorking = await emailService.testConnection();
        if (emailWorking) {
            logger.info('✅ Email service is ready');
        } else {
            logger.warn('⚠️ Email service is not configured properly');
        }
    }
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    pool.end(() => {
        process.exit(0);
    });
});

module.exports = app;

