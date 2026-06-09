export function generateId(): string {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}

export function formatPace(paceInSecondsPerKm: number): string {
  const minutes = Math.floor(paceInSecondsPerKm / 60);
  const seconds = Math.round(paceInSecondsPerKm % 60);
  return `${minutes}'${seconds.toString().padStart(2, '0')}"`;
}

export function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

export function calculateMax(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

export function calculateMin(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

export function calculateStandardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = calculateAverage(values);
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  return Math.sqrt(calculateAverage(squareDiffs));
}

export function getStartOfWeek(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

export function getEndOfWeek(timestamp: number): number {
  const start = getStartOfWeek(timestamp);
  return start + 7 * 24 * 60 * 60 * 1000 - 1;
}

export function getDayOfWeek(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export function isSameDay(ts1: number, ts2: number): boolean {
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

export function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = (p / 100) * (sortedValues.length - 1);
  const floor = Math.floor(index);
  const ceil = Math.ceil(index);
  if (floor === ceil) return sortedValues[floor];
  const weight = index - floor;
  return sortedValues[floor] * (1 - weight) + sortedValues[ceil] * weight;
}
