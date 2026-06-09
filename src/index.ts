export * from './types';

import { dataStore } from './store';
import { trainingRecordManager } from './modules/trainingRecord';
import { heartRateAnalyzer } from './modules/heartRate';
import { performanceAnalyzer } from './modules/performance';
import { motionAnalyzer, fatigueScorer } from './modules/fatigue';
import { goalManager, teamRankingGenerator } from './modules/ranking';
import { anomalyDetector } from './modules/anomaly';
import { weeklyReportGenerator, dataAggregator, trainingLoadTrendAnalyzer } from './modules/report';

export class SmartSportsTrainingSDK {
  public store = dataStore;
  public trainingRecords = trainingRecordManager;
  public heartRate = heartRateAnalyzer;
  public performance = performanceAnalyzer;
  public motion = motionAnalyzer;
  public fatigue = fatigueScorer;
  public goals = goalManager;
  public rankings = teamRankingGenerator;
  public anomalies = anomalyDetector;
  public reports = weeklyReportGenerator;
  public aggregator = dataAggregator;
  public loadTrend = trainingLoadTrendAnalyzer;

  constructor() {}

  setUserProfile(profile: any) {
    return dataStore.setUserProfile(profile);
  }

  getUserProfile(userId: string) {
    return dataStore.getUserProfile(userId);
  }

  setTeam(team: any) {
    return dataStore.setTeam(team);
  }

  getTeam(teamId: string) {
    return dataStore.getTeam(teamId);
  }

  setCourse(course: any) {
    return dataStore.setCourse(course);
  }

  getCourse(courseId: string) {
    return dataStore.getCourse(courseId);
  }
}

export const sdk = new SmartSportsTrainingSDK();
export default SmartSportsTrainingSDK;
