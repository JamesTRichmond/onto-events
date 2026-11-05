import { Platform } from 'react-native';

/**
 * Deep link that opens directions to a point in the platform's maps app.
 * Pure given an explicit platform, so every branch is testable.
 */
export function directionsUrl(
  lat: number,
  lng: number,
  label: string,
  platform: string = Platform.OS
): string {
  const encoded = encodeURIComponent(label);
  // encodeURIComponent leaves parentheses intact, and Android's geo: scheme
  // uses them to delimit the label — a venue like "The Complex (Rockwell)",
  // which arrives from live Ticketmaster data, would close the label early.
  const geoLabel = encoded.replace(/\(/g, '%28').replace(/\)/g, '%29');
  switch (platform) {
    case 'ios':
      return `https://maps.apple.com/?daddr=${lat},${lng}&q=${encoded}`;
    case 'android':
      return `geo:${lat},${lng}?q=${lat},${lng}(${geoLabel})`;
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
}
