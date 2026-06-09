import {
  WeeklyReport,
  TrainingLoadChange,
  BestPerformance,
  UserSummary,
  TeamSummary,
  TeamRankingEntry,
  CourseSummary,
  AggregationOptions,
  SportType
} from '../types';
import { dataStore } from '../store';
import { getStartOfWeek, getEndOfWeek, getDayOfWeek, calculateAverage } from '../utils';
import { heartRateAnalyzer } from './heartRate';
import { fatigueScorer } from './fatigue';
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
    const recoveryAdvice = this.generateRecoveryAdvice(trainingLoad, records.length);
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

  private generateRecoveryAdvice(trainingLoad: number, trainingCount: number): string[] {
    const advice: string[] = [];

    if (trainingLoad > 300) {
      advice.push('本周训练负荷较高，建议周末安排主动恢复');
      advice.push('保证每天8小时以上睡眠，促进身体恢复');
      advice.push('增加蛋白质摄入，帮助肌肉修复');
    } else if (trainingLoad > 150) {
      advice.push('训练负荷适中，保持良好作息');
      advice.push('训练后注意拉伸放松');
    } else {
      advice.push('本周训练量适中，可适当增加训练强度');
      advice.push('保持规律运动习惯');
    }

    if (trainingCount >= 5) {
      advice.push('训练频次较高，注意安排休息日');
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
        totalCompletions: records.length,
        avgDuration: 0
      };
    }

    const totalDuration = records.reduce((sum, r) => sum + r.data.duration, 0);

    return {
      courseId,
      totalCompletions: records.length,
      avgDuration: records.length > 0 ? Math.round(totalDuration / records.length) : 0,
      difficultyRating: course.difficulty
    };
  }
}

export const dataAggregator = new DataAggregator();
