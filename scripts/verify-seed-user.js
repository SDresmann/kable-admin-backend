/**
 * Verify that mkohlmorgen@kableacademy.com exists and password ChangeMe123 works.
 * Run from backend folder: node scripts/verify-seed-user.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../schema/UserSchema');

const SEED_EMAIL = 'mkohlmorgen@kableacademy.com';
const TEMP_PASSWORD = 'ChangeMe123';

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
        console.log('User EXISTS but password is NOT "ChangeMe123".');
        console.log('They may have been created by the main Kable Career app with a different password.');
        console.log('Either log in with that password, or delete this user in MongoDB and run: npm run seed');
        process.exit(1);
    }
    console.log('OK: User exists and password matches. They can log in with:');
    console.log('  Email:', SEED_EMAIL);
    console.log('  Password:', TEMP_PASSWORD);
}

verify().catch((err) => {
    console.error(err);
    process.exit(1);
});
