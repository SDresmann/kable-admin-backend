const router = require('express').Router();
const Cohort = require('../schema/CohortSchema');
const CohortSectionRelease = require('../schema/CohortSectionReleaseSchema');

// GET /api/cohorts – list cohorts. ?archived=true = end date has passed; otherwise active only (end date null or >= today)
router.get('/', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let query = {};
    if (req.query.archived === 'true') {
      query = { endDate: { $exists: true, $ne: null, $lt: today } };
    } else {
      query = { $or: [{ endDate: null }, { endDate: { $gte: today } }] };
    }
    const cohorts = await Cohort.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: cohorts });
  } catch (err) {
    console.error('Error fetching cohorts:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch cohorts' });
  }
});

// POST /api/cohorts – create a cohort
router.post('/', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Cohort name is required' });
    const payload = { name };
    if (req.body.startDate) payload.startDate = new Date(req.body.startDate);
    if (req.body.endDate) payload.endDate = new Date(req.body.endDate);
    const cohort = await Cohort.create(payload);
    res.status(201).json({ success: true, data: cohort });
  } catch (err) {
    console.error('Error creating cohort:', err);
    res.status(500).json({ success: false, message: 'Failed to create cohort' });
  }
});

// PATCH /api/cohorts/:id – update cohort (name, startDate, endDate)
router.patch('/:id', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Cohort name is required' });
    const update = { name };
    if (req.body.startDate !== undefined) update.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    if (req.body.endDate !== undefined) update.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    const cohort = await Cohort.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' });
    if (!cohort) return res.status(404).json({ success: false, message: 'Cohort not found' });
    res.json({ success: true, data: cohort });
  } catch (err) {
    console.error('Error updating cohort:', err);
    res.status(500).json({ success: false, message: 'Failed to update cohort' });
  }
});

// DELETE /api/cohorts/:id – delete cohort and its section releases
router.delete('/:id', async (req, res) => {
  try {
    const cohort = await Cohort.findByIdAndDelete(req.params.id);
    if (!cohort) return res.status(404).json({ success: false, message: 'Cohort not found' });
    await CohortSectionRelease.deleteMany({ cohortId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting cohort:', err);
    res.status(500).json({ success: false, message: 'Failed to delete cohort' });
  }
});

// GET /api/cohorts/:id/releases – list section releases for a cohort
router.get('/:id/releases', async (req, res) => {
  try {
    const releases = await CohortSectionRelease.find({ cohortId: req.params.id })
      .sort({ sectionId: 1 })
      .lean();
    res.json({ success: true, data: releases });
  } catch (err) {
    console.error('Error fetching cohort releases:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch releases' });
  }
});

// PUT /api/cohorts/:id/releases – set section release (start date) for a cohort
router.put('/:id/releases', async (req, res) => {
  try {
    const { sectionId, startDate } = req.body;
    if (sectionId == null || !startDate) {
      return res.status(400).json({ success: false, message: 'sectionId and startDate are required' });
    }
    const cohort = await Cohort.findById(req.params.id);
    if (!cohort) return res.status(404).json({ success: false, message: 'Cohort not found' });
    const release = await CohortSectionRelease.findOneAndUpdate(
      { cohortId: req.params.id, sectionId: Number(sectionId) },
      { startDate: new Date(startDate) },
      { returnDocument: 'after', upsert: true }
    );
    res.json({ success: true, data: release });
  } catch (err) {
    console.error('Error setting cohort release:', err);
    res.status(500).json({ success: false, message: 'Failed to set release' });
  }
});

module.exports = router;
