import { saveVisit } from '../../lib/api';
import { buildVisitInput, type VisitSpot, type VisitValues } from './visitForm';

/** Saves a visit at a spot. */
export const saveVisitAt = (spot: VisitSpot, values: VisitValues, visitId?: number) =>
  saveVisit(buildVisitInput(values, spot, visitId));
