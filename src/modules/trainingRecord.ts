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
      if (record.sportType === 'running' && 'distance' in record.data && record.data.distance) {
        const distance = record.data.distance;
        const distanceKm = distance / 1000;
        const time = record.duration;
        const pace = time / distanceKm;

        performances.push({
          sportType: record.sportType as any,
          distance,
          distanceKm: Math.round(distanceKm * 100) / 100,
          time,
          timeFormatted: this.formatTime(time),
          pace: Math.round(pace * 10) / 10,
          paceFormatted: this.formatPace(pace),
          date: record.startTime,
          dateFormatted: this.formatDate(record.startTime),
          recordId: record.recordId,
          label: `${distanceKm.toFixed(1)} 公里跑步`,
          value: this.formatPace(pace)
        });
      } else if (record.sportType === 'cycling' && 'distance' in record.data && record.data.distance) {
        const distance = record.data.distance;
        const distanceKm = distance / 1000;
        const time = record.duration;
        const avgSpeed = distanceKm / (time / 3600);

        let avgPower: number | undefined;
        let normalizedPower: number | undefined;
        if ('powerSamples' in record.data && record.data.powerSamples) {
          const powers = record.data.powerSamples.map(s => s.power);
          avgPower = Math.round(powers.reduce((a, b) => a + b, 0) / powers.length);
        }

        performances.push({
          sportType: record.sportType as any,
          distance,
          distanceKm: Math.round(distanceKm * 100) / 100,
          time,
          timeFormatted: this.formatTime(time),
          power: avgPower,
          avgPower,
          normalizedPower,
          date: record.startTime,
          dateFormatted: this.formatDate(record.startTime),
          recordId: record.recordId,
          label: `${distanceKm.toFixed(1)} 公里骑行`,
          value: avgPower ? `${avgPower}W 平均功率` : `${avgSpeed.toFixed(1)} km/h`
        });
      } else if (record.sportType === 'strength') {
        let totalVolume = 0;
        let totalSets = 0;
        if ('sets' in record.data && record.data.sets) {
          totalVolume = record.data.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
          totalSets = record.data.sets.length;
        }
        performances.push({
          sportType: record.sportType as any,
          time: record.duration,
          timeFormatted: this.formatTime(record.duration),
          date: record.startTime,
          dateFormatted: this.formatDate(record.startTime),
          recordId: record.recordId,
          label: `力量训练`,
          value: `${totalVolume} kg 总容量`
        });
      } else if (record.sportType === 'ball') {
        let actionCount = 0;
        if ('actions' in record.data && record.data.actions) {
          actionCount = record.data.actions.reduce((sum, a) => sum + a.count, 0);
        }
        performances.push({
          sportType: record.sportType as any,
          time: record.duration,
          timeFormatted: this.formatTime(record.duration),
          date: record.startTime,
          dateFormatted: this.formatDate(record.startTime),
          recordId: record.recordId,
          label: `球类训练`,
          value: `${actionCount} 次动作`
        });
      }
    }

    return performances.sort((a, b) => {
      if (a.pace && b.pace) return a.pace - b.pace;
      if (a.power && b.power) return b.power - a.power;
      return b.date - a.date;
    }).slice(0, limit);
  }

  private formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  private formatPace(paceInSecondsPerKm: number): string {
    const minutes = Math.floor(paceInSecondsPerKm / 60);
    const seconds = Math.round(paceInSecondsPerKm % 60);
    return `${minutes}'${seconds.toString().padStart(2, '0')}"`;
  }

  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  }
}

export const trainingRecordManager = new TrainingRecordManager();
