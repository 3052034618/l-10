import {
  PaceAnalysis,
  PaceSegment,
  PowerAnalysis,
  RunningTrainingData,
  CyclingTrainingData,
  TrainingRecord
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

  analyzePower(data: CyclingTrainingData, ftp?: number): PowerAnalysis {
    const powerSamples = data.powerSamples || [];
    const powerValues = powerSamples.map(s => s.power);

    const avgPower = powerValues.length > 0 ? calculateAverage(powerValues) : 0;
    const maxPower = powerValues.length > 0 ? Math.max(...powerValues) : 0;

    let normalizedPower = avgPower;
    let trainingStressScore: number | undefined;
    let intensityFactor: number | undefined;
    let variabilityIndex: number | undefined;

    if (powerSamples.length > 1) {
      const sorted = [...powerValues].sort((a, b) => a - b);
      normalizedPower = percentile(sorted, 75) * 0.95 + percentile(sorted, 95) * 0.05;
    }

    if (ftp && ftp > 0) {
      intensityFactor = normalizedPower / ftp;
      const durationHours = data.duration / 3600;
      trainingStressScore = (durationHours * normalizedPower * intensityFactor) / (ftp * 36) * 100;
    }

    if (avgPower > 0) {
      variabilityIndex = normalizedPower / avgPower;
    }

    const powerRanges = [
      { range: '0-50% FTP', min: 0, max: (ftp || 200) * 0.5 },
      { range: '50-75% FTP', min: (ftp || 200) * 0.5, max: (ftp || 200) * 0.75 },
      { range: '75-90% FTP', min: (ftp || 200) * 0.75, max: (ftp || 200) * 0.9 },
      { range: '90-105% FTP', min: (ftp || 200) * 0.9, max: (ftp || 200) * 1.05 },
      { range: '105-120% FTP', min: (ftp || 200) * 1.05, max: (ftp || 200) * 1.2 },
      { range: '120%+ FTP', min: (ftp || 200) * 1.2, max: Infinity }
    ];

    const powerDistribution = powerRanges.map(range => {
      let duration = 0;
      if (powerSamples.length > 1) {
        const sorted = [...powerSamples].sort((a, b) => a.timestamp - b.timestamp);
        for (let i = 1; i < sorted.length; i++) {
          const avgP = (sorted[i].power + sorted[i - 1].power) / 2;
          if (avgP >= range.min && avgP < range.max) {
            duration += (sorted[i].timestamp - sorted[i - 1].timestamp) / 1000;
          }
        }
      }
      return {
        range: range.range,
        duration: Math.round(duration),
        percentage: data.duration > 0 ? Math.round((duration / data.duration) * 100) : 0
      };
    });

    return {
      avgPower: Math.round(avgPower),
      maxPower: Math.round(maxPower),
      normalizedPower: Math.round(normalizedPower),
      powerDistribution,
      trainingStressScore: trainingStressScore ? Math.round(trainingStressScore * 10) / 10 : undefined,
      intensityFactor: intensityFactor ? Math.round(intensityFactor * 1000) / 1000 : undefined,
      variabilityIndex: variabilityIndex ? Math.round(variabilityIndex * 1000) / 1000 : undefined
    };
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
