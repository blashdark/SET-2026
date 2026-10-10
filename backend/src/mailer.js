'use strict';

// Sends verification emails over real SMTP (Gmail by default).
// Configure via env; when SMTP is not configured we log the link instead
// so the flow still works in development.

const nodemailer = require('nodemailer');

const HOST = process.env.SMTP_HOST;
const PORT = Number(process.env.SMTP_PORT || 465);
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const FROM = process.env.MAIL_FROM || USER;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const VERIFY_TTL_SECONDS = Number(process.env.VERIFY_TTL_SECONDS || 86400);

// Human-readable lifetime for the email copy, derived from VERIFY_TTL_SECONDS.
function ttlText() {
  if (VERIFY_TTL_SECONDS % 86400 === 0) return `${VERIFY_TTL_SECONDS / 86400} ngày`;
  if (VERIFY_TTL_SECONDS % 3600 === 0) return `${VERIFY_TTL_SECONDS / 3600} giờ`;
  if (VERIFY_TTL_SECONDS % 60 === 0) return `${VERIFY_TTL_SECONDS / 60} phút`;
  return `${VERIFY_TTL_SECONDS} giây`;
}

// secure: true for implicit TLS (port 465), false for STARTTLS (port 587).
const transporter = HOST && USER && PASS
  ? nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465,
      auth: { user: USER, pass: PASS }
    })
  : null;

function isConfigured() {
  return transporter !== null;
}

function verifyLink(token) {
  return `${BASE_URL}/verify?token=${encodeURIComponent(token)}`;
}

// Send the "please verify your email" message. Returns { delivered, link }.
async function sendVerificationEmail(email, token) {
  const link = verifyLink(token);
  const ttl = ttlText();

  if (!transporter) {
    console.log(`[mailer] SMTP not configured. Verification link for ${email}: ${link}`);
    return { delivered: false, link };
  }

  await transporter.sendMail({
    from: FROM,
    to: email,
    subject: 'Xác thực email của bạn',
    text: `Chào bạn,\n\nNhấn vào link sau để xác thực email:\n${link}\n\nLink hết hạn sau ${ttl}.`,
    html: `<p>Chào bạn,</p><p>Nhấn <a href="${link}">vào đây</a> để xác thực email.</p><p>Link hết hạn sau ${ttl}.</p>`
  });

  return { delivered: true, link };
}

module.exports = { sendVerificationEmail, verifyLink, isConfigured };
