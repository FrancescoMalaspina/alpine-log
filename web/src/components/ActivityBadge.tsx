import { badgeSvg } from '../lib/activityIcons';
import { activityLabel } from '../lib/labels';
import type { Activity } from '../lib/types';

/** The activity's map symbol, small, next to a name. */
export function ActivityBadge({ activity }: { activity: Activity }) {
  return <span className="activity-badge" title={activityLabel(activity)} dangerouslySetInnerHTML={{ __html: badgeSvg(activity) }} />;
}
