import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import buggiesRouter from './routes/buggies.js';
import driversRouter from './routes/drivers.js';
import routesRouter from './routes/routes.js';
import adminRouter from './routes/admin.js';
import demandRouter from './routes/demand.js';

const app = express();
const httpServer = createServer(app);
const configuredOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin = configuredOrigins.length ? configuredOrigins : true;

const io = new Server(httpServer, { cors: { origin: corsOrigin, methods: ['GET', 'POST', 'PUT', 'DELETE'] } });
app.set('io', io);
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://tiles.openfreemap.org'],
      connectSrc: ["'self'", 'ws:', 'wss:', 'https://tiles.openfreemap.org'],
      workerSrc: ["'self'", 'blob:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"]
    }
  }
}));
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, database: mongoose.connection.readyState === 1 }));
app.use('/api/buggies', buggiesRouter);
app.use('/api/drivers', driversRouter);
app.use('/api/routes', routesRouter);
app.use('/api/demand-zones', demandRouter);
app.use('/api/admin', adminRouter);

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(currentDir, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (error) => error && next());
});

app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || (error.name === 'ValidationError' ? 400 : 500)).json({
    message: error.status || error.name === 'ValidationError' ? error.message : 'The server could not complete that request.'
  });
});

const port = Number(process.env.PORT || 5000);
const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/buggy-tracker';

async function start() {
  await mongoose.connect(mongoUri);
  if (!process.env.ADMIN_KEY) {
    console.warn('ADMIN_KEY is not set; using the documented demo key. Set ADMIN_KEY before sharing a tunnel.');
  }
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`Buggy tracker listening on http://0.0.0.0:${port}`);
  });
}

async function shutdown() {
  io.close();
  await mongoose.disconnect();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch((error) => {
  console.error('Startup failed:', error.message);
  process.exit(1);
});
