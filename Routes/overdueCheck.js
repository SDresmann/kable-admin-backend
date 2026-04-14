/**
 * Check for students who have at least one overdue assignment and send a professional email.
 * Due date = section release startDate + 7 days. Overdue = due date has passed (today >= due date).
 * Trigger: GET or POST /api/cron/check-overdue (optional ?secret=CRON_SECRET if CRON_SECRET is set in env).
 */
const router = require('express').Router();
const mongoose = require('mongoose');
const { getTestDb } = require('../testDb');
const User = require('../schema/UserSchema');
const CohortSectionRelease = require('../schema/CohortSectionReleaseSchema');
const AssignmentCommentModel = require('../schema/AssignmentCommentSchema');
const ChecklistSubmissionSchema = require('../schema/ChecklistSubmissionSchema');
const { getAssignmentNames } = require('../sectionAssignments');

const DAYS_AFTER_RELEASE_DUE = 7;  // assignment due this many days after section release

function getAssignmentCommentModel() {
  const testDb = getTestDb();
  return testDb.models.AssignmentComment || testDb.model('AssignmentComment', AssignmentCommentModel.schema);
}

function getChecklistSubmissionModel() {
  const testDb = getTestDb();
  return testDb.models.ChecklistSubmission || testDb.model('ChecklistSubmission', ChecklistSubmissionSchema.schema);
}

async function runOverdueCheck(opts = {}) {
  const debug = opts.debug === true;
  const testDb = getTestDb();
  const UserModel = testDb.models.user || testDb.model('user', User.schema);
  const AssignmentComment = getAssignmentCommentModel();
  const ChecklistSubmission = getChecklistSubmissionModel();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const students = await UserModel.find({ cohortId: { $exists: true, $ne: null, $ne: '' } })
    .select('email cohortId')
    .lean();

  const results = { emailsSent: 0, studentsChecked: students.length, studentsWithOverdue: [], errors: [] };
  if (debug) results.debug = { today: today.toISOString(), todayLocal: today.toString(), students: [] };

  for (const student of students) {
    try {
      const cohortObjId = mongoose.Types.ObjectId.isValid(student.cohortId)
        ? new mongoose.Types.ObjectId(student.cohortId)
        : student.cohortId;
      const releases = await CohortSectionRelease.find({
        cohortId: cohortObjId,
        startDate: { $lte: today },
      })
        .lean();

      if (debug) {
        const summary = { email: student.email, cohortId: String(student.cohortId), releasesFound: releases.length };
        const overdueReleases = releases.filter((rel) => {
          const releaseStart = new Date(rel.startDate);
          releaseStart.setHours(0, 0, 0, 0);
          const dueDate = new Date(releaseStart);
          dueDate.setDate(dueDate.getDate() + DAYS_AFTER_RELEASE_DUE);
          return dueDate <= today;
        });
        summary.releasesWithDueDatePassed = overdueReleases.length;
        if (releases.length > 0) {
          const rs = new Date(releases[0].startDate);
          rs.setHours(0, 0, 0, 0);
          const dd = new Date(rs);
          dd.setDate(dd.getDate() + DAYS_AFTER_RELEASE_DUE);
          summary.firstRelease = {
            sectionId: releases[0].sectionId,
            startDate: releases[0].startDate,
            dueDate: dd.toISOString(),
          };
        }
        results.debug.students.push(summary);
      }

      const emailLower = (student.email || '').trim().toLowerCase();
      const [allComments, allSubmissions] = await Promise.all([
        AssignmentComment.find({ userEmail: emailLower }).select('sectionId assignmentIndex').lean(),
        ChecklistSubmission.find({ userEmail: emailLower }).select('assignmentName').lean(),
      ]);
      const commentSet = new Set(
        allComments.map((c) => `${Number(c.sectionId)}:${Number(c.assignmentIndex)}`)
      );
      const submissionNamesLower = new Set(
        allSubmissions.map((s) => (s.assignmentName || '').toLowerCase())
      );

      const overdueAssignments = [];
      for (const rel of releases) {
        const releaseStart = new Date(rel.startDate);
        releaseStart.setHours(0, 0, 0, 0);
        const dueDate = new Date(releaseStart);
        dueDate.setDate(dueDate.getDate() + DAYS_AFTER_RELEASE_DUE);
        if (dueDate > today) continue; // not overdue yet (due date is in the future)
        const sectionId = rel.sectionId;
        const names = getAssignmentNames(sectionId);

        for (let idx = 0; idx < names.length; idx++) {
          const assignmentName = names[idx];
          if (commentSet.has(`${Number(sectionId)}:${idx}`)) continue;
          if (submissionNamesLower.has((assignmentName || '').toLowerCase())) continue;
          overdueAssignments.push({ sectionId, assignmentName, dueDate });
        }
      }

      if (overdueAssignments.length >= 1) {
        results.studentsWithOverdue.push({ email: student.email, overdueCount: overdueAssignments.length });
        console.log(`[overdue] ${student.email} has ${overdueAssignments.length} overdue assignment(s), sending email...`);
        try {
          await sendOverdueEmail(student.email, overdueAssignments.length);
          results.emailsSent += 1;
          console.log(`[overdue] Email sent to ${student.email}`);
        } catch (sendErr) {
          console.error(`[overdue] Send failed for ${student.email}:`, sendErr.message);
          results.errors.push({ email: student.email, message: `Send failed: ${sendErr.message}` });
        }
      }
    } catch (err) {
      results.errors.push({ email: student.email, message: err.message });
    }
  }

  return results;
}

const SUBJECT = 'Kable Academy – Course progress reminder';

function getOverdueEmailBody(count) {
  const text = `Dear Student,

This is a friendly reminder that you currently have ${count} assignment${count !== 1 ? 's' : ''} past due in your Kable Academy course. We encourage you to log in to the student portal and complete these items at your earliest convenience.

Staying on track with your assignments will help you get the most out of the program. If you have any questions or need support, please reach out to your instructor or program administrator.

Best regards,
Kable Academy`;
  const html = `<!DOCTYPE html><html><body style="font-family: system-ui, sans-serif; line-height: 1.6; color: #374151; max-width: 560px;">
<p>Dear Student,</p>
<p>This is a friendly reminder that you currently have <strong>${count} assignment${count !== 1 ? 's' : ''}</strong> past due in your Kable Academy course. We encourage you to log in to the student portal and complete these items at your earliest convenience.</p>
<p>Staying on track with your assignments will help you get the most out of the program. If you have any questions or need support, please reach out to your instructor or program administrator.</p>
<p>Best regards,<br>Kable Academy</p>
</body></html>`;
  return { text, html };
}

function useGraph() {
  return !!(
    process.env.MS_CLIENT_ID &&
    process.env.MS_CLIENT_SECRET &&
    process.env.MS_TENANT_ID &&
    process.env.MS_SENDER_UPN
  );
}

async function getGraphAccessToken() {
  const msal = require('@azure/msal-node');
  const config = {
    auth: {
      clientId: process.env.MS_CLIENT_ID,
      authority: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}`,
      clientSecret: process.env.MS_CLIENT_SECRET,
    },
  };
  const cca = new msal.ConfidentialClientApplication(config);
  const result = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  if (!result || !result.accessToken) throw new Error('Failed to get Graph access token');
  return result.accessToken;
}

async function sendOverdueEmailViaGraph(toEmail, count) {
  const token = await getGraphAccessToken();
  const { html } = getOverdueEmailBody(count);
  const sender = process.env.MS_SENDER_UPN;
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: SUBJECT,
        body: { contentType: 'HTML', content: html },
        toRecipients: [{ emailAddress: { address: toEmail } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    let msg = `Graph sendMail ${res.status}`;
    try {
      const j = JSON.parse(errBody);
      if (j.error && j.error.message) msg = j.error.message;
    } catch (_) {}
    throw new Error(msg);
  }
}

async function sendOverdueEmailViaSmtp(toEmail, count) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER && process.env.SMTP_PASS
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  const { text, html } = getOverdueEmailBody(count);
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@kableacademy.com',
    to: toEmail,
    subject: SUBJECT,
    text,
    html,
  });
}

async function sendOverdueEmail(toEmail, count) {
  if (useGraph()) {
    await sendOverdueEmailViaGraph(toEmail, count);
  } else {
    await sendOverdueEmailViaSmtp(toEmail, count);
  }
}

router.get('/', async (req, res) => {
  if (process.env.CRON_SECRET && req.query.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const results = await runOverdueCheck({ debug: req.query.debug === '1' });
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Overdue check error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', async (req, res) => {
  if (process.env.CRON_SECRET && req.body.secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const results = await runOverdueCheck({ debug: req.body.debug === true || req.body.debug === '1' });
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Overdue check error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
module.exports.runOverdueCheck = runOverdueCheck;
