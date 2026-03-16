const mongoose = require('mongoose');

const cohortSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

const Cohort = mongoose.model('Cohort', cohortSchema);

module.exports = Cohort;
