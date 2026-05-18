// City filter configuration for Triad (GSO, HPT, WS) and RTP (DUR, RAL, CHH) areas

export interface CityConfig {
  id: string;
  abbr: string;
  label: string;
  color: string;
  defaultEnabled: boolean;
}

export const CITIES: CityConfig[] = [
  { id: 'Greensboro',     abbr: 'GSO', label: 'GSO · Greensboro',    color: '#87d8e3', defaultEnabled: true  },
  { id: 'High Point',    abbr: 'HPT', label: 'HPT · High Point',    color: '#f0a05a', defaultEnabled: false },
  { id: 'Winston-Salem', abbr: 'WS',  label: 'WS · Winston-Salem',  color: '#7ec87e', defaultEnabled: false },
  { id: 'Durham',        abbr: 'DUR', label: 'DUR · Durham',        color: '#e07070', defaultEnabled: false },
  { id: 'Raleigh',       abbr: 'RAL', label: 'RAL · Raleigh',       color: '#c09ee0', defaultEnabled: false },
  { id: 'Chapel Hill',   abbr: 'CHH', label: 'CHH · Chapel Hill',   color: '#7acfcf', defaultEnabled: false },
];

export const CITY_COLOR_MAP: Record<string, string> = Object.fromEntries(
  CITIES.map(c => [c.id, c.color])
);

export function citySafeId(cityId: string): string {
  return 'city' + cityId.replace(/[^a-zA-Z0-9]/g, '');
}
