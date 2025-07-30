// Email Service - backend/services/emailService.js
const nodemailer = require('nodemailer');

class EmailService {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.transporter = null;
        this.setupTransporter();
    }

    setupTransporter() {
        if (!this.config.email || !this.config.email.enabled) {
            this.logger.info('Email service disabled');
            return;
        }

        try {
            if (this.config.email.service === 'gmail') {
                this.transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: {
                        user: this.config.email.auth.user,
                        pass: this.config.email.auth.pass
                    }
                });
            } else if (this.config.email.service === 'smtp') {
                this.transporter = nodemailer.createTransport({
                    host: this.config.email.smtp.host,
                    port: this.config.email.smtp.port,
                    secure: this.config.email.smtp.secure,
                    auth: {
                        user: this.config.email.auth.user,
                        pass: this.config.email.auth.pass
                    },
                    tls: {
                        rejectUnauthorized: false
                    }
                });
            } else {
                this.logger.info('Email service not configured (no valid service specified)');
                return;
            }

            this.logger.info('Email transporter configured successfully');
        } catch (error) {
            this.logger.error('Failed to setup email transporter:', error);
        }
    }

    async sendVerificationEmail(user, token) {
        if (!this.transporter) {
            this.logger.warn('Email service not configured, skipping verification email');
            return false;
        }

        try {
            // ลิงก์ไปยัง backend endpoint ที่จะ handle verification
            const verificationUrl = `${this.config.server.publicUrl}/api/auth/verify-email?token=${token}`;

            const mailOptions = {
                from: {
                    name: this.config.email.fromName || 'WebChat',
                    address: this.config.email.fromAddress || 'noreply@webchat.local'
                },
                to: user.email,
                subject: 'Verify Your Email - WebChat',
                html: this.getVerificationEmailTemplate(user, verificationUrl),
                text: `
Hello ${user.first_name},

Please verify your email address by clicking the link below:
${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account, please ignore this email.

Best regards,
WebChat Team
                `.trim()
            };

            const result = await this.transporter.sendMail(mailOptions);
            this.logger.info(`Verification email sent to ${user.email}`, { messageId: result.messageId });
            return true;
        } catch (error) {
            this.logger.error('Failed to send verification email:', error);
            return false;
        }
    }

    async sendWelcomeEmail(user) {
        if (!this.transporter) {
            return false;
        }

        try {
            const loginUrl = `${this.config.frontend.publicUrl}/`;

            const mailOptions = {
                from: {
                    name: this.config.email.fromName || 'WebChat',
                    address: this.config.email.fromAddress || 'noreply@webchat.local'
                },
                to: user.email,
                subject: 'Welcome to WebChat!',
                html: this.getWelcomeEmailTemplate(user, loginUrl),
                text: `
Welcome to WebChat, ${user.first_name}!

Your email has been verified successfully. You can now login and start using the chat application.

Login here: ${loginUrl}

Best regards,
WebChat Team
                `.trim()
            };

            const result = await this.transporter.sendMail(mailOptions);
            this.logger.info(`Welcome email sent to ${user.email}`, { messageId: result.messageId });
            return true;
        } catch (error) {
            this.logger.error('Failed to send welcome email:', error);
            return false;
        }
    }

    getVerificationEmailTemplate(user, verificationUrl) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Verify Your Email</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #3b82f6, #10b981); color: white; padding: 30px; text-align: center; }
                .content { padding: 30px; }
                .button { display: inline-block; background: #3b82f6; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📧 Verify Your Email</h1>
                    <p>Welcome to WebChat!</p>
                </div>
                <div class="content">
                    <h2>Hello ${user.first_name}!</h2>
                    <p>Thank you for registering with WebChat. Please verify your email address to complete your registration.</p>
                    
                    <div style="text-align: center;">
                        <a href="${verificationUrl}" class="button">Verify Email Address</a>
                    </div>
                    
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace;">
                        ${verificationUrl}
                    </p>
                    
                    <p><strong>Note:</strong> This link will expire in 24 hours.</p>
                    <p>If you didn't create an account with WebChat, please ignore this email.</p>
                </div>
                <div class="footer">
                    <p>© 2025 WebChat. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    getWelcomeEmailTemplate(user, loginUrl) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Welcome to WebChat</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; }
                .content { padding: 30px; }
                .button { display: inline-block; background: #10b981; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; font-weight: bold; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Welcome!</h1>
                    <p>Your WebChat account is ready</p>
                </div>
                <div class="content">
                    <h2>Hello ${user.first_name}!</h2>
                    <p>Congratulations! Your email has been verified successfully. You can now login and start using WebChat.</p>
                    
                    <div style="text-align: center;">
                        <a href="${loginUrl}" class="button">Start Chatting</a>
                    </div>
                    
                    <p>Enjoy chatting with our AI assistant!</p>
                </div>
                <div class="footer">
                    <p>© 2025 WebChat. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    async testConnection() {
        if (!this.transporter) {
            return false;
        }

        try {
            await this.transporter.verify();
            this.logger.info('Email service connection verified');
            return true;
        } catch (error) {
            this.logger.error('Email service connection failed:', error);
            return false;
        }
    }
}

module.exports = EmailService;
