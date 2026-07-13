// scripts/admin-set-password.js
// Admin password reset via Firebase Admin SDK.
// Triggered manually from the GitHub Actions "🔑 Set User Password" workflow
// (workflow_dispatch) so the owner can reset any team member's RUDY login
// password from a phone — no computer / no Firebase Console "Edit account"
// (which is desktop-only) required.
//
// Inputs come from env (set by the workflow from its dispatch inputs):
//   TARGET_EMAIL     — the user's login email (e.g. lenghlx1@gmail.com)
//   NEW_PASSWORD     — the new password (Firebase requires >= 6 chars)
//
// Safety:
//   - never logs the password
//   - validates length before calling Firebase
//   - looks the user up by email first; clear error if not found

const { init } = require('./lib/firebase');

async function main() {
  const email = (process.env.TARGET_EMAIL || '').trim();
  const password = process.env.NEW_PASSWORD || '';

  if (!email) {
    console.error('❌ TARGET_EMAIL is empty.');
    process.exit(1);
  }
  if (password.length < 6) {
    console.error('❌ NEW_PASSWORD must be at least 6 characters (Firebase rule). Got length: ' + password.length);
    process.exit(1);
  }

  const admin = init();
  const auth = admin.auth();

  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      console.error('❌ No account found for: ' + email);
      console.error('   Check the exact spelling in Firebase Console → Authentication → Users.');
      process.exit(1);
    }
    throw e;
  }

  await auth.updateUser(user.uid, { password });

  console.log('✅ Password updated successfully.');
  console.log('   Email : ' + email);
  console.log('   UID   : ' + user.uid);
  console.log('   The user can now log in to RUDY with the new password.');
}

main().catch(err => {
  console.error('❌ Failed:', err && err.message ? err.message : err);
  process.exit(1);
});
