import express from 'express';
import BuggySession from '../models/BuggySession.js';
import { thresholds, toPublicBuggy } from '../services/publicBuggy.js';

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const sessions = await BuggySession.find({ active: true }).sort({ buggyId: 1 });
    res.json({ buggies: sessions.map(toPublicBuggy), thresholds });
  } catch (error) {
    next(error);
  }
});

export default router;
