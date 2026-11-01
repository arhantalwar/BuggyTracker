import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { CAMPUS } from '../config/campus.js';
import { OpenFreeMapLayer } from './BuggyMap.jsx';

function MapClickHandler({ onAddPoint }) {
  useMapEvents({
    click(event) {
      onAddPoint({ lat: event.latlng.lat, lng: event.latlng.lng });
    }
  });
  return null;
}

function FitRoute({ points, routeId }) {
  const map = useMap();
  useEffect(() => {
    if (routeId && points.length >= 2) {
      map.fitBounds(L.latLngBounds(points.map((point) => [point.lat, point.lng])), { padding: [40, 40] });
    }
  }, [map, points, routeId]);
  return null;
}

function pointIcon(index, color) {
  return L.divIcon({
    className: 'route-point-wrap',
    html: `<span class="route-point" style="background:${color}">${index + 1}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

export default function RouteEditorMap({ points, color, routeId, onAddPoint }) {
  return (
    <MapContainer center={CAMPUS.center} zoom={CAMPUS.zoom} className="route-editor-map" scrollWheelZoom>
      <OpenFreeMapLayer />
      <MapClickHandler onAddPoint={onAddPoint} />
      <FitRoute points={points} routeId={routeId} />
      {points.length >= 2 && (
        <Polyline positions={points.map((point) => [point.lat, point.lng])} pathOptions={{ color, weight: 6, opacity: 0.82 }} />
      )}
      {points.map((point, index) => (
        <Marker key={`${point.lat}-${point.lng}-${index}`} position={[point.lat, point.lng]} icon={pointIcon(index, color)} />
      ))}
    </MapContainer>
  );
}
