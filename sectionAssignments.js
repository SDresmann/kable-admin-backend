/**
 * Assignment names per section – must stay in sync with Kable Career sectionData.js
 * Used to count overdue assignments (released section + 7 days = due; + 14 days = one week late).
 */

function getAssignmentNames(sectionId) {
  const id = parseInt(sectionId, 10) || 1;
  const readChapter = `Read chapter ${id}`;
  const s1 = [readChapter, "How Hiring Actually Works (and Why It's Not Personal)", 'Questions'];
  const s2 = [readChapter, 'Resume Foundations, ATS & AI', 'Chat GPT Exercise: The Resume Scan', 'Resume v1 Checklist'];
  const s3 = [readChapter, 'LinkedIn & Indeed Profile Setup'];
  const s4 = [readChapter, 'Building Your AI Career Strategist Using NotebookLM', 'Schedule Your First One-on-One', 'Access NotebookLM (Google Notebook)'];
  const s5 = ['Resume Alignment Assignment', 'Finalize LinkedIn & Indeed Profiles', 'Mock Interview with Nick (Recruiter Practice)'];
  const s6 = ['Professional Presence, Discomfort & Ownership'];
  const s7 = ['Professional Scenarios – Written Responses', 'Professional Reliability Checklist & Reflection', 'Schedule Your Final 1:1'];
  const s8 = ['The Plan', 'Reflection'];
  const s9 = ['Financial & Lifestyle Reflection', 'Creating a 12 Month Stability Plan'];
  const s10 = ['Build Your Story'];
  const s11 = ['How Recruiting and Hiring Works: Part II', 'Assignment 1 – Reverse Engineer a Posting', 'Assignment 2 – Resume Through a Recruiter Lens', '1:1 Progress Review – Come Prepared'];
  const s12 = ['Mock Technical Interview – Book with Jon or Daniel'];

  if (id === 1) return s1;
  if (id === 2) return s2;
  if (id === 3) return s3;
  if (id === 4) return s4;
  if (id === 5) return s5;
  if (id === 6) return s6;
  if (id === 7) return s7;
  if (id === 8) return s8;
  if (id === 9) return s9;
  if (id === 10) return ['Read chapter 7', ...s10];
  if (id === 11) return ['Read chapter 8', ...s11];
  if (id === 12) return ['Read chapter 9', ...s12];
  return [readChapter, 'Assignment 1', 'Assignment 2', 'Assignment 3', 'Assignment 4'];
}

module.exports = { getAssignmentNames };
