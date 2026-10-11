import { ACTIVITIES } from './labels';
import type { PlaceType } from './types';

/*
 * One white glyph per activity, drawn inside a 30×30 circle (the head of a
 * map pin or a legend/list badge), so activities differ by shape as well as
 * colour.
 */
const GLYPHS: Record<PlaceType, string> = {
  crag: '<circle cx="15" cy="15" r="5.5" fill="#fff"/>',
  multipitch: '<path d="M10 16.5l5-5 5 5M10 21l5-5 5 5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  alpine: '<path d="M8.5 20 15 9l6.5 11z" fill="#fff"/>',
  ice: '<path d="M15 8.5 21 15l-6 6.5L9 15z" fill="#fff"/>',
  ski: '<path d="M11.5 21 16 9M15.5 21.5 20 9.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
};

const PIN_PATH = 'M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0z';

export const pinSvg = (type: PlaceType) =>
  `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="${PIN_PATH}" fill="${ACTIVITIES[type].color}" stroke="#fff" stroke-width="1.5"/>${GLYPHS[type]}</svg>`;

export const plainPinSvg = (color: string) =>
  `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="${PIN_PATH}" fill="${color}" stroke="#fff" stroke-width="1.5"/><circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>`;

export const badgeSvg = (type: PlaceType) =>
  `<svg viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="15" cy="15" r="15" fill="${ACTIVITIES[type].color}"/>${GLYPHS[type]}</svg>`;
