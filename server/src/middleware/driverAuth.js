import BuggySession from '../models/BuggySession.js';

export async function driverAuth(req, res, next) {
  try {
    const [scheme, token] = (req.get('authorization') || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Driver session token is required.' });
    }

    const session = await BuggySession.findOne({ sessionToken: token, active: true });
    if (!session) {
      return res.status(401).json({ message: 'This driver session is no longer active.' });
    }

    req.driverSession = session;
    next();
  } catch (error) {
    next(error);
  }
}
