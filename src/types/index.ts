export enum SportType {
  RUNNING = 'running',
  CYCLING = 'cycling',
  STRENGTH = 'strength',
  BALL = 'ball'
}

export enum HeartRateZone {
  REST = 'rest',
  WARM_UP = 'warm_up',
  FAT_BURN = 'fat_burn',
  AEROBIC = 'aerobic',
  ANAEROBIC = 'anaerobic',
  MAXIMUM = 'maximum'
}

export enum FatigueLevel {
  NONE = 'none',
  MILD = 'mild',
  MODERATE = 'moderate',
  HIGH = 'high',
  EXTREME = 'extreme'
}

export enum AnomalyType {
  HEART_RATE_TOO_HIGH = 'heart_rate_too_high',
  HEART_RATE_TOO_LOW = 'heart_rate_too_low',
  HEART_RATE_IRREGULAR = 'heart_rate_irregular',
  PACE_ABNORMAL = 'pace_abnormal',
  POWER_SPIKE = 'power_spike',
  DATA_GAP = 'data_gap',
  INCONSISTENT_DISTANCE = 'inconsistent_distance'
}

export interface UserProfile {
  userId: string;
  name?: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  height?: number;
  weight?: number;
  restingHeartRate?: number;
  maxHeartRate?: number;
  thresholdHeartRate?: number;
  ftp?: number;
  teamId?: string;
}

export interface Team {
  teamId: string;
  name: string;
  memberIds: string[];
  coachId?: string;
}

export interface Course {
  courseId: string;
  name: string;
  sportType: SportType;
  duration: number;
  difficulty: number;
}

export interface HeartRateSample {
  timestamp: number;
  heartRate: number;
}

export interface LocationSample {
  timestamp: number;
  latitude: number;
  longitude: number;
  altitude?: number;
  speed?: number;
}

export interface PowerSample {
  timestamp: number;
  power: number;
}

export interface CadenceSample {
  timestamp: number;
  cadence: number;
}

export interface MotionSample {
  timestamp: number;
  accelerationX: number;
  accelerationY: number;
  accelerationZ: number;
  gyroX?: number;
  gyroY?: number;
  gyroZ?: number;
}

export interface StrengthSet {
  exerciseName: string;
  weight: number;
  reps: number;
  duration?: number;
  restTime?: number;
}

export interface BallAction {
  actionType: string;
  count: number;
  successRate?: number;
}

export interface RunningTrainingData {
  sportType: SportType.RUNNING;
  distance: number;
  duration: number;
  heartRateSamples?: HeartRateSample[];
  locationSamples?: LocationSample[];
  cadenceSamples?: CadenceSample[];
  paceSamples?: { timestamp: number; pace: number }[];
  elevationGain?: number;
  elevationLoss?: number;
  steps?: number;
}

export interface CyclingTrainingData {
  sportType: SportType.CYCLING;
  distance: number;
  duration: number;
  heartRateSamples?: HeartRateSample[];
  powerSamples?: PowerSample[];
  cadenceSamples?: CadenceSample[];
  locationSamples?: LocationSample[];
  speedSamples?: { timestamp: number; speed: number }[];
  elevationGain?: number;
  elevationLoss?: number;
}

export interface StrengthTrainingData {
  sportType: SportType.STRENGTH;
  duration: number;
  heartRateSamples?: HeartRateSample[];
  motionSamples?: MotionSample[];
  sets: StrengthSet[];
  totalVolume?: number;
}

export interface BallTrainingData {
  sportType: SportType.BALL;
  duration: number;
  heartRateSamples?: HeartRateSample[];
  locationSamples?: LocationSample[];
  distance?: number;
  actions?: BallAction[];
  sprintCount?: number;
}

export type TrainingData = RunningTrainingData | CyclingTrainingData | StrengthTrainingData | BallTrainingData;

export interface TrainingRecordInput {
  userId: string;
  sportType: SportType;
  startTime: number;
  endTime?: number;
  data: TrainingData;
  courseId?: string;
  notes?: string;
}

export interface TrainingRecord {
  recordId: string;
  userId: string;
  sportType: SportType;
  startTime: number;
  endTime: number;
  duration: number;
  data: TrainingData;
  courseId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface HeartRateZoneResult {
  zone: HeartRateZone;
  name: string;
  minHr: number;
  maxHr: number;
  duration: number;
  percentage: number;
}

export interface HeartRateAnalysis {
  avgHeartRate: number;
  maxHeartRate: number;
  minHeartRate: number;
  zones: HeartRateZoneResult[];
  hrv?: number;
  trainingLoad: number;
}

export interface PaceSegment {
  segmentIndex: number;
  distance: number;
  duration: number;
  pace: number;
  avgHeartRate?: number;
}

export interface PaceAnalysis {
  avgPace: number;
  bestPace: number;
  paceSegments: PaceSegment[];
  paceVariation: number;
}

export interface PowerAnalysis {
  avgPower: number;
  maxPower: number;
  normalizedPower: number;
  powerDistribution: { range: string; duration: number; percentage: number }[];
  trainingStressScore?: number;
  intensityFactor?: number;
  variabilityIndex?: number;
}

export interface MotionCount {
  exerciseName: string;
  count: number;
  quality?: number;
}

export interface MotionAnalysis {
  totalReps: number;
  exercises: MotionCount[];
  avgRestTime?: number;
  totalVolume?: number;
}

export interface FatigueScore {
  score: number;
  level: FatigueLevel;
  factors: {
    factor: string;
    weight: number;
    value: number;
    description: string;
  }[];
  recoveryAdvice: string[];
  estimatedRecoveryTime: number;
}

export interface PersonalGoal {
  goalId: string;
  userId: string;
  sportType?: SportType;
  goalType: 'distance' | 'duration' | 'calories' | 'frequency' | 'performance';
  targetValue: number;
  currentValue: number;
  unit: string;
  startDate: number;
  endDate: number;
  status: 'active' | 'completed' | 'failed';
}

export interface TeamRankingEntry {
  rank: number;
  userId: string;
  userName?: string;
  score: number;
  metric: string;
  value: number;
  trend?: 'up' | 'down' | 'stable';
}

export interface TeamRanking {
  teamId: string;
  metric: string;
  period: 'week' | 'month' | 'all';
  rankings: TeamRankingEntry[];
  updatedAt: number;
}

export interface AnomalyAlert {
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high';
  message: string;
  timestamp?: number;
  value?: number;
  expectedRange?: { min: number; max: number };
  suggestion?: string;
}

export interface SegmentPerformance {
  segmentIndex: number;
  distance?: number;
  duration: number;
  avgHeartRate?: number;
  pace?: number;
  power?: number;
  performanceIndex: number;
}

export interface BestPerformance {
  distance?: number;
  time?: number;
  pace?: number;
  power?: number;
  date: number;
  recordId: string;
}

export interface TrainingLoadChange {
  currentLoad: number;
  previousLoad: number;
  changePercentage: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  recommendation: string;
}

export interface WeeklyReport {
  userId: string;
  weekStart: number;
  weekEnd: number;
  totalTrainingDays: number;
  totalDuration: number;
  totalDistance?: number;
  avgHeartRate?: number;
  trainingLoad: number;
  loadChange: TrainingLoadChange;
  bestPerformances: BestPerformance[];
  recoveryAdvice: string[];
  sportDistribution: { sportType: SportType; duration: number; count: number }[];
  trends: {
    metric: string;
    values: { day: number; value: number }[];
    trend: 'up' | 'down' | 'stable';
  }[];
  summary: string;
}

export interface UserSummary {
  userId: string;
  totalTrainingCount: number;
  totalDuration: number;
  totalDistance?: number;
  avgTrainingLoad: number;
  recentTrend: 'up' | 'down' | 'stable';
}

export interface TeamSummary {
  teamId: string;
  memberCount: number;
  totalTrainingCount: number;
  totalDuration: number;
  avgTrainingLoad: number;
  topPerformers: TeamRankingEntry[];
}

export interface CourseSummary {
  courseId: string;
  totalCompletions: number;
  avgDuration: number;
  avgScore?: number;
  difficultyRating?: number;
}

export interface AggregationOptions {
  dimension: 'user' | 'team' | 'course';
  id?: string;
  sportType?: SportType;
  startDate?: number;
  endDate?: number;
  metrics?: string[];
}
