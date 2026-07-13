// functions/index.js
// RUDY admin Cloud Functions (Firebase Functions v2, Node 20).
//
// setUserPassword — lets an ADMIN reset any team member's login password
// from inside the app. The Firebase client SDK cannot change another
// user's password; only the Admin SDK (server-side) can. This callable
// bridges that gap, and — critically — verifies the caller is an admin
// SERVER-SIDE by reading their role from the database, never trusting
// anything the client claims.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

const DB_URL =
  'https://timetrack-63654-default-rtdb.asia-southeast1.firebasedatabase.app';

exports.setUserPassword = onCall({ region: 'asia-southeast1' }, async (request) => {
  // 1. Must be signed in.
  const callerUid = request.auth && request.auth.uid;
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบก่อน');
  }

  // 2. Caller must be an admin — checked against the DB, not the client.
  const roleSnap = await admin
    .database(admin.app(), DB_URL)
    .ref(`employees/${callerUid}/role`)
    .get();
  const callerRole = roleSnap.val();
  if (callerRole !== 'admin') {
    throw new HttpsError('permission-denied', 'เฉพาะ Admin เท่านั้น');
  }

  // 3. Validate inputs.
  const email = (request.data && request.data.email ? String(request.data.email) : '').trim();
  const password = request.data && request.data.password ? String(request.data.password) : '';
  if (!email) {
    throw new HttpsError('invalid-argument', 'กรุณาระบุอีเมล');
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
  }

  // 4. Find the target user + update the password.
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'ไม่พบบัญชีอีเมลนี้ในระบบ');
    }
    throw new HttpsError('internal', 'ค้นหาบัญชีไม่สำเร็จ');
  }

  await admin.auth().updateUser(user.uid, { password });

  return { ok: true, email, uid: user.uid };
});
