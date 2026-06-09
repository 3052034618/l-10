import {
  HeartRateZone,
  HeartRateZoneResult,
  HeartRateAnalysis,
  HeartRateSample,
  UserProfile
} from '../types';
import { dataStore } from '../store';
import { calculateAverage, calculateMax, calculateMin } from '../utils';

const ZONE_NAMES: Record<HeartRateZone, string> = {
  [HeartRateZone.REST]: '静息',
  [HeartRateZone.WARM_UP]: '热身',
  [HeartRateZone.FAT_BURN]: '燃脂',
  [HeartRateZone.AEROBIC]: '有氧',
  [HeartRateZone.ANAEROBIC]: '无氧',
  [HeartRateZone.MAXIMUM]: '极限'
};

export class HeartRateAnalyzer {
  private calculateMaxHr(userProfile?: UserProfile): number {
    if (userProfile?.maxHeartRate) {
      return userProfile.maxHeartRate;
    }
    if (userProfile?.age) {
      return 220 - userProfile.age;
    }
    return 190;
  }

  private calculateRestHr(userProfile?: UserProfile): number {
    return userProfile?.restingHeartRate || 60;
  }

  getHeartRateZones(maxHr: number, restHr: number): { zone: HeartRateZone; name: string; minHr: number; maxHr: number }[] {
    const hrReserve = maxHr - restHr;
    return [
      { zone: HeartRateZone.REST, name: ZONE_NAMES[HeartRateZone.REST], minHr: 0, maxHr: restHr + hrReserve * 0.1 },
      { zone: HeartRateZone.WARM_UP, name: ZONE_NAMES[HeartRateZone.WARM_UP], minHr: restHr + hrReserve * 0.1, maxHr: restHr + hrReserve * 0.3 },
      { zone: HeartRateZone.FAT_BURN, name: ZONE_NAMES[HeartRateZone.FAT_BURN], minHr: restHr + hrReserve * 0.3, maxHr: restHr + hrReserve * 0.6 },
      { zone: HeartRateZone.AEROBIC, name: ZONE_NAMES[HeartRateZone.AEROBIC], minHr: restHr + hrReserve * 0.6, maxHr: restHr + hrReserve * 0.8 },
      { zone: HeartRateZone.ANAEROBIC, name: ZONE_NAMES[HeartRateZone.ANAEROBIC], minHr: restHr + hrReserve * 0.8, maxHr: restHr + hrReserve * 0.95 },
      { zone: HeartRateZone.MAXIMUM, name: ZONE_NAMES[HeartRateZone.MAXIMUM], minHr: restHr + hrReserve * 0.95, maxHr: maxHr }
    ];
  }

  private normalizeSamples(samples: HeartRateSample[]): HeartRateSample[] {
    if (samples.length === 0) return [];

    const timestampMap = new Map<number, number>();

    for (const sample of samples) {
      const ts = Math.round(sample.timestamp);
      if (!timestampMap.has(ts)) {
        timestampMap.set(ts, sample.heartRate);
      } else {
        const existing = timestampMap.get(ts)!;
        timestampMap.set(ts, (existing + sample.heartRate) / 2);
      }
    }

    const normalized = Array.from(timestampMap.entries())
      .map(([timestamp, heartRate]) => ({ timestamp, heartRate }))
      .sort((a, b) => a.timestamp - b.timestamp);

    return normalized;
  }

  private getZoneForHr(hr: number, zones: { zone: HeartRateZone; minHr: number; maxHr: number }[], isMaxZone: boolean): HeartRateZone {
    for (let i = zones.length - 1; i >= 0; i--) {
      const zone = zones[i];
      if (i === zones.length - 1) {
        if (hr >= zone.minHr) return zone.zone;
      } else {
        if (hr >= zone.minHr && hr < zone.maxHr) return zone.zone;
      }
    }
    return zones[0].zone;
  }

  calculateZones(heartRateSamples: HeartRateSample[], userId?: string): HeartRateZoneResult[] {
    const userProfile = userId ? dataStore.getUserProfile(userId) : undefined;
    const maxHr = this.calculateMaxHr(userProfile);
    const restHr = this.calculateRestHr(userProfile);
    const zones = this.getHeartRateZones(maxHr, restHr);

    const zoneDurations: Record<HeartRateZone, number> = {
      [HeartRateZone.REST]: 0,
      [HeartRateZone.WARM_UP]: 0,
      [HeartRateZone.FAT_BURN]: 0,
      [HeartRateZone.AEROBIC]: 0,
      [HeartRateZone.ANAEROBIC]: 0,
      [HeartRateZone.MAXIMUM]: 0
    };

    const samples = this.normalizeSamples(heartRateSamples);

    if (samples.length === 0) {
      return zones.map(z => ({
        ...z,
        duration: 0,
        percentage: 0
      }));
    }

    if (samples.length === 1) {
      const hr = samples[0].heartRate;
      const zone = this.getZoneForHr(hr, zones, true);
      zoneDurations[zone] = 60;
      const totalDuration = 60;

      return zones.map(z => ({
        ...z,
        duration: Math.round(zoneDurations[z.zone] * 10) / 10,
        percentage: Math.round((zoneDurations[z.zone] / totalDuration) * 1000) / 10
      }));
    }

    let totalDuration = 0;

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      const timeDiff = (curr.timestamp - prev.timestamp) / 1000;

      if (timeDiff <= 0) continue;

      totalDuration += timeDiff;

      const avgHr = (prev.heartRate + curr.heartRate) / 2;
      const zone = this.getZoneForHr(avgHr, zones, false);
      zoneDurations[zone] += timeDiff;
    }

    if (totalDuration <= 0) {
      const avgHr = calculateAverage(samples.map(s => s.heartRate));
      const zone = this.getZoneForHr(avgHr, zones, true);
      zoneDurations[zone] = 60;
      totalDuration = 60;
    }

    return zones.map(z => ({
      ...z,
      duration: Math.round(zoneDurations[z.zone] * 10) / 10,
      percentage: totalDuration > 0
        ? Math.round((zoneDurations[z.zone] / totalDuration) * 1000) / 10
        : 0
    }));
  }

  analyze(heartRateSamples: HeartRateSample[], userId?: string): HeartRateAnalysis {
    const samples = this.normalizeSamples(heartRateSamples);

    if (samples.length === 0) {
      const userProfile = userId ? dataStore.getUserProfile(userId) : undefined;
      const maxHr = this.calculateMaxHr(userProfile);
      const restHr = this.calculateRestHr(userProfile);
      const zones = this.getHeartRateZones(maxHr, restHr);
      return {
        avgHeartRate: 0,
        maxHeartRate: 0,
        minHeartRate: 0,
        zones: zones.map(z => ({ ...z, duration: 0, percentage: 0 })),
        trainingLoad: 0
      };
    }

    const hrValues = samples.map(s => s.heartRate);
    const avgHeartRate = Math.round(calculateAverage(hrValues) * 10) / 10;
    const maxHeartRate = calculateMax(hrValues);
    const minHeartRate = calculateMin(hrValues);
    const zones = this.calculateZones(samples, userId);

    let trainingLoad = 0;
    for (const zone of zones) {
      let loadFactor = 0;
      switch (zone.zone) {
        case HeartRateZone.REST: loadFactor = 0.1; break;
        case HeartRateZone.WARM_UP: loadFactor = 0.3; break;
        case HeartRateZone.FAT_BURN: loadFactor = 0.6; break;
        case HeartRateZone.AEROBIC: loadFactor = 1.0; break;
        case HeartRateZone.ANAEROBIC: loadFactor = 1.5; break;
        case HeartRateZone.MAXIMUM: loadFactor = 2.0; break;
      }
      trainingLoad += zone.duration * loadFactor;
    }

    trainingLoad = Math.round(trainingLoad / 60 * 10) / 10;

    return {
      avgHeartRate,
      maxHeartRate,
      minHeartRate,
      zones,
      trainingLoad
    };
  }

  analyzeRecord(recordId: string): HeartRateAnalysis | null {
    const record = dataStore.getTrainingRecord(recordId);
    if (!record) return null;

    const data = record.data;
    const hrSamples = 'heartRateSamples' in data ? data.heartRateSamples : [];

    if (!hrSamples || hrSamples.length === 0) {
      const userProfile = dataStore.getUserProfile(record.userId);
      const maxHr = this.calculateMaxHr(userProfile);
      const restHr = this.calculateRestHr(userProfile);
      const zones = this.getHeartRateZones(maxHr, restHr);
      return {
        avgHeartRate: 0,
        maxHeartRate: 0,
        minHeartRate: 0,
        zones: zones.map(z => ({ ...z, duration: 0, percentage: 0 })),
        trainingLoad: 0
      };
    }

    return this.analyze(hrSamples, record.userId);
  }
}

export const heartRateAnalyzer = new HeartRateAnalyzer();
