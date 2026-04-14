const mongoose = require('mongoose');

const cohortSectionReleaseSchema = new mongoose.Schema({
  cohortId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cohort', required: true },
  sectionId: { type: Number, required: true },
  startDate: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

cohortSectionReleaseSchema.index({ cohortId: 1, sectionId: 1 }, { unique: true });
cohortSectionReleaseSchema.index({ cohortId: 1, startDate: 1 });

const CohortSectionRelease = mongoose.model('CohortSectionRelease', cohortSectionReleaseSchema);

module.exports = CohortSectionRelease;
