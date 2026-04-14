const router = require('express').Router();
const bcrypt = require('bcrypt');
const User = require('../schema/UserSchema');
const { signToken, verifyToken } = require('../middleware/authJwt');
const { validateRegister, validateLogin, validateChangePassword } = require('../middleware/validateAuth');

function useGraph() {
    return !!(
        String(process.env.MS_CLIENT_ID || '').trim() &&
        String(process.env.MS_CLIENT_SECRET || '').trim() &&
        String(process.env.MS_TENANT_ID || '').trim() &&
        String(process.env.MS_SENDER_UPN || '').trim()
    );
}

function canUseSmtp() {
    return !!(
        String(process.env.SMTP_USER || '').trim() &&
        String(process.env.SMTP_PASS || '').trim()
    );
}

function hasMailConfig() {
    return useGraph() || canUseSmtp();
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
        }),
    ]);
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
    const sender = String(process.env.MS_SENDER_UPN || '').trim();
    const sendMailRequest = fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
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
    const res = await withTimeout(
        sendMailRequest,
        Number(process.env.MAIL_TIMEOUT_MS) || 10000,
        'Graph email timeout'
    );
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
    const host = String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    const isOffice365 = /office365|outlook\.com|microsoft/i.test(host);
    const transporter = nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE === 'true',
        requireTLS: isOffice365 || process.env.SMTP_REQUIRE_TLS === 'true',
        connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 10000,
        greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 10000,
        socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 15000,
        tls: { minVersion: 'TLSv1.2' },
        auth: { user, pass },
    });
    const fromAddr = String(process.env.SMTP_FROM || user).trim();
    const info = await transporter.sendMail({
        from: fromAddr,
        to,
        subject,
        text,
        html,
    });
    if (info?.messageId) {
        console.log(`[smtp] queued/sent messageId=${info.messageId} to=${to}`);
    }
}

/** MAIL_PRIMARY=smtp | graph | (unset = smtp then graph when both exist) */
function mailStrategiesOrder() {
    const p = String(process.env.MAIL_PRIMARY || '').trim().toLowerCase();
    const hasS = canUseSmtp();
    const hasG = useGraph();
    if (!hasS && !hasG) return [];
    if (p === 'graph') {
        return hasG ? (hasS ? ['graph', 'smtp'] : ['graph']) : ['smtp'];
    }
    if (p === 'smtp') {
        return hasS ? (hasG ? ['smtp', 'graph'] : ['smtp']) : ['graph'];
    }
    // Default: try SMTP first (works for most Office365 app-password setups; Graph app-only often lacks Mail.Send)
    return hasS ? (hasG ? ['smtp', 'graph'] : ['smtp']) : ['graph'];
}

async function sendMailWithStrategies({ to, subject, text, html, logPrefix = 'mail' }) {
    if (!hasMailConfig()) {
        throw new Error('Email not configured: set Graph credentials or SMTP_USER/SMTP_PASS in backend .env');
    }
    const order = mailStrategiesOrder();
    if (order.length === 0) {
        throw new Error('Email not configured');
    }
    let lastErr;
    for (let i = 0; i < order.length; i += 1) {
        const strategy = order[i];
        try {
            if (strategy === 'smtp') {
                await withTimeout(
                    sendEmailViaSmtp({ to, subject, text, html }),
                    Number(process.env.MAIL_TIMEOUT_MS) || 10000,
                    'SMTP email timeout'
                );
                console.log(`[${logPrefix}] mail sent via smtp to ${to}`);
                return i === 0 ? 'smtp' : 'smtp-fallback';
            }
            await withTimeout(
                sendEmailViaGraph({ to, subject, html }),
                Number(process.env.MAIL_TIMEOUT_MS) || 10000,
                'Graph email timeout'
            );
            console.log(`[${logPrefix}] mail sent via graph to ${to}`);
            return i === 0 ? 'graph' : 'graph-fallback';
        } catch (err) {
            lastErr = err;
            console.warn(`[${logPrefix}] ${strategy} failed for ${to}:`, err.message);
        }
    }
    throw lastErr || new Error('All mail strategies failed');
}

async function sendMailWithFallback({ to, subject, text, html, logPrefix = 'mail' }) {
    return sendMailWithStrategies({ to, subject, text, html, logPrefix });
}

async function sendStudentWelcomeEmail({ email, password }) {
    const loginUrl = process.env.STUDENT_PORTAL_LOGIN_URL || 'https://kable-career.onrender.com';
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

    return sendMailWithStrategies({ to: email, subject, text, html, logPrefix: 'create-user' });
}

function isWelcomeEmailAsync() {
    const v = String(process.env.WELCOME_EMAIL_ASYNC || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
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
        let emailProvider = null;
        const emailQueued = isWelcomeEmailAsync();
        if (emailQueued) {
            setImmediate(() => {
                sendStudentWelcomeEmail({ email, password })
                    .then((provider) => {
                        console.log(`[create-user] Welcome email sent async to ${email} via ${provider}`);
                    })
                    .catch((mailErr) => {
                        console.error(`[create-user] Welcome email async failed for ${email}:`, mailErr?.message || mailErr);
                    });
            });
        } else {
            try {
                emailProvider = await sendStudentWelcomeEmail({ email, password });
                emailSent = true;
            } catch (mailErr) {
                emailError = mailErr?.message || 'Failed to send welcome email';
                console.error(`[create-user] Welcome email failed for ${email}:`, emailError);
            }
        }
        res.status(201).json({
            message: emailQueued
                ? 'User created; welcome email is sending in the background'
                : emailSent
                    ? 'User created and welcome email sent'
                    : 'User created, but welcome email failed',
            userId: user._id,
            email: user.email,
            role: 'student',
            cohortId: user.cohortId,
            emailQueued,
            ...(emailQueued ? {} : { emailSent }),
            ...(emailQueued ? {} : emailSent && emailProvider ? { emailProvider } : {}),
            ...(emailQueued ? {} : emailError ? { emailError } : {}),
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

// Send a test email to validate mail configuration (requires admin auth)
router.post('/test-email', verifyToken, async (req, res) => {
    try {
        const toEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        if (!toEmail) {
            return res.status(400).json({ message: 'Email is required' });
        }
        const subject = 'Kable Admin - Test Email';
        const text = `This is a test email from Kable Admin backend.

If you received this, outbound email is configured correctly.`;
        const html = `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
    <p>This is a test email from <strong>Kable Admin backend</strong>.</p>
    <p>If you received this, outbound email is configured correctly.</p>
  </body>
</html>`;
        const provider = await sendMailWithFallback({
            to: toEmail,
            subject,
            text,
            html,
            logPrefix: 'test-email',
        });
        return res.json({ message: `Test email sent to ${toEmail}`, provider });
    } catch (err) {
        return res.status(500).json({ message: err.message || 'Failed to send test email' });
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
