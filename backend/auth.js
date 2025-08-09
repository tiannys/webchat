const express = require('express');

module.exports = (config, pool, emailService, logger) => {
    const router = express.Router();

    // Email Verification Route Handler
    router.get('/verify-email', async (req, res) => {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({
                success: false,
                title: 'Invalid Verification Link',
                message: 'Verification token is missing.',
                redirectUrl: `${config.frontend.publicUrl}/login`
            });
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

        // ค้นหา token ในฐานข้อมูล พร้อมข้อมูล user
        const tokenResult = await client.query(`
            SELECT 
                evt.id as token_id,
                evt.user_id,
                evt.expires_at,
                evt.is_used,
                u.id,
                u.email,
                u.first_name,
                u.last_name,
                u.email_verified
            FROM email_verification_tokens evt
            JOIN users u ON evt.user_id = u.id
            WHERE evt.token = $1
        `, [token]);

        if (tokenResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                title: 'Invalid Verification Link',
                message: 'Invalid or expired verification token.',
                redirectUrl: `${config.frontend.publicUrl}/login`
            });
        }

        const tokenData = tokenResult.rows[0];
        const user = {
            id: tokenData.id,
            email: tokenData.email,
            first_name: tokenData.first_name,
            last_name: tokenData.last_name,
            email_verified: tokenData.email_verified
        };

        // ตรวจสอบว่า token หมดอายุหรือไม่
        if (new Date() > new Date(tokenData.expires_at)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                title: 'Verification Link Expired',
                message: 'This verification link has expired. Please request a new verification email.',
                redirectUrl: `${config.frontend.publicUrl}/resend-verification`
            });
        }

        // ตรวจสอบว่า token ถูกใช้แล้วหรือไม่
        if (tokenData.is_used) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                success: false,
                title: 'Already Verified',
                message: 'This email has already been verified. You can login now.',
                redirectUrl: `${config.frontend.publicUrl}/login`
            });
        }

        // ตรวจสอบว่า user ได้ verify แล้วหรือไม่
        if (user.email_verified) {
            // อัพเดท token ให้เป็น used
            await client.query(`
                UPDATE email_verification_tokens
                SET is_used = true, used_at = CURRENT_TIMESTAMP
                WHERE id = $1
            `, [tokenData.token_id]);

            await client.query('COMMIT');
            return res.status(200).json({
                success: true,
                title: 'Already Verified',
                message: 'Your email is already verified. You can login now.',
                redirectUrl: `${config.frontend.publicUrl}/login`
            });
        }

        // อัพเดท user ให้ verified
        await client.query(`
            UPDATE users 
            SET email_verified = true, email_verified_at = CURRENT_TIMESTAMP 
            WHERE id = $1
        `, [user.id]);

        // มาร์ค token ว่าถูกใช้แล้ว
        await client.query(`
            UPDATE email_verification_tokens 
            SET is_used = true, used_at = CURRENT_TIMESTAMP 
            WHERE id = $1
        `, [tokenData.token_id]);

        await client.query('COMMIT');

        // ส่ง welcome email (optional)
        try {
            if (emailService) {
                await emailService.sendWelcomeEmail(user);
            }
        } catch (emailError) {
            logger.error('Failed to send welcome email:', emailError);
            // ไม่ให้ email error มาทำให้ verification ล้มเหลว
        }

        logger.info(`Email verified successfully for user: ${user.email}`);

        // แสดงหน้าสำเร็จ
        return res.status(200).json({
            success: true,
            title: 'Email Verified Successfully',
            message: `Thank you ${user.first_name}! Your email has been verified successfully. You can now login and start using WebChat.`,
            redirectUrl: `${config.frontend.publicUrl}/login`
        });

    } catch (error) {
        await client.query('ROLLBACK');
        logger.error('Email verification error:', error);

        return res.status(500).json({
            success: false,
            title: 'Verification Failed',
            message: 'An error occurred while verifying your email. Please try again or contact support.',
            redirectUrl: `${config.frontend.publicUrl}/contact`
        });
    } finally {
        client.release();
    }
    });

    // เพิ่ม route สำหรับ resend verification email
    router.post('/resend-verification', async (req, res) => {
        const { email } = req.body;
    
    if (!email) {
        return res.status(400).json({
            success: false,
            message: 'Email is required'
        });
    }

    const client = await pool.connect();
    
    try {
        // ค้นหา user
        const userResult = await client.query(
            'SELECT id, email, first_name, email_verified FROM users WHERE email = $1',
            [email]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const user = userResult.rows[0];

        if (user.email_verified) {
            return res.status(400).json({
                success: false,
                message: 'Email is already verified'
            });
        }

        // ลบ token เก่าที่ยังไม่ได้ใช้
        await client.query(
            'DELETE FROM email_verification_tokens WHERE user_id = $1 AND is_used = false',
            [user.id]
        );

        // สร้าง token ใหม่
        const crypto = require('crypto');
        const newToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 ชั่วโมง

        await client.query(`
            INSERT INTO email_verification_tokens (user_id, token, expires_at)
            VALUES ($1, $2, $3)
        `, [user.id, newToken, expiresAt]);

        // ส่ง email ใหม่
        if (emailService) {
            const emailSent = await emailService.sendVerificationEmail(user, newToken);
            if (!emailSent) {
                throw new Error('Failed to send verification email');
            }
        }

        logger.info(`Verification email resent to: ${user.email}`);

        res.json({
            success: true,
            message: 'Verification email sent successfully'
        });

    } catch (error) {
        logger.error('Resend verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to resend verification email'
        });
    } finally {
        client.release();
    }
    });

    return router;
};
