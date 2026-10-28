import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import BuggySession from '../src/models/BuggySession.js';
import CampusRoute from '../src/models/CampusRoute.js';
import Driver from '../src/models/Driver.js';
import driversRouter from '../src/routes/drivers.js';
import { hashPasscode } from '../src/services/passcodes.js';

let server;
let baseUrl;
let activeSession;
const events = [];
const originalFindOne = BuggySession.findOne;
const originalCreate = BuggySession.create;
const originalRouteExists = CampusRoute.exists;
const originalDriverFind = Driver.find;
const originalDriverFindById = Driver.findById;
const assignedRouteId = '507f191e810c19729de860ea';
const driverId = '507f1f77bcf86cd799439012';

function documentFrom(data) {
  return {
    _id: '507f1f77bcf86cd799439011',
    active: true,
    shiftStartedAt: new Date(),
    ...data,
    async save() {},
    toObject() {
      const { save, toObject, ...plain } = this;
      return plain;
    }
  };
}

before(async () => {
  const credentials = await hashPasscode('2468');
  const driver = { _id: driverId, name: 'Asha', ...credentials };
  Driver.find = () => ({ sort: async () => [driver] });
  Driver.findById = () => ({ select: async () => driver });
  BuggySession.findOne = async (query) => {
    if (query.buggyId) return null;
    return activeSession?.active && query.sessionToken === activeSession.sessionToken ? activeSession : null;
  };
  BuggySession.create = async (data) => {
    activeSession = documentFrom(data);
    return activeSession;
  };
  CampusRoute.exists = async ({ _id }) => String(_id) === assignedRouteId;

  const app = express();
  app.set('io', { emit: (name, payload) => events.push({ name, payload }) });
  app.use(express.json());
  app.use('/api/drivers', driversRouter);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  BuggySession.findOne = originalFindOne;
  BuggySession.create = originalCreate;
  CampusRoute.exists = originalRouteExists;
  Driver.find = originalDriverFind;
  Driver.findById = originalDriverFindById;
  await new Promise((resolve) => server.close(resolve));
});

test('driver can register, update a public position, restore, and end a shift', async () => {
  const options = await fetch(`${baseUrl}/api/drivers/options`);
  assert.deepEqual(await options.json(), { drivers: [{ id: driverId, name: 'Asha' }] });

  const rejected = await fetch(`${baseUrl}/api/drivers/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buggyId: 'buggy-07', driverId, passcode: 'wrong' })
  });
  assert.equal(rejected.status, 401);

  const registration = await fetch(`${baseUrl}/api/drivers/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ buggyId: 'buggy-07', driverId, passcode: '2468' })
  });
  assert.equal(registration.status, 201);
  const registered = await registration.json();
  assert.equal(registered.buggy.buggyId, 'BUGGY-07');
  assert.equal(registered.buggy.driverName, 'Asha');
  assert.equal(registered.buggy.passengerCount, 0);
  assert.equal(registered.buggy.availableSeats, 10);
  assert.equal(registered.buggy.sessionToken, undefined);
  assert.match(registered.token, /^[a-f0-9]{64}$/);

  const auth = { Authorization: `Bearer ${registered.token}` };
  const invalidOccupancy = await fetch(`${baseUrl}/api/drivers/occupancy`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ passengerCount: 11 })
  });
  assert.equal(invalidOccupancy.status, 400);

  const occupancy = await fetch(`${baseUrl}/api/drivers/occupancy`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ passengerCount: 6 })
  });
  assert.equal(occupancy.status, 200);
  const occupancyData = await occupancy.json();
  assert.equal(occupancyData.buggy.passengerCount, 6);
  assert.equal(occupancyData.buggy.availableSeats, 4);

  const routeRequired = await fetch(`${baseUrl}/api/drivers/location`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 19.1334, lng: 72.9133, accuracy: 4, source: 'simulation', direction: 'forward' })
  });
  assert.equal(routeRequired.status, 400);

  const update = await fetch(`${baseUrl}/api/drivers/location`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 19.1334, lng: 72.9133, accuracy: 4, source: 'simulation', routeId: assignedRouteId, direction: 'forward' })
  });
  assert.equal(update.status, 200);
  const updated = await update.json();
  assert.deepEqual(updated.buggy.location, {
    lat: 19.1334,
    lng: 72.9133,
    accuracy: 4,
    source: 'simulation'
  });
  assert.equal(updated.buggy.status, 'live');
  assert.equal(updated.buggy.routeId, assignedRouteId);
  assert.equal(updated.buggy.direction, 'forward');
  assert.equal(updated.buggy.sessionToken, undefined);

  const restored = await fetch(`${baseUrl}/api/drivers/me`, { headers: auth });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).buggy.buggyId, 'BUGGY-07');

  const ended = await fetch(`${baseUrl}/api/drivers/session`, { method: 'DELETE', headers: auth });
  assert.equal(ended.status, 204);
  assert.deepEqual(events.map((event) => event.name), ['buggy:started', 'buggy:updated', 'buggy:updated', 'buggy:ended']);
  assert.equal(events.some((event) => event.payload?.sessionToken), false);
});
