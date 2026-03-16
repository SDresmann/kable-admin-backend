const router = require('express').Router();
const mongoose = require('mongoose');
const { getTestDb } = require('../testDb');
const User = require('../schema/UserSchema');
const CohortSectionRelease = require('../schema/CohortSectionReleaseSchema');

// GET /api/released-sections?userEmail=... – section IDs released for this student's cohort (startDate <= today)
// Used by Kable Career so students only see assigned sections that have started
router.get('/', async (req, res) => {
  try {
    const userEmail = (req.query.userEmail || '').trim();
    if (!userEmail) {
      return res.json({ success: true, data: { sectionIds: [] } });
    }
    const testDb = getTestDb();
    const UserModel = testDb.models.user || testDb.model('user', User.schema);
    const user = await UserModel.findOne(
      { email: new RegExp(`^${userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      { cohortId: 1 }
    ).lean();
    if (!user || !user.cohortId) {
      return res.json({ success: true, data: { sectionIds: [] } });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cohortObjId = mongoose.Types.ObjectId.isValid(user.cohortId) ? new mongoose.Types.ObjectId(user.cohortId) : user.cohortId;
    const releases = await CohortSectionRelease.find({
      cohortId: cohortObjId,
      startDate: { $lte: today },
    })
      .select('sectionId')
      .lean();
    const sectionIds = [...new Set(releases.map((r) => r.sectionId))].sort((a, b) => a - b);
    res.json({ success: true, data: { sectionIds } });
  } catch (err) {
    console.error('Error fetching released sections:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch released sections' });
  }
});

module.exports = router;
