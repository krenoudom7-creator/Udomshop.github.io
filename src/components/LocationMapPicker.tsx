import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  APILoadingStatus,
  Map as GoogleMap,
  Pin,
  useApiLoadingStatus,
  useMapsLibrary,
  type MapCameraChangedEvent,
  type MapCameraProps,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  Camera,
  Crosshair,
  ExternalLink,
  Link2,
  Loader2,
  MapPin,
  Search,
  Trash2,
} from 'lucide-react';
import { apiUrl, safeReadJson } from '../utils/api.ts';
import { compressImageToBoundedDataUrl } from '../services/firestoreShop.ts';
import {
  buildGoogleMapsUrl,
  getGoogleMapsApiKey,
  isValidLatLng,
  parseLatLngFromTextOrUrl,
  sanitizeMapUrl,
  setRuntimeGoogleMapsApiKey,
} from '../utils/mapsConfig.ts';

export interface SelectedMapLocation {
  lat?: number;
  lng?: number;
  mapUrl?: string;
  imageUrl?: string;
  suggestedAddress?: string;
}

interface LocationMapPickerProps {
  label?: string;
  helperText?: string;
  lat?: number;
  lng?: number;
  mapUrl?: string;
  imageUrl?: string;
  onChange: (next: SelectedMapLocation) => void;
  mapHeightClass?: string;
}

const DEFAULT_CAMBODIA_CENTER = { lat: 11.5564, lng: 104.9282 };
const GMP_LIBRARIES: string[] = ['places', 'marker'];

function dispatchQuotaWarningIfNeeded(err: unknown) {
  const msg = String(err || '');
  if (
    msg.includes('OverQuotaMapError') ||
    msg.includes('QuotaExceededError') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('429')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  }
}

interface InteractiveMapCanvasProps {
  lat?: number;
  lng?: number;
  mapHeightClass: string;
  onSelectLocation: (loc: SelectedMapLocation) => void;
  onQuotaOrAuthError: () => void;
}

function InteractiveMapCanvas({
  lat,
  lng,
  mapHeightClass,
  onSelectLocation,
  onQuotaOrAuthError,
}: InteractiveMapCanvasProps) {
  const apiStatus = useApiLoadingStatus();
  const placesLib = useMapsLibrary('places');

  const initialCenter = isValidLatLng(lat, lng)
    ? { lat: lat!, lng: lng! }
    : DEFAULT_CAMBODIA_CENTER;

  const [cameraProps, setCameraProps] = useState<MapCameraProps>({
    center: initialCenter,
    zoom: isValidLatLng(lat, lng) ? 16 : 12,
  });

  const [searchInput, setSearchInput] = useState('');
  const [suggestions, setSuggestions] = useState<
    google.maps.places.AutocompleteSuggestion[]
  >([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [searchError, setSearchError] = useState('');
  const sessionTokenRef =
    useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (isValidLatLng(lat, lng)) {
      setCameraProps((prev) => ({
        center: { lat: lat!, lng: lng! },
        zoom: Math.max(prev.zoom || 12, 15),
      }));
    }
  }, [lat, lng]);

  useEffect(() => {
    if (
      apiStatus === APILoadingStatus.FAILED ||
      apiStatus === APILoadingStatus.AUTH_FAILURE
    ) {
      onQuotaOrAuthError();
    }
  }, [apiStatus, onQuotaOrAuthError]);

  useEffect(() => {
    const query = searchInput.trim();
    if (!placesLib || !query) {
      setSuggestions([]);
      setSearchingPlaces(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setSearchingPlaces(true);
        setSearchError('');
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: ['kh'],
        });
        if (!cancelled) {
          setSuggestions(res.suggestions || []);
        }
      } catch (err) {
        if (!cancelled) {
          dispatchQuotaWarningIfNeeded(err);
          setSuggestions([]);
          setSearchError('មិនអាចស្វែងរកទីតាំងបានទេ សូមចុចលើផែនទីផ្ទាល់ ឬប្រើ GPS');
        }
      } finally {
        if (!cancelled) {
          setSearchingPlaces(false);
        }
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [placesLib, searchInput]);

  const resetSearchSession = useCallback(() => {
    sessionTokenRef.current = null;
    setSuggestions([]);
  }, []);

  const handleSelectSuggestion = async (
    suggestion: google.maps.places.AutocompleteSuggestion
  ) => {
    if (!suggestion.placePrediction) return;
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location', 'viewport'],
      });
      if (place.location) {
        const pickedLat = Number(place.location.lat().toFixed(6));
        const pickedLng = Number(place.location.lng().toFixed(6));
        const suggestedAddress = [place.displayName, place.formattedAddress]
          .filter(Boolean)
          .join(', ')
          .trim();

        setCameraProps({
          center: { lat: pickedLat, lng: pickedLng },
          zoom: 16,
        });
        setSearchInput(suggestedAddress || suggestion.placePrediction.text.text);
        onSelectLocation({
          lat: pickedLat,
          lng: pickedLng,
          mapUrl: buildGoogleMapsUrl(pickedLat, pickedLng),
          suggestedAddress: suggestedAddress || undefined,
        });
      }
      resetSearchSession();
    } catch (err) {
      dispatchQuotaWarningIfNeeded(err);
      setSearchError('មិនអាចទាញព័ត៌មានទីតាំងនេះបានទេ');
    }
  };

  const handleMapClick = (ev: MapMouseEvent) => {
    const clicked = ev.detail.latLng;
    if (!clicked) return;
    const pickedLat = Number(clicked.lat.toFixed(6));
    const pickedLng = Number(clicked.lng.toFixed(6));
    onSelectLocation({
      lat: pickedLat,
      lng: pickedLng,
      mapUrl: buildGoogleMapsUrl(pickedLat, pickedLng),
    });
  };

  const handleMarkerDragEnd = (ev: google.maps.MapMouseEvent) => {
    if (!ev.latLng) return;
    const pickedLat = Number(ev.latLng.lat().toFixed(6));
    const pickedLng = Number(ev.latLng.lng().toFixed(6));
    onSelectLocation({
      lat: pickedLat,
      lng: pickedLng,
      mapUrl: buildGoogleMapsUrl(pickedLat, pickedLng),
    });
  };

  const hasPin = isValidLatLng(lat, lng);

  return (
    <div className="space-y-2">
      {/* Places API New Autocomplete Search Box */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B6559]" />
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="ស្វែងរកទីតាំង (ឧ. Aeon Mall, ទួលគោក, សៀមរាប)..."
          aria-label="ស្វែងរកទីតាំងលើផែនទី"
          className="h-10 w-full rounded-xl border border-[#E2DDD3] bg-white pl-8 pr-8 text-xs text-[#111111] placeholder:text-[#8A8478] focus:border-[#111111] focus:outline-none"
        />
        {searchingPlaces && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-[#B8860B]" />
        )}

        {suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-11 z-30 max-h-48 overflow-y-auto rounded-xl border border-[#E2DDD3] bg-white py-1 shadow-xl">
            {suggestions.map((sug, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => void handleSelectSuggestion(sug)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs text-[#111111] hover:bg-[#FAF9F6]"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B8860B]" />
                  <span className="line-clamp-2">
                    {sug.placePrediction?.text.text}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {searchError && <p className="text-[11px] text-amber-800">{searchError}</p>}

      {/* Interactive Google Map Container with explicit height */}
      <div
        className={`relative w-full overflow-hidden rounded-xl border border-[#E2DDD3] bg-[#EFECE5] ${mapHeightClass}`}
      >
        <GoogleMap
          {...cameraProps}
          mapId="DEMO_MAP_ID"
          gestureHandling="greedy"
          disableDefaultUI={false}
          streetViewControl={false}
          mapTypeControl={false}
          fullscreenControl={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          onCameraChanged={(ev: MapCameraChangedEvent) =>
            setCameraProps(ev.detail)
          }
          onClick={handleMapClick}
          style={{ width: '100%', height: '100%' }}
        >
          {hasPin && (
            <AdvancedMarker
              position={{ lat: lat!, lng: lng! }}
              draggable
              onDragEnd={handleMarkerDragEnd}
              title="ទីតាំងដែលបានជ្រើសរើស (អាចអូសផ្លាស់ទីបាន)"
            >
              <Pin
                background="#111111"
                glyphColor="#C9A227"
                borderColor="#C9A227"
                scale={1.15}
              />
            </AdvancedMarker>
          )}
        </GoogleMap>

        {!hasPin && (
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex justify-center">
            <span className="rounded-lg bg-black/75 px-3 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
              ចុចលើផែនទី ដើម្បីដាក់ Pin ទីតាំងដឹកជញ្ជូន
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function LocationMapPicker({
  label = 'ដាក់ទីតាំងលើផែនទី (Map Location - ជាជម្រើស)',
  helperText = 'ស្វែងរកទីតាំង ចុចលើផែនទី ប្រើ GPS បិទភ្ជាប់ Link ឬដាក់រូបភាពទីតាំង ដើម្បីងាយស្រួលស្វែងរក។',
  lat,
  lng,
  mapUrl,
  imageUrl,
  onChange,
  mapHeightClass = 'h-56 sm:h-60',
}: LocationMapPickerProps) {
  const [apiKey, setApiKey] = useState<string>(() => getGoogleMapsApiKey());
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkDraft, setLinkDraft] = useState(mapUrl || '');

  useEffect(() => {
    setLinkDraft(mapUrl || '');
  }, [mapUrl]);

  useEffect(() => {
    if (apiKey) return;
    let active = true;
    void fetch(apiUrl('/api/config/public'))
      .then((res) => (res.ok ? safeReadJson<{ googleMapsApiKey?: string }>(res) : null))
      .then((cfg) => {
        if (active && cfg?.googleMapsApiKey) {
          setRuntimeGoogleMapsApiKey(cfg.googleMapsApiKey);
          setApiKey(cfg.googleMapsApiKey);
        }
      })
      .catch(() => {
        // Ignore if running serverless without Node API
      });
    return () => {
      active = false;
    };
  }, [apiKey]);

  const emitWithCurrentImage = useCallback(
    (next: SelectedMapLocation) => {
      onChange({
        ...next,
        imageUrl: next.imageUrl !== undefined ? next.imageUrl : imageUrl,
      });
    },
    [onChange, imageUrl]
  );

  const handleUseGps = () => {
    setGpsError('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsError('កម្មវិធីរុករកនេះមិនគាំទ្រ GPS ទេ');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pickedLat = Number(pos.coords.latitude.toFixed(6));
        const pickedLng = Number(pos.coords.longitude.toFixed(6));
        const nextUrl = buildGoogleMapsUrl(pickedLat, pickedLng);
        emitWithCurrentImage({
          lat: pickedLat,
          lng: pickedLng,
          mapUrl: nextUrl,
        });
        setLocatingGps(false);
      },
      () => {
        setGpsError('មិនអាចទាញទីតាំង GPS បានទេ សូមអនុញ្ញាតសិទ្ធិ Location ឬជ្រើសលើផែនទី។');
        setLocatingGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleApplyLink = (rawValue: string) => {
    setLinkDraft(rawValue);
    const trimmed = rawValue.trim();
    if (!trimmed) {
      emitWithCurrentImage({ lat: undefined, lng: undefined, mapUrl: undefined });
      return;
    }
    const parsed = parseLatLngFromTextOrUrl(trimmed);
    const safeUrl = sanitizeMapUrl(trimmed);
    if (parsed) {
      emitWithCurrentImage({
        lat: parsed.lat,
        lng: parsed.lng,
        mapUrl: safeUrl || buildGoogleMapsUrl(parsed.lat, parsed.lng),
      });
    } else if (safeUrl) {
      emitWithCurrentImage({
        lat: undefined,
        lng: undefined,
        mapUrl: safeUrl,
      });
    }
  };

  const handleLocationPhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    setUploadingPhoto(true);
    try {
      const dataUrl = await compressImageToBoundedDataUrl(file, 760, 240000);
      onChange({
        lat,
        lng,
        mapUrl,
        imageUrl: dataUrl,
      });
    } catch {
      setPhotoError('មិនអាចអានរូបភាពទីតាំងនេះបានទេ សូមសាកល្បងរូបភាពផ្សេង។');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleClearPhoto = () => {
    setPhotoError('');
    onChange({
      lat,
      lng,
      mapUrl,
      imageUrl: undefined,
    });
  };

  const handleClear = () => {
    setLinkDraft('');
    setGpsError('');
    setPhotoError('');
    onChange({ lat: undefined, lng: undefined, mapUrl: undefined, imageUrl: undefined });
  };

  const hasValidCoords = isValidLatLng(lat, lng);
  const resolvedMapUrl =
    mapUrl || (hasValidCoords ? buildGoogleMapsUrl(lat!, lng!) : '');

  return (
    <div className="rounded-xl border border-[#ECE8DF] bg-[#FAF9F6] p-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#111111]">
          <MapPin className="h-3.5 w-3.5 text-[#B8860B] shrink-0" />
          <span>{label}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleUseGps}
            disabled={locatingGps}
            className="flex h-8 items-center gap-1 rounded-lg border border-[#E2DDD3] bg-white px-2.5 text-[11px] font-semibold text-[#111111] hover:border-[#111111] disabled:opacity-50"
          >
            {locatingGps ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Crosshair className="h-3 w-3 text-[#B8860B]" />
            )}
            <span>ទីតាំង GPS ខ្ញុំ</span>
          </button>

          <button
            type="button"
            onClick={() => setShowLinkInput((v) => !v)}
            className={`flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-medium transition ${
              showLinkInput
                ? 'border-[#111111] bg-[#111111] text-white'
                : 'border-[#E2DDD3] bg-white text-[#4A463E] hover:border-[#111111]'
            }`}
          >
            <Link2 className="h-3 w-3" />
            <span>ដាក់ Link Map</span>
          </button>

          <label className="flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-[#E2DDD3] bg-white px-2.5 text-[11px] font-semibold text-[#111111] hover:border-[#111111]">
            {uploadingPhoto ? (
              <Loader2 className="h-3 w-3 animate-spin text-[#B8860B]" />
            ) : (
              <Camera className="h-3 w-3 text-[#B8860B]" />
            )}
            <span>{uploadingPhoto ? 'កំពុងភ្ជាប់...' : 'ដាក់រូបភាពទីតាំង'}</span>
            <input
              type="file"
              accept="image/*"
              disabled={uploadingPhoto}
              onChange={(e) => void handleLocationPhotoChange(e)}
              className="hidden"
            />
          </label>

          {(hasValidCoords || resolvedMapUrl || imageUrl) && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="សម្អាតទីតាំងផែនទី"
              className="flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-white px-2 text-[11px] font-medium text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-3 w-3" />
              <span>លុប</span>
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-[#6B6559] leading-relaxed">{helperText}</p>

      {showLinkInput && (
        <div className="space-y-1">
          <input
            type="url"
            value={linkDraft}
            onChange={(e) => handleApplyLink(e.target.value)}
            placeholder="បិទភ្ជាប់ Link Google Maps (ឧ. https://maps.app.goo.gl/... ឬ 11.5564, 104.9282)"
            className="h-10 w-full rounded-xl border border-[#E2DDD3] bg-white px-3 text-xs text-[#111111] focus:border-[#111111] focus:outline-none"
          />
          <p className="text-[10px] text-[#8A8478]">
            គាំទ្រទាំង Link Google Maps និងលេខកូអរដោណេ (Lat, Lng)
          </p>
        </div>
      )}

      {gpsError && <p className="text-[11px] text-red-700">{gpsError}</p>}
      {photoError && <p className="text-[11px] text-red-700">{photoError}</p>}

      {apiKey && !mapLoadFailed ? (
        <APIProvider
          apiKey={apiKey}
          libraries={GMP_LIBRARIES}
          language="km"
          region="KH"
        >
          <InteractiveMapCanvas
            lat={lat}
            lng={lng}
            mapHeightClass={mapHeightClass}
            onSelectLocation={emitWithCurrentImage}
            onQuotaOrAuthError={() => setMapLoadFailed(true)}
          />
        </APIProvider>
      ) : (
        <div className="rounded-xl border border-dashed border-[#D8D1C3] bg-white p-3.5 text-[11px] text-[#6B6559] space-y-2">
          <p>
            ផែនទីអន្តរកម្មត្រូវការ Google Maps API Key ឬអ្នកអាចចុច{' '}
            <b className="text-[#111111]">«ទីតាំង GPS ខ្ញុំ»</b>{' '}
            <b className="text-[#111111]">«ដាក់ Link Map»</b> ឬ{' '}
            <b className="text-[#111111]">«ដាក់រូបភាពទីតាំង»</b> ខាងលើដើម្បីងាយស្រួលស្វែងរកទីតាំង។
          </p>
        </div>
      )}

      {imageUrl && (
        <div className="flex items-center gap-3 rounded-xl border border-[#E2DDD3] bg-white p-2.5">
          <img
            src={imageUrl}
            alt="រូបភាពទីតាំង"
            className="h-16 w-16 shrink-0 rounded-lg border border-[#ECE8DF] object-cover"
          />
          <div className="min-w-0 flex-1 space-y-0.5 text-[11px]">
            <p className="font-semibold text-[#111111]">
              រូបភាពទីតាំង (សម្រាប់ងាយស្រួលស្វែងរក)
            </p>
            <p className="text-[#6B6559]">
              បានភ្ជាប់រូបភាពទីតាំង / ផ្ទះ / ផ្លាកសញ្ញាសម្គាល់រួចរាល់
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearPhoto}
            className="flex h-8 shrink-0 items-center gap-1 rounded-lg border border-red-200 px-2.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" />
            <span>លុបរូប</span>
          </button>
        </div>
      )}

      {(hasValidCoords || resolvedMapUrl) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-950">
          <div className="flex items-center gap-1.5 min-w-0">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-700" />
            <span className="font-mono-num truncate">
              {hasValidCoords
                ? `បានជ្រើសទីតាំង៖ ${lat!.toFixed(5)}, ${lng!.toFixed(5)}`
                : 'បានភ្ជាប់ Google Maps Link រួចរាល់'}
            </span>
          </div>
          {resolvedMapUrl && (
            <a
              href={resolvedMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-emerald-800 underline shrink-0"
            >
              <span>មើលលើ Google Maps</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
