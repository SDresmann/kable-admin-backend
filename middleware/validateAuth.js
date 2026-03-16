// Permissive: something@domain.tld (allows +, dots, hyphens in local part)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
const MIN_PASSWORD = 6;
const MAX_PASSWORD = 128;
const MAX_EMAIL_LENGTH = 254;

function validateRegister(body) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const errors = [];
    if (!email) errors.push('Email is required');
    else if (email.length > MAX_EMAIL_LENGTH) errors.push('Email is too long');
    else if (!EMAIL_REGEX.test(email)) errors.push('Email format is invalid');
    if (!password) errors.push('Password is required');
    else if (password.length < MIN_PASSWORD) errors.push(`Password must be at least ${MIN_PASSWORD} characters`);
    else if (password.length > MAX_PASSWORD) errors.push('Password is too long');
    return {
        valid: errors.length === 0,
        email,
        password: errors.length ? '' : password,
        message: errors[0] || null,
    };
}

function validateLogin(body) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!email || !password) {
        return { valid: false, email: '', password: '', message: 'Email and password are required' };
    }
    return { valid: true, email, password, message: null };
}

function validateChangePassword(body) {
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    const errors = [];
    if (!currentPassword) errors.push('Current password is required');
    if (!newPassword) errors.push('New password is required');
    else if (newPassword.length < MIN_PASSWORD) errors.push(`New password must be at least ${MIN_PASSWORD} characters`);
    else if (newPassword.length > MAX_PASSWORD) errors.push('New password is too long');
    return {
        valid: errors.length === 0,
        currentPassword,
        newPassword,
        message: errors[0] || null,
    };
}

module.exports = { validateRegister, validateLogin, validateChangePassword };
