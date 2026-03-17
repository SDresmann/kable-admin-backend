/**
 * Verify that the admin user from .env (ADMIN_EMAIL / ADMIN_PASSWORD) exists and password matches.
 * Run from backend folder: node scripts/verify-seed-user.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../schema/UserSchema');

const SEED_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const TEMP_PASSWORD = process.env.ADMIN_PASSWORD || '';

async function verify() {
    const uri = process.env.ATLAS_URI;
    if (!uri) {
        console.error('ATLAS_URI not set in backend/.env');
        process.exit(1);
    }
    await mongoose.connect(uri, { dbName: 'kableadmin' });
    const user = await User.findOne({ email: SEED_EMAIL });
    await mongoose.disconnect();

    if (!user) {
        console.log('User NOT FOUND in database. Run: npm run seed');
        process.exit(1);
    }
    const passwordOk = await bcrypt.compare(TEMP_PASSWORD, user.password);
    if (!passwordOk) {
        console.log('User EXISTS but password does not match ADMIN_PASSWORD in .env.');
        console.log('Update .env or delete this user in MongoDB and run: npm run seed');
        process.exit(1);
    }
    console.log('OK: Admin user exists and password matches .env. You can log in with ADMIN_EMAIL.');
}

verify().catch((err) => {
    console.error(err);
    process.exit(1);
});
