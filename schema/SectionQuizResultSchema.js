const mongoose = require('mongoose');

const sectionQuizResultSchema = new mongoose.Schema({
  userEmail: { type: String, required: true },
  sectionId: { type: String, required: true },
  sectionTitle: { type: String, default: '' },
  score: { type: Number, required: true },
  total: { type: Number, required: true },
  completedAt: { type: Date, default: Date.now },
});

sectionQuizResultSchema.index({ userEmail: 1, completedAt: -1 });

const SectionQuizResult = mongoose.model('SectionQuizResult', sectionQuizResultSchema);

module.exports = SectionQuizResult;
