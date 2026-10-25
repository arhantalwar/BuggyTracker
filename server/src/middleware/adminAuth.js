import crypto from 'node:crypto';

function sameSecret(received, expected) {
  const receivedBuffer = Buffer.from(received || '');
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

export function adminAuth(req, res, next) {
  const configuredKey = process.env.ADMIN_KEY || 'buggy-demo-admin';
  if (!sameSecret(req.get('x-admin-key'), configuredKey)) {
    return res.status(401).json({ message: 'Invalid admin key.' });
  }
  next();
}
