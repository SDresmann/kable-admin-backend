const router = require('express').Router();
const { getTestDb } = require('../testDb');
const User = require('../schema/UserSchema');

function getStudentModel() {
    const testDb = getTestDb();
    return testDb.models.user || testDb.model('user', User.schema);
}

// Get all students from test/users (student portal), not admin users
router.get('/', async (req, res) => {
    try {
        const Student = getStudentModel();
        const users = await Student.find({}, { password: 0 }).sort({ email: 1 });
        res.json({ success: true, data: users });
    } catch (err) {
        console.error('Error fetching students:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch students' });
    }
});

// Get a single student by ID
router.get('/:id', async (req, res) => {
    try {
        const Student = getStudentModel();
        const user = await Student.findOne({ _id: req.params.id }, { password: 0 });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ success: false, message: 'Failed to fetch user' });
    }
});

// Update student (e.g. cohort)
router.patch('/:id', async (req, res) => {
    try {
        const Student = getStudentModel();
        const updates = {};
        if (req.body.cohort !== undefined) {
            updates.cohort = req.body.cohort ? new Date(req.body.cohort) : null;
        }
        if (req.body.cohortId !== undefined) {
            updates.cohortId = req.body.cohortId ? String(req.body.cohortId) : null;
        }
        const user = await Student.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { returnDocument: 'after', runValidators: true }
        ).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Error updating student:', err);
        res.status(500).json({ success: false, message: 'Failed to update student' });
    }
});

module.exports = router;
