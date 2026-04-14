const router = require('express').Router();
const bcrypt = require('bcrypt');
const User = require('../schema/UserSchema');
const { signToken, verifyToken } = require('../middleware/authJwt');
const { validateRegister, validateLogin, validateChangePassword } = require('../middleware/validateAuth');

function useGraph() {
    return !!(
        process.env.MS_CLIENT_ID &&
        process.env.MS_CLIENT_SECRET &&
        process.env.MS_TENANT_ID &&
        process.env.MS_SENDER_UPN
    );
}

function canUseSmtp() {
    return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function hasMailConfig() {
    return useGraph() || canUseSmtp();
}

async function getGraphAccessToken() {
    const msal = require('@azure/msal-node');
    const config = {
        auth: {
            clientId: process.env.MS_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}`,
            clientSecret: process.env.MS_CLIENT_SECRET,
        },
    };
    const cca = new msal.ConfidentialClientApplication(config);
    const result = await cca.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
    });
    if (!result || !result.accessToken) throw new Error('Failed to get Graph access token');
    return result.accessToken;
}

async function sendEmailViaGraph({ to, subject, html }) {
    const token = await getGraphAccessToken();
    const sender = process.env.MS_SENDER_UPN;
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message: {
                subject,
                body: { contentType: 'HTML', content: html },
                toRecipients: [{ emailAddress: { address: to } }],
            },
            saveToSentItems: true,
        }),
    });
    if (!res.ok) {
        const errBody = await res.text();
        let msg = `Graph sendMail ${res.status}`;
        try {
            const parsed = JSON.parse(errBody);
            if (parsed.error && parsed.error.message) msg = parsed.error.message;
        } catch (_) {}
        throw new Error(msg);
    }
}

async function sendEmailViaSmtp({ to, subject, text, html }) {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html,
    });
}

async function sendStudentWelcomeEmail({ email, password }) {
    const loginUrl = process.env.STUDENT_PORTAL_LOGIN_URL || 'https://kable-career.onrender.com/login';
    const subject = 'Welcome to Kable Academy - Student Account Created';
    const text = `Welcome to Kable Academy!

Your student account has been created by your admin.

Login email: ${email}
Temporary password: ${password}
Login URL: ${loginUrl}

Please log in and change your password as soon as possible.`;
    const html = `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <p>Welcome to Kable Academy!</p>
    <p>Your student account has been created by your admin.</p>
    <p><strong>Login email:</strong> ${email}<br/>
    <strong>Temporary password:</strong> ${password}<br/>
    <strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
    <p>Please log in and change your password as soon as possible.</p>
  </body>
</html>`;

    if (!hasMailConfig()) {
        throw new Error('Email not configured: set Graph credentials or SMTP_USER/SMTP_PASS in backend .env');
    }
    if (useGraph()) {
        await sendEmailViaGraph({ to: email, subject, html });
    } else {
        await sendEmailViaSmtp({ to: email, subject, text, html });
    }
}

// Login
router.post('/login', async (req, res) => {
    try {
        const { valid, email, password, message } = validateLogin(req.body);
        if (!valid) {
            return res.status(400).json({ message });
        }
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        const token = signToken(user._id);
        res.json({ message: 'Login successful', userId: user._id, token, email: user.email });
    } catch (err) {
        res.status(500).json({ message: 'Login failed' });
    }
});

// Create user – role "admin" → kableadmin DB (admin portal), role "student" → test DB (student portal). Requires admin auth.
router.post('/create-user', verifyToken, async (req, res) => {
    try {
        const role = (req.body.role === 'student') ? 'student' : 'admin';
        const { valid, email, password, message } = validateRegister(req.body);
        if (!valid) {
            return res.status(400).json({ message });
        }
        const hashed = await bcrypt.hash(password, 10);
        if (role === 'admin') {
            const existing = await User.findOne({ email });
            if (existing) {
                return res.status(409).json({ message: 'Email already registered' });
            }
            const user = await User.create({ email, password: hashed });
            return res.status(201).json({ message: 'User created', userId: user._id, email: user.email, role: 'admin' });
        }
        // role === 'student' → create in test database (student portal / Kable Career)
        const mongoose = require('mongoose');
        const testDb = mongoose.connection.useDb('test');
        const TestUser = testDb.models.user || testDb.model('user', User.schema);
        const existing = await TestUser.findOne({ email });
        if (existing) {
            return res.status(409).json({ message: 'Email already registered' });
        }
        const cohortId = req.body.cohortId ? String(req.body.cohortId) : undefined;
        const user = await TestUser.create({ email, password: hashed, ...(cohortId && { cohortId }) });
        let emailSent = false;
        let emailError = null;
        try {
            await sendStudentWelcomeEmail({ email, password });
            emailSent = true;
        } catch (mailErr) {
            emailError = mailErr?.message || 'Failed to send welcome email';
            console.error(`[create-user] Welcome email failed for ${email}:`, emailError);
        }
        res.status(201).json({
            message: emailSent ? 'User created and welcome email sent' : 'User created, but welcome email failed',
            userId: user._id,
            email: user.email,
            role: 'student',
            cohortId: user.cohortId,
            emailSent,
            ...(emailError ? { emailError } : {}),
        });
    } catch (err) {
        const msg = err.code === 11000 ? 'Email already registered' : 'User creation failed';
        res.status(500).json({ message: msg });
    }
});

// Reset password for an existing user by email – checks kableadmin first, then test (student). Requires admin auth.
router.post('/reset-password', verifyToken, async (req, res) => {
    try {
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
        if (!email) return res.status(400).json({ message: 'Email is required' });
        if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });
        let user = await User.findOne({ email });
        let dbLabel = 'admin portal';
        if (!user) {
            const mongoose = require('mongoose');
            const testDb = mongoose.connection.useDb('test');
            const TestUser = testDb.models.user || testDb.model('user', User.schema);
            user = await TestUser.findOne({ email });
            dbLabel = 'student portal';
        }
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ message: `Password updated for ${dbLabel}. They can now log in with this password.` });
    } catch (err) {
        res.status(500).json({ message: 'Failed to reset password' });
    }
});

// Change password (requires Authorization: Bearer <token>)
router.post('/change-password', verifyToken, async (req, res) => {
    try {
        const { valid, currentPassword, newPassword, message } = validateChangePassword(req.body);
        if (!valid) {
            return res.status(400).json({ message });
        }
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(401).json({ message: 'User not found' });
        }
        const validCurrent = await bcrypt.compare(currentPassword, user.password);
        if (!validCurrent) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to update password' });
    }
});

module.exports = router;
