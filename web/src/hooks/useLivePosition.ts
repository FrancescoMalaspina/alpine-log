import { useCallback, useEffect, useRef, useState } from 'react';
import { geolocationError, type LatLng } from '../lib/coords';

/** Where the device is, and how sure it is of that, in metres. */
export type LivePosition = LatLng & { accuracy: number };

/**
 * The device's position, kept up to date while switched on. Nothing starts
 * until `start()`: the browser asks for permission then. The position stays
 * on this device. `onError` gets the reason when it can't be read; a refused
 * permission also switches it off.
 */
export function useLivePosition(onError: (message: string) => void) {
  const [position, setPosition] = useState<LivePosition | null>(null);
  const [on, setOn] = useState(false);
  const watch = useRef<number | null>(null);
  // Read when an error arrives, without restarting the watch when it changes.
  const reportError = useRef(onError);
  useEffect(() => { reportError.current = onError; }, [onError]);

  const stop = useCallback(() => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setOn(false);
    setPosition(null);
  }, []);

  const start = useCallback(() => {
    if (watch.current != null) return;
    setOn(true);
    // A lost signal in a valley is said once, and the watch keeps going.
    let lostSaid = false;
    watch.current = navigator.geolocation.watchPosition(
      p => {
        lostSaid = false;
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
      },
      e => {
        if (e.code === e.PERMISSION_DENIED) stop();
        else if (lostSaid) return;
        lostSaid = true;
        reportError.current(geolocationError(e).message);
      },
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { position, on, start, stop };
}
