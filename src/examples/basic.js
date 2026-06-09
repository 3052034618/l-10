const { sdk, SportType, HeartRateZone, FatigueLevel } = require('../../dist/index');

console.log('========== 智慧体育训练数据 SDK 演示 ==========\n');

console.log('1. 设置用户档案');
const userProfile = {
  userId: 'user_001',
  name: '张三',
  age: 28,
  gender: 'male',
  height: 178,
  weight: 72,
  restingHeartRate: 62,
  maxHeartRate: 192,
  ftp: 250,
  teamId: 'team_001'
};
sdk.setUserProfile(userProfile);
console.log('   用户:', userProfile.name, '年龄:', userProfile.age);

console.log('\n2. 创建团队');
const team = sdk.setTeam({
  teamId: 'team_001',
  name: '飞人跑团',
  memberIds: ['user_001', 'user_002', 'user_003'],
  coachId: 'coach_001'
});
console.log('   团队:', team.name, '成员数:', team.memberIds.length);

console.log('\n3. 创建跑步训练记录');
const startTime = Date.now() - 3600 * 1000;

const hrSamples = [];
for (let i = 0; i < 60; i++) {
  const t = startTime + i * 60 * 1000;
  let hr = 120 + i * 1.2;
  if (i > 30) hr = 150 + (i - 30) * 0.5;
  if (i > 50) hr = 170 - (i - 50) * 3;
  hrSamples.push({
    timestamp: t,
    heartRate: Math.round(hr + (Math.random() - 0.5) * 5)
  });
}

const runningRecord = sdk.trainingRecords.createRecord({
  userId: 'user_001',
  sportType: SportType.RUNNING,
  startTime: startTime,
  data: {
    sportType: SportType.RUNNING,
    distance: 10000,
    duration: 3600,
    heartRateSamples: hrSamples,
    elevationGain: 45,
    elevationLoss: 42,
    steps: 12500
  },
  notes: '清晨慢跑训练'
});
console.log('   记录ID:', runningRecord.recordId);
console.log('   运动类型:', runningRecord.sportType);
console.log('   距离:', runningRecord.data.distance, '米');
console.log('   时长:', Math.round(runningRecord.duration / 60), '分钟');

console.log('\n4. 心率区间分析');
const hrAnalysis = sdk.heartRate.analyzeRecord(runningRecord.recordId);
if (hrAnalysis) {
  console.log('   平均心率:', hrAnalysis.avgHeartRate, 'bpm');
  console.log('   最高心率:', hrAnalysis.maxHeartRate, 'bpm');
  console.log('   训练负荷:', hrAnalysis.trainingLoad, 'TRIMP');
  console.log('   心率区间分布:');
  hrAnalysis.zones.forEach(zone => {
    const bar = '█'.repeat(Math.round(zone.percentage / 5));
    console.log(`     ${zone.name.padEnd(4)}: ${bar.padEnd(20)} ${zone.percentage.toFixed(1)}% (${Math.round(zone.duration / 60)}分)`);
  });
}

console.log('\n5. 配速分析');
const paceAnalysis = sdk.performance.analyzeRecordPace(runningRecord.recordId);
if (paceAnalysis) {
  console.log('   平均配速:', formatPace(paceAnalysis.avgPace), '/km');
  console.log('   最佳配速:', formatPace(paceAnalysis.bestPace), '/km');
  console.log('   配速变异系数:', (paceAnalysis.paceVariation * 100).toFixed(2), '%');
  console.log('   分段表现:');
  paceAnalysis.paceSegments.slice(0, 5).forEach(seg => {
    console.log(`     第${seg.segmentIndex + 1}段: ${formatPace(seg.pace)}/km`);
  });
}

console.log('\n6. 分段表现');
const segments = sdk.trainingRecords.getSegmentPerformance(runningRecord.recordId, 5);
console.log('   5段表现指数:');
segments.forEach(seg => {
  const bar = '█'.repeat(Math.round(seg.performanceIndex / 5));
  console.log(`     第${seg.segmentIndex + 1}段: ${bar.padEnd(20)} ${seg.performanceIndex.toFixed(1)}分`);
});

console.log('\n7. 疲劳评分');
const fatigue = sdk.fatigue.calculate(runningRecord.recordId);
if (fatigue) {
  console.log('   疲劳评分:', fatigue.score, '/ 100');
  console.log('   疲劳等级:', fatigue.level);
  console.log('   预计恢复时间:', Math.round(fatigue.estimatedRecoveryTime / 3600), '小时');
  console.log('   影响因素:');
  fatigue.factors.forEach(f => {
    console.log(`     ${f.factor}: ${f.value} (权重${(f.weight * 100).toFixed(0)}%)`);
  });
  console.log('   恢复建议:');
  fatigue.recoveryAdvice.slice(0, 3).forEach(a => {
    console.log(`     - ${a}`);
  });
}

console.log('\n8. 异常数据检测');
const anomalies = sdk.anomalies.detect(runningRecord.recordId);
if (anomalies.length > 0) {
  anomalies.forEach(a => {
    console.log(`   [${a.severity.toUpperCase()}] ${a.type}: ${a.message}`);
  });
} else {
  console.log('   数据正常，未检测到异常');
}

console.log('\n9. 创建力量训练记录');
const strengthRecord = sdk.trainingRecords.createRecord({
  userId: 'user_001',
  sportType: SportType.STRENGTH,
  startTime: Date.now() - 7200 * 1000,
  data: {
    sportType: SportType.STRENGTH,
    duration: 2700,
    sets: [
      { exerciseName: '深蹲', weight: 80, reps: 12, restTime: 90 },
      { exerciseName: '深蹲', weight: 80, reps: 10, restTime: 90 },
      { exerciseName: '深蹲', weight: 80, reps: 8, restTime: 120 },
      { exerciseName: '卧推', weight: 60, reps: 12, restTime: 90 },
      { exerciseName: '卧推', weight: 60, reps: 10, restTime: 90 },
      { exerciseName: '硬拉', weight: 100, reps: 8, restTime: 120 },
      { exerciseName: '硬拉', weight: 100, reps: 6, restTime: 120 }
    ]
  }
});
console.log('   力量训练记录创建成功');

console.log('\n10. 动作计数分析');
const motionAnalysis = sdk.motion.analyzeRecord(strengthRecord.recordId);
if (motionAnalysis) {
  console.log('   总动作次数:', motionAnalysis.totalReps);
  console.log('   总训练容量:', motionAnalysis.totalVolume, 'kg');
  console.log('   各动作详情:');
  motionAnalysis.exercises.forEach(ex => {
    console.log(`     ${ex.exerciseName}: ${ex.count}次`);
  });
}

console.log('\n11. 个人目标管理');
const goal = sdk.goals.createGoal({
  userId: 'user_001',
  sportType: SportType.RUNNING,
  goalType: 'distance',
  targetValue: 50000,
  unit: '米',
  startDate: Date.now() - 7 * 24 * 3600 * 1000,
  endDate: Date.now() + 30 * 24 * 3600 * 1000
});
console.log('   目标ID:', goal.goalId);
console.log('   目标类型:', goal.goalType);
console.log('   目标值:', goal.targetValue, goal.unit);

sdk.goals.addTrainingToGoal(goal.goalId, runningRecord.recordId);
const progress = sdk.goals.calculateProgress(goal.goalId);
console.log('   当前进度:', progress, '%');

console.log('\n12. 创建骑行训练记录');
const powerSamples = [];
for (let i = 0; i < 60; i++) {
  const t = startTime + i * 60 * 1000;
  let power = 150 + Math.sin(i / 10) * 50;
  if (i > 20 && i < 30) power = 250 + Math.random() * 30;
  powerSamples.push({
    timestamp: t,
    power: Math.round(power)
  });
}

const cyclingRecord = sdk.trainingRecords.createRecord({
  userId: 'user_001',
  sportType: SportType.CYCLING,
  startTime: Date.now() - 5400 * 1000,
  data: {
    sportType: SportType.CYCLING,
    distance: 30000,
    duration: 5400,
    powerSamples: powerSamples,
    elevationGain: 320,
    elevationLoss: 310
  },
  notes: '周末公路骑行'
});
console.log('   骑行记录创建成功');

console.log('\n13. 功率分析');
const powerAnalysis = sdk.performance.analyzeRecordPower(cyclingRecord.recordId);
if (powerAnalysis) {
  console.log('   平均功率:', powerAnalysis.avgPower, 'W');
  console.log('   标准化功率:', powerAnalysis.normalizedPower, 'W');
  console.log('   最大功率:', powerAnalysis.maxPower, 'W');
  console.log('   TSS:', powerAnalysis.trainingStressScore?.toFixed(1));
  console.log('   IF:', powerAnalysis.intensityFactor?.toFixed(3));
  console.log('   VI:', powerAnalysis.variabilityIndex?.toFixed(3));
  console.log('   功率分布:');
  powerAnalysis.powerDistribution.forEach(p => {
    const bar = '█'.repeat(Math.round(p.percentage / 5));
    console.log(`     ${p.range.padEnd(12)}: ${bar.padEnd(20)} ${p.percentage}%`);
  });
}

console.log('\n14. 团队排行');
sdk.setUserProfile({ userId: 'user_002', name: '李四', age: 25 });
sdk.setUserProfile({ userId: 'user_003', name: '王五', age: 30 });

sdk.trainingRecords.createRecord({
  userId: 'user_002',
  sportType: SportType.RUNNING,
  startTime: Date.now() - 4000 * 1000,
  data: {
    sportType: SportType.RUNNING,
    distance: 8000,
    duration: 2800
  }
});

sdk.trainingRecords.createRecord({
  userId: 'user_003',
  sportType: SportType.RUNNING,
  startTime: Date.now() - 5000 * 1000,
  data: {
    sportType: SportType.RUNNING,
    distance: 12000,
    duration: 4500
  }
});

const ranking = sdk.rankings.generateRanking('team_001', 'duration', 'week');
if (ranking) {
  console.log('   周训练时长排行:');
  ranking.rankings.forEach(entry => {
    const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : '  ';
    const trendIcon = entry.trend === 'up' ? '↑' : entry.trend === 'down' ? '↓' : '→';
    console.log(`     ${medal} 第${entry.rank}名 ${(entry.userName || '未知').padEnd(6)} - ${Math.round(entry.value / 60)}分钟 ${trendIcon}`);
  });
}

console.log('\n15. 周报生成');
const report = sdk.reports.generate('user_001');
console.log('   周训练天数:', report.totalTrainingDays, '天');
console.log('   总训练时长:', Math.round(report.totalDuration / 60), '分钟');
if (report.totalDistance) {
  console.log('   总训练距离:', (report.totalDistance / 1000).toFixed(2), 'km');
}
console.log('   训练负荷:', report.trainingLoad);
console.log('   负荷变化:', report.loadChange.changePercentage, '%', `(${report.loadChange.trend})`);
console.log('   运动项目分布:');
report.sportDistribution.forEach(s => {
  console.log(`     ${s.sportType}: ${s.count}次, ${Math.round(s.duration / 60)}分钟`);
});
console.log('   周总结:', report.summary);

console.log('\n16. 数据汇总（用户维度）');
const userSummary = sdk.aggregator.aggregate({ dimension: 'user', id: 'user_001' });
if (userSummary && 'totalTrainingCount' in userSummary) {
  console.log('   训练总次数:', userSummary.totalTrainingCount);
  console.log('   总时长:', Math.round(userSummary.totalDuration / 60), '分钟');
  console.log('   近期趋势:', userSummary.recentTrend);
}

console.log('\n17. 数据汇总（团队维度）');
const teamSummary = sdk.aggregator.aggregate({ dimension: 'team', id: 'team_001' });
if (teamSummary && 'memberCount' in teamSummary) {
  console.log('   成员数:', teamSummary.memberCount);
  console.log('   总训练次数:', teamSummary.totalTrainingCount);
  console.log('   总时长:', Math.round(teamSummary.totalDuration / 60), '分钟');
  console.log('   最佳表现者:');
  teamSummary.topPerformers.slice(0, 3).forEach(p => {
    console.log(`     ${p.rank}. ${p.userName || '未知'}`);
  });
}

console.log('\n18. 最佳成绩');
const bestPerformances = sdk.trainingRecords.getBestPerformances('user_001', 'running', 3);
console.log('   跑步最佳成绩 (Top 3):');
bestPerformances.forEach((bp, i) => {
  console.log(`     ${i + 1}. ${(bp.distance / 1000).toFixed(2)}km - ${formatPace(bp.pace)}/km`);
});

console.log('\n========== 演示结束 ==========');

function formatPace(pace) {
  const minutes = Math.floor(pace / 60);
  const seconds = Math.round(pace % 60);
  return `${minutes}'${seconds.toString().padStart(2, '0')}"`;
}
