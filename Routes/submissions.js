const router = require('express').Router();
const mongoose = require('mongoose');
const { getTestDb } = require('../testDb');
const ChecklistSubmissionSchema = require('../schema/ChecklistSubmissionSchema');

function getChecklistSubmissionModel() {
  const testDb = getTestDb();
  return testDb.models.ChecklistSubmission || testDb.model('ChecklistSubmission', ChecklistSubmissionSchema.schema);
}

// GET /api/submissions – list assignment submissions. Optional ?userEmail= to filter by student email
router.get('/', async (req, res) => {
  try {
    const ChecklistSubmission = getChecklistSubmissionModel();
    const filter = {};
    if (req.query.userEmail && req.query.userEmail.trim()) {
      filter.userEmail = req.query.userEmail.trim().toLowerCase();
    }
    const submissions = await ChecklistSubmission.find(filter)
      .select('-fileContent')
      .sort({ submittedAt: -1 })
      .lean();
    res.json({ success: true, data: submissions });
  } catch (err) {
    console.error('Error fetching submissions:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch submissions' });
  }
});

// Normalize MongoDB binary/Buffer into a Node Buffer for download (PDF, Word, etc.)
function toBuffer(fileContent) {
  if (!fileContent) return null;
  if (Buffer.isBuffer(fileContent)) return fileContent;
  // Mongoose / JSON: { type: 'Buffer', data: number[] }
  if (fileContent && typeof fileContent === 'object' && Array.isArray(fileContent.data)) {
    return Buffer.from(fileContent.data);
  }
  // BSON Binary (native driver): .buffer or .value(true)
  if (fileContent && fileContent.buffer) {
    const b = fileContent.buffer;
    return Buffer.isBuffer(b) ? b : Buffer.from(b);
  }
  if (fileContent && typeof fileContent.value === 'function') {
    try { return Buffer.from(fileContent.value(true)); } catch (_) { return Buffer.from(fileContent.value()); }
  }
  if (Array.isArray(fileContent)) return Buffer.from(fileContent);
  return Buffer.from(fileContent);
}

// GET /api/submissions/:id/file – download one submission's file (PDF, Word, etc.)
router.get('/:id/file', async (req, res) => {
  try {
    const testDb = getTestDb();
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid submission ID' });
    }
    const collection = testDb.db.collection('checklistsubmissions');
    const doc = await collection.findOne(
      { _id: new mongoose.Types.ObjectId(id) },
      { projection: { originalFilename: 1, contentType: 1, fileContent: 1 } }
    );
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }
    const buf = toBuffer(doc.fileContent);
    if (!buf || buf.length === 0) {
      return res.status(404).json({ success: false, message: 'File content not found or empty for this submission' });
    }
    const contentType = doc.contentType || 'application/octet-stream';
    const filename = (doc.originalFilename || 'download').replace(/"/g, '%22');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (err) {
    console.error('Error fetching submission file:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch file' });
  }
});

module.exports = router;
