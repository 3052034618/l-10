import {
  PaceAnalysis,
  PaceSegment,
  PowerAnalysis,
  RunningTrainingData,
  CyclingTrainingData,
  TrainingRecord,
  PowerSample,
  PeakPowerPoint
} from '../types';
import { dataStore } from '../store';
import { calculateAverage, calculateStandardDeviation, percentile, calculateDistance } from '../utils';

export class PerformanceAnalyzer {
  analyzePace(data: RunningTrainingData): PaceAnalysis {
    if (!data.distance || data.distance <= 0) {
      return {
        avgPace: 0,
        bestPace: 0,
        paceSegments: [],
        paceVariation: 0
      };
    }

    const avgPace = data.duration / (data.distance / 1000);

    const segmentCount = Math.min(10, Math.max(1, Math.floor(data.distance / 1000)));
    const distancePerSegment = data.distance / segmentCount;
    const paceSegments: PaceSegment[] = [];

    if (data.locationSamples && data.locationSamples.length > 1) {
      const sortedSamples = [...data.locationSamples].sort((a, b) => a.timestamp - b.timestamp);
      let currentDistance = 0;
      let segmentStartIdx = 0;

      for (let i = 0; i < sortedSamples.length - 1; i++) {
        const d = calculateDistance(
          sortedSamples[i].latitude,
          sortedSamples[i].longitude,
          sortedSamples[i + 1].latitude,
          sortedSamples[i + 1].longitude
        );
        currentDistance += d;

        const targetDistance = (paceSegments.length + 1) * distancePerSegment;
        if (currentDistance >= targetDistance && paceSegments.length < segmentCount) {
          const segmentDuration = (sortedSamples[i].timestamp - sortedSamples[segmentStartIdx].timestamp) / 1000;
          const segmentPace = segmentDuration / (distancePerSegment / 1000);

          paceSegments.push({
            segmentIndex: paceSegments.length,
            distance: distancePerSegment,
            duration: segmentDuration,
            pace: segmentPace
          });
          segmentStartIdx = i;
        }
      }
    }

    if (paceSegments.length === 0) {
      for (let i = 0; i < segmentCount; i++) {
        paceSegments.push({
          segmentIndex: i,
          distance: distancePerSegment,
          duration: data.duration / segmentCount,
          pace: avgPace
        });
      }
    }

    const paces = paceSegments.map(s => s.pace).filter(p => p > 0);
    const bestPace = paces.length > 0 ? Math.min(...paces) : avgPace;
    const paceVariation = paces.length > 1 ? calculateStandardDeviation(paces) / calculateAverage(paces) : 0;

    return {
      avgPace: Math.round(avgPace * 10) / 10,
      bestPace: Math.round(bestPace * 10) / 10,
      paceSegments: paceSegments.map(s => ({
        ...s,
        pace: Math.round(s.pace * 10) / 10,
        duration: Math.round(s.duration * 10) / 10
      })),
      paceVariation: Math.round(paceVariation * 1000) / 1000
    };
  }

  private normalizePowerSamples(samples: PowerSample[]): PowerSample[] {
    if (samples.length === 0) return [];

    const timestampMap = new Map<number, number>();

    for (const sample of samples) {
      const ts = Math.round(sample.timestamp);
      if (!timestampMap.has(ts)) {
        timestampMap.set(ts, sample.power);
      } else {
        const existing = timestampMap.get(ts)!;
        timestampMap.set(ts, (existing + sample.power) / 2);
      }
    }

    return Array.from(timestampMap.entries())
      .map(([timestamp, power]) => ({ timestamp, power }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private removePowerSpikes(samples: PowerSample[], thresholdMultiplier: number = 3.5): PowerSample[] {
    if (samples.length < 5) return samples;

    const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
    const powerValues = sorted.map(s => s.power);
    const sortedPowers = [...powerValues].sort((a, b) => a - b);

    const median = percentile(sortedPowers, 50);
    const deviations = sortedPowers.map(p => Math.abs(p - median)).sort((a, b) => a - b);
    const mad = percentile(deviations, 50);
    
    let threshold: number;
    if (mad > median * 0.02) {
      threshold = median + thresholdMultiplier * mad * 1.4826;
    } else {
      threshold = median * 2.5;
    }

    const filtered: PowerSample[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];

      if (current.power <= threshold) {
        filtered.push(current);
      } else {
        let prevValid = 0;
        let nextValid = 0;

        for (let j = i - 1; j >= 0; j--) {
          if (sorted[j].power <= threshold) {
            prevValid = sorted[j].power;
            break;
          }
        }

        for (let j = i + 1; j < sorted.length; j++) {
          if (sorted[j].power <= threshold) {
            nextValid = sorted[j].power;
            break;
          }
        }

        if (prevValid > 0 && nextValid > 0) {
          filtered.push({
          timestamp: current.timestamp,
          power: (prevValid + nextValid) / 2
        });
        } else if (prevValid > 0) {
          filtered.push({ timestamp: current.timestamp, power: prevValid });
        } else if (nextValid > 0) {
          filtered.push({ timestamp: current.timestamp, power: nextValid });
        } else {
          filtered.push(current);
        }
      }
    }

    return filtered;
  }

  private calculateNormalizedPower(samples: PowerSample[]): number {
    if (samples.length < 10) {
      return calculateAverage(samples.map(s => s.power));
    }

    const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
    const windowSize = 30;
    const windowPowers: number[] = [];

    let windowStartIndex = 0;
    let windowSum = 0;

    for (let i = 0; i < sorted.length; i++) {
      windowSum += sorted[i].power ** 4;

      while (sorted[i].timestamp - sorted[windowStartIndex].timestamp > windowSize * 1000 && windowStartIndex < i) {
        windowSum -= sorted[windowStartIndex].power ** 4;
        windowStartIndex++;
      }

      const windowCount = i - windowStartIndex + 1;
      if (windowCount >= 15) {
        const avgFourth = windowSum / windowCount;
        windowPowers.push(Math.pow(avgFourth, 0.25));
      }
    }

    if (windowPowers.length === 0) {
      return calculateAverage(sorted.map(s => s.power));
    }

    const avgOfWindows = windowPowers.reduce((a, b) => a + b, 0) / windowPowers.length;
    return avgOfWindows;
  }

  analyzePower(data: CyclingTrainingData, ftp?: number): PowerAnalysis {
    const rawPowerSamples = data.powerSamples || [];
    const normalizedSamples = this.normalizePowerSamples(rawPowerSamples);

    if (normalizedSamples.length === 0) {
      return {
        avgPower: 0,
        maxPower: 0,
        normalizedPower: 0,
        powerDistribution: [],
        trainingStressScore: undefined,
        intensityFactor: undefined,
        variabilityIndex: undefined
      };
    }

    const filteredSamples = this.removePowerSpikes(normalizedSamples, 3.5);

    const filteredPowerValues = filteredSamples.map(s => s.power);
    const avgPower = calculateAverage(filteredPowerValues);
    const rawPowerValues = normalizedSamples.map(s => s.power);
    const maxPower = rawPowerValues.length > 0 ? Math.max(...rawPowerValues) : 0;

    const normalizedPower = this.calculateNormalizedPower(filteredSamples);

    let trainingStressScore: number | undefined;
    let intensityFactor: number | undefined;
    let variabilityIndex: number | undefined;

    if (ftp && ftp > 0) {
      intensityFactor = normalizedPower / ftp;
      const durationSeconds = this.calculateTotalDuration(filteredSamples);
      const durationHours = durationSeconds / 3600;
      trainingStressScore = Math.pow(intensityFactor, 2) * durationHours * 100;
    }

    if (avgPower > 0) {
      variabilityIndex = normalizedPower / avgPower;
    }

    const effectiveFtp = ftp || 200;
    const powerZones = [
      { range: '主动恢复', shortRange: '0-55% FTP', min: 0, max: effectiveFtp * 0.55 },
      { range: '耐力骑', shortRange: '55-75% FTP', min: effectiveFtp * 0.55, max: effectiveFtp * 0.75 },
      { range: 'Tempo', shortRange: '75-90% FTP', min: effectiveFtp * 0.75, max: effectiveFtp * 0.90 },
      { range: '阈值', shortRange: '90-105% FTP', min: effectiveFtp * 0.90, max: effectiveFtp * 1.05 },
      { range: 'VO2max', shortRange: '105-120% FTP', min: effectiveFtp * 1.05, max: effectiveFtp * 1.20 },
      { range: '无氧能力', shortRange: '120-150% FTP', min: effectiveFtp * 1.20, max: effectiveFtp * 1.50 },
      { range: '神经肌肉', shortRange: '150%+ FTP', min: effectiveFtp * 1.50, max: Infinity }
    ];

    const totalDuration = this.calculateTotalDuration(filteredSamples);
    const powerDistribution = powerZones.map(zone => {
      let duration = 0;
      if (filteredSamples.length > 1) {
        for (let i = 1; i < filteredSamples.length; i++) {
          const avgP = (filteredSamples[i].power + filteredSamples[i - 1].power) / 2;
          if (avgP >= zone.min && avgP < zone.max) {
            duration += (filteredSamples[i].timestamp - filteredSamples[i - 1].timestamp) / 1000;
          }
        }
      } else if (filteredSamples.length === 1) {
        if (filteredSamples[0].power >= zone.min && filteredSamples[0].power < zone.max) {
          duration = 60;
        }
      }
      return {
        range: zone.shortRange,
        zoneName: zone.range,
        duration: Math.round(duration),
        percentage: totalDuration > 0 ? Math.round((duration / totalDuration) * 100) : 0
      };
    });

    const peakPowerCurve = this.calculatePeakPowerCurve(normalizedSamples);

    return {
      avgPower: Math.round(avgPower),
      maxPower: Math.round(maxPower),
      normalizedPower: Math.round(normalizedPower),
      powerDistribution,
      trainingStressScore: trainingStressScore ? Math.round(trainingStressScore * 10) / 10 : undefined,
      intensityFactor: intensityFactor ? Math.round(intensityFactor * 1000) / 1000 : undefined,
      variabilityIndex: variabilityIndex ? Math.round(variabilityIndex * 1000) / 1000 : undefined,
      peakPowerCurve
    };
  }

  private calculateTotalDuration(samples: PowerSample[]): number {
    if (samples.length < 2) {
      return samples.length > 0 ? 60 : 0;
    }
    const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
    return (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / 1000;
  }

  private calculatePeakPower(samples: PowerSample[], windowSeconds: number): number {
    if (samples.length < 2) return samples.length > 0 ? samples[0].power : 0;

    const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
    const totalDuration = this.calculateTotalDuration(samples);
    
    if (totalDuration < windowSeconds) {
      const avgPower = calculateAverage(sorted.map(s => s.power));
      return avgPower;
    }

    let maxAvgPower = 0;
    const windowMs = windowSeconds * 1000;

    for (let i = 0; i < sorted.length; i++) {
      const windowEnd = sorted[i].timestamp + windowMs;
      let sumPower = 0;
      let count = 0;
      
      for (let j = i; j < sorted.length && sorted[j].timestamp < windowEnd; j++) {
        sumPower += sorted[j].power;
        count++;
      }
      
      if (count > 0) {
        const avg = sumPower / count;
        if (avg > maxAvgPower) {
          maxAvgPower = avg;
        }
      }
    }

    return maxAvgPower;
  }

  private calculatePeakPowerCurve(samples: PowerSample[], weight?: number): PeakPowerPoint[] {
    const durations = [
      { seconds: 5, label: '5秒' },
      { seconds: 30, label: '30秒' },
      { seconds: 60, label: '1分钟' },
      { seconds: 300, label: '5分钟' },
      { seconds: 1200, label: '20分钟' },
      { seconds: 3600, label: '60分钟' }
    ];

    const curve: PeakPowerPoint[] = [];
    const totalDuration = this.calculateTotalDuration(samples);

    for (const d of durations) {
      if (totalDuration >= d.seconds * 0.8) {
        const power = this.calculatePeakPower(samples, d.seconds);
        curve.push({
          duration: d.seconds,
          durationLabel: d.label,
          power: Math.round(power),
          wattsPerKg: weight ? Math.round((power / weight) * 100) / 100 : undefined
        });
      }
    }

    return curve;
  }

  analyzeRecordPace(recordId: string): PaceAnalysis | null {
    const record = dataStore.getTrainingRecord(recordId);
    if (!record || record.sportType !== 'running') return null;
    return this.analyzePace(record.data as RunningTrainingData);
  }

  analyzeRecordPower(recordId: string): PowerAnalysis | null {
    const record = dataStore.getTrainingRecord(recordId);
    if (!record || record.sportType !== 'cycling') return null;

    const user = dataStore.getUserProfile(record.userId);
    return this.analyzePower(record.data as CyclingTrainingData, user?.ftp);
  }
}

export const performanceAnalyzer = new PerformanceAnalyzer();
