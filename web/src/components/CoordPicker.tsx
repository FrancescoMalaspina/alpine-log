import { useState } from 'react';
import { parseCoordinates, type LatLng } from '../lib/coords';
import { isTouchLayout } from '../lib/labels';

type Props = {
  onPreview: (at: LatLng | null) => void;
  onNext: (at: LatLng) => void;
  onClose: () => void;
};

export function CoordPicker({ onPreview, onNext, onClose }: Props) {
  const [text, setText] = useState('');
  const at = parseCoordinates(text);

  return (
    <div className="coord-picker show">
      <div className="coord-picker-head">
        <span>Place a pin</span>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <input
        className="mono"
        autoFocus={!isTouchLayout()}
        spellCheck={false}
        value={text}
        placeholder={'46.076245, 9.435389 or 46°04\'34.5"N 9°26\'07.4"E'}
        onChange={e => {
          setText(e.target.value);
          onPreview(parseCoordinates(e.target.value));
        }}
        onKeyDown={e => { if (e.key === 'Enter' && at) onNext(at); }}
      />
      <div className="coord-picker-hint">
        {!at && text.trim() && (
          "Couldn't read that as one coordinate — mixing decimal degrees with minutes/seconds is ambiguous. "
          + 'Use either decimal (46.076245, 9.435389) or DMS (46°04\'34.5"N 9°26\'07.4"E), not both.'
        )}
      </div>
      <button className="btn btn-add" type="button" disabled={!at} onClick={() => at && onNext(at)}>
        Add details
      </button>
    </div>
  );
}
