import { badgeSvg } from '../lib/activityIcons';
import { primaryType, typeLabel } from '../lib/labels';
import type { PlaceType } from '../lib/types';

/** The activity's map symbol, small, next to a name. */
export function ActivityBadge({ types }: { types: PlaceType[] }) {
  const t = primaryType(types);
  return <span className="activity-badge" title={typeLabel(t)} dangerouslySetInnerHTML={{ __html: badgeSvg(t) }} />;
}
