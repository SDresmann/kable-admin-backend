const router = require('express').Router();
const bcrypt = require('bcrypt');
const User = require('../schema/UserSchema');
const { signToken, verifyToken } = require('../middleware/authJwt');
const { validateRegister, validateLogin, validateChangePassword } = require('../middleware/validateAuth');

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
        res.status(201).json({ message: 'User created', userId: user._id, email: user.email, role: 'student', cohortId: user.cohortId });
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
