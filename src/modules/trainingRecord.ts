import {
  TrainingRecordInput,
  TrainingRecord,
  SegmentPerformance,
  BestPerformance
} from '../types';
import { dataStore } from '../store';
import { generateId } from '../utils';

export class TrainingRecordManager {
  createRecord(input: TrainingRecordInput): TrainingRecord {
    return dataStore.addTrainingRecord(input);
  }

  getRecord(recordId: string): TrainingRecord | undefined {
    return dataStore.getTrainingRecord(recordId);
  }

  updateRecord(recordId: string, updates: Partial<TrainingRecord>): TrainingRecord | undefined {
    return dataStore.updateTrainingRecord(recordId, updates);
  }

  deleteRecord(recordId: string): boolean {
    return dataStore.deleteTrainingRecord(recordId);
  }

  getUserRecords(userId: string, options?: { sportType?: string; startDate?: number; endDate?: number }): TrainingRecord[] {
    return dataStore.getTrainingRecordsByUser(userId, options);
  }

  getSegmentPerformance(recordId: string, segmentCount: number = 5): SegmentPerformance[] {
    const record = dataStore.getTrainingRecord(recordId);
    if (!record) return [];

    const segments: SegmentPerformance[] = [];
    const totalDuration = record.duration;
    const segmentDuration = totalDuration / segmentCount;

    const hrSamples = 'heartRateSamples' in record.data ? record.data.heartRateSamples : undefined;

    for (let i = 0; i < segmentCount; i++) {
      const segmentStart = i * segmentDuration;
      const segmentEnd = (i + 1) * segmentDuration;

      let avgHeartRate: number | undefined;
      if (hrSamples && hrSamples.length > 0) {
        const startTimeMs = record.startTime + segmentStart * 1000;
        const endTimeMs = record.startTime + segmentEnd * 1000;
        const segmentHr = hrSamples.filter(s => s.timestamp >= startTimeMs && s.timestamp <= endTimeMs);
        if (segmentHr.length > 0) {
          avgHeartRate = segmentHr.reduce((sum, s) => sum + s.heartRate, 0) / segmentHr.length;
        }
      }

      let pace: number | undefined;
      let distance: number | undefined;
      if ('distance' in record.data && record.data.distance) {
        distance = record.data.distance / segmentCount;
        pace = segmentDuration / distance * 1000;
      }

      let power: number | undefined;
      if ('powerSamples' in record.data && record.data.powerSamples) {
        const startTimeMs = record.startTime + segmentStart * 1000;
        const endTimeMs = record.startTime + segmentEnd * 1000;
        const segmentPower = record.data.powerSamples.filter(s => s.timestamp >= startTimeMs && s.timestamp <= endTimeMs);
        if (segmentPower.length > 0) {
          power = segmentPower.reduce((sum, s) => sum + s.power, 0) / segmentPower.length;
        }
      }

      let performanceIndex = 50;
      if (avgHeartRate) {
        performanceIndex = Math.min(100, Math.max(0, (avgHeartRate - 60) / 1.4));
      }
      if (pace) {
        const paceScore = Math.min(100, Math.max(0, 100 - (pace - 240) / 6));
        performanceIndex = (performanceIndex + paceScore) / 2;
      }
      if (power) {
        const powerScore = Math.min(100, Math.max(0, power / 3));
        performanceIndex = (performanceIndex + powerScore) / 2;
      }

      segments.push({
        segmentIndex: i,
        distance,
        duration: segmentDuration,
        avgHeartRate,
        pace,
        power,
        performanceIndex: Math.round(performanceIndex * 10) / 10
      });
    }

    return segments;
  }

  getBestPerformances(userId: string, sportType?: string, limit: number = 10): BestPerformance[] {
    const records = dataStore.getTrainingRecordsByUser(userId, { sportType });
    const performances: BestPerformance[] = [];

    for (const record of records) {
      if ('distance' in record.data && record.data.distance) {
        const distance = record.data.distance;
        const pace = record.duration / (distance / 1000);
        performances.push({
          distance,
          time: record.duration,
          pace,
          date: record.startTime,
          recordId: record.recordId
        });
      }
    }

    return performances.sort((a, b) => (a.pace || 0) - (b.pace || 0)).slice(0, limit);
  }
}

export const trainingRecordManager = new TrainingRecordManager();
