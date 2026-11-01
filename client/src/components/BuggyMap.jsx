import { useEffect } from 'react';
import L from 'leaflet';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Circle, MapContainer, Marker, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import { CAMPUS } from '../config/campus.js';
import SignalPill from './SignalPill.jsx';

setWorkerUrl(workerUrl);

const MAP_ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

export function OpenFreeMapLayer() {
  const map = useMap();
  useEffect(() => {
    const layer = maplibreGL({
      style: 'https://tiles.openfreemap.org/styles/liberty',
      attribution: MAP_ATTRIBUTION
    }).addTo(map);
    map.attributionControl.addAttribution(MAP_ATTRIBUTION);
    return () => {
      map.attributionControl.removeAttribution(MAP_ATTRIBUTION);
      map.removeLayer(layer);
    };
  }, [map]);
  return null;
}

function FocusBuggy({ buggy }) {
  const map = useMap();
  const id = buggy?.id;
  const lat = buggy?.location?.lat;
  const lng = buggy?.location?.lng;
  useEffect(() => {
    if (id && lat != null && lng != null) map.flyTo([lat, lng], Math.max(map.getZoom(), 17));
  }, [id, lat, lng, map]);
  return null;
}

function markerIcon(status, selected) {
  return L.divIcon({
    className: 'buggy-marker-wrap',
    html: `<div class="buggy-marker marker-${status}${selected ? ' marker-selected' : ''}" aria-label="Buggy marker"><span>●</span></div>`,
    iconSize: [46, 46],
    iconAnchor: [23, 38],
    popupAnchor: [0, -35]
  });
}

function directionText(buggy, routes) {
  const route = routes.find((item) => item.id === buggy?.routeId);
  if (!route || !buggy || buggy.direction === 'unknown') return null;
  return `Towards ${buggy.direction === 'reverse' ? route.startLabel : route.endLabel}`;
}

export default function BuggyMap({ buggies, selectedBuggy, routes = [], demandZones = [], onSelectBuggy }) {
  const selectedRouteId = selectedBuggy?.routeId;
  const hasSelectedRoute = Boolean(selectedRouteId && routes.some((route) => route.id === selectedRouteId));
  const displayRoutes = hasSelectedRoute
    ? [...routes].sort((a, b) => Number(a.id === selectedRouteId) - Number(b.id === selectedRouteId))
    : routes;
  return (
    <MapContainer center={CAMPUS.center} zoom={CAMPUS.zoom} className="map" scrollWheelZoom>
      <OpenFreeMapLayer />
      {demandZones.map((zone) => (
        <Circle
          key={zone.id}
          center={[zone.center.lat, zone.center.lng]}
          radius={zone.radiusMeters}
          pathOptions={{
            color: zone.thresholdReached ? '#df554e' : '#e7a42f',
            fillColor: zone.thresholdReached ? '#ff8b83' : '#ffd77b',
            fillOpacity: zone.thresholdReached ? 0.24 : 0.13,
            weight: zone.thresholdReached ? 4 : 2
          }}
        >
          <Tooltip sticky>{zone.name} · {zone.demandCount}/{zone.threshold} pickup requests</Tooltip>
        </Circle>
      ))}
      {displayRoutes.map((route) => (
        <Polyline
          key={route.id}
          positions={route.waypoints.map((point) => [point.lat, point.lng])}
          pathOptions={{
            color: route.color,
            weight: hasSelectedRoute && route.id === selectedRouteId ? 10 : hasSelectedRoute ? 3 : 5,
            opacity: hasSelectedRoute && route.id === selectedRouteId ? 1 : hasSelectedRoute ? 0.2 : 0.72
          }}
        >
          <Tooltip sticky>
            {route.name}{route.id === selectedRouteId && directionText(selectedBuggy, routes) ? ` · ${directionText(selectedBuggy, routes)}` : ''}
          </Tooltip>
        </Polyline>
      ))}
      {buggies.filter((buggy) => buggy.location).map((buggy) => (
        <Marker
          key={buggy.id}
          position={[buggy.location.lat, buggy.location.lng]}
          icon={markerIcon(buggy.status, buggy.id === selectedBuggy?.id)}
          eventHandlers={{ click: () => onSelectBuggy?.(buggy.id) }}
        >
          <Popup>
            <div className="map-popup">
              <strong>{buggy.buggyId}</strong>
              <span>{buggy.driverName}</span>
              <strong className={`popup-capacity ${buggy.availableSeats === 0 ? 'full' : ''}`}>
                {buggy.availableSeats === 0 ? 'Buggy full' : `${buggy.availableSeats} passenger seat${buggy.availableSeats === 1 ? '' : 's'} available`}
              </strong>
              {buggy.routeId && <span>{routes.find((route) => route.id === buggy.routeId)?.name || 'Assigned route'}</span>}
              {directionText(buggy, routes) && <strong className="popup-direction">{directionText(buggy, routes)}</strong>}
              <SignalPill status={buggy.status} />
            </div>
          </Popup>
        </Marker>
      ))}
      <FocusBuggy buggy={selectedBuggy} />
    </MapContainer>
  );
}
