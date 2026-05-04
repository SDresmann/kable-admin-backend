const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
// Always load .env from backend folder (so PORT=5001 is used even when run from project root)
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
// Admin backend runs on 5001 locally; hosts like Render inject PORT.
const rawPort = process.env.PORT;
const parsedPort = rawPort != null && String(rawPort).trim() !== '' ? Number(String(rawPort).trim()) : NaN;
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 5001;

app.use(helmet());
const allowedOrigins = [
  'https://kable-admin.onrender.com',
  'https://kable-career.onrender.com',
  'http://localhost:3000',
  'http://localhost:3001',
];
const corsOptions = {
  origin(origin, callback) {
    // Allow non-browser/server-to-server calls with no Origin header.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept'],
};
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'kable-career-admin' });
});

// MongoDB connection – default db "kableadmin". Student data (quizzes, submissions, etc.) is read from "test" DB.
const uri = process.env.ATLAS_URI;
const uriTest = process.env.ATLAS_URI_TEST; // Optional: same URI as Kable Career so admin sees same data (e.g. mongodb+srv://.../test)
const dbName = 'kableadmin';

async function ensureAdminUser() {
    const bcrypt = require('bcrypt');
    const User = require('./schema/UserSchema');
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || '');
    const smtpEmail = String(process.env.SMTP_USER || '').trim().toLowerCase();
    const smtpPassword = String(process.env.SMTP_PASS || '');

    // Prefer explicit admin bootstrap vars (updates password on each deploy if provided)
    if (adminEmail && adminPassword) {
        try {
            const existing = await User.findOne({ email: adminEmail });
            const hashed = await bcrypt.hash(adminPassword, 10);
            if (existing) {
                existing.password = hashed;
                await existing.save();
                console.log('Admin user updated from ADMIN_EMAIL/ADMIN_PASSWORD');
            } else {
                await User.create({ email: adminEmail, password: hashed });
                console.log('Admin user created from ADMIN_EMAIL/ADMIN_PASSWORD');
            }
        } catch (err) {
            console.error('ensureAdminUser failed:', err.message);
        }
        return;
    }

    // One-time bootstrap only: if there are zero admins, create from SMTP creds (do not rewrite password every cold start)
    if (!smtpEmail || !smtpPassword) return;
    try {
        const count = await User.countDocuments();
        if (count > 0) return;
        const hashed = await bcrypt.hash(smtpPassword, 10);
        await User.create({ email: smtpEmail, password: hashed });
        console.log('Admin user bootstrapped from SMTP_USER/SMTP_PASS (first run only)');
    } catch (err) {
        console.error('ensureAdminUser bootstrap failed:', err.message);
    }
}

if (uri) {
    const mongoOpts = {
        dbName,
        serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
        socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000,
        maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 10,
    };
    mongoose.connect(uri, mongoOpts).then(async () => {
        console.log(`MongoDB connected to database "${dbName}"`);
        await ensureAdminUser();
        if (uriTest) {
            const testConn = mongoose.createConnection(uriTest, {
                serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
                socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000,
                maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 10,
            });
            testConn.asPromise().then(() => console.log('MongoDB test DB connection (ATLAS_URI_TEST) ready')).catch((e) => console.error('ATLAS_URI_TEST connection error:', e.message));
            require('./testDb').setTestConnection(testConn);
        }
    }).catch((err) => {
        console.error('MongoDB connection error:', err.message);
    });
} else {
    console.warn('ATLAS_URI not set in .env – add it to connect to MongoDB. Use double quotes: ATLAS_URI="mongodb+srv://..."');
}

// All student data read from "test" DB (same as your DB: users, checklistsubmissions, sectionquizresults, assignmentcomments)
const studentsRouter = require('./Routes/students');
const submissionsRouter = require('./Routes/submissions');
const quizResultsRouter = require('./Routes/quizResults');
const assignmentCommentsRouter = require('./Routes/assignmentComments');
const cohortsRouter = require('./Routes/cohorts');
const releasedSectionsRouter = require('./Routes/releasedSections');
const overdueCheckRouter = require('./Routes/overdueCheck');
const runOverdueCheck = overdueCheckRouter.runOverdueCheck;
const debugRouter = require('./Routes/debug');
const authRouter = require('./Routes/auth');
const { verifyToken } = require('./middleware/authJwt');

app.use('/api/released-sections', releasedSectionsRouter);
app.use('/api/cron/check-overdue', overdueCheckRouter);
app.use('/api/auth', authRouter);
app.use('/api/students', verifyToken, studentsRouter);
app.use('/api/cohorts', verifyToken, cohortsRouter);
app.use('/api/submissions', verifyToken, submissionsRouter);
// Public so student app can submit/check quiz results without admin token
app.use('/api/quiz-results', quizResultsRouter);
app.use('/api/assignment-comments', verifyToken, assignmentCommentsRouter);
app.use('/api/debug', verifyToken, debugRouter);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    // Run overdue check automatically every day at 9:00 AM (server local time)
    if (typeof runOverdueCheck === 'function') {
        const cron = require('node-cron');
        cron.schedule('0 9 * * *', async () => {
            try {
                const results = await runOverdueCheck();
                console.log('[cron] Overdue check ran:', results.emailsSent, 'emails sent,', results.errors?.length || 0, 'errors');
            } catch (err) {
                console.error('[cron] Overdue check failed:', err.message);
            }
        });
        console.log('Overdue check scheduled daily at 9:00 AM');
    }
});
