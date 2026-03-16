/**
 * One-time seed: ensure mkohlmorgen@kableacademy.com exists with a temporary password.
 * Run from backend folder: npm run seed
 * User should log in and change password after first login.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../schema/UserSchema');

const SEED_EMAIL = 'mkohlmorgen@kableacademy.com';
const TEMP_PASSWORD = 'ChangeMe123';

async function seed() {
    console.log('Seed script starting...');
    const uri = process.env.ATLAS_URI;
    if (!uri) {
        console.error('ERROR: ATLAS_URI is not set.');
        console.error('Add ATLAS_URI=your-mongodb-connection-string to backend/.env');
        process.exit(1);
    }
    console.log('ATLAS_URI found. Connecting to MongoDB (database: kableadmin)...');
    try {
        await mongoose.connect(uri, { dbName: 'kableadmin' });
    } catch (err) {
        console.error('ERROR: Could not connect to MongoDB:', err.message);
        process.exit(1);
    }
    console.log('Connected. Checking for existing user...');
    const existing = await User.findOne({ email: SEED_EMAIL });
    if (existing) {
        console.log(`User ${SEED_EMAIL} already exists. They can log in and change password.`);
        await mongoose.disconnect();
        process.exit(0);
        return;
    }
    console.log('User not found. Creating...');
    try {
        const hashed = await bcrypt.hash(TEMP_PASSWORD, 10);
        await User.create({ email: SEED_EMAIL, password: hashed });
    } catch (err) {
        console.error('ERROR creating user:', err.message);
        if (err.code === 11000) console.error('(Email already exists in DB)');
        await mongoose.disconnect();
        process.exit(1);
    }
    console.log(`Created user ${SEED_EMAIL} with temporary password: ${TEMP_PASSWORD}`);
    console.log('Have them log in and change their password.');
    await mongoose.disconnect();
    process.exit(0);
}

seed().catch((err) => {
    console.error('ERROR:', err.message);
    console.error(err);
    process.exit(1);
});
