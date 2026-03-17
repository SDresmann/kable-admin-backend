/**
 * One-time seed: ensure the admin user exists in kableadmin.
 * Uses ADMIN_EMAIL + ADMIN_PASSWORD from .env, or falls back to SMTP_USER + SMTP_PASS.
 * Run from backend folder: npm run seed
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../schema/UserSchema');

const SEED_EMAIL = (process.env.ADMIN_EMAIL || process.env.SMTP_USER || '').trim().toLowerCase();
const SEED_PASSWORD = process.env.ADMIN_PASSWORD || process.env.SMTP_PASS || '';

async function seed() {
    console.log('Seed script starting...');
    const uri = process.env.ATLAS_URI;
    if (!uri) {
        console.error('ERROR: ATLAS_URI is not set.');
        console.error('Add ATLAS_URI=... to backend/.env');
        process.exit(1);
    }
    if (!SEED_EMAIL || !SEED_PASSWORD) {
        console.error('ERROR: Set ADMIN_EMAIL + ADMIN_PASSWORD, or SMTP_USER + SMTP_PASS in backend/.env');
        process.exit(1);
    }
    console.log('ATLAS_URI found. Connecting to MongoDB (database: kableadmin)...');
    try {
        await mongoose.connect(uri, { dbName: 'kableadmin' });
    } catch (err) {
        console.error('ERROR: Could not connect to MongoDB:', err.message);
        process.exit(1);
    }
    console.log('Connected. Checking for existing admin user...');
    const hashed = await bcrypt.hash(SEED_PASSWORD, 10);
    let existing = await User.findOne({ email: SEED_EMAIL });
    if (existing) {
        existing.password = hashed;
        await existing.save();
        console.log(`Admin user ${SEED_EMAIL} already exists. Password updated to match .env – you can log in now.`);
        await mongoose.disconnect();
        process.exit(0);
        return;
    }
    console.log('Admin user not found. Creating from .env credentials...');
    try {
        await User.create({ email: SEED_EMAIL, password: hashed });
    } catch (err) {
        console.error('ERROR creating user:', err.message);
        if (err.code === 11000) console.error('(Email already exists in DB)');
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`Created admin user ${SEED_EMAIL}. You can log in with your .env password.`);
    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error('ERROR:', err.message);
    console.error(err);
    process.exit(1);
});
