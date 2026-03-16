const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        lowercase: true,
    },
    password: {
        type: String,
        required: [true, "Password is required"],
        minlength: [6, "Password must be at least 6 characters long"],
    },
    // Optional: cohort start date (students only; legacy)
    cohort: { type: Date, required: false },
    // Cohort (class) – ObjectId as string so student belongs to one cohort
    cohortId: { type: String, required: false },
});

const User = mongoose.model('user', userSchema);

module.exports = User;
