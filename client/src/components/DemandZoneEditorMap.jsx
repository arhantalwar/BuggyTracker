import { useEffect } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { CAMPUS } from '../config/campus.js';
import { OpenFreeMapLayer } from './BuggyMap.jsx';

function ZoneClick({ onChange }) {
  useMapEvents({
    click(event) {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    }
  });
  return null;
}

function FocusZone({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo([center.lat, center.lng], Math.max(map.getZoom(), 17));
  }, [center, map]);
  return null;
}

const zoneIcon = L.divIcon({
  className: 'demand-zone-point-wrap',
  html: '<span class="demand-zone-point">◎</span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17]
});

export default function DemandZoneEditorMap({ center, radiusMeters, onChange }) {
  return (
    <MapContainer center={CAMPUS.center} zoom={CAMPUS.zoom} className="demand-zone-editor-map" scrollWheelZoom>
      <OpenFreeMapLayer />
      <ZoneClick onChange={onChange} />
      <FocusZone center={center} />
      {center && <Circle center={[center.lat, center.lng]} radius={radiusMeters} pathOptions={{ color: '#e7a42f', fillColor: '#ffd77b', fillOpacity: 0.25, weight: 3 }} />}
      {center && <Marker position={[center.lat, center.lng]} icon={zoneIcon} />}
    </MapContainer>
  );
}
