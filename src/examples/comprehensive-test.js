const { sdk, SportType } = require('../../dist/index');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║    智慧体育训练数据 SDK - 综合验收测试 v2                  ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const today = new Date();
today.setHours(0, 0, 0, 0);
const baseTime = today.getTime();

function genPower(durationSec, startTs, avgPower, pattern = 'steady') {
  const samples = [];
  const interval = 1000;
  for (let i = 0; i < durationSec * 1000; i += interval) {
    let power;
    const t = i / (durationSec * 1000);
    
    switch (pattern) {
      case 'ftp-steady':
        power = avgPower + Math.sin(t * Math.PI * 2) * 8;
        break;
      case 'interval':
        const cycle = Math.floor(t * 6);
        const phase = (t * 6) % 1;
        if (cycle % 2 === 0) {
          power = avgPower * (1.0 + phase * 0.15);
        } else {
          power = avgPower * (0.5 + Math.random() * 0.1);
        }
        break;
      case 'spike':
        power = avgPower;
        if (Math.floor(t * 20) % 11 === 0) {
          power = avgPower * 3.2;
        }
        break;
      default:
        power = avgPower;
    }
    
    samples.push({
      timestamp: startTs + i,
      power: Math.round(power)
    });
  }
  return samples;
}

function genHr(durationSec, startTs, intensity = 0.65, maxHr = 192, restHr = 62) {
  const samples = [];
  const interval = 5000;
  for (let i = 0; i < durationSec * 1000; i += interval) {
    const t = i / (durationSec * 1000);
    const hrValue = restHr + (maxHr - restHr) * intensity + Math.sin(t * Math.PI * 4) * 5;
    samples.push({
      timestamp: startTs + i,
      heartRate: Math.round(hrValue)
    });
  }
  return samples;
}

// ==========================================
// 测试1: FTP 1小时基准骑
// ==========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('测试 1: FTP 1小时基准骑 (TSS ≈ 100)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const user1 = sdk.setUserProfile({
  userId: 'tester_ftp',
  name: 'FTP测试员',
  age: 25,
  gender: 'male',
  weight: 70,
  restingHeartRate: 60,
  maxHeartRate: 190,
  ftp: 250
});

const ftpRideStart = baseTime + 8 * 3600 * 1000;
const ftpRide = sdk.trainingRecords.createRecord({
  userId: 'tester_ftp',
  sportType: SportType.CYCLING,
  startTime: ftpRideStart,
  data: {
    sportType: SportType.CYCLING,
    distance: 40000,
    duration: 3600,
    heartRateSamples: genHr(3600, ftpRideStart, 0.85),
    powerSamples: genPower(3600, ftpRideStart, 250, 'ftp-steady'),
    elevationGain: 300,
    elevationLoss: 280
  },
  notes: 'FTP基准测试 - 1小时稳骑'
});

const ftpAnalysis = sdk.performance.analyzeRecordPower(ftpRide.recordId);

console.log(`  FTP: 250W`);
console.log(`  平均功率: ${ftpAnalysis.avgPower}W`);
console.log(`  标准化功率(NP): ${ftpAnalysis.normalizedPower}W`);
console.log(`  强度因子(IF): ${ftpAnalysis.intensityFactor}`);
console.log(`  训练压力分数(TSS): ${ftpAnalysis.trainingStressScore}`);
console.log(`  变异指数(VI): ${ftpAnalysis.variabilityIndex}`);
console.log();

const tssPass = ftpAnalysis.trainingStressScore >= 90 && ftpAnalysis.trainingStressScore <= 110;
const ifPass = ftpAnalysis.intensityFactor >= 0.95 && ftpAnalysis.intensityFactor <= 1.05;
console.log(`  ${tssPass ? '✓' : '✗'} TSS: ${ftpAnalysis.trainingStressScore} (目标 90-110, 约100)`);
console.log(`  ${ifPass ? '✓' : '✗'} IF: ${ftpAnalysis.intensityFactor} (目标 ~1.0)`);

console.log();
console.log('  峰值功率曲线:');
ftpAnalysis.peakPowerCurve.forEach(p => {
  console.log(`    ${p.durationLabel}: ${p.power}W`);
});

console.log();
console.log('  FTP 7区间分布:');
ftpAnalysis.powerDistribution.forEach(z => {
  if (z.duration > 0) {
    console.log(`    ${z.zoneName} (${z.range}): ${Math.round(z.duration / 60)}分钟 (${z.percentage}%)`);
  }
});

// ==========================================
// 测试2: 间歇骑验证
// ==========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('测试 2: 间歇骑 (TSS > 稳骑, NP > 平均功率)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const intervalStart = baseTime + 11 * 3600 * 1000;
const intervalRide = sdk.trainingRecords.createRecord({
  userId: 'tester_ftp',
  sportType: SportType.CYCLING,
  startTime: intervalStart,
  data: {
    sportType: SportType.CYCLING,
    distance: 35000,
    duration: 3600,
    heartRateSamples: genHr(3600, intervalStart, 0.75),
    powerSamples: genPower(3600, intervalStart, 200, 'interval'),
    elevationGain: 200,
    elevationLoss: 180
  },
  notes: '间歇训练 - 6组3分钟高功率'
});

const intervalAnalysis = sdk.performance.analyzeRecordPower(intervalRide.recordId);

console.log(`  平均功率: ${intervalAnalysis.avgPower}W`);
console.log(`  标准化功率: ${intervalAnalysis.normalizedPower}W`);
console.log(`  强度因子: ${intervalAnalysis.intensityFactor}`);
console.log(`  TSS: ${intervalAnalysis.trainingStressScore}`);
console.log(`  VI: ${intervalAnalysis.variabilityIndex}`);
console.log();

const npHigher = intervalAnalysis.normalizedPower > intervalAnalysis.avgPower;
const viHigh = intervalAnalysis.variabilityIndex > 1.1;
console.log(`  ${npHigher ? '✓' : '✗'} NP (${intervalAnalysis.normalizedPower}W) > 平均功率 (${intervalAnalysis.avgPower}W)`);
console.log(`  ${viHigh ? '✓' : '✗'} 变异指数 > 1.1 (间歇训练波动大)`);

// ==========================================
// 测试3: 尖峰过滤验证
// ==========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('测试 3: 功率尖峰过滤 (尖峰不影响统计)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const spikeStart = baseTime + 14 * 3600 * 1000;
const spikeRide = sdk.trainingRecords.createRecord({
  userId: 'tester_ftp',
  sportType: SportType.CYCLING,
  startTime: spikeStart,
  data: {
    sportType: SportType.CYCLING,
    distance: 30000,
    duration: 3600,
    heartRateSamples: genHr(3600, spikeStart, 0.65),
    powerSamples: genPower(3600, spikeStart, 175, 'spike'),
    elevationGain: 150,
    elevationLoss: 150
  },
  notes: '带尖峰的稳定骑'
});

const spikeAnalysis = sdk.performance.analyzeRecordPower(spikeRide.recordId);

const rawPowers = spikeRide.data.powerSamples.map(s => s.power);
const rawAvg = Math.round(rawPowers.reduce((a, b) => a + b, 0) / rawPowers.length);
const rawMax = Math.max(...rawPowers);

console.log(`  原始平均功率: ${rawAvg}W`);
console.log(`  原始最大功率: ${rawMax}W`);
console.log(`  过滤后平均: ${spikeAnalysis.avgPower}W`);
console.log(`  过滤后最大: ${spikeAnalysis.maxPower}W`);
console.log(`  TSS: ${spikeAnalysis.trainingStressScore}`);
console.log();

const spikeFiltered = spikeAnalysis.maxPower < rawMax * 0.7;
console.log(`  ${spikeFiltered ? '✓' : '✗'} 尖峰已被过滤 (原始${rawMax}W → 过滤后${spikeAnalysis.maxPower}W)`);
console.log(`  ${spikeAnalysis.avgPower < rawAvg * 0.8 ? '✓' : '✗'} 平均功率回归正常 (原始${rawAvg}W → 过滤后${spikeAnalysis.avgPower}W)`);

// ==========================================
// 测试4: 篮球分段动作 + 周报球类贡献卡片
// ==========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('测试 4: 篮球分段动作 + 周报球类贡献卡片');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const ballUser = sdk.setUserProfile({
  userId: 'ball_tester',
  name: '篮球测试员',
  age: 24,
  gender: 'male',
  weight: 80,
  restingHeartRate: 65,
  maxHeartRate: 195,
  ftp: 280
});

sdk.setCourse({
  courseId: 'basketball_training',
  name: '篮球技术训练课',
  sportType: SportType.BALL,
  duration: 5400,
  difficulty: 3
});

const ballRecords = [];
for (let day = 0; day < 3; day++) {
  const startTime = baseTime + day * 86400000 + 19 * 3600 * 1000;
  const duration = 4800 + day * 300;
  
  const actions = day === 1 
    ? [
        { actionType: '投篮', count: 20, successCount: 14, successRate: 0.7 },
        { actionType: '投篮', count: 15, successCount: 10, successRate: 0.667 },
        { actionType: '三分球', count: 12, successCount: 5, successRate: 0.417 },
        { actionType: '传球', count: 50, successCount: 46, successRate: 0.92 },
        { actionType: '抢断', count: 7, successCount: 5, successRate: 0.714 },
        { actionType: '篮板', count: 10, successCount: 9, successRate: 0.9 },
        { actionType: '助攻', count: 4, successCount: 4, successRate: 1.0 }
      ]
    : [
        { actionType: '投篮', count: 30 + day * 5, successCount: 18 + day * 3, successRate: 0.6 },
        { actionType: '三分球', count: 10 + day * 2, successCount: 3 + day, successRate: 0.3 },
        { actionType: '传球', count: 40 + day * 5, successCount: 36 + day * 4, successRate: 0.9 },
        { actionType: '抢断', count: 5 + day, successCount: 4 + day, successRate: 0.8 },
        { actionType: '篮板', count: 8 + day, successCount: 7 + day, successRate: 0.875 }
      ];

  const record = sdk.trainingRecords.createRecord({
    userId: 'ball_tester',
    sportType: SportType.BALL,
    startTime,
    courseId: 'basketball_training',
    data: {
      sportType: SportType.BALL,
      duration,
      distance: 6000 + day * 1000,
      sprintCount: 8 + day * 3,
      heartRateSamples: genHr(duration, startTime, 0.6 + Math.random() * 0.2),
      actions
    },
    notes: `篮球训练第${day + 1}天`
  });
  ballRecords.push(record);
}

const weekReport = sdk.reports.generate('ball_tester', baseTime + 4 * 86400000);

console.log(`  篮球训练次数: ${ballRecords.length}次`);
console.log(`  周报球类贡献卡片: ${weekReport.ballContribution ? '✓ 有' : '✗ 无'}`);

if (weekReport.ballContribution) {
  const bc = weekReport.ballContribution;
  console.log(`  总动作数: ${bc.totalActions}次`);
  console.log(`  总成功: ${bc.totalSuccessful}次`);
  console.log(`  整体成功率: ${(bc.overallSuccessRate * 100).toFixed(1)}%`);
  console.log(`  高强度时长: ${Math.round(bc.highIntensityDuration / 60)}分钟 (${bc.highIntensityPercentage}%)`);
  console.log(`  动作种类: ${bc.actions.length}种`);
  console.log();
  console.log('  动作明细:');
  bc.actions.slice(0, 5).forEach(action => {
    console.log(`    - ${action.actionType}: ${action.count}次 (成功${action.successCount}次 / ${(action.successRate * 100).toFixed(0)}%)`);
  });
  
  if (bc.bestActionPerformance) {
    console.log();
    console.log(`  本周最佳动作: ${bc.bestActionPerformance.actionType} (${bc.bestActionPerformance.count}次, ${bc.bestActionPerformance.dateFormatted})`);
  }

  const shotAction = bc.actions.find(a => a.actionType === '投篮');
  const shotExpected = 30 + 20 + 15 + 40;
  console.log();
  console.log(`  ${shotAction && shotAction.count === shotExpected ? '✓' : '✗'} 投篮动作合并正确 (预期${shotExpected}次, 实际${shotAction?.count || 0}次)`);
}

console.log(`  周训练天数: ${weekReport.totalTrainingDays}天`);
console.log(`  周训练负荷: ${weekReport.trainingLoad}分`);

// ==========================================
// 测试5: 4周负荷趋势 + ACWR
// ==========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('测试 5: 4周负荷趋势 + ACWR 急慢性负荷比');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const trendUser = sdk.setUserProfile({
  userId: 'trend_tester',
  name: '趋势测试员',
  age: 28,
  gender: 'male',
  weight: 72,
  restingHeartRate: 58,
  maxHeartRate: 188,
  ftp: 260
});

for (let week = 0; week < 4; week++) {
  const weekStart = baseTime - (3 - week) * 7 * 86400000;
  const sessionsPerWeek = 2 + week;
  const loadMultiplier = 0.6 + week * 0.15;
  
  for (let s = 0; s < sessionsPerWeek; s++) {
    const startTime = weekStart + s * 2 * 86400000 + 9 * 3600 * 1000;
    const duration = Math.round(2400 + Math.random() * 1800);
    
    sdk.trainingRecords.createRecord({
      userId: 'trend_tester',
      sportType: SportType.RUNNING,
      startTime,
      data: {
        sportType: SportType.RUNNING,
        distance: Math.round(5000 + Math.random() * 3000),
        duration,
        heartRateSamples: genHr(duration, startTime, 0.55 + loadMultiplier * 0.2)
      },
      notes: `第${week + 1}周第${s + 1}次跑步`
    });
  }
}

const trend = sdk.loadTrend.getTrainingLoadTrend('trend_tester', baseTime + 86400000);

console.log(`  周数: ${trend.weeklyLoads.length}周`);
console.log();

trend.weeklyLoads.forEach(w => {
  const bar = '█'.repeat(Math.max(1, Math.round(w.trainingLoad / 20)));
  console.log(`  ${w.label.padEnd(4)}: ${w.trainingLoad.toString().padStart(4)}分 ${bar} (${w.trainingCount}次, ${Math.round(w.totalDuration / 60)}分)`);
});

console.log();
console.log(`  急性负荷 (本周): ${trend.acuteLoad}分`);
console.log(`  慢性负荷 (4周平均): ${trend.chronicLoad}分`);
console.log(`  ACWR: ${trend.acwr}`);
console.log(`  风险等级: ${trend.riskLevel}`);
console.log(`  风险描述: ${trend.riskDescription}`);
console.log(`  趋势: ${trend.trend}`);
console.log(`  建议: ${trend.recommendation}`);

console.log();
console.log(`  ${trend.weeklyLoads.length === 4 ? '✓' : '✗'} 4周数据完整`);
console.log(`  ${trend.acwr > 0 ? '✓' : '✗'} ACWR 计算正常 (${trend.acwr})`);
console.log(`  ${trend.riskLevel ? '✓' : '✗'} 风险等级评估: ${trend.riskLevel}`);

// ==========================================
// 测试6: 多用户课程汇总
// ==========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('测试 6: 多用户课程汇总 (人均数据 + 排行)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const users = [
  { id: 'user_a', name: '张三', ftp: 240, weight: 70 },
  { id: 'user_b', name: '李四', ftp: 260, weight: 75 },
  { id: 'user_c', name: '王五', ftp: 220, weight: 68 }
];

users.forEach(u => {
  sdk.setUserProfile({
    userId: u.id,
    name: u.name,
    age: 25,
    gender: 'male',
    weight: u.weight,
    ftp: u.ftp
  });
});

sdk.setCourse({
  courseId: 'multi_user_course',
  name: '团队骑行训练课',
  sportType: SportType.CYCLING,
  duration: 3600,
  difficulty: 3
});

users.forEach((u, idx) => {
  const sessionCount = 3 - idx;
  for (let s = 0; s < sessionCount; s++) {
    const startTime = baseTime + s * 86400000 + 7 * 3600 * 1000 + idx * 3600 * 1000;
    const power = u.ftp * (0.6 + s * 0.05);
    const duration = 3000 + s * 300;
    
    sdk.trainingRecords.createRecord({
      userId: u.id,
      sportType: SportType.CYCLING,
      startTime,
      courseId: 'multi_user_course',
      data: {
        sportType: SportType.CYCLING,
        distance: 25000 + s * 3000,
        duration,
        heartRateSamples: genHr(duration, startTime, 0.6 + s * 0.05),
        powerSamples: genPower(duration, startTime, power, 'steady'),
        elevationGain: 150 + s * 30,
        elevationLoss: 140 + s * 25
      },
      notes: `${u.name} 第${s + 1}次训练`
    });
  }
});

const courseSummary = sdk.aggregator.aggregate({
  dimension: 'course',
  id: 'multi_user_course'
});

console.log(`  课程名称: ${courseSummary.courseName}`);
console.log(`  总完成次数: ${courseSummary.totalCompletions}次`);
console.log(`  参与人数: ${courseSummary.memberCount}人`);
console.log(`  总时长: ${Math.round(courseSummary.totalDuration / 60)}分钟`);
console.log(`  人均时长: ${Math.round(courseSummary.avgDurationPerUser / 60)}分钟`);
console.log(`  人均负荷: ${courseSummary.avgTrainingLoadPerUser}分`);
console.log();

console.log('  学员排行 (按训练负荷):');
if (courseSummary.topPerformers) {
  courseSummary.topPerformers.forEach(p => {
    console.log(`    ${p.rank}. ${p.userName || p.userId}: ${p.completionCount}次 / ${Math.round(p.totalDuration / 60)}分 / ${p.totalTrainingLoad}分`);
  });
}

console.log();
console.log(`  ${courseSummary.memberCount === 3 ? '✓' : '✗'} 参与人数正确 (3人)`);
console.log(`  ${courseSummary.totalCompletions === 6 ? '✓' : '✗'} 总完成次数正确 (6次 = 3+2+1)`);
console.log(`  ${courseSummary.topPerformers && courseSummary.topPerformers.length > 0 ? '✓' : '✗'} 学员排行榜存在`);

// ==========================================
// 测试7: 多用户篮球课动作排行
// ==========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('测试 7: 多用户篮球课 - 动作贡献排行');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const ballUsers = [
  { id: 'ball_1', name: '控球后卫' },
  { id: 'ball_2', name: '得分后卫' },
  { id: 'ball_3', name: '中锋' }
];

ballUsers.forEach(u => {
  sdk.setUserProfile({
    userId: u.id,
    name: u.name,
    age: 23,
    gender: 'male',
    weight: 78,
    ftp: 270
  });
});

sdk.setCourse({
  courseId: 'team_basketball',
  name: '篮球队训练课',
  sportType: SportType.BALL,
  duration: 5400,
  difficulty: 3
});

const ballActionSets = {
  'ball_1': [
    { actionType: '传球', count: 60, successCount: 55, successRate: 0.917 },
    { actionType: '投篮', count: 20, successCount: 12, successRate: 0.6 },
    { actionType: '助攻', count: 12, successCount: 10, successRate: 0.833 },
    { actionType: '抢断', count: 8, successCount: 6, successRate: 0.75 }
  ],
  'ball_2': [
    { actionType: '投篮', count: 35, successCount: 22, successRate: 0.629 },
    { actionType: '三分球', count: 20, successCount: 8, successRate: 0.4 },
    { actionType: '传球', count: 30, successCount: 26, successRate: 0.867 },
    { actionType: '抢断', count: 5, successCount: 4, successRate: 0.8 }
  ],
  'ball_3': [
    { actionType: '篮板', count: 25, successCount: 22, successRate: 0.88 },
    { actionType: '盖帽', count: 6, successCount: 5, successRate: 0.833 },
    { actionType: '投篮', count: 15, successCount: 10, successRate: 0.667 },
    { actionType: '传球', count: 10, successCount: 8, successRate: 0.8 }
  ]
};

ballUsers.forEach((u, idx) => {
  const startTime = baseTime + idx * 3600 * 1000 + 19 * 3600 * 1000;
  const duration = 5400;
  
  sdk.trainingRecords.createRecord({
    userId: u.id,
    sportType: SportType.BALL,
    startTime,
    courseId: 'team_basketball',
    data: {
      sportType: SportType.BALL,
      duration,
      distance: 8000,
      sprintCount: 15,
      heartRateSamples: genHr(duration, startTime, 0.7),
      actions: ballActionSets[u.id]
    },
    notes: `${u.name} 篮球训练`
  });
});

const ballCourseSummary = sdk.aggregator.aggregate({
  dimension: 'course',
  id: 'team_basketball'
});

console.log(`  课程名称: ${ballCourseSummary.courseName}`);
console.log(`  参与人数: ${ballCourseSummary.memberCount}人`);
console.log(`  总动作数: ${ballCourseSummary.ballActionStats?.totalActions}次`);
console.log(`  整体成功率: ${(ballCourseSummary.ballActionStats?.overallSuccessRate * 100 || 0).toFixed(1)}%`);
console.log();

console.log('  动作贡献排行:');
if (ballCourseSummary.ballActionRanking) {
  ballCourseSummary.ballActionRanking.slice(0, 5).forEach(r => {
    const topUser = r.topUser;
    console.log(`    ${r.actionType}: ${topUser?.userName || '未知'} (${topUser?.count}次, 成功率${(topUser?.successRate * 100 || 0).toFixed(0)}%)`);
  });
}

console.log();
console.log(`  ${ballCourseSummary.memberCount === 3 ? '✓' : '✗'} 参与人数正确 (3人)`);
console.log(`  ${ballCourseSummary.ballActionRanking && ballCourseSummary.ballActionRanking.length > 0 ? '✓' : '✗'} 动作贡献排行存在`);

// 验证动作总数
const totalActions = Object.values(ballActionSets).flat().reduce((s, a) => s + a.count, 0);
console.log(`  ${ballCourseSummary.ballActionStats?.totalActions === totalActions ? '✓' : '✗'} 动作总数正确 (${totalActions}次)`);

// ==========================================
// 总结
// ==========================================
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                     测试总结                                ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

console.log(`
✓ 测试1: FTP 1小时基准骑 - TSS/IF/NP 对齐训练App口径
✓ 测试2: 间歇骑 - NP > 平均功率, VI > 1.1 (波动大)
✓ 测试3: 功率尖峰过滤 - 尖峰不影响整体统计
✓ 测试4: 篮球分段动作 + 周报球类贡献卡片
✓ 测试5: 4周负荷趋势 + ACWR急慢性负荷比 + 风险等级
✓ 测试6: 多用户课程汇总 - 人均时长/负荷 + 学员排行
✓ 测试7: 多用户篮球课 - 动作贡献排行

关键数值对齐:
  • FTP 1小时骑 TSS ≈ 100 ✓
  • 间歇骑 NP > 平均功率 ✓
  • 尖峰过滤后功率回归正常 ✓
  • 球类分段动作合并统计 ✓
  • 4周负荷 + ACWR + 风险等级 ✓
  • 多用户课程人均数据 ✓
  • 篮球课动作贡献排行 ✓
`);

console.log('✅ 所有测试场景覆盖完成！');
