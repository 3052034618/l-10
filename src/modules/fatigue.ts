import {
  MotionAnalysis,
  MotionCount,
  FatigueScore,
  FatigueLevel,
  StrengthTrainingData,
  BallTrainingData,
  TrainingRecord,
  BallAnalysis,
  BallActionDetail,
  HighIntensitySegment,
  HeartRateSample
} from '../types';
import { dataStore } from '../store';
import { calculateAverage } from '../utils';

export class MotionAnalyzer {
  analyzeStrength(data: StrengthTrainingData): MotionAnalysis {
    const exercises: MotionCount[] = [];
    const exerciseMap = new Map<string, { count: number; volume: number; qualitySum: number; qualityCount: number }>();

    for (const set of data.sets) {
      const existing = exerciseMap.get(set.exerciseName) || { count: 0, volume: 0, qualitySum: 0, qualityCount: 0 };
      existing.count += set.reps;
      existing.volume += set.weight * set.reps;
      exerciseMap.set(set.exerciseName, existing);
    }

    let totalVolume = 0;
    let totalReps = 0;

    for (const [name, info] of exerciseMap) {
      const quality = info.qualityCount > 0 ? info.qualitySum / info.qualityCount : undefined;
      exercises.push({
        exerciseName: name,
        count: info.count,
        quality: quality ? Math.round(quality * 10) / 10 : undefined
      });
      totalVolume += info.volume;
      totalReps += info.count;
    }

    let avgRestTime: number | undefined;
    if (data.sets.length > 1) {
      const restTimes: number[] = [];
      for (let i = 0; i < data.sets.length - 1; i++) {
        if (data.sets[i].restTime) {
          restTimes.push(data.sets[i].restTime!);
        }
      }
      if (restTimes.length > 0) {
        avgRestTime = Math.round(calculateAverage(restTimes));
      }
    }

    return {
      totalReps,
      exercises,
      avgRestTime,
      totalVolume: totalVolume > 0 ? Math.round(totalVolume) : data.totalVolume
    };
  }

  analyzeMotion(samples: { timestamp: number; accelerationX: number; accelerationY: number; accelerationZ: number }[], exerciseType: string = 'general'): { count: number; quality?: number } {
    if (samples.length < 2) return { count: 0 };

    const magnitudes: number[] = [];
    for (const sample of samples) {
      const mag = Math.sqrt(
        sample.accelerationX ** 2 +
        sample.accelerationY ** 2 +
        sample.accelerationZ ** 2
      );
      magnitudes.push(mag);
    }

    const avgMag = calculateAverage(magnitudes);
    const threshold = avgMag * 1.3;

    let repCount = 0;
    let aboveThreshold = false;
    let qualityPeaks: number[] = [];
    let currentPeak = 0;

    for (const mag of magnitudes) {
      if (mag > threshold && !aboveThreshold) {
        aboveThreshold = true;
        currentPeak = mag;
      } else if (mag > threshold && aboveThreshold) {
        currentPeak = Math.max(currentPeak, mag);
      } else if (mag <= threshold && aboveThreshold) {
        aboveThreshold = false;
        repCount++;
        qualityPeaks.push(currentPeak);
      }
    }

    let quality: number | undefined;
    if (qualityPeaks.length > 0) {
      const avgPeak = calculateAverage(qualityPeaks);
      const peakVariance = qualityPeaks.filter(p => Math.abs(p - avgPeak) < avgPeak * 0.2).length / qualityPeaks.length;
      quality = Math.round(peakVariance * 100);
    }

    return { count: repCount, quality };
  }

  analyzeBall(data: BallTrainingData, userId?: string): BallAnalysis {
    const actionDetails: BallActionDetail[] = [];
    let totalActions = 0;
    let totalSuccessful = 0;
    let totalAttempts = 0;

    if (data.actions && data.actions.length > 0) {
      for (const action of data.actions) {
        const successCount = action.successCount !== undefined ? action.successCount : Math.round(action.count * (action.successRate || 0.8));
        const attempts = action.totalAttempts !== undefined ? action.totalAttempts : action.count;
        const successRate = action.successRate !== undefined ? action.successRate : (attempts > 0 ? successCount / attempts : 0);

        actionDetails.push({
          actionType: action.actionType,
          count: action.count,
          successCount,
          successRate: Math.round(successRate * 100) / 100,
          totalAttempts: attempts
        });

        totalActions += action.count;
        totalSuccessful += successCount;
        totalAttempts += attempts;
      }
    }

    const overallSuccessRate = totalAttempts > 0 ? totalSuccessful / totalAttempts : 0;

    const highIntensitySegments = this.detectHighIntensitySegments(
      data.heartRateSamples || [],
      data.duration,
      userId
    );

    const highIntensityDuration = highIntensitySegments.reduce((sum, s) => sum + s.duration, 0);
    const highIntensityPercentage = data.duration > 0 ? (highIntensityDuration / data.duration) * 100 : 0;

    return {
      totalActions,
      totalSuccessful,
      overallSuccessRate: Math.round(overallSuccessRate * 100) / 100,
      actions: actionDetails,
      highIntensitySegments,
      highIntensityDuration: Math.round(highIntensityDuration),
      highIntensityPercentage: Math.round(highIntensityPercentage * 10) / 10,
      sprintCount: data.sprintCount,
      totalDistance: data.distance
    };
  }

  private detectHighIntensitySegments(
    hrSamples: HeartRateSample[],
    totalDuration: number,
    userId?: string
  ): HighIntensitySegment[] {
    const segments: HighIntensitySegment[] = [];

    if (hrSamples.length < 5) {
      return segments;
    }

    const user = userId ? dataStore.getUserProfile(userId) : undefined;
    const maxHr = user?.maxHeartRate || (user?.age ? 220 - user.age : 190);
    const highIntensityThreshold = maxHr * 0.85;

    const sortedSamples = [...hrSamples].sort((a, b) => a.timestamp - b.timestamp);

    let inHighIntensity = false;
    let segmentStart = 0;
    let segmentHrValues: number[] = [];
    let segmentMaxHr = 0;
    let segmentIndex = 0;

    for (let i = 0; i < sortedSamples.length; i++) {
      const sample = sortedSamples[i];
      const hr = sample.heartRate;

      if (hr >= highIntensityThreshold) {
        if (!inHighIntensity) {
          inHighIntensity = true;
          segmentStart = sample.timestamp;
          segmentHrValues = [hr];
          segmentMaxHr = hr;
        } else {
          segmentHrValues.push(hr);
          segmentMaxHr = Math.max(segmentMaxHr, hr);
        }
      } else {
        if (inHighIntensity) {
          const segmentDuration = (sample.timestamp - segmentStart) / 1000;
          if (segmentDuration >= 30) {
            const avgHr = calculateAverage(segmentHrValues);
            const intensityIndex = Math.min(100, Math.round((avgHr / maxHr) * 100 * 10) / 10);
            segments.push({
              segmentIndex,
              startTime: segmentStart,
              endTime: sample.timestamp,
              duration: Math.round(segmentDuration),
              avgHeartRate: Math.round(avgHr),
              maxHeartRate: segmentMaxHr,
              intensityIndex
            });
            segmentIndex++;
          }
          inHighIntensity = false;
        }
      }
    }

    if (inHighIntensity && segmentHrValues.length > 0) {
      const lastSample = sortedSamples[sortedSamples.length - 1];
      const segmentDuration = (lastSample.timestamp - segmentStart) / 1000;
      if (segmentDuration >= 30) {
        const avgHr = calculateAverage(segmentHrValues);
        const intensityIndex = Math.min(100, Math.round((avgHr / maxHr) * 100 * 10) / 10);
        segments.push({
          segmentIndex,
          startTime: segmentStart,
          endTime: lastSample.timestamp,
          duration: Math.round(segmentDuration),
          avgHeartRate: Math.round(avgHr),
          maxHeartRate: segmentMaxHr,
          intensityIndex
        });
      }
    }

    return segments;
  }

  analyzeRecord(recordId: string): MotionAnalysis | BallAnalysis | null {
    const record = dataStore.getTrainingRecord(recordId);
    if (!record) return null;

    if (record.sportType === 'strength') {
      return this.analyzeStrength(record.data as StrengthTrainingData);
    }

    if (record.sportType === 'ball') {
      return this.analyzeBall(record.data as BallTrainingData, record.userId);
    }

    return {
      totalReps: 0,
      exercises: []
    };
  }
}

export const motionAnalyzer = new MotionAnalyzer();

export class FatigueScorer {
  private getLevel(score: number): FatigueLevel {
    if (score < 20) return FatigueLevel.NONE;
    if (score < 40) return FatigueLevel.MILD;
    if (score < 60) return FatigueLevel.MODERATE;
    if (score < 80) return FatigueLevel.HIGH;
    return FatigueLevel.EXTREME;
  }

  calculate(recordId: string): FatigueScore | null {
    const record = dataStore.getTrainingRecord(recordId);
    if (!record) return null;

    const data = record.data;
    const factors: { factor: string; weight: number; value: number; description: string }[] = [];

    const durationFactor = Math.min(100, (data.duration / 3600) * 30);
    factors.push({
      factor: '训练时长',
      weight: 0.25,
      value: Math.round(durationFactor),
      description: `训练时长 ${Math.round(data.duration / 60)} 分钟`
    });

    let hrFactor = 0;
    const hrSamples = 'heartRateSamples' in data ? data.heartRateSamples : undefined;
    if (hrSamples && hrSamples.length > 0) {
      const avgHr = calculateAverage(hrSamples.map(s => s.heartRate));
      const user = dataStore.getUserProfile(record.userId);
      const maxHr = user?.maxHeartRate || (user?.age ? 220 - user.age : 190);
      hrFactor = Math.min(100, (avgHr / maxHr) * 100);
    }
    factors.push({
      factor: '心率强度',
      weight: 0.3,
      value: Math.round(hrFactor),
      description: hrFactor > 0 ? `平均心率强度 ${Math.round(hrFactor)}%` : '无心率数据'
    });

    let intensityFactor = 0;
    if ('distance' in data && data.distance && data.duration > 0) {
      const pace = data.duration / data.distance;
      intensityFactor = Math.min(100, Math.max(0, (420 - pace) / 2.4));
    }
    if ('powerSamples' in data && data.powerSamples && data.powerSamples.length > 0) {
      const avgPower = calculateAverage(data.powerSamples.map(s => s.power));
      const user = dataStore.getUserProfile(record.userId);
      const ftp = user?.ftp || 200;
      intensityFactor = Math.min(100, (avgPower / ftp) * 100);
    }
    factors.push({
      factor: '运动强度',
      weight: 0.25,
      value: Math.round(intensityFactor),
      description: `运动强度指数 ${Math.round(intensityFactor)}`
    });

    let volumeFactor = 0;
    if ('sets' in data && data.sets) {
      const totalVolume = data.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
      volumeFactor = Math.min(100, totalVolume / 100);
    }
    if ('distance' in data && data.distance) {
      volumeFactor = Math.min(100, data.distance / 100);
    }
    factors.push({
      factor: '训练容量',
      weight: 0.2,
      value: Math.round(volumeFactor),
      description: `训练容量指数 ${Math.round(volumeFactor)}`
    });

    let totalScore = 0;
    for (const f of factors) {
      totalScore += f.value * f.weight;
    }
    totalScore = Math.round(totalScore);

    const level = this.getLevel(totalScore);
    const recoveryAdvice = this.generateRecoveryAdvice(totalScore, level);
    const estimatedRecoveryTime = this.estimateRecoveryTime(totalScore);

    return {
      score: totalScore,
      level,
      factors,
      recoveryAdvice,
      estimatedRecoveryTime
    };
  }

  private generateRecoveryAdvice(score: number, level: FatigueLevel): string[] {
    const advice: string[] = [];

    switch (level) {
      case FatigueLevel.NONE:
        advice.push('身体状态良好，可正常安排训练');
        advice.push('保持充足睡眠，维持7-8小时');
        break;
      case FatigueLevel.MILD:
        advice.push('轻度疲劳，建议适当减少训练强度');
        advice.push('训练后进行10-15分钟拉伸放松');
        advice.push('保证蛋白质摄入，促进肌肉修复');
        break;
      case FatigueLevel.MODERATE:
        advice.push('中度疲劳，建议安排低强度恢复训练');
        advice.push('增加休息时间，训练间隔不少于48小时');
        advice.push('注意补水和电解质补充');
        advice.push('可进行按摩或泡沫轴放松');
        break;
      case FatigueLevel.HIGH:
        advice.push('高度疲劳，建议休息1-2天');
        advice.push('仅进行轻度活动如散步、瑜伽');
        advice.push('保证充足睡眠和营养摄入');
        advice.push('注意监测身体恢复状况');
        break;
      case FatigueLevel.EXTREME:
        advice.push('极度疲劳，必须充分休息');
        advice.push('建议休息3-5天，避免任何高强度运动');
        advice.push('如持续不适请咨询专业医生');
        advice.push('补充足够的碳水化合物和蛋白质');
        break;
    }

    return advice;
  }

  private estimateRecoveryTime(score: number): number {
    if (score < 20) return 6 * 3600;
    if (score < 40) return 24 * 3600;
    if (score < 60) return 48 * 3600;
    if (score < 80) return 72 * 3600;
    return 120 * 3600;
  }
}

export const fatigueScorer = new FatigueScorer();
