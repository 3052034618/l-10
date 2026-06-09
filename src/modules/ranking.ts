import {
  PersonalGoal,
  TeamRanking,
  TeamRankingEntry,
  TrainingRecord,
  SportType
} from '../types';
import { dataStore } from '../store';
import { getStartOfWeek } from '../utils';

export class GoalManager {
  createGoal(goal: Omit<PersonalGoal, 'goalId' | 'status' | 'currentValue'>): PersonalGoal {
    return dataStore.addGoal({
      ...goal,
      currentValue: 0,
      status: 'active'
    });
  }

  getGoal(goalId: string): PersonalGoal | undefined {
    return dataStore.getGoal(goalId);
  }

  getUserGoals(userId: string, options?: { status?: string; sportType?: string }): PersonalGoal[] {
    return dataStore.getGoalsByUser(userId, options);
  }

  updateGoalProgress(goalId: string, value: number): PersonalGoal | undefined {
    const goal = dataStore.getGoal(goalId);
    if (!goal) return undefined;

    const currentValue = value;
    let status = goal.status;

    if (status === 'active') {
      if (currentValue >= goal.targetValue) {
        status = 'completed';
      } else if (Date.now() > goal.endDate) {
        status = 'failed';
      }
    }

    return dataStore.updateGoal(goalId, {
      currentValue,
      status
    });
  }

  updateGoal(goalId: string, updates: Partial<PersonalGoal>): PersonalGoal | undefined {
    return dataStore.updateGoal(goalId, updates);
  }

  calculateProgress(goalId: string): number {
    const goal = dataStore.getGoal(goalId);
    if (!goal || goal.targetValue <= 0) return 0;
    return Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
  }

  syncGoalsForUser(userId: string): PersonalGoal[] {
    const goals = dataStore.getGoalsByUser(userId, { status: 'active' });
    const now = Date.now();

    for (const goal of goals) {
      if (now > goal.endDate && goal.status === 'active') {
        if (goal.currentValue < goal.targetValue) {
          dataStore.updateGoal(goal.goalId, { status: 'failed' });
        }
      }

      if (goal.currentValue >= goal.targetValue && goal.status === 'active') {
        dataStore.updateGoal(goal.goalId, { status: 'completed' });
      }
    }

    return dataStore.getGoalsByUser(userId);
  }

  addTrainingToGoal(goalId: string, recordId: string): PersonalGoal | undefined {
    const goal = dataStore.getGoal(goalId);
    const record = dataStore.getTrainingRecord(recordId);

    if (!goal || !record) return undefined;
    if (goal.sportType && goal.sportType !== record.sportType) return undefined;

    let addValue = 0;
    switch (goal.goalType) {
      case 'distance':
        if ('distance' in record.data && record.data.distance) {
          addValue = record.data.distance;
        }
        break;
      case 'duration':
        addValue = record.data.duration;
        break;
      case 'frequency':
        addValue = 1;
        break;
    }

    if (addValue > 0) {
      return this.updateGoalProgress(goal.goalId, goal.currentValue + addValue);
    }

    return goal;
  }
}

export const goalManager = new GoalManager();

export class TeamRankingGenerator {
  generateRanking(
    teamId: string,
    metric: string,
    period: 'week' | 'month' | 'all' = 'week'
  ): TeamRanking | null {
    const team = dataStore.getTeam(teamId);
    if (!team) return null;

    const records = dataStore.getTrainingRecordsByTeam(teamId, this.getPeriodOptions(period));
    const userRecords = new Map<string, TrainingRecord[]>();

    for (const record of records) {
      const userRecordsList = userRecords.get(record.userId) || [];
      userRecordsList.push(record);
      userRecords.set(record.userId, userRecordsList);
    }

    const entries: TeamRankingEntry[] = [];

    for (const userId of team.memberIds) {
      const userRecs = userRecords.get(userId) || [];
      const userProfile = dataStore.getUserProfile(userId);
      const value = this.calculateMetricValue(userRecs, metric);
      const score = this.calculateScore(value, metric);

      entries.push({
        rank: 0,
        userId,
        userName: userProfile?.name,
        score,
        metric,
        value,
        trend: this.calculateTrend(userId, metric, period)
      });
    }

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return {
      teamId,
      metric,
      period,
      rankings: entries,
      updatedAt: Date.now()
    };
  }

  private getPeriodOptions(period: string): { startDate?: number } {
    const now = Date.now();
    switch (period) {
      case 'week':
        return { startDate: getStartOfWeek(now) };
      case 'month':
        const date = new Date(now);
        date.setDate(1);
        date.setHours(0, 0, 0, 0);
        return { startDate: date.getTime() };
      default:
        return {};
    }
  }

  private calculateMetricValue(records: TrainingRecord[], metric: string): number {
    switch (metric) {
      case 'duration':
        return records.reduce((sum, r) => sum + r.data.duration, 0);
      case 'distance':
        return records.reduce((sum, r) => {
          if ('distance' in r.data && r.data.distance) {
            return sum + r.data.distance;
          }
          return sum;
        }, 0);
      case 'frequency':
        const uniqueDays = new Set(records.map(r => new Date(r.startTime).toDateString()));
        return uniqueDays.size;
      case 'trainingLoad':
        return records.reduce((sum, r) => {
          const loadFactor = r.data.duration / 60;
          return sum + loadFactor;
        }, 0);
      default:
        return records.length;
    }
  }

  private calculateScore(value: number, metric: string): number {
    switch (metric) {
      case 'duration':
        return Math.round(value / 60);
      case 'distance':
        return Math.round(value);
      case 'frequency':
        return value * 100;
      default:
        return Math.round(value);
    }
  }

  private calculateTrend(userId: string, metric: string, period: string): 'up' | 'down' | 'stable' {
    const records = dataStore.getTrainingRecordsByUser(userId);
    if (records.length < 2) return 'stable';

    const periodOptions = this.getPeriodOptions(period);
    const currentRecords = records.filter(r =>
      periodOptions.startDate ? r.startTime >= periodOptions.startDate : true
    );

    if (currentRecords.length < 2) return 'stable';

    const midPoint = Math.floor(currentRecords.length / 2);
    const recent = currentRecords.slice(0, midPoint);
    const earlier = currentRecords.slice(midPoint);

    const recentValue = this.calculateMetricValue(recent, metric);
    const earlierValue = this.calculateMetricValue(earlier, metric);

    const diff = recentValue - earlierValue;
    const threshold = earlierValue * 0.1;

    if (diff > threshold) return 'up';
    if (diff < -threshold) return 'down';
    return 'stable';
  }

  getAvailableMetrics(): { key: string; label: string }[] {
    return [
      { key: 'duration', label: '训练时长' },
      { key: 'distance', label: '训练距离' },
      { key: 'frequency', label: '训练频率' },
      { key: 'trainingLoad', label: '训练负荷' }
    ];
  }
}

export const teamRankingGenerator = new TeamRankingGenerator();
