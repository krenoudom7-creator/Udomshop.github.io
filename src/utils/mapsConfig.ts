declare const __GMP_RUNTIME_KEY__: string | undefined;

let runtimeApiKeyCache = '';

export function setRuntimeGoogleMapsApiKey(key?: string | null): void {
  const trimmed = typeof key === 'string' ? key.trim() : '';
  if (trimmed) {
    runtimeApiKeyCache = trimmed;
  }
}

export function getGoogleMapsApiKey(): string {
  const viteEnvKey =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    typeof import.meta.env.VITE_GOOGLE_MAPS_API_KEY === 'string'
      ? import.meta.env.VITE_GOOGLE_MAPS_API_KEY.trim()
      : '';
  const buildDefineKey =
    typeof __GMP_RUNTIME_KEY__ === 'string' ? __GMP_RUNTIME_KEY__.trim() : '';
  return runtimeApiKeyCache || viteEnvKey || buildDefineKey || '';
}

export function buildGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function buildGoogleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function parseLatLngFromTextOrUrl(
  input: string
): { lat: number; lng: number } | null {
  const raw = input.trim();
  if (!raw) return null;

  // Match patterns like "@11.5564,104.9282", "?q=11.5564,104.9282", "ll=11.5564,104.9282", or plain "11.5564, 104.9282"
  const directMatch =
    /(?:@|[?&](?:q|ll|query|center|destination)=|^|\s)(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/.exec(
      raw
    );
  if (directMatch) {
    const lat = Number(directMatch[1]);
    const lng = Number(directMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }

  // Match "!3d11.5564!4d104.9282" embedded in Google Maps share URLs
  const pbMatch = /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(raw);
  if (pbMatch) {
    const lat = Number(pbMatch[1]);
    const lng = Number(pbMatch[2]);
    if (isValidLatLng(lat, lng)) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }

  return null;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function sanitizeMapUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const trimmed = url.trim().slice(0, 400);
  if (!trimmed) return undefined;
  if (/^https?:\/\/(?:www\.)?(?:google\.com\/maps|maps\.google\.com|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}
