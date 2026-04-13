const nodemailer = require('nodemailer');
const admin = require('firebase-admin');

const ALLOWED_ORIGIN = 'https://compsci-talks.github.io';
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const requestLog = new Map();

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

function applyRateLimit(key) {
  const now = Date.now();
  const entries = requestLog.get(key) || [];
  const recent = entries.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestLog.set(key, recent);
  return recent.length <= RATE_LIMIT_MAX_REQUESTS;
}

function initFirebaseAdmin() {
  if (admin.apps.length > 0) return admin.app();
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

function escapeHtml(input = '') {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml({ name, actionLink }) {
  const safeName = escapeHtml(name || 'there');
  const safeLink = escapeHtml(actionLink);
  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827;line-height:1.6;">
      <h2 style="margin-bottom:8px;">Confirm your CompSci Talks account</h2>
      <p>Hi ${safeName},</p>
      <p>Please verify your email address to activate your account.</p>
      <p style="margin:24px 0;">
        <a href="${safeLink}" style="background:#0ea5e9;color:#ffffff;padding:12px 16px;border-radius:8px;text-decoration:none;display:inline-block;">Verify Email</a>
      </p>
      <p style="font-size:12px;color:#6b7280;">If the button does not work, copy this URL:</p>
      <p style="font-size:12px;word-break:break-all;color:#6b7280;">${safeLink}</p>
    </div>
  `;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, displayName, continueUrl, idToken } = req.body || {};

  if (!email || !continueUrl || !idToken) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (!applyRateLimit(`${ip}:${email}`)) {
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    initFirebaseAdmin();
    const auth = admin.auth();

    const decodedToken = await auth.verifyIdToken(idToken);
    if (decodedToken.email !== email) {
      return res.status(403).json({ error: 'Token/email mismatch' });
    }

    const actionLink = await auth.generateEmailVerificationLink(email, { url: continueUrl });

    await getTransporter().sendMail({
      from: `"${process.env.SENDER_NAME}" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Confirm your CompSci Talks account',
      html: buildHtml({ name: displayName || email, actionLink }),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to send verification email' });
  }
};