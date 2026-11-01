import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import adminRouter from '../src/routes/admin.js';
import BuggySession from '../src/models/BuggySession.js';
import CampusRoute from '../src/models/CampusRoute.js';
import Driver from '../src/models/Driver.js';
import DemandNudge from '../src/models/DemandNudge.js';
import DemandZone from '../src/models/DemandZone.js';

let server;
let baseUrl;
const events = [];
const previousAdminKey = process.env.ADMIN_KEY;
const originals = {
  buggyFind: BuggySession.find,
  buggyDelete: BuggySession.findByIdAndDelete,
  buggyExists: BuggySession.exists,
  routeFind: CampusRoute.find,
  routeCreate: CampusRoute.create,
  routeDelete: CampusRoute.findByIdAndDelete,
  driverFind: Driver.find,
  driverCreate: Driver.create,
  driverDelete: Driver.findByIdAndDelete,
  zoneFind: DemandZone.find,
  zoneCreate: DemandZone.create,
  zoneDelete: DemandZone.findByIdAndDelete,
  nudgeCount: DemandNudge.countDocuments,
  nudgeDelete: DemandNudge.deleteMany
};

const buggy = {
  _id: '507f1f77bcf86cd799439011',
  buggyId: 'BUGGY-09',
  driverName: 'Meera',
  sessionToken: 'private-token',
  active: true,
  location: { lat: 19.13, lng: 72.91, source: 'gps' },
  lastSeen: new Date(),
  shiftStartedAt: new Date(),
  toObject() {
    return { ...this, toObject: undefined };
  }
};

const driver = { _id: '507f1f77bcf86cd799439012', name: 'Meera' };

function queryResult(items) {
  return {
    sort: async () => items,
    then(resolve, reject) {
      return Promise.resolve(items).then(resolve, reject);
    }
  };
}

function zoneDocument(data = {}) {
  return {
    _id: '507f191e810c19729de860eb',
    name: 'Library pickup',
    center: { lat: 19.13, lng: 72.91 },
    radiusMeters: 100,
    threshold: 3,
    active: true,
    ...data,
    toObject() {
      return { ...this, toObject: undefined };
    }
  };
}

function routeDocument(data = {}) {
  return {
    _id: '507f191e810c19729de860ea',
    name: 'Main Gate Loop',
    startLabel: 'Hostels',
    endLabel: 'Main Gate',
    color: '#27c278',
    waypoints: [{ lat: 19.13, lng: 72.91 }, { lat: 19.14, lng: 72.92 }],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
    toObject() {
      return { ...this, toObject: undefined };
    }
  };
}

before(async () => {
  process.env.ADMIN_KEY = 'test-admin-key';
  BuggySession.find = () => queryResult([buggy]);
  BuggySession.findByIdAndDelete = async () => buggy;
  BuggySession.exists = async () => false;
  CampusRoute.find = () => ({ sort: async () => [routeDocument()] });
  CampusRoute.create = async (data) => routeDocument(data);
  CampusRoute.findByIdAndDelete = async () => routeDocument();
  Driver.find = () => ({ sort: async () => [driver] });
  Driver.create = async (data) => ({ _id: driver._id, ...data });
  Driver.findByIdAndDelete = async () => driver;
  DemandZone.find = () => queryResult([zoneDocument()]);
  DemandZone.create = async (data) => zoneDocument(data);
  DemandZone.findByIdAndDelete = async () => zoneDocument();
  DemandNudge.countDocuments = async () => 2;
  DemandNudge.deleteMany = async () => ({ deletedCount: 2 });

  const app = express();
  app.set('io', { emit: (name, payload) => events.push({ name, payload }) });
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  BuggySession.find = originals.buggyFind;
  BuggySession.findByIdAndDelete = originals.buggyDelete;
  BuggySession.exists = originals.buggyExists;
  CampusRoute.find = originals.routeFind;
  CampusRoute.create = originals.routeCreate;
  CampusRoute.findByIdAndDelete = originals.routeDelete;
  Driver.find = originals.driverFind;
  Driver.create = originals.driverCreate;
  Driver.findByIdAndDelete = originals.driverDelete;
  DemandZone.find = originals.zoneFind;
  DemandZone.create = originals.zoneCreate;
  DemandZone.findByIdAndDelete = originals.zoneDelete;
  DemandNudge.countDocuments = originals.nudgeCount;
  DemandNudge.deleteMany = originals.nudgeDelete;
  if (previousAdminKey === undefined) delete process.env.ADMIN_KEY;
  else process.env.ADMIN_KEY = previousAdminKey;
  await new Promise((resolve) => server.close(resolve));
});

test('admin key protects overview and admin can create a route and delete an active buggy', async () => {
  const denied = await fetch(`${baseUrl}/api/admin/overview`);
  assert.equal(denied.status, 401);

  const headers = { 'X-Admin-Key': 'test-admin-key' };
  const overview = await fetch(`${baseUrl}/api/admin/overview`, { headers });
  assert.equal(overview.status, 200);
  const overviewData = await overview.json();
  assert.equal(overviewData.buggies[0].buggyId, 'BUGGY-09');
  assert.equal(overviewData.buggies[0].sessionToken, undefined);
  assert.equal(overviewData.routes[0].name, 'Main Gate Loop');
  assert.deepEqual(overviewData.drivers[0], { id: driver._id, name: 'Meera', active: false });
  assert.equal(overviewData.demandZones[0].name, 'Library pickup');
  assert.equal(overviewData.demandZones[0].demandCount, 2);

  const createdZone = await fetch(`${baseUrl}/api/admin/demand-zones`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Library pickup', center: { lat: 19.13, lng: 72.91 }, radiusMeters: 100, threshold: 3 })
  });
  assert.equal(createdZone.status, 201);
  assert.equal((await createdZone.json()).zone.radiusMeters, 100);

  const createdDriver = await fetch(`${baseUrl}/api/admin/drivers`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Asha', passcode: '2468' })
  });
  assert.equal(createdDriver.status, 201);
  const createdDriverData = await createdDriver.json();
  assert.equal(createdDriverData.driver.name, 'Asha');
  assert.equal(createdDriverData.driver.passcodeHash, undefined);

  const created = await fetch(`${baseUrl}/api/admin/routes`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Library Express',
      startLabel: 'Library',
      endLabel: 'Lecture Hall',
      color: '#3366ff',
      waypoints: [{ lat: 19.131, lng: 72.911 }, { lat: 19.132, lng: 72.912 }]
    })
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).route.name, 'Library Express');

  const deleted = await fetch(`${baseUrl}/api/admin/buggies/${buggy._id}`, { method: 'DELETE', headers });
  assert.equal(deleted.status, 204);
  assert.deepEqual(events.map((event) => event.name), ['demand:updated', 'route:created', 'buggy:ended']);
});
