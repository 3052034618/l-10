import {
  WeeklyReport,
  TrainingLoadChange,
  BestPerformance,
  UserSummary,
  TeamSummary,
  TeamRankingEntry,
  CourseSummary,
  AggregationOptions,
  SportType,
  BallActionDetail,
  TrainingLoadTrend
} from '../types';
import { dataStore } from '../store';
import { getStartOfWeek, getEndOfWeek, getDayOfWeek, calculateAverage } from '../utils';
import { heartRateAnalyzer } from './heartRate';
import { fatigueScorer, motionAnalyzer } from './fatigue';
import { teamRankingGenerator } from './ranking';

export class WeeklyReportGenerator {
  generate(userId: string, referenceDate: number = Date.now()): WeeklyReport {
    const weekStart = getStartOfWeek(referenceDate);
    const weekEnd = getEndOfWeek(referenceDate);

    const records = dataStore.getTrainingRecordsByUser(userId, {
      startDate: weekStart,
      endDate: weekEnd
    });

    const prevWeekStart = weekStart - 7 * 24 * 60 * 60 * 1000;
    const prevWeekEnd = weekStart - 1;
    const prevRecords = dataStore.getTrainingRecordsByUser(userId, {
      startDate: prevWeekStart,
      endDate: prevWeekEnd
    });

    const totalTrainingDays = new Set(records.map(r => new Date(r.startTime).toDateString())).size;
    const totalDuration = records.reduce((sum, r) => sum + r.data.duration, 0);

    let totalDistance: number | undefined;
    let totalHeartRateSum = 0;
    let hrCount = 0;
    let trainingLoad = 0;

    const sportDistribution = new Map<SportType, { duration: number; count: number }>();

    for (const record of records) {
      const sport = record.sportType as SportType;
      const existing = sportDistribution.get(sport) || { duration: 0, count: 0 };
      existing.duration += record.data.duration;
      existing.count += 1;
      sportDistribution.set(sport, existing);

      if ('distance' in record.data && record.data.distance) {
        totalDistance = (totalDistance || 0) + record.data.distance;
      }

      if ('heartRateSamples' in record.data && record.data.heartRateSamples) {
        const hr = record.data.heartRateSamples;
        if (hr.length > 0) {
          totalHeartRateSum += hr.reduce((sum, s) => sum + s.heartRate, 0);
          hrCount += hr.length;
        }
      }

      const fatigue = fatigueScorer.calculate(record.recordId);
      if (fatigue) {
        trainingLoad += fatigue.score;
      }
    }

    const avgHeartRate = hrCount > 0 ? Math.round(totalHeartRateSum / hrCount) : undefined;

    let prevTrainingLoad = 0;
    for (const record of prevRecords) {
      const fatigue = fatigueScorer.calculate(record.recordId);
      if (fatigue) {
        prevTrainingLoad += fatigue.score;
      }
    }

    const loadChange = this.calculateLoadChange(trainingLoad, prevTrainingLoad);

    const bestPerformances = this.getWeeklyBestPerformances(records);
    const ballContribution = this.calculateBallContribution(records);
    const loadInsights = this.calculateLoadInsights(trainingLoad, records.length, loadChange, sportDistribution);
    const recoveryAdvice = this.generateRecoveryAdvice(trainingLoad, records.length, loadChange, sportDistribution);
    const trends = this.calculateWeeklyTrends(records, weekStart);

    const summary = this.generateSummary(totalTrainingDays, totalDuration, loadChange, sportDistribution);

    return {
      userId,
      weekStart,
      weekEnd,
      totalTrainingDays,
      totalDuration,
      totalDistance: totalDistance ? Math.round(totalDistance) : undefined,
      avgHeartRate,
      trainingLoad: Math.round(trainingLoad),
      loadChange,
      bestPerformances,
      ballContribution,
      loadInsights,
      recoveryAdvice,
      sportDistribution: Array.from(sportDistribution.entries()).map(([sportType, data]) => ({
        sportType,
        duration: Math.round(data.duration),
        count: data.count
      })),
      trends,
      summary
    };
  }

  private calculateLoadChange(currentLoad: number, previousLoad: number): TrainingLoadChange {
    let changePercentage = 0;
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    let recommendation = '';

    if (previousLoad > 0) {
      changePercentage = Math.round(((currentLoad - previousLoad) / previousLoad) * 100);
      if (changePercentage > 10) {
        trend = 'increasing';
        recommendation = '训练负荷增加较快，注意休息和恢复，避免过度训练';
      } else if (changePercentage < -10) {
        trend = 'decreasing';
        recommendation = '训练负荷有所下降，可适当增加训练强度以保持进步';
      } else {
        trend = 'stable';
        recommendation = '训练负荷稳定，保持当前节奏，持续进步';
      }
    } else if (currentLoad > 0) {
      trend = 'increasing';
      recommendation = '开始新的训练周期，循序渐进，注意身体适应';
    } else {
      recommendation = '本周暂无训练记录，建议保持规律运动';
    }

    return {
      currentLoad: Math.round(currentLoad),
      previousLoad: Math.round(previousLoad),
      changePercentage,
      trend,
      recommendation
    };
  }

  private getWeeklyBestPerformances(records: any[]): BestPerformance[] {
    const performances: BestPerformance[] = [];

    for (const record of records) {
      if (record.sportType === 'running' && 'distance' in record.data && record.data.distance) {
        const distanceKm = record.data.distance / 1000;
        const pace = record.data.duration / distanceKm;
        performances.push({
          sportType: record.sportType,
          distance: record.data.distance,
          distanceKm: Math.round(distanceKm * 100) / 100,
          time: record.data.duration,
          timeFormatted: this.formatTime(record.data.duration),
          pace: Math.round(pace * 10) / 10,
          paceFormatted: this.formatPace(pace),
          date: record.startTime,
          dateFormatted: this.formatDate(record.startTime),
          recordId: record.recordId,
          label: `${distanceKm.toFixed(1)}km 跑步`,
          value: `配速 ${this.formatPace(pace)}`
        });
      } else if (record.sportType === 'cycling' && 'distance' in record.data && record.data.distance) {
        const distanceKm = record.data.distance / 1000;
        const avgSpeed = distanceKm / (record.data.duration / 3600);
        let avgPower: number | undefined;
        if ('powerSamples' in record.data && record.data.powerSamples) {
          const powers = record.data.powerSamples.map((s: any) => s.power);
          avgPower = Math.round(powers.reduce((a: number, b: number) => a + b, 0) / powers.length);
        }
        performances.push({
          sportType: record.sportType,
          distance: record.data.distance,
          distanceKm: Math.round(distanceKm * 100) / 100,
          time: record.data.duration,
          timeFormatted: this.formatTime(record.data.duration),
          avgPower,
          date: record.startTime,
          dateFormatted: this.formatDate(record.startTime),
          recordId: record.recordId,
          label: `${distanceKm.toFixed(1)}km 骑行`,
          value: avgPower ? `平均 ${avgPower}W` : `均速 ${avgSpeed.toFixed(1)}km/h`
        });
      } else if (record.sportType === 'strength') {
        let totalVolume = 0;
        let exerciseCount = 0;
        if ('sets' in record.data && record.data.sets) {
          totalVolume = record.data.sets.reduce((sum: number, s: any) => sum + s.weight * s.reps, 0);
          const exercises = new Set(record.data.sets.map((s: any) => s.exerciseName));
          exerciseCount = exercises.size;
        }
        performances.push({
          sportType: record.sportType,
          time: record.data.duration,
          timeFormatted: this.formatTime(record.data.duration),
          date: record.startTime,
          dateFormatted: this.formatDate(record.startTime),
          recordId: record.recordId,
          label: `力量训练`,
          value: `${totalVolume}kg 容量 / ${exerciseCount}个动作`
        });
      } else if (record.sportType === 'ball') {
        let actionCount = 0;
        let highIntensityDuration = 0;
        if ('actions' in record.data && record.data.actions) {
          actionCount = record.data.actions.reduce((sum: number, a: any) => sum + a.count, 0);
        }
        performances.push({
          sportType: record.sportType,
          time: record.data.duration,
          timeFormatted: this.formatTime(record.data.duration),
          date: record.startTime,
          dateFormatted: this.formatDate(record.startTime),
          recordId: record.recordId,
          label: `球类训练`,
          value: `${actionCount} 次动作`
        });
      }
    }

    return performances
      .sort((a, b) => {
        if (a.pace && b.pace) return a.pace - b.pace;
        if (a.avgPower && b.avgPower) return b.avgPower - a.avgPower;
        return b.date - a.date;
      })
      .slice(0, 5);
  }

  private calculateBallContribution(records: any[]): WeeklyReport['ballContribution'] | undefined {
    const ballRecords = records.filter(r => r.sportType === 'ball');
    if (ballRecords.length === 0) return undefined;

    const actionMap = new Map<string, { count: number; successCount: number; totalAttempts: number }>();
    let totalActions = 0;
    let totalSuccessful = 0;
    let totalAttempts = 0;
    let highIntensityDuration = 0;
    let totalDuration = 0;

    let bestAction: { actionType: string; count: number; date: number } | undefined;

    for (const record of ballRecords) {
      totalDuration += record.data.duration;
      const analysis = motionAnalyzer.analyzeRecord(record.recordId);
      
      if (analysis && 'actions' in analysis) {
        for (const action of analysis.actions) {
          const existing = actionMap.get(action.actionType) || { count: 0, successCount: 0, totalAttempts: 0 };
          existing.count += action.count;
          existing.successCount += action.successCount;
          existing.totalAttempts += action.totalAttempts || action.count;
          actionMap.set(action.actionType, existing);

          if (!bestAction || action.count > bestAction.count) {
            bestAction = { actionType: action.actionType, count: action.count, date: record.startTime };
          }
        }
        totalActions += analysis.totalActions;
        totalSuccessful += analysis.totalSuccessful;
        totalAttempts += analysis.actions.reduce((s: number, a: BallActionDetail) => s + (a.totalAttempts || a.count), 0);
        
        if ('highIntensityDuration' in analysis) {
          highIntensityDuration += analysis.highIntensityDuration;
        }
      }
    }

    const actions = Array.from(actionMap.entries())
      .map(([actionType, stats]) => ({
        actionType,
        count: stats.count,
        successCount: stats.successCount,
        successRate: stats.totalAttempts > 0 ? Math.round((stats.successCount / stats.totalAttempts) * 100) / 100 : 0
      }))
      .sort((a, b) => b.count - a.count);

    return {
      totalActions,
      totalSuccessful,
      overallSuccessRate: totalAttempts > 0 ? Math.round((totalSuccessful / totalAttempts) * 100) / 100 : 0,
      actions,
      highIntensityDuration: Math.round(highIntensityDuration),
      highIntensityPercentage: totalDuration > 0 ? Math.round((highIntensityDuration / totalDuration) * 100) : 0,
      bestActionPerformance: bestAction ? {
        actionType: bestAction.actionType,
        count: bestAction.count,
        dateFormatted: this.formatDate(bestAction.date)
      } : undefined
    };
  }

  private calculateLoadInsights(
    trainingLoad: number,
    trainingCount: number,
    loadChange: TrainingLoadChange,
    sportDistribution: Map<SportType, { duration: number; count: number }>
  ): WeeklyReport['loadInsights'] {
    const sportNames: Record<SportType, string> = {
      [SportType.RUNNING]: '跑步',
      [SportType.CYCLING]: '骑行',
      [SportType.STRENGTH]: '力量',
      [SportType.BALL]: '球类'
    };

    const sourceBreakdown: { sportType: SportType; sportName: string; load: number; percentage: number }[] = [];

    const sports = Array.from(sportDistribution.entries());
    if (sports.length === 0 || trainingLoad === 0) {
      return {
        primarySource: '无训练数据',
        sourceBreakdown: [],
        riskTriggers: ['本周暂无训练记录'],
        recommendedAdjustment: '建议从轻松的运动开始，逐步建立训练习惯',
        adjustmentMagnitude: 'none',
        adjustmentDirection: 'maintain'
      };
    }

    const loadPerSport = trainingCount > 0 ? trainingLoad / trainingCount : 0;
    for (const [sportType, data] of sports) {
      const estimatedLoad = data.count * loadPerSport;
      sourceBreakdown.push({
        sportType,
        sportName: sportNames[sportType] || sportType,
        load: Math.round(estimatedLoad),
        percentage: trainingLoad > 0 ? Math.round((estimatedLoad / trainingLoad) * 100) : 0
      });
    }
    sourceBreakdown.sort((a, b) => b.load - a.load);

    const primarySource = sourceBreakdown[0]?.sportName || '综合训练';

    const riskTriggers: string[] = [];
    let adjustmentDirection: 'increase' | 'maintain' | 'decrease' = 'maintain';
    let adjustmentMagnitude: 'none' | 'small' | 'moderate' | 'large' = 'none';
    let recommendedAdjustment = '';

    if (trainingCount === 0) {
      riskTriggers.push('本周无训练记录');
      adjustmentDirection = 'increase';
      adjustmentMagnitude = 'small';
      recommendedAdjustment = '本周无训练，建议安排 2-3 次轻量运动，逐步恢复状态';
    } else if (loadChange.changePercentage > 50) {
      riskTriggers.push('周负荷激增超过 50%');
      riskTriggers.push('过度训练风险显著升高');
      adjustmentDirection = 'decrease';
      adjustmentMagnitude = 'large';
      recommendedAdjustment = '负荷增加过快，建议下周减少 30-50% 训练量，优先保证恢复';
    } else if (loadChange.changePercentage > 25) {
      riskTriggers.push('周负荷增加超过 25%');
      adjustmentDirection = 'decrease';
      adjustmentMagnitude = 'moderate';
      recommendedAdjustment = '负荷增加偏快，建议下周减少 15-25% 训练量，注意身体反应';
    } else if (loadChange.changePercentage > 10) {
      riskTriggers.push('周负荷稳步增加');
      adjustmentDirection = 'maintain';
      adjustmentMagnitude = 'small';
      recommendedAdjustment = '负荷增加在合理范围内，保持当前节奏，确保训练后充分恢复';
    } else if (loadChange.changePercentage < -30) {
      riskTriggers.push('周负荷下降明显');
      adjustmentDirection = 'increase';
      adjustmentMagnitude = 'moderate';
      recommendedAdjustment = '负荷下降较多，建议下周逐步增加 20-30% 训练量，回到正常水平';
    } else if (loadChange.changePercentage < -10) {
      riskTriggers.push('周负荷有所下降');
      adjustmentDirection = 'increase';
      adjustmentMagnitude = 'small';
      recommendedAdjustment = '负荷略有下降，如非主动减量，建议下周适度增加训练量';
    } else {
      riskTriggers.push('负荷稳定，处于良好适应区间');
      adjustmentDirection = 'maintain';
      adjustmentMagnitude = 'none';
      recommendedAdjustment = '训练负荷稳定，保持当前节奏，可持续提升';
    }

    if (trainingCount >= 6) {
      riskTriggers.push('训练频次过高，可能影响恢复');
      if (adjustmentDirection !== 'decrease') {
        adjustmentDirection = 'decrease';
        adjustmentMagnitude = 'small';
        recommendedAdjustment = '训练频次较高，建议安排 1-2 天完全休息日，防止过度疲劳';
      }
    }

    if (trainingLoad > 400) {
      riskTriggers.push('周训练负荷较高');
      if (adjustmentMagnitude === 'none' || adjustmentMagnitude === 'small') {
        adjustmentMagnitude = 'moderate';
        adjustmentDirection = 'decrease';
        recommendedAdjustment = '训练负荷偏高，建议下周适当减少强度训练，增加恢复训练比例';
      }
    }

    if (sports.length >= 3 && trainingCount >= 3) {
      riskTriggers.unshift('混合运动模式，训练内容丰富');
    }

    return {
      primarySource: primarySource + '训练',
      sourceBreakdown,
      riskTriggers,
      recommendedAdjustment,
      adjustmentMagnitude,
      adjustmentDirection
    };
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

  private generateRecoveryAdvice(
    trainingLoad: number,
    trainingCount: number,
    loadChange: TrainingLoadChange,
    sportDistribution: Map<SportType, { duration: number; count: number }>
  ): string[] {
    const advice: string[] = [];
    const sports = Array.from(sportDistribution.keys());

    if (trainingCount === 0) {
      advice.push('本周暂无训练记录，建议保持规律运动习惯');
      advice.push('可以从一次轻松的慢跑或骑行开始新的一周');
      return advice;
    }

    if (trainingLoad > 300) {
      advice.push('本周训练负荷较高，建议周末安排1-2天主动恢复');
      advice.push('保证每天8小时以上睡眠，促进身体恢复');
      advice.push('适当增加蛋白质摄入，帮助肌肉修复');
    } else if (trainingLoad > 150) {
      advice.push('训练负荷适中，保持良好作息和训练节奏');
      advice.push('训练后注意拉伸放松，避免肌肉紧张');
    } else {
      advice.push('本周训练量适中，可适当增加训练强度或频次');
      advice.push('保持规律运动习惯，循序渐进提升能力');
    }

    if (loadChange.trend === 'increasing' && loadChange.changePercentage > 20) {
      advice.push('⚠️ 负荷增加过快，注意监控身体状态，避免过度训练');
    }

    if (trainingCount >= 5) {
      advice.push('训练频次较高，建议每周至少安排1天完全休息日');
    }

    if (sports.includes(SportType.STRENGTH) && trainingCount >= 2) {
      advice.push('力量训练后给肌肉48小时恢复时间，同一肌群不要连续两天训练');
    }

    if (sports.includes(SportType.RUNNING) && sports.includes(SportType.CYCLING)) {
      advice.push('跑骑结合的训练模式很棒，注意两种运动的强度搭配');
    }

    if (sports.includes(SportType.BALL)) {
      advice.push('球类训练注意赛前热身和赛后拉伸，减少运动损伤风险');
    }

    return advice;
  }

  private calculateWeeklyTrends(records: any[], weekStart: number): {
    metric: string;
    values: { day: number; value: number }[];
    trend: 'up' | 'down' | 'stable';
  }[] {
    const dailyDuration = new Array(7).fill(0);
    const dailyDistance = new Array(7).fill(0);
    const dailyHr = new Array(7).fill(0);
    const dailyHrCount = new Array(7).fill(0);

    for (const record of records) {
      const day = getDayOfWeek(record.startTime);
      dailyDuration[day] += record.data.duration;

      if ('distance' in record.data && record.data.distance) {
        dailyDistance[day] += record.data.distance;
      }

      if ('heartRateSamples' in record.data && record.data.heartRateSamples) {
        const hr = record.data.heartRateSamples;
        if (hr.length > 0) {
          dailyHr[day] += hr.reduce((sum: number, s: any) => sum + s.heartRate, 0);
          dailyHrCount[day] += hr.length;
        }
      }
    }

    const durationValues = dailyDuration.map((value, day) => ({
      day,
      value: Math.round(value)
    }));

    const distanceValues = dailyDistance.map((value, day) => ({
      day,
      value: Math.round(value)
    }));

    const hrValues = dailyHr.map((value, day) => ({
      day,
      value: dailyHrCount[day] > 0 ? Math.round(value / dailyHrCount[day]) : 0
    }));

    return [
      {
        metric: '训练时长',
        values: durationValues,
        trend: this.calculateTrend(dailyDuration)
      },
      {
        metric: '训练距离',
        values: distanceValues,
        trend: this.calculateTrend(dailyDistance)
      },
      {
        metric: '平均心率',
        values: hrValues,
        trend: this.calculateTrend(dailyHr.map((v, i) => dailyHrCount[i] > 0 ? v / dailyHrCount[i] : 0))
      }
    ];
  }

  private calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
    const nonZero = values.filter(v => v > 0);
    if (nonZero.length < 2) return 'stable';

    const mid = Math.floor(nonZero.length / 2);
    const firstHalf = nonZero.slice(0, mid);
    const secondHalf = nonZero.slice(mid);

    const avgFirst = calculateAverage(firstHalf);
    const avgSecond = calculateAverage(secondHalf);

    const diff = (avgSecond - avgFirst) / avgFirst;

    if (diff > 0.1) return 'up';
    if (diff < -0.1) return 'down';
    return 'stable';
  }

  private generateSummary(days: number, duration: number, loadChange: TrainingLoadChange, sportDistribution: Map<SportType, { duration: number; count: number }>): string {
    const hours = Math.round(duration / 3600 * 10) / 10;

    if (days === 0) {
      return '本周暂无训练记录，建议保持规律运动习惯。新的一周，从一次轻松的训练开始吧！';
    }

    let summary = `本周共训练 ${days} 天，总时长 ${hours} 小时。`;

    const sports = Array.from(sportDistribution.keys());
    if (sports.length === 1) {
      const sport = sports[0];
      const data = sportDistribution.get(sport)!;
      const sportNames: Record<string, string> = {
        running: '跑步',
        cycling: '骑行',
        strength: '力量',
        ball: '球类'
      };
      summary = `本周进行了 ${data.count} 次${sportNames[sport] || sport}训练，总时长 ${hours} 小时。`;
    } else if (sports.length > 1) {
      summary += `包含 ${sports.length} 种运动类型，训练内容丰富多样。`;
    }

    if (days >= 5) {
      summary += '训练频次较高，注意合理安排休息。';
    } else if (days >= 3) {
      summary += '训练频次适中，保持良好节奏。';
    } else {
      summary += '训练频次较少，建议增加运动频率。';
    }

    switch (loadChange.trend) {
      case 'increasing':
        summary += '训练负荷较上周有所增加，保持良好势头的同时注意休息恢复。';
        break;
      case 'decreasing':
        summary += '训练负荷较上周有所下降，建议适当增加训练量以保持训练效果。';
        break;
      case 'stable':
        summary += '训练负荷与上周基本持平，保持稳定的训练节奏。';
        break;
    }

    return summary;
  }
}

export const weeklyReportGenerator = new WeeklyReportGenerator();

export class DataAggregator {
  aggregate(options: AggregationOptions): UserSummary | TeamSummary | CourseSummary | null {
    switch (options.dimension) {
      case 'user':
        return this.aggregateUser(options.id!, options);
      case 'team':
        return this.aggregateTeam(options.id!, options);
      case 'course':
        return this.aggregateCourse(options.id!);
      default:
        return null;
    }
  }

  private aggregateUser(userId: string, options: AggregationOptions): UserSummary {
    const records = dataStore.getTrainingRecordsByUser(userId, {
      sportType: options.sportType,
      startDate: options.startDate,
      endDate: options.endDate
    });

    const totalDuration = records.reduce((sum, r) => sum + r.data.duration, 0);
    let totalDistance: number | undefined;
    let totalLoad = 0;

    for (const record of records) {
      if ('distance' in record.data && record.data.distance) {
        totalDistance = (totalDistance || 0) + record.data.distance;
      }
      const fatigue = fatigueScorer.calculate(record.recordId);
      if (fatigue) {
        totalLoad += fatigue.score;
      }
    }

    const recentTrend = this.getUserTrend(userId);

    return {
      userId,
      totalTrainingCount: records.length,
      totalDuration: Math.round(totalDuration),
      totalDistance: totalDistance ? Math.round(totalDistance) : undefined,
      avgTrainingLoad: records.length > 0 ? Math.round(totalLoad / records.length) : 0,
      recentTrend
    };
  }

  private getUserTrend(userId: string): 'up' | 'down' | 'stable' {
    const records = dataStore.getTrainingRecordsByUser(userId);
    if (records.length < 4) return 'stable';

    const half = Math.floor(records.length / 2);
    const recent = records.slice(0, half);
    const earlier = records.slice(half, half * 2);

    const recentDuration = recent.reduce((sum, r) => sum + r.data.duration, 0);
    const earlierDuration = earlier.reduce((sum, r) => sum + r.data.duration, 0);

    if (earlierDuration === 0) return 'stable';

    const diff = (recentDuration - earlierDuration) / earlierDuration;
    if (diff > 0.15) return 'up';
    if (diff < -0.15) return 'down';
    return 'stable';
  }

  private aggregateTeam(teamId: string, options: AggregationOptions): TeamSummary {
    const team = dataStore.getTeam(teamId);
    if (!team) {
      return {
        teamId,
        memberCount: 0,
        totalTrainingCount: 0,
        totalDuration: 0,
        avgTrainingLoad: 0,
        topPerformers: []
      };
    }

    const records = dataStore.getTrainingRecordsByTeam(teamId, {
      sportType: options.sportType,
      startDate: options.startDate,
      endDate: options.endDate
    });

    const totalDuration = records.reduce((sum, r) => sum + r.data.duration, 0);

    let totalLoad = 0;
    let loadCount = 0;
    for (const record of records) {
      const fatigue = fatigueScorer.calculate(record.recordId);
      if (fatigue) {
        totalLoad += fatigue.score;
        loadCount++;
      }
    }

    const ranking = teamRankingGenerator.generateRanking(teamId, 'duration', 'week');
    const topPerformers: TeamRankingEntry[] = ranking?.rankings.slice(0, 3) || [];

    return {
      teamId,
      memberCount: team.memberIds.length,
      totalTrainingCount: records.length,
      totalDuration: Math.round(totalDuration),
      avgTrainingLoad: loadCount > 0 ? Math.round(totalLoad / loadCount) : 0,
      topPerformers
    };
  }

  private aggregateCourse(courseId: string): CourseSummary {
    const course = dataStore.getCourse(courseId);
    const records = dataStore.getTrainingRecordsByCourse(courseId);

    if (!course) {
      return {
        courseId,
        totalCompletions: 0,
        totalDuration: 0,
        avgDuration: 0
      };
    }

    const totalDuration = records.reduce((sum, r) => sum + r.data.duration, 0);
    const avgDuration = records.length > 0 ? totalDuration / records.length : 0;

    let totalDistance = 0;
    let hasDistance = false;
    let totalTrainingLoad = 0;

    let ballActionMap = new Map<string, { count: number; successCount: number; totalAttempts: number }>();
    let totalBallActions = 0;
    let totalBallSuccessful = 0;
    let totalBallAttempts = 0;
    let highIntensityDuration = 0;

    const userStats = new Map<string, {
      completionCount: number;
      totalDuration: number;
      totalTrainingLoad: number;
      totalBallActions: number;
      ballActions: Map<string, { count: number; successCount: number; totalAttempts: number }>;
    }>();

    for (const record of records) {
      if ('distance' in record.data && record.data.distance) {
        totalDistance += record.data.distance;
        hasDistance = true;
      }

      const fatigue = fatigueScorer.calculate(record.recordId);
      const load = fatigue?.score || 0;
      if (fatigue) {
        totalTrainingLoad += fatigue.score;
      }

      const userId = record.userId;
      if (!userStats.has(userId)) {
        userStats.set(userId, {
          completionCount: 0,
          totalDuration: 0,
          totalTrainingLoad: 0,
          totalBallActions: 0,
          ballActions: new Map()
        });
      }
      const userStat = userStats.get(userId)!;
      userStat.completionCount += 1;
      userStat.totalDuration += record.data.duration;
      userStat.totalTrainingLoad += load;

      if (record.sportType === 'ball') {
        const analysis = motionAnalyzer.analyzeRecord(record.recordId);
        if (analysis && 'actions' in analysis) {
          for (const action of analysis.actions) {
            const existing = ballActionMap.get(action.actionType) || { count: 0, successCount: 0, totalAttempts: 0 };
            existing.count += action.count;
            existing.successCount += action.successCount;
            existing.totalAttempts += action.totalAttempts || action.count;
            ballActionMap.set(action.actionType, existing);

            const userAction = userStat.ballActions.get(action.actionType) || { count: 0, successCount: 0, totalAttempts: 0 };
            userAction.count += action.count;
            userAction.successCount += action.successCount;
            userAction.totalAttempts += action.totalAttempts || action.count;
            userStat.ballActions.set(action.actionType, userAction);
          }
          totalBallActions += analysis.totalActions;
          totalBallSuccessful += analysis.totalSuccessful;
          totalBallAttempts += analysis.actions.reduce((s: number, a: BallActionDetail) => s + (a.totalAttempts || a.count), 0);
          userStat.totalBallActions += analysis.totalActions;
          
          if ('highIntensityDuration' in analysis) {
            highIntensityDuration += analysis.highIntensityDuration;
          }
        }
      }
    }

    let bestPerformance: BestPerformance | undefined;
    if (records.length > 0) {
      bestPerformance = this.findCourseBestPerformance(records);
    }

    const memberCount = userStats.size;
    const avgDurationPerUser = memberCount > 0 ? totalDuration / memberCount : 0;
    const avgTrainingLoadPerUser = memberCount > 0 ? totalTrainingLoad / memberCount : 0;

    const topPerformers: CourseSummary['topPerformers'] = [];
    const sortedUsers = Array.from(userStats.entries()).sort((a, b) => {
      if (b[1].totalTrainingLoad !== a[1].totalTrainingLoad) {
        return b[1].totalTrainingLoad - a[1].totalTrainingLoad;
      }
      return b[1].completionCount - a[1].completionCount;
    });

    for (let i = 0; i < Math.min(5, sortedUsers.length); i++) {
      const [userId, stats] = sortedUsers[i];
      const user = dataStore.getUserProfile(userId);
      topPerformers.push({
        rank: i + 1,
        userId,
        userName: user?.name,
        completionCount: stats.completionCount,
        totalDuration: Math.round(stats.totalDuration),
        totalTrainingLoad: Math.round(stats.totalTrainingLoad),
        totalBallActions: stats.totalBallActions || undefined
      });
    }

    let ballActionRanking: CourseSummary['ballActionRanking'] | undefined;
    if (course.sportType === SportType.BALL && ballActionMap.size > 0) {
      ballActionRanking = [];
      for (const [actionType] of ballActionMap) {
        let topUser: { userId: string; userName?: string; count: number; successCount: number; successRate: number } | undefined;
        for (const [userId, stats] of userStats) {
          const actionStat = stats.ballActions.get(actionType);
          if (actionStat && (!topUser || actionStat.count > topUser.count)) {
            const user = dataStore.getUserProfile(userId);
            topUser = {
              userId,
              userName: user?.name,
              count: actionStat.count,
              successCount: actionStat.successCount,
              successRate: actionStat.totalAttempts > 0 
                ? Math.round((actionStat.successCount / actionStat.totalAttempts) * 100) / 100 
                : 0
            };
          }
        }
        ballActionRanking.push({ actionType, topUser });
      }
      ballActionRanking.sort((a, b) => {
        const aCount = ballActionMap.get(a.actionType)?.count || 0;
        const bCount = ballActionMap.get(b.actionType)?.count || 0;
        return bCount - aCount;
      });
    }

    const avgTrainingLoad = records.length > 0 ? totalTrainingLoad / records.length : 0;
    const avgDistance = records.length > 0 ? totalDistance / records.length : 0;

    const memberDetails: CourseSummary['memberDetails'] = [];
    const expectedCompletions = 3;
    
    for (const [userId, stats] of userStats) {
      const user = dataStore.getUserProfile(userId);
      const userRecords = records.filter(r => r.userId === userId)
        .sort((a, b) => a.startTime - b.startTime);

      const firstRecord = userRecords[0];
      const lastRecord = userRecords[userRecords.length - 1];
      const firstLoad = firstRecord ? fatigueScorer.calculate(firstRecord.recordId)?.score || 0 : 0;
      const lastLoad = lastRecord ? fatigueScorer.calculate(lastRecord.recordId)?.score || 0 : 0;
      let loadTrend: 'up' | 'down' | 'stable' = 'stable';
      if (firstLoad > 0 && lastLoad - firstLoad > firstLoad * 0.1) {
        loadTrend = 'up';
      } else if (firstLoad > 0 && lastLoad - firstLoad < -firstLoad * 0.1) {
        loadTrend = 'down';
      }

      const bestPerf = userRecords.length > 0 ? this.findCourseBestPerformance(userRecords) : undefined;

      const userBallActions: { actionType: string; count: number; successCount: number; successRate: number }[] = [];
      const ballWeakPoints: string[] = [];
      
      if (stats.ballActions.size > 0) {
        for (const [actionType, actionStat] of stats.ballActions) {
          const successRate = actionStat.totalAttempts > 0 
            ? actionStat.successCount / actionStat.totalAttempts 
            : 0;
          userBallActions.push({
            actionType,
            count: actionStat.count,
            successCount: actionStat.successCount,
            successRate: Math.round(successRate * 100) / 100
          });
          
          if (successRate < 0.6 && actionStat.count >= 5) {
            ballWeakPoints.push(`${actionType}（成功率${Math.round(successRate * 100)}%）`);
          }
        }
        userBallActions.sort((a, b) => b.count - a.count);
      }

      memberDetails.push({
        userId,
        userName: user?.name,
        completionCount: stats.completionCount,
        completionRate: Math.round((stats.completionCount / expectedCompletions) * 100),
        totalDuration: Math.round(stats.totalDuration),
        avgDuration: stats.completionCount > 0 ? Math.round(stats.totalDuration / stats.completionCount) : 0,
        totalTrainingLoad: Math.round(stats.totalTrainingLoad),
        avgTrainingLoad: stats.completionCount > 0 ? Math.round(stats.totalTrainingLoad / stats.completionCount) : 0,
        loadTrend,
        bestPerformance: bestPerf,
        ballActions: userBallActions.length > 0 ? userBallActions : undefined,
        ballWeakPoints: ballWeakPoints.length > 0 ? ballWeakPoints : undefined
      });
    }
    memberDetails.sort((a, b) => b.totalTrainingLoad - a.totalTrainingLoad);

    let ballProgressRanking: CourseSummary['ballProgressRanking'] | undefined;
    if (course.sportType === SportType.BALL && ballActionMap.size > 0 && memberCount >= 2) {
      ballProgressRanking = [];
      for (const [actionType] of ballActionMap) {
        let mostImproved: {
          userId: string;
          userName?: string;
          improvementRate: number;
          startValue: number;
          endValue: number;
        } | undefined;
        let topTotal: {
          userId: string;
          userName?: string;
          totalCount: number;
          successRate: number;
        } | undefined;

        for (const member of memberDetails) {
          const userAction = member.ballActions?.find(a => a.actionType === actionType);
          if (userAction) {
            if (!topTotal || userAction.count > topTotal.totalCount) {
              topTotal = {
                userId: member.userId,
                userName: member.userName,
                totalCount: userAction.count,
                successRate: userAction.successRate
              };
            }
          }

          const userRecords = records.filter(r => r.userId === member.userId)
            .sort((a, b) => a.startTime - b.startTime);
          
          if (userRecords.length >= 2) {
            const firstAnalysis = motionAnalyzer.analyzeRecord(userRecords[0].recordId);
            const lastAnalysis = motionAnalyzer.analyzeRecord(userRecords[userRecords.length - 1].recordId);
            
            if (firstAnalysis && 'actions' in firstAnalysis && lastAnalysis && 'actions' in lastAnalysis) {
              const firstAction = firstAnalysis.actions.find(a => a.actionType === actionType);
              const lastAction = lastAnalysis.actions.find(a => a.actionType === actionType);
              
              if (firstAction && lastAction && firstAction.successRate > 0) {
                const improvement = (lastAction.successRate - firstAction.successRate) / firstAction.successRate;
                if (!mostImproved || improvement > mostImproved.improvementRate) {
                  const user = dataStore.getUserProfile(member.userId);
                  mostImproved = {
                    userId: member.userId,
                    userName: user?.name,
                    improvementRate: Math.round(improvement * 100) / 100,
                    startValue: Math.round(firstAction.successRate * 100),
                    endValue: Math.round(lastAction.successRate * 100)
                  };
                }
              }
            }
          }
        }

        if (topTotal || mostImproved) {
          ballProgressRanking.push({
            actionType,
            mostImproved,
            topTotal
          });
        }
      }
      ballProgressRanking.sort((a, b) => {
        const aCount = ballActionMap.get(a.actionType)?.count || 0;
        const bCount = ballActionMap.get(b.actionType)?.count || 0;
        return bCount - aCount;
      });
    }

    const result: CourseSummary = {
      courseId,
      courseName: course.name,
      sportType: course.sportType,
      totalCompletions: records.length,
      totalDuration: Math.round(totalDuration),
      avgDuration: Math.round(avgDuration),
      avgTrainingLoad: Math.round(avgTrainingLoad),
      totalTrainingLoad: Math.round(totalTrainingLoad),
      difficultyRating: course.difficulty,
      bestPerformance,
      memberCount,
      avgDurationPerUser: Math.round(avgDurationPerUser),
      avgTrainingLoadPerUser: Math.round(avgTrainingLoadPerUser),
      topPerformers: topPerformers.length > 0 ? topPerformers : undefined,
      ballActionRanking,
      memberDetails: memberDetails.length > 0 ? memberDetails : undefined,
      ballProgressRanking
    };

    if (hasDistance) {
      result.totalDistance = Math.round(totalDistance);
      result.avgDistance = Math.round(avgDistance);
    }

    if (course.sportType === SportType.BALL && ballActionMap.size > 0) {
      const actions = Array.from(ballActionMap.entries())
        .map(([actionType, stats]) => ({
          actionType,
          count: stats.count,
          successCount: stats.successCount,
          successRate: stats.totalAttempts > 0 ? Math.round((stats.successCount / stats.totalAttempts) * 100) / 100 : 0
        }))
        .sort((a, b) => b.count - a.count);

      result.ballActionStats = {
        totalActions: totalBallActions,
        totalSuccessful: totalBallSuccessful,
        overallSuccessRate: totalBallAttempts > 0 ? Math.round((totalBallSuccessful / totalBallAttempts) * 100) / 100 : 0,
        actions
      };

      if (highIntensityDuration > 0) {
        result.highIntensityDuration = Math.round(highIntensityDuration);
      }
    }

    return result;
  }

  private findCourseBestPerformance(records: any[]): BestPerformance | undefined {
    if (records.length === 0) return undefined;

    let best: BestPerformance | undefined;

    for (const record of records) {
      let perf: BestPerformance | undefined;

      if (record.sportType === 'running' && 'distance' in record.data && record.data.distance) {
        const distanceKm = record.data.distance / 1000;
        const pace = record.data.duration / distanceKm;
        perf = {
          sportType: record.sportType,
          distance: record.data.distance,
          distanceKm: Math.round(distanceKm * 100) / 100,
          time: record.data.duration,
          timeFormatted: this.formatDuration(record.data.duration),
          pace: Math.round(pace * 10) / 10,
          paceFormatted: this.formatPaceStr(pace),
          date: record.startTime,
          dateFormatted: this.formatDateStr(record.startTime),
          recordId: record.recordId,
          label: `${distanceKm.toFixed(1)}km 跑步`,
          value: `配速 ${this.formatPaceStr(pace)}`
        };
      } else if (record.sportType === 'cycling' && 'distance' in record.data && record.data.distance) {
        const distanceKm = record.data.distance / 1000;
        const avgSpeed = distanceKm / (record.data.duration / 3600);
        perf = {
          sportType: record.sportType,
          distance: record.data.distance,
          distanceKm: Math.round(distanceKm * 100) / 100,
          time: record.data.duration,
          timeFormatted: this.formatDuration(record.data.duration),
          date: record.startTime,
          dateFormatted: this.formatDateStr(record.startTime),
          recordId: record.recordId,
          label: `${distanceKm.toFixed(1)}km 骑行`,
          value: `均速 ${avgSpeed.toFixed(1)}km/h`
        };
      } else if (record.sportType === 'strength') {
        let totalVolume = 0;
        let exerciseCount = 0;
        if ('sets' in record.data && record.data.sets) {
          totalVolume = record.data.sets.reduce((sum: number, s: any) => sum + s.weight * s.reps, 0);
          const exercises = new Set(record.data.sets.map((s: any) => s.exerciseName));
          exerciseCount = exercises.size;
        }
        perf = {
          sportType: record.sportType,
          time: record.data.duration,
          timeFormatted: this.formatDuration(record.data.duration),
          date: record.startTime,
          dateFormatted: this.formatDateStr(record.startTime),
          recordId: record.recordId,
          label: `力量训练`,
          value: `${totalVolume}kg 容量 / ${exerciseCount}个动作`
        };
      } else if (record.sportType === 'ball') {
        let actionCount = 0;
        if ('actions' in record.data && record.data.actions) {
          actionCount = record.data.actions.reduce((sum: number, a: any) => sum + a.count, 0);
        }
        perf = {
          sportType: record.sportType,
          time: record.data.duration,
          timeFormatted: this.formatDuration(record.data.duration),
          date: record.startTime,
          dateFormatted: this.formatDateStr(record.startTime),
          recordId: record.recordId,
          label: `球类训练`,
          value: `${actionCount} 次动作`
        };
      }

      if (perf) {
        if (!best) {
          best = perf;
        } else {
          if (perf.pace && best.pace && perf.pace < best.pace) best = perf;
          else if (perf.distance && best.distance && perf.distance > best.distance) best = perf;
          else if (perf.date && best.date && perf.date > best.date) best = perf;
        }
      }
    }

    return best;
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  private formatPaceStr(paceInSecondsPerKm: number): string {
    const minutes = Math.floor(paceInSecondsPerKm / 60);
    const seconds = Math.round(paceInSecondsPerKm % 60);
    return `${minutes}'${seconds.toString().padStart(2, '0')}"`;
  }

  private formatDateStr(timestamp: number): string {
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${month}月${day}日`;
  }
}

export const dataAggregator = new DataAggregator();

export class TrainingLoadTrendAnalyzer {
  getTrainingLoadTrend(userId: string, referenceDate: number = Date.now()): TrainingLoadTrend {
    const weeklyLoads: TrainingLoadTrend['weeklyLoads'] = [];

    for (let i = 3; i >= 0; i--) {
      const weekStart = getStartOfWeek(referenceDate) - i * 7 * 24 * 3600 * 1000;
      const weekEnd = getEndOfWeek(referenceDate) - i * 7 * 24 * 3600 * 1000;
      
      const records = dataStore.getTrainingRecordsByUser(userId, {
        startDate: weekStart,
        endDate: weekEnd
      });

      let trainingLoad = 0;
      let totalDuration = 0;
      
      for (const record of records) {
        totalDuration += record.data.duration;
        const fatigue = fatigueScorer.calculate(record.recordId);
        if (fatigue) {
          trainingLoad += fatigue.score;
        }
      }

      const weekNum = 4 - i;
      const label = i === 0 ? '本周' : `${i}周前`;

      weeklyLoads.push({
        weekStart,
        weekEnd,
        weekNumber: weekNum,
        label,
        trainingLoad: Math.round(trainingLoad),
        trainingCount: records.length,
        totalDuration: Math.round(totalDuration)
      });
    }

    const acuteLoad = weeklyLoads[3]?.trainingLoad || 0;
    const loads = weeklyLoads.map(w => w.trainingLoad);
    const nonZeroWeeks = loads.filter(l => l > 0).length;
    const chronicLoad = nonZeroWeeks > 0 
      ? loads.reduce((a, b) => a + b, 0) / nonZeroWeeks 
      : 0;

    let acwr = 0;
    let riskLevel: TrainingLoadTrend['riskLevel'] = 'low';
    let riskDescription = '';
    let recommendation = '';

    const totalWeeksWithData = weeklyLoads.filter(w => w.trainingCount > 0).length;

    if (chronicLoad > 0 && nonZeroWeeks >= 2) {
      acwr = Math.round((acuteLoad / chronicLoad) * 100) / 100;

      if (acwr < 0.5) {
        riskLevel = 'low';
        riskDescription = '负荷偏低，训练效果可能不足';
        recommendation = '训练量偏低，建议逐步增加训练负荷以获得更好的训练效果';
      } else if (acwr < 0.8) {
        riskLevel = 'low';
        riskDescription = '负荷合理，处于最佳适应区间';
        recommendation = '训练负荷适中，保持当前节奏，稳步提升能力';
      } else if (acwr < 1.3) {
        riskLevel = 'moderate';
        riskDescription = '负荷适中略高，注意恢复';
        recommendation = '训练负荷适中偏高，注意训练后充分恢复，避免过度疲劳';
      } else if (acwr < 1.5) {
        riskLevel = 'high';
        riskDescription = '负荷偏高，过度训练风险增加';
        recommendation = '训练负荷较高，建议适当降低训练强度，增加恢复训练';
      } else {
        riskLevel = 'very_high';
        riskDescription = '负荷过高，过度训练风险很大';
        recommendation = '训练负荷过高，建议立即减少训练量，安排主动恢复，防止运动损伤';
      }
    } else if (totalWeeksWithData === 0) {
      riskLevel = 'low';
      riskDescription = '暂无训练数据';
      recommendation = '还没有训练记录，建议从轻松的运动开始';
    } else if (totalWeeksWithData === 1) {
      riskLevel = 'low';
      riskDescription = '刚开始训练，逐步适应中';
      recommendation = '刚开始训练，循序渐进，让身体逐步适应运动节奏';
    } else {
      riskLevel = 'low';
      riskDescription = '数据不足，建议持续训练观察趋势';
      recommendation = '训练数据较少，建议保持规律训练，形成稳定的训练模式';
    }

    const recentTrend = this.calculateTrend(loads);
    const trend: 'increasing' | 'decreasing' | 'stable' = 
      recentTrend === 'up' ? 'increasing' : 
      recentTrend === 'down' ? 'decreasing' : 'stable';

    if (totalWeeksWithData >= 2) {
      if (trend === 'increasing' && riskLevel === 'low') {
        recommendation = '训练负荷稳步增加，保持良好节奏，注意身体反应';
      } else if (trend === 'decreasing') {
        recommendation = '训练负荷有所下降，如果是主动调整没问题，否则建议保持训练连续性';
      }
    }

    const insights = this.generateTrendInsights(weeklyLoads, acwr, riskLevel, trend, totalWeeksWithData);

    return {
      userId,
      referenceDate,
      weeklyLoads,
      acuteLoad: Math.round(acuteLoad),
      chronicLoad: Math.round(chronicLoad),
      acwr,
      riskLevel,
      riskDescription,
      trend,
      recommendation,
      insights
    };
  }

  private generateTrendInsights(
    weeklyLoads: TrainingLoadTrend['weeklyLoads'],
    acwr: number,
    riskLevel: TrainingLoadTrend['riskLevel'],
    trend: 'increasing' | 'decreasing' | 'stable',
    weeksWithData: number
  ): TrainingLoadTrend['insights'] {
    const loads = weeklyLoads.map(w => w.trainingLoad);
    const latestLoad = loads[loads.length - 1] || 0;

    let loadPattern: 'empty' | 'start' | 'building' | 'stable' | 'tapering' | 'overreaching' = 'empty';
    let patternDescription = '';
    const keyDrivers: string[] = [];
    const riskFactors: string[] = [];
    let suggestedAdjustment = '';
    let adjustmentPercentage = 0;

    if (weeksWithData === 0) {
      loadPattern = 'empty';
      patternDescription = '暂无训练数据，处于初始状态';
      keyDrivers.push('未开始训练或数据不足');
      suggestedAdjustment = '从低强度训练开始，逐步建立运动习惯';
      adjustmentPercentage = 0;
    } else if (weeksWithData === 1) {
      loadPattern = 'start';
      patternDescription = '刚开始训练，处于适应期';
      keyDrivers.push('开始建立训练习惯');
      keyDrivers.push('身体正在适应运动刺激');
      suggestedAdjustment = '保持当前训练量，让身体逐步适应，不要急于加量';
      adjustmentPercentage = 0;
    } else if (trend === 'increasing' && acwr > 1.3) {
      loadPattern = 'overreaching';
      patternDescription = '负荷激增，存在过度训练倾向';
      keyDrivers.push('近期训练量快速增加');
      keyDrivers.push('急性负荷显著高于慢性负荷');
      riskFactors.push('过度训练风险高');
      riskFactors.push('运动损伤风险上升');
      riskFactors.push('恢复时间可能不足');
      suggestedAdjustment = '立即减少训练量，安排主动恢复，防止过度训练';
      adjustmentPercentage = -30;
    } else if (trend === 'increasing' && acwr > 1.0) {
      loadPattern = 'building';
      patternDescription = '处于稳步提升阶段，负荷合理增加';
      keyDrivers.push('训练量持续增加');
      keyDrivers.push('身体适应良好');
      if (acwr > 1.2) {
        riskFactors.push('负荷增长偏快，注意监控身体状态');
      }
      suggestedAdjustment = '保持当前增长节奏，确保充分恢复，持续稳步提升';
      adjustmentPercentage = acwr > 1.2 ? -10 : 0;
    } else if (trend === 'stable' && acwr >= 0.8 && acwr <= 1.2) {
      loadPattern = 'stable';
      patternDescription = '负荷稳定，处于良好适应状态';
      keyDrivers.push('训练节奏稳定');
      keyDrivers.push('身体适应良好');
      suggestedAdjustment = '保持当前训练模式，可尝试小幅增加强度以突破平台期';
      adjustmentPercentage = 5;
    } else if (trend === 'decreasing' && acwr < 0.6) {
      loadPattern = 'tapering';
      patternDescription = '负荷显著下降，可能在减量调整或恢复';
      keyDrivers.push('训练量明显减少');
      if (latestLoad > 0) {
        keyDrivers.push('处于主动恢复或赛前减量阶段');
      } else {
        riskFactors.push('训练连续性受影响');
      }
      suggestedAdjustment = '如果是主动减量，保持低强度活动维持状态；如非主动，建议逐步恢复训练量';
      adjustmentPercentage = latestLoad > 0 ? 0 : 15;
    } else {
      loadPattern = 'building';
      patternDescription = '训练模式正在形成中';
      keyDrivers.push('训练规律性有待加强');
      suggestedAdjustment = '建立规律的训练计划，保持稳定的运动频次';
      adjustmentPercentage = 10;
    }

    if (riskLevel === 'high' || riskLevel === 'very_high') {
      if (!riskFactors.includes('过度训练风险高')) {
        riskFactors.push('过度训练风险较高');
      }
    }

    return {
      loadPattern,
      patternDescription,
      keyDrivers,
      riskFactors,
      suggestedAdjustment,
      adjustmentPercentage
    };
  }

  private calculateTrend(values: number[]): 'up' | 'down' | 'stable' {
    const nonZero = values.filter(v => v > 0);
    if (nonZero.length < 2) return 'stable';

    const mid = Math.floor(nonZero.length / 2);
    const firstHalf = nonZero.slice(0, mid);
    const secondHalf = nonZero.slice(mid);

    const avgFirst = calculateAverage(firstHalf);
    const avgSecond = calculateAverage(secondHalf);

    if (avgFirst === 0) return 'stable';
    const diff = (avgSecond - avgFirst) / avgFirst;

    if (diff > 0.15) return 'up';
    if (diff < -0.15) return 'down';
    return 'stable';
  }
}

export const trainingLoadTrendAnalyzer = new TrainingLoadTrendAnalyzer();
