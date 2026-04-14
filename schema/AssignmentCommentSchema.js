const mongoose = require('mongoose');

// Same schema as kable-career – reads from "test" DB assignmentcomments collection
const assignmentCommentSchema = new mongoose.Schema({
  userEmail: { type: String, required: true, default: 'unknown' },
  assignmentName: { type: String, required: true },
  sectionId: { type: Number, required: true },
  assignmentIndex: { type: Number, required: true },
  comment: { type: String, required: true },
  checklistChecked: { type: [Boolean], default: undefined },
  submittedAt: { type: Date, default: Date.now },
});

assignmentCommentSchema.index({ userEmail: 1, sectionId: 1, assignmentIndex: 1 });
assignmentCommentSchema.index({ userEmail: 1, submittedAt: -1 });

const AssignmentComment = mongoose.model('AssignmentComment', assignmentCommentSchema);

module.exports = AssignmentComment;
