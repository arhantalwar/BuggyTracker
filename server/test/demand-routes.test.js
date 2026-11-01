import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import BuggySession from '../src/models/BuggySession.js';
import DemandNudge from '../src/models/DemandNudge.js';
import DemandZone from '../src/models/DemandZone.js';
import demandRouter from '../src/routes/demand.js';

let server;
let baseUrl;
let savedNudge;
const events = [];
const zoneId = '507f191e810c19729de860eb';
const originals = {
  buggyFind: BuggySession.find,
  zoneFind: DemandZone.find,
  zoneFindOne: DemandZone.findOne,
  nudgeCount: DemandNudge.countDocuments,
  nudgeUpsert: DemandNudge.findOneAndUpdate
};

const zone = {
  _id: zoneId,
  name: 'Library pickup',
  center: { lat: 19.13, lng: 72.91 },
  radiusMeters: 100,
  threshold: 3,
  active: true,
  toObject() {
    return { ...this, toObject: undefined };
  }
};

function queryResult(items) {
  return {
    sort: async () => items,
    then(resolve, reject) {
      return Promise.resolve(items).then(resolve, reject);
    }
  };
}

before(async () => {
  DemandZone.find = () => queryResult([zone]);
  DemandZone.findOne = async ({ _id, active }) => String(_id) === zoneId && active ? zone : null;
  DemandNudge.countDocuments = async () => 3;
  DemandNudge.findOneAndUpdate = async (filter, update) => {
    savedNudge = { filter, update };
    return { ...filter, ...update.$set };
  };
  BuggySession.find = () => Promise.resolve([
    { _id: '507f1f77bcf86cd799439021', buggyId: 'BUGGY-FULL', passengerCount: 10, lastSeen: new Date(), location: { lat: 19.13005, lng: 72.91005 } },
    { _id: '507f1f77bcf86cd799439022', buggyId: 'BUGGY-NEAR', passengerCount: 4, lastSeen: new Date(), location: { lat: 19.131, lng: 72.911 } },
    { _id: '507f1f77bcf86cd799439023', buggyId: 'BUGGY-FAR', passengerCount: 1, lastSeen: new Date(), location: { lat: 19.14, lng: 72.92 } }
  ]);

  const app = express();
  app.set('io', { emit: (name, payload) => events.push({ name, payload }) });
  app.use(express.json());
  app.use('/api/demand-zones', demandRouter);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  BuggySession.find = originals.buggyFind;
  DemandZone.find = originals.zoneFind;
  DemandZone.findOne = originals.zoneFindOne;
  DemandNudge.countDocuments = originals.nudgeCount;
  DemandNudge.findOneAndUpdate = originals.nudgeUpsert;
  await new Promise((resolve) => server.close(resolve));
});

test('student must be inside a zone and threshold demand selects the nearest buggy with a free seat', async () => {
  const outside = await fetch(`${baseUrl}/api/demand-zones/${zoneId}/nudge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 19.14, lng: 72.92, deviceId: 'outside-device-123456' })
  });
  assert.equal(outside.status, 403);
  assert.equal(savedNudge, undefined);

  const inside = await fetch(`${baseUrl}/api/demand-zones/${zoneId}/nudge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 19.1301, lng: 72.9101, deviceId: 'inside-device-1234567' })
  });
  assert.equal(inside.status, 200);
  const data = await inside.json();
  assert.equal(data.zone.demandCount, 3);
  assert.equal(data.zone.thresholdReached, true);
  assert.equal(data.zone.assignedBuggyLabel, 'BUGGY-NEAR');
  assert.notEqual(savedNudge.filter.deviceHash, 'inside-device-1234567');
  assert.deepEqual(Object.keys(savedNudge.update.$set), ['expiresAt']);
  assert.equal(events.at(-1).name, 'demand:updated');
});
