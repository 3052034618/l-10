import {
  AnomalyAlert,
  AnomalyType,
  TrainingRecord,
  HeartRateSample,
  PowerSample,
  UserProfile
} from '../types';
import { dataStore } from '../store';
import { calculateAverage, calculateStandardDeviation, calculateMax, calculateDistance } from '../utils';

export class AnomalyDetector {
  detect(recordId: string): AnomalyAlert[] {
    const record = dataStore.getTrainingRecord(recordId);
    if (!record) return [];

    const alerts: AnomalyAlert[] = [];
    const userProfile = dataStore.getUserProfile(record.userId);

    alerts.push(...this.detectHeartRateAnomalies(record, userProfile));
    alerts.push(...this.detectPaceAnomalies(record));
    alerts.push(...this.detectPowerAnomalies(record));
    alerts.push(...this.detectDataGaps(record));
    alerts.push(...this.detectDistanceInconsistency(record));

    return alerts.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  private detectHeartRateAnomalies(record: TrainingRecord, profile?: UserProfile): AnomalyAlert[] {
    const alerts: AnomalyAlert[] = [];
    const data = record.data;
    const hrSamples = 'heartRateSamples' in data ? data.heartRateSamples : undefined;

    if (!hrSamples || hrSamples.length < 5) return alerts;

    const maxHr = profile?.maxHeartRate || (profile?.age ? 220 - profile.age : 200);
    const restHr = profile?.restingHeartRate || 50;

    const hrValues = hrSamples.map(s => s.heartRate);
    const avgHr = calculateAverage(hrValues);
    const stdHr = calculateStandardDeviation(hrValues);

    const maxRecordedHr = calculateMax(hrValues);
    if (maxRecordedHr > maxHr * 1.1) {
      const spikeSample = hrSamples.find(s => s.heartRate === maxRecordedHr);
      alerts.push({
        type: AnomalyType.HEART_RATE_TOO_HIGH,
        severity: 'high',
        message: `心率异常偏高，最高达到 ${Math.round(maxRecordedHr)} bpm，超出最大心率 ${Math.round(maxHr)} bpm`,
        timestamp: spikeSample?.timestamp,
        value: maxRecordedHr,
        expectedRange: { min: restHr, max: maxHr },
        suggestion: '请确认心率传感器佩戴是否正确，如感觉不适请立即停止运动并咨询医生'
      });
    }

    const minHr = Math.min(...hrValues);
    if (minHr < restHr * 0.7 && minHr > 30) {
      const lowSample = hrSamples.find(s => s.heartRate === minHr);
      alerts.push({
        type: AnomalyType.HEART_RATE_TOO_LOW,
        severity: 'medium',
        message: `心率异常偏低，最低达到 ${Math.round(minHr)} bpm`,
        timestamp: lowSample?.timestamp,
        value: minHr,
        expectedRange: { min: restHr * 0.8, max: maxHr },
        suggestion: '请检查传感器是否正确佩戴，或确认是否处于休息状态'
      });
    }

    if (stdHr > avgHr * 0.4) {
      alerts.push({
        type: AnomalyType.HEART_RATE_IRREGULAR,
        severity: 'medium',
        message: `心率波动异常，标准差约 ${Math.round(stdHr)} bpm`,
        value: stdHr,
        expectedRange: { min: 0, max: avgHr * 0.3 },
        suggestion: '心率波动过大，建议检查传感器或咨询专业人士'
      });
    }

    return alerts;
  }

  private detectPaceAnomalies(record: TrainingRecord): AnomalyAlert[] {
    const alerts: AnomalyAlert[] = [];
    const data = record.data;

    if (!('paceSamples' in data) || !data.paceSamples || data.paceSamples.length < 5) {
      return alerts;
    }

    const paceValues = data.paceSamples.map(s => s.pace).filter(p => p > 0);
    if (paceValues.length < 5) return alerts;

    const avgPace = calculateAverage(paceValues);
    const stdPace = calculateStandardDeviation(paceValues);

    if (stdPace > avgPace * 0.5) {
      alerts.push({
        type: AnomalyType.PACE_ABNORMAL,
        severity: 'low',
        message: `配速波动较大，标准差约 ${Math.round(stdPace)} 秒/公里`,
        value: stdPace,
        expectedRange: { min: 0, max: avgPace * 0.3 },
        suggestion: '配速波动较大，可能影响训练效果，建议保持稳定节奏'
      });
    }

    return alerts;
  }

  private detectPowerAnomalies(record: TrainingRecord): AnomalyAlert[] {
    const alerts: AnomalyAlert[] = [];
    const data = record.data;

    if (!('powerSamples' in data) || !data.powerSamples || data.powerSamples.length < 5) {
      return alerts;
    }

    const powerSamples = data.powerSamples as PowerSample[];
    const powerValues = powerSamples.map(s => s.power);
    const avgPower = calculateAverage(powerValues);
    const maxPower = calculateMax(powerValues);

    if (maxPower > avgPower * 4) {
      const spikeSample = powerSamples.find(s => s.power === maxPower);
      alerts.push({
        type: AnomalyType.POWER_SPIKE,
        severity: 'medium',
        message: `功率异常峰值，最高达到 ${Math.round(maxPower)}W，是平均功率的 ${Math.round(maxPower / avgPower)} 倍`,
        timestamp: spikeSample?.timestamp,
        value: maxPower,
        expectedRange: { min: 0, max: avgPower * 3 },
        suggestion: '检测到功率异常峰值，可能是传感器干扰或冲刺动作，请确认数据有效性'
      });
    }

    return alerts;
  }

  private detectDataGaps(record: TrainingRecord): AnomalyAlert[] {
    const alerts: AnomalyAlert[] = [];
    const data = record.data;
    const hrSamples = 'heartRateSamples' in data ? data.heartRateSamples : undefined;

    if (!hrSamples || hrSamples.length < 2) return alerts;

    const sorted = [...hrSamples].sort((a, b) => a.timestamp - b.timestamp);
    let maxGap = 0;
    let gapStart = 0;

    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i].timestamp - sorted[i - 1].timestamp;
      if (gap > maxGap) {
        maxGap = gap;
        gapStart = sorted[i - 1].timestamp;
      }
    }

    const expectedInterval = (sorted[sorted.length - 1].timestamp - sorted[0].timestamp) / sorted.length;

    if (maxGap > expectedInterval * 5 && maxGap > 30000) {
      alerts.push({
        type: AnomalyType.DATA_GAP,
        severity: 'medium',
        message: `检测到数据断层，最长间隔约 ${Math.round(maxGap / 1000)} 秒`,
        timestamp: gapStart,
        value: maxGap / 1000,
        expectedRange: { min: 0, max: expectedInterval * 3 / 1000 },
        suggestion: '数据存在明显断层，可能影响分析准确性，请确认传感器连接是否稳定'
      });
    }

    return alerts;
  }

  private detectDistanceInconsistency(record: TrainingRecord): AnomalyAlert[] {
    const alerts: AnomalyAlert[] = [];
    const data = record.data;

    if (!('distance' in data) || !data.distance) return alerts;
    if (!('locationSamples' in data) || !data.locationSamples || data.locationSamples.length < 2) {
      return alerts;
    }

    const locationSamples = data.locationSamples;

    let calculatedDistance = 0;
    const sorted = [...locationSamples].sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 1; i < sorted.length; i++) {
      calculatedDistance += calculateDistance(
        sorted[i - 1].latitude,
        sorted[i - 1].longitude,
        sorted[i].latitude,
        sorted[i].longitude
      );
    }

    const diff = Math.abs(calculatedDistance - data.distance);
    const diffPercent = diff / data.distance;

    if (diffPercent > 0.2) {
      alerts.push({
        type: AnomalyType.INCONSISTENT_DISTANCE,
        severity: 'low',
        message: `距离数据不一致，记录距离 ${Math.round(data.distance)}m，GPS计算距离 ${Math.round(calculatedDistance)}m，差异 ${Math.round(diffPercent * 100)}%`,
        value: diffPercent * 100,
        expectedRange: { min: 0, max: 10 },
        suggestion: '距离数据存在差异，可能是GPS信号不稳定导致的'
      });
    }

    return alerts;
  }
}

export const anomalyDetector = new AnomalyDetector();
