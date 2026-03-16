const router = require('express').Router();
const { getTestDb } = require('../testDb');
const AssignmentCommentModel = require('../schema/AssignmentCommentSchema');

function getAssignmentCommentModel() {
  const testDb = getTestDb();
  return testDb.models.AssignmentComment || testDb.model('AssignmentComment', AssignmentCommentModel.schema);
}

// GET /api/assignment-comments?userEmail=... – list assignment comments/reflections for a student
router.get('/', async (req, res) => {
  try {
    const AssignmentComment = getAssignmentCommentModel();
    const filter = {};
    if (req.query.userEmail && req.query.userEmail.trim()) {
      filter.userEmail = { $regex: new RegExp(`^${req.query.userEmail.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    }
    const comments = await AssignmentComment.find(filter)
      .sort({ submittedAt: -1 })
      .lean();
    res.json({ success: true, data: comments });
  } catch (err) {
    console.error('Error fetching assignment comments:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch assignment comments' });
  }
});

module.exports = router;
