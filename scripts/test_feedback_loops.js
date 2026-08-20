// Verification script for Caller Feedback Loops & Dashboard Reflection
require('dotenv').config();
const db = require('../src/db/database');

async function runFeedbackVerification() {
  console.log('🔄 Initializing Database connection for Feedback Loop Test...');
  await db.connect();

  const leads = await db.getAllLeads();
  console.log(`📊 Found ${leads.length} leads in database.`);
  if (leads.length === 0) {
    console.error('❌ No leads in database to test.');
    process.exit(1);
  }

  const testLead1 = leads[0];
  const testLead2 = leads[1] || leads[0];

  console.log(`\n🧪 Test 1: Marking Lead 1 ("${testLead1.name}") as Interested with Follow-Up Schedule...`);
  const followUpDate = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
  const updated1 = await db.updateLeadStatus(
    testLead1.id,
    'Interested',
    'Spoke with Operations Director; scheduled demo for tomorrow morning.',
    followUpDate
  );

  if (updated1.call_status !== 'Interested' || updated1.follow_up_date !== followUpDate) {
    console.error('❌ Test 1 Failed: Status or follow_up_date mismatch', updated1);
    process.exit(1);
  }
  console.log('✅ Test 1 Passed: Interested status and follow_up_date persisted correctly.');

  console.log(`\n🧪 Test 2: Marking Lead 2 ("${testLead2.name}") as Not a Fit...`);
  const updated2 = await db.updateLeadStatus(
    testLead2.id,
    'Not a Fit',
    'Has internal in-house ERP team, no external budget.',
    null
  );

  if (updated2.call_status !== 'Not a Fit' || updated2.follow_up_date !== null) {
    console.error('❌ Test 2 Failed: Not a Fit status mismatch', updated2);
    process.exit(1);
  }
  console.log('✅ Test 2 Passed: Not a Fit status persisted correctly.');

  console.log('\n🧪 Test 3: Verifying Call Logs generation...');
  const logs = await db.getCallLogs();
  const foundLog1 = logs.find(l => l.lead_id === testLead1.id && l.status === 'Interested');
  const foundLog2 = logs.find(l => l.lead_id === testLead2.id && l.status === 'Not a Fit');

  if (!foundLog1 || !foundLog2) {
    console.error('❌ Test 3 Failed: Call logs missing entries.', { foundLog1, foundLog2 });
    process.exit(1);
  }
  console.log(`✅ Test 3 Passed: Call logs generated for both outcomes (Total logs: ${logs.length}).`);

  console.log('\n======================================================');
  console.log('🎉 ALL CALLER FEEDBACK LOOP INTEGRITY TESTS PASSED (3/3)');
  console.log('======================================================\n');
  process.exit(0);
}

runFeedbackVerification().catch(err => {
  console.error('❌ Verification Error:', err);
  process.exit(1);
});
