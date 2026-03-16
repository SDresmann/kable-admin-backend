const router = require('express').Router();
const { getTestDb } = require('../testDb');
const User = require('../schema/UserSchema');
const ChecklistSubmission = require('../schema/ChecklistSubmissionSchema');
const SectionQuizResult = require('../schema/SectionQuizResultSchema');
const AssignmentComment = require('../schema/AssignmentCommentSchema');

// GET /api/debug/test-db – return document counts in "test" DB (to verify admin is reading same DB as Kable Career)
router.get('/test-db', async (req, res) => {
  try {
    const testDb = getTestDb();
    const UserModel = testDb.models.user || testDb.model('user', User.schema);
    const ChecklistModel = testDb.models.ChecklistSubmission || testDb.model('ChecklistSubmission', ChecklistSubmission.schema);
    const QuizModel = testDb.models.SectionQuizResult || testDb.model('SectionQuizResult', SectionQuizResult.schema);
    const CommentModel = testDb.models.AssignmentComment || testDb.model('AssignmentComment', AssignmentComment.schema);

    const [users, checklistsubmissions, sectionquizresults, assignmentcomments] = await Promise.all([
      UserModel.countDocuments(),
      ChecklistModel.countDocuments(),
      QuizModel.countDocuments(),
      CommentModel.countDocuments(),
    ]);

    res.json({
      success: true,
      database: 'test',
      message: 'If counts are 0, set ATLAS_URI_TEST in admin .env to the same MongoDB URI as Kable Career (e.g. mongodb+srv://.../test).',
      counts: {
        users,
        checklistsubmissions,
        sectionquizresults,
        assignmentcomments,
      },
    });
  } catch (err) {
    console.error('Debug test-db error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
