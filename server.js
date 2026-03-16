const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
// Always load .env from backend folder (so PORT=5001 is used even when run from project root)
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
// Admin backend runs on 5001 so it doesn't conflict with Kable Career (5000)
const port = process.env.PORT || 5001;

app.use(helmet());
app.use(cors());
app.use(express.json());

// MongoDB connection – default db "kableadmin". Student data (quizzes, submissions, etc.) is read from "test" DB.
const uri = process.env.ATLAS_URI;
const uriTest = process.env.ATLAS_URI_TEST; // Optional: same URI as Kable Career so admin sees same data (e.g. mongodb+srv://.../test)
const dbName = 'kableadmin';
if (uri) {
    mongoose.connect(uri, { dbName }).then(() => {
        console.log(`MongoDB connected to database "${dbName}"`);
        if (uriTest) {
            const testConn = mongoose.createConnection(uriTest);
            testConn.asPromise().then(() => console.log('MongoDB test DB connection (ATLAS_URI_TEST) ready')).catch((e) => console.error('ATLAS_URI_TEST connection error:', e.message));
            require('./testDb').setTestConnection(testConn);
        }
    }).catch((err) => {
        console.error('MongoDB connection error:', err.message);
    });
} else {
    console.warn('ATLAS_URI not set in .env – add it to connect to MongoDB. Use double quotes: ATLAS_URI="mongodb+srv://..."');
}

app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});


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
app.use('/api/students', studentsRouter);
app.use('/api/cohorts', cohortsRouter);
app.use('/api/released-sections', releasedSectionsRouter);
app.use('/api/cron/check-overdue', overdueCheckRouter);
app.use('/api/submissions', submissionsRouter);
app.use('/api/quiz-results', quizResultsRouter);
app.use('/api/assignment-comments', assignmentCommentsRouter);
app.use('/api/debug', debugRouter);
app.use('/api/auth', authRouter);

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
