const router = require('express').Router();
const { getTestDb } = require('../testDb');
const SectionQuizResultModel = require('../schema/SectionQuizResultSchema');

function getSectionQuizResultModel() {
  const testDb = getTestDb();
  return testDb.models.SectionQuizResult || testDb.model('SectionQuizResult', SectionQuizResultModel.schema);
}

// GET /api/quiz-results?userEmail=... – list section quiz results for a student
router.get('/', async (req, res) => {
  try {
    const SectionQuizResult = getSectionQuizResultModel();
    const filter = {};
    if (req.query.userEmail && req.query.userEmail.trim()) {
      filter.userEmail = req.query.userEmail.trim().toLowerCase();
    }
    const results = await SectionQuizResult.find(filter)
      .sort({ completedAt: -1 })
      .lean();
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Error fetching quiz results:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch quiz results' });
  }
});

// POST /api/quiz-results – save a section quiz result (e.g. from Kable Career app).
router.post('/', async (req, res) => {
  try {
    const SectionQuizResult = getSectionQuizResultModel();
    const { userEmail, sectionId, sectionTitle, score, total } = req.body;
    if (!userEmail || sectionId == null || score == null || total == null) {
      return res.status(400).json({ success: false, message: 'Missing required fields: userEmail, sectionId, score, total' });
    }
    const scoreNum = Number(score);
    const totalNum = Number(total);
    const doc = await SectionQuizResult.create({
      userEmail: String(userEmail).trim().toLowerCase(),
      sectionId: String(sectionId),
      sectionTitle: sectionTitle ? String(sectionTitle) : '',
      score: scoreNum,
      total: totalNum,
      completedAt: new Date(),
    });
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error('Error saving quiz result:', err);
    res.status(500).json({ success: false, message: 'Failed to save quiz result' });
  }
});

module.exports = router;
