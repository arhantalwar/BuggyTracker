const numberFromEnv = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const CAMPUS = {
  center: [
    numberFromEnv(import.meta.env.VITE_CAMPUS_LAT, 19.1334),
    numberFromEnv(import.meta.env.VITE_CAMPUS_LNG, 72.9133)
  ],
  zoom: numberFromEnv(import.meta.env.VITE_CAMPUS_ZOOM, 16)
};

// Replace these with points from your own campus route for the live demo.
export const SIMULATION_ROUTE = [
  [19.13275, 72.91402],
  [19.13317, 72.9137],
  [19.13371, 72.91327],
  [19.13422, 72.91282],
  [19.13466, 72.91336],
  [19.13427, 72.91404],
  [19.13374, 72.91455],
  [19.13319, 72.91449]
];
