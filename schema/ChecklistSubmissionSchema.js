const mongoose = require('mongoose');

// Same schema as kable-career so we read the same collection
const checklistSubmissionSchema = new mongoose.Schema({
  userEmail: { type: String, required: true, default: 'unknown' },
  assignmentName: { type: String, required: true, default: 'Resume v1 Checklist' },
  originalFilename: { type: String, required: true },
  contentType: { type: String, default: 'application/octet-stream' },
  fileContent: { type: Buffer, required: true },
  submittedAt: { type: Date, default: Date.now },
});

checklistSubmissionSchema.index({ userEmail: 1, assignmentName: 1 });
checklistSubmissionSchema.index({ userEmail: 1, submittedAt: -1 });

const ChecklistSubmission = mongoose.model('ChecklistSubmission', checklistSubmissionSchema);

module.exports = ChecklistSubmission;
