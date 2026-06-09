const { sdk, SportType } = require('../../dist/index');

const results = {
  passed: 0,
  failed: 0,
  failures: []
};

function assert(condition, testName, detail = '') {
  if (condition) {
    results.passed++;
    console.log(`  ✓ ${testName}`);
  } else {
    results.failed++;
    results.failures.push({ name: testName, detail });
    console.log(`  ✗ ${testName}${detail ? ' - ' + detail : ''}`);
  }
}

function assertApprox(actual, expected, tolerancePct, testName) {
  const diff = Math.abs(actual - expected);
  const pct = expected > 0 ? (diff / expected) * 100 : 0;
  const pass = pct <= tolerancePct;
  if (pass) {
    results.passed++;
    console.log(`  ✓ ${testName} (实际${actual}, 预期${expected}, 偏差${pct.toFixed(1)}% <= ${tolerancePct}%)`);
  } else {
    results.failed++;
    results.failures.push({ name: testName, detail: `实际${actual}, 预期${expected}, 偏差${pct.toFixed(1)}% > ${tolerancePct}%` });
    console.log(`  ✗ ${testName} (实际${actual}, 预期${expected}, 偏差${pct.toFixed(1)}% > ${tolerancePct}%)`);
  }
}

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   智慧体育训练数据 SDK - 验收测试 (严格模式 v2)            ║');
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
        power = avgPower + Math.sin(t * Math.PI * 2) * 5;
        break;
      case '30-30':
        const cycle2 = Math.floor(t * 60);
        if (cycle2 % 2 === 0) {
          power = avgPower * 1.45 + Math.random() * 15;
        } else {
          power = avgPower * 0.3 + Math.random() * 10;
        }
        break;
      case 'sprint-spike':
        power = avgPower * 0.7;
        const spikePositions = [0.1, 0.25, 0.45, 0.6, 0.8, 0.92];
        for (const pos of spikePositions) {
          if (Math.abs(t - pos) < 0.01) {
            power = avgPower * 2.5;
            break;
          }
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
// 测试组 1: 骑行功率 Golden Case
// ==========================================
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║ 测试组 1: 骑行功率 Golden Case                             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const ftpUser = sdk.setUserProfile({
  userId: 'golden_ftp',
  name: 'Golden Rider',
  age: 25,
  gender: 'male',
  weight: 70,
  ftp: 250
});

console.log('--- Golden Case 1: FTP 稳骑 1 小时 ---\n');
console.log('  预期: TSS ≈ 100, IF ≈ 1.0, NP ≈ FTP, VI ≈ 1.0 (±10%)\n');

const ftpStart = baseTime + 8 * 3600 * 1000;
const ftpRide = sdk.trainingRecords.createRecord({
  userId: 'golden_ftp',
  sportType: SportType.CYCLING,
  startTime: ftpStart,
  data: {
    sportType: SportType.CYCLING,
    distance: 40000,
    duration: 3600,
    heartRateSamples: genHr(3600, ftpStart, 0.85),
    powerSamples: genPower(3600, ftpStart, 250, 'ftp-steady'),
    elevationGain: 300,
    elevationLoss: 280
  }
});

const ftpAnalysis = sdk.performance.analyzeRecordPower(ftpRide.recordId);

console.log(`  实测值: NP=${ftpAnalysis.normalizedPower}W, IF=${ftpAnalysis.intensityFactor}, TSS=${ftpAnalysis.trainingStressScore}, VI=${ftpAnalysis.variabilityIndex}\n`);

assertApprox(ftpAnalysis.trainingStressScore, 100, 15, 'FTP稳骑 TSS ≈ 100');
assertApprox(ftpAnalysis.intensityFactor, 1.0, 10, 'FTP稳骑 IF ≈ 1.0');
assertApprox(ftpAnalysis.normalizedPower, 250, 10, 'FTP稳骑 NP ≈ 250W');
assertApprox(ftpAnalysis.variabilityIndex, 1.0, 10, 'FTP稳骑 VI ≈ 1.0');
assert(ftpAnalysis.peakPowerCurve && ftpAnalysis.peakPowerCurve.length >= 4,
  '峰值功率曲线至少4个点',
  `实际${ftpAnalysis.peakPowerCurve?.length || 0}个`);
assert(ftpAnalysis.powerDistribution.length === 7, 'FTP 7区间完整');

console.log('\n--- Golden Case 2: 30/30 间歇骑 ---\n');
console.log('  预期: NP > 平均功率, VI > 1.2, TSS > 稳骑同时长, 峰值功率> FTP*1.2\n');

const intvStart = baseTime + 11 * 3600 * 1000;
const intvRide = sdk.trainingRecords.createRecord({
  userId: 'golden_ftp',
  sportType: SportType.CYCLING,
  startTime: intvStart,
  data: {
    sportType: SportType.CYCLING,
    distance: 30000,
    duration: 3600,
    heartRateSamples: genHr(3600, intvStart, 0.75),
    powerSamples: genPower(3600, intvStart, 200, '30-30'),
    elevationGain: 150,
    elevationLoss: 140
  }
});

const intvAnalysis = sdk.performance.analyzeRecordPower(intvRide.recordId);

console.log(`  实测值: 平均=${intvAnalysis.avgPower}W, NP=${intvAnalysis.normalizedPower}W, TSS=${intvAnalysis.trainingStressScore}, VI=${intvAnalysis.variabilityIndex}\n`);

assert(intvAnalysis.normalizedPower > intvAnalysis.avgPower,
  '间歇骑 NP > 平均功率',
  `NP=${intvAnalysis.normalizedPower}, 平均=${intvAnalysis.avgPower}`);
assert(intvAnalysis.variabilityIndex > 1.15,
  '间歇骑 VI > 1.15 (波动大)',
  `实际 VI=${intvAnalysis.variabilityIndex}`);
assert(intvAnalysis.trainingStressScore > 60,
  '间歇骑 TSS > 60 (1小时中等强度)',
  `实际 TSS=${intvAnalysis.trainingStressScore}`);

const peak5s = intvAnalysis.peakPowerCurve?.find(p => p.duration === 5);
assert(peak5s && peak5s.power > 250 * 1.1,
  '5秒峰值功率 > FTP * 1.1',
  `5秒峰值=${peak5s?.power || 0}W`);

console.log('\n--- Golden Case 3: 带短冲刺尖峰的稳定骑 ---\n');
console.log('  预期: 尖峰被过滤, NP ≈ 基础功率, TSS 不受尖峰影响, 最大峰值 > FTP*2\n');

const spikeStart = baseTime + 14 * 3600 * 1000;
const spikeRide = sdk.trainingRecords.createRecord({
  userId: 'golden_ftp',
  sportType: SportType.CYCLING,
  startTime: spikeStart,
  data: {
    sportType: SportType.CYCLING,
    distance: 30000,
    duration: 3600,
    heartRateSamples: genHr(3600, spikeStart, 0.65),
    powerSamples: genPower(3600, spikeStart, 175, 'sprint-spike'),
    elevationGain: 100,
    elevationLoss: 100
  }
});

const spikeAnalysis = sdk.performance.analyzeRecordPower(spikeRide.recordId);

const rawPowers = spikeRide.data.powerSamples.map(s => s.power);
const rawMax = Math.max(...rawPowers);
const rawAvg = Math.round(rawPowers.reduce((a, b) => a + b, 0) / rawPowers.length);

console.log(`  原始: 平均${rawAvg}W / 最大${rawMax}W`);
console.log(`  统计: 平均${spikeAnalysis.avgPower}W / 最大${spikeAnalysis.maxPower}W / NP=${spikeAnalysis.normalizedPower}W\n`);

assert(spikeAnalysis.normalizedPower < rawMax * 0.7,
  '尖峰不影响 NP (NP < 原始最大的70%)',
  `原始${rawMax}W → NP${spikeAnalysis.normalizedPower}W`);
assert(spikeAnalysis.avgPower < rawAvg,
  '平均功率因过滤而降低',
  `原始${rawAvg}W → 过滤后${spikeAnalysis.avgPower}W`);
assertApprox(spikeAnalysis.trainingStressScore, 25, 30, '带尖峰骑 TSS ≈ 25 (低强度)');

const spikePeak5s = spikeAnalysis.peakPowerCurve?.find(p => p.duration === 5);
assert(spikePeak5s && spikePeak5s.power > rawAvg * 1.3,
  '峰值功率曲线反映短时间峰值',
  `5秒峰值=${spikePeak5s?.power || 0}W (基础${rawAvg}W)`);

// ==========================================
// 测试组 2: 篮球分段动作 + 周报球类卡片
// ==========================================
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║ 测试组 2: 篮球分段动作 + 周报球类贡献卡片                   ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const ballUser = sdk.setUserProfile({
  userId: 'ball_accept',
  name: '篮球验收员',
  age: 24,
  weight: 80,
  ftp: 280
});

sdk.setCourse({
  courseId: 'ball_course_acc',
  name: '篮球验收课',
  sportType: SportType.BALL,
  duration: 5400,
  difficulty: 3
});

const ballActionsPerDay = [
  [
    { actionType: '投篮', count: 30, successCount: 18, successRate: 0.6 },
    { actionType: '三分球', count: 10, successCount: 3, successRate: 0.3 },
    { actionType: '传球', count: 40, successCount: 36, successRate: 0.9 },
    { actionType: '抢断', count: 5, successCount: 4, successRate: 0.8 }
  ],
  [
    { actionType: '投篮', count: 20, successCount: 14, successRate: 0.7 },
    { actionType: '投篮', count: 15, successCount: 10, successRate: 0.667 },
    { actionType: '三分球', count: 12, successCount: 5, successRate: 0.417 },
    { actionType: '传球', count: 50, successCount: 46, successRate: 0.92 },
    { actionType: '抢断', count: 7, successCount: 5, successRate: 0.714 },
    { actionType: '篮板', count: 10, successCount: 9, successRate: 0.9 }
  ],
  [
    { actionType: '投篮', count: 25, successCount: 18, successRate: 0.72 },
    { actionType: '三分球', count: 15, successCount: 6, successRate: 0.4 },
    { actionType: '传球', count: 55, successCount: 50, successRate: 0.909 },
    { actionType: '抢断', count: 10, successCount: 8, successRate: 0.8 },
    { actionType: '篮板', count: 12, successCount: 10, successRate: 0.833 },
    { actionType: '盖帽', count: 3, successCount: 2, successRate: 0.667 }
  ]
];

for (let day = 0; day < 3; day++) {
  const startTime = baseTime + day * 86400000 + 19 * 3600 * 1000;
  const duration = 4800 + day * 300;
  
  sdk.trainingRecords.createRecord({
    userId: 'ball_accept',
    sportType: SportType.BALL,
    startTime,
    courseId: 'ball_course_acc',
    data: {
      sportType: SportType.BALL,
      duration,
      distance: 6000 + day * 1000,
      sprintCount: 8 + day * 3,
      heartRateSamples: genHr(duration, startTime, 0.65 + day * 0.05),
      actions: ballActionsPerDay[day]
    }
  });
}

const weeklyReport = sdk.reports.generate('ball_accept', baseTime + 4 * 86400000);

console.log('--- 周报球类贡献卡片 ---\n');

assert(weeklyReport.ballContribution !== undefined, '周报包含球类贡献卡片');

const bc = weeklyReport.ballContribution;
if (bc) {
  assert(bc.totalActions > 0, '总动作数 > 0', `实际${bc.totalActions}`);
  assert(bc.totalSuccessful > 0, '总成功数 > 0', `实际${bc.totalSuccessful}`);
  assert(bc.overallSuccessRate > 0 && bc.overallSuccessRate < 1, '成功率在合理范围', `实际${bc.overallSuccessRate}`);
  assert(bc.actions.length >= 5, '动作种类 >= 5', `实际${bc.actions.length}种`);
  assert(bc.highIntensityDuration >= 0, '高强度时长 >= 0', `实际${bc.highIntensityDuration}秒`);
  
  const shotAction = bc.actions.find(a => a.actionType === '投篮');
  assert(shotAction && shotAction.count === 90,
    '投篮动作合并正确 (30+35+25=90次)',
    `实际${shotAction?.count || 0}次`);
  
  const passAction = bc.actions.find(a => a.actionType === '传球');
  assert(passAction && passAction.count === 145,
    '传球动作合并正确 (40+50+55=145次)',
    `实际${passAction?.count || 0}次`);
  
  assert(bc.actions[0].count >= bc.actions[1].count, '动作按次数降序排列');
  
  if (bc.bestActionPerformance) {
    assert(bc.bestActionPerformance.actionType.length > 0, '本周最佳动作有名称');
    assert(bc.bestActionPerformance.count > 0, '本周最佳动作有次数');
    assert(bc.bestActionPerformance.dateFormatted.length > 0, '本周最佳动作有日期');
  }
}

console.log('\n--- 周报训练负荷解释层 ---\n');

assert(weeklyReport.loadInsights !== undefined, '周报包含负荷解释层');

const li = weeklyReport.loadInsights;
if (li) {
  assert(li.primarySource.length > 0, '有主要负荷来源');
  assert(li.sourceBreakdown.length > 0, '有负荷来源细分', `实际${li.sourceBreakdown.length}项`);
  assert(li.riskTriggers.length > 0, '有风险触发因素', `实际${li.riskTriggers.length}项`);
  assert(li.recommendedAdjustment.length > 0, '有调整建议');
  assert(['none', 'small', 'moderate', 'large'].includes(li.adjustmentMagnitude),
    '调整幅度在合理范围',
    `实际${li.adjustmentMagnitude}`);
  assert(['increase', 'maintain', 'decrease'].includes(li.adjustmentDirection),
    '调整方向合理',
    `实际${li.adjustmentDirection}`);
  
  const totalPct = li.sourceBreakdown.reduce((s, x) => s + x.percentage, 0);
  assert(totalPct >= 90 && totalPct <= 110,
    '负荷来源占比总和 ≈ 100%',
    `实际${totalPct}%`);
}

// ==========================================
// 测试组 3: 4周负荷趋势 + ACWR
// ==========================================
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║ 测试组 3: 4周负荷趋势 + ACWR + 风险等级                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const trendUser = sdk.setUserProfile({
  userId: 'trend_accept',
  name: '趋势验收员',
  age: 28,
  weight: 72,
  ftp: 260
});

for (let week = 0; week < 4; week++) {
  const weekStart = baseTime - (3 - week) * 7 * 86400000;
  const sessions = 2 + week;
  const loadFactor = 0.7 + week * 0.1;
  
  for (let s = 0; s < sessions; s++) {
    const startTime = weekStart + s * 2 * 86400000 + 9 * 3600 * 1000;
    const duration = 2400 + Math.round(Math.random() * 1200);
    
    sdk.trainingRecords.createRecord({
      userId: 'trend_accept',
      sportType: SportType.RUNNING,
      startTime,
      data: {
        sportType: SportType.RUNNING,
        distance: Math.round(5000 + Math.random() * 2000),
        duration,
        heartRateSamples: genHr(duration, startTime, loadFactor)
      }
    });
  }
}

const trend = sdk.loadTrend.getTrainingLoadTrend('trend_accept', baseTime + 86400000);

console.log('--- 4周负荷曲线 ---\n');

assert(trend.weeklyLoads.length === 4, '4周数据完整', `实际${trend.weeklyLoads.length}周`);

for (let i = 0; i < trend.weeklyLoads.length; i++) {
  const w = trend.weeklyLoads[i];
  console.log(`  ${w.label}: ${w.trainingLoad}分 / ${w.trainingCount}次 / ${Math.round(w.totalDuration / 60)}分`);
  assert(w.trainingLoad >= 0, `${w.label}负荷 >= 0`);
  assert(w.trainingCount >= 0, `${w.label}次数 >= 0`);
}

console.log('\n--- ACWR + 风险等级 ---\n');

console.log(`  急性负荷(AC): ${trend.acuteLoad}分`);
console.log(`  慢性负荷(CL): ${trend.chronicLoad}分`);
console.log(`  ACWR: ${trend.acwr}`);
console.log(`  风险等级: ${trend.riskLevel}`);
console.log(`  趋势: ${trend.trend}`);
console.log(`  建议: ${trend.recommendation}\n`);

assert(trend.acuteLoad > 0, '急性负荷 > 0', `实际${trend.acuteLoad}`);
assert(trend.chronicLoad > 0, '慢性负荷 > 0', `实际${trend.chronicLoad}`);
assert(trend.acwr > 0, 'ACWR > 0', `实际${trend.acwr}`);
assert(['low', 'moderate', 'high', 'very_high'].includes(trend.riskLevel),
  '风险等级有效',
  `实际${trend.riskLevel}`);
assert(['increasing', 'decreasing', 'stable'].includes(trend.trend),
  '趋势方向有效',
  `实际${trend.trend}`);
assert(trend.recommendation.length > 10, '建议文案充足', `实际${trend.recommendation.length}字`);

console.log('\n--- 趋势洞察层 ---\n');

assert(trend.insights !== undefined, '包含趋势洞察层');

if (trend.insights) {
  assert(['empty', 'start', 'building', 'stable', 'tapering', 'overreaching'].includes(trend.insights.loadPattern),
    '负荷模式有效',
    `实际${trend.insights.loadPattern}`);
  assert(trend.insights.patternDescription.length > 5, '模式描述充足');
  assert(trend.insights.keyDrivers.length > 0, '有关键驱动因素', `实际${trend.insights.keyDrivers.length}项`);
  assert(Array.isArray(trend.insights.riskFactors), '有风险因素数组');
  assert(trend.insights.suggestedAdjustment.length > 5, '有调整建议');
  assert(typeof trend.insights.adjustmentPercentage === 'number', '有调整幅度百分比');
  
  console.log(`  模式: ${trend.insights.loadPattern}`);
  console.log(`  描述: ${trend.insights.patternDescription}`);
  console.log(`  关键驱动: ${trend.insights.keyDrivers.slice(0, 2).join('、')}`);
  console.log(`  建议调整: ${trend.insights.adjustmentPercentage > 0 ? '+' : ''}${trend.insights.adjustmentPercentage}%`);
}

// ==========================================
// 测试组 4: 课程交叉汇总 + 教练视角
// ==========================================
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║ 测试组 4: 课程交叉汇总 + 教练视角                          ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const coachUsers = [
  { id: 'coach_u1', name: '学员甲' },
  { id: 'coach_u2', name: '学员乙' },
  { id: 'coach_u3', name: '学员丙' }
];

coachUsers.forEach((u, i) => {
  sdk.setUserProfile({
    userId: u.id,
    name: u.name,
    age: 22 + i,
    weight: 70 + i * 5,
    ftp: 240 + i * 15
  });
});

sdk.setCourse({
  courseId: 'coach_running',
  name: '教练跑步班',
  sportType: SportType.RUNNING,
  duration: 2100,
  difficulty: 2
});

coachUsers.forEach((u, idx) => {
  const sessionCount = 3 - idx;
  for (let s = 0; s < sessionCount; s++) {
    const startTime = baseTime + s * 86400000 + 7 * 3600 * 1000 + idx * 1800 * 1000;
    const duration = 1800 + s * 150 + idx * 100;
    
    sdk.trainingRecords.createRecord({
      userId: u.id,
      sportType: SportType.RUNNING,
      startTime,
      courseId: 'coach_running',
      data: {
        sportType: SportType.RUNNING,
        distance: 4500 + s * 500,
        duration,
        heartRateSamples: genHr(duration, startTime, 0.6 + s * 0.05 + idx * 0.03)
      }
    });
  }
});

const courseSummary = sdk.aggregator.aggregate({
  dimension: 'course',
  id: 'coach_running'
});

console.log('--- 课程概览 ---\n');

assert(courseSummary.courseName === '教练跑步班', '课程名称正确');
assert(courseSummary.memberCount === 3, '参与人数正确 (3人)', `实际${courseSummary.memberCount}人`);
assert(courseSummary.totalCompletions === 6, '总完成次数正确 (3+2+1=6)', `实际${courseSummary.totalCompletions}次`);
assert(courseSummary.avgDurationPerUser > 0, '有人均时长');
assert(courseSummary.avgTrainingLoadPerUser > 0, '有人均负荷');

console.log(`  课程: ${courseSummary.courseName}`);
console.log(`  参与: ${courseSummary.memberCount}人 / ${courseSummary.totalCompletions}次完成`);
console.log(`  人均时长: ${Math.round(courseSummary.avgDurationPerUser / 60)}分`);
console.log(`  人均负荷: ${courseSummary.avgTrainingLoadPerUser}分\n`);

console.log('--- 学员排行 ---\n');

assert(courseSummary.topPerformers && courseSummary.topPerformers.length > 0,
  '有学员排行榜',
  `实际${courseSummary.topPerformers?.length || 0}人`);

if (courseSummary.topPerformers) {
  courseSummary.topPerformers.forEach(p => {
    console.log(`  ${p.rank}. ${p.userName}: ${p.completionCount}次 / ${p.totalTrainingLoad}分`);
  });
  
  assert(courseSummary.topPerformers[0].rank === 1, '排行榜第1名rank=1');
  assert(courseSummary.topPerformers[0].totalTrainingLoad >= (courseSummary.topPerformers[1]?.totalTrainingLoad || 0),
    '排行榜按负荷降序排列');
}

console.log('\n--- 学员详情 (教练视角) ---\n');

assert(courseSummary.memberDetails && courseSummary.memberDetails.length === 3,
  '有3位学员详情',
  `实际${courseSummary.memberDetails?.length || 0}位`);

if (courseSummary.memberDetails) {
  courseSummary.memberDetails.forEach(m => {
    console.log(`  ${m.userName}:`);
    console.log(`    完成率: ${m.completionRate}% (${m.completionCount}/3)`);
    console.log(`    负荷趋势: ${m.loadTrend}`);
    console.log(`    平均负荷: ${m.avgTrainingLoad}分`);
    if (m.bestPerformance) {
      console.log(`    最佳表现: ${m.bestPerformance.label} - ${m.bestPerformance.value}`);
    }
  });
  
  for (const m of courseSummary.memberDetails) {
    assert(m.completionRate > 0, `${m.userName}完成率 > 0`);
    assert(['up', 'down', 'stable'].includes(m.loadTrend), `${m.userName}负荷趋势有效`, `实际${m.loadTrend}`);
    assert(m.avgTrainingLoad > 0, `${m.userName}有平均负荷`);
    assert(m.bestPerformance !== undefined, `${m.userName}有最佳表现`);
  }
}

console.log('\n--- 篮球课进步排行 ---\n');

const ballCoachUsers = [
  { id: 'ball_c1', name: '后卫A' },
  { id: 'ball_c2', name: '前锋B' },
  { id: 'ball_c3', name: '中锋C' }
];

ballCoachUsers.forEach((u, i) => {
  sdk.setUserProfile({
    userId: u.id,
    name: u.name,
    age: 21 + i,
    weight: 75 + i * 8,
    ftp: 270
  });
});

sdk.setCourse({
  courseId: 'ball_coach_course',
  name: '篮球教练班',
  sportType: SportType.BALL,
  duration: 5400,
  difficulty: 3
});

const ballCoachData = {
  'ball_c1': [
    [
      { actionType: '投篮', count: 25, successCount: 12, successRate: 0.48 },
      { actionType: '传球', count: 50, successCount: 42, successRate: 0.84 },
      { actionType: '抢断', count: 6, successCount: 4, successRate: 0.667 }
    ],
    [
      { actionType: '投篮', count: 28, successCount: 18, successRate: 0.643 },
      { actionType: '传球', count: 55, successCount: 50, successRate: 0.909 },
      { actionType: '抢断', count: 8, successCount: 6, successRate: 0.75 }
    ]
  ],
  'ball_c2': [
    [
      { actionType: '投篮', count: 20, successCount: 10, successRate: 0.5 },
      { actionType: '篮板', count: 15, successCount: 12, successRate: 0.8 },
      { actionType: '盖帽', count: 3, successCount: 2, successRate: 0.667 }
    ],
    [
      { actionType: '投篮', count: 22, successCount: 14, successRate: 0.636 },
      { actionType: '篮板', count: 18, successCount: 15, successRate: 0.833 },
      { actionType: '盖帽', count: 5, successCount: 4, successRate: 0.8 }
    ]
  ],
  'ball_c3': [
    [
      { actionType: '投篮', count: 30, successCount: 15, successRate: 0.5 },
      { actionType: '三分球', count: 10, successCount: 2, successRate: 0.2 },
      { actionType: '传球', count: 35, successCount: 28, successRate: 0.8 }
    ],
    [
      { actionType: '投篮', count: 32, successCount: 20, successRate: 0.625 },
      { actionType: '三分球', count: 12, successCount: 5, successRate: 0.417 },
      { actionType: '传球', count: 40, successCount: 34, successRate: 0.85 }
    ]
  ]
};

ballCoachUsers.forEach((u, idx) => {
  const sessions = ballCoachData[u.id] || [];
  sessions.forEach((actions, sIdx) => {
    const startTime = baseTime + sIdx * 2 * 86400000 + 18 * 3600 * 1000 + idx * 1800 * 1000;
    const duration = 5400;
    
    sdk.trainingRecords.createRecord({
      userId: u.id,
      sportType: SportType.BALL,
      startTime,
      courseId: 'ball_coach_course',
      data: {
        sportType: SportType.BALL,
        duration,
        distance: 8000,
        sprintCount: 15,
        heartRateSamples: genHr(duration, startTime, 0.7),
        actions
      }
    });
  });
});

const ballCoachSummary = sdk.aggregator.aggregate({
  dimension: 'course',
  id: 'ball_coach_course'
});

assert(ballCoachSummary.memberCount === 3, '篮球课3人参与', `实际${ballCoachSummary.memberCount}人`);
assert(ballCoachSummary.ballActionStats && ballCoachSummary.ballActionStats.totalActions > 0,
  '篮球课有动作统计');
assert(ballCoachSummary.ballProgressRanking && ballCoachSummary.ballProgressRanking.length > 0,
  '有动作进步排行',
  `实际${ballCoachSummary.ballProgressRanking?.length || 0}项`);

if (ballCoachSummary.ballProgressRanking) {
  ballCoachSummary.ballProgressRanking.slice(0, 4).forEach(r => {
    console.log(`  ${r.actionType}:`);
    if (r.topTotal) {
      console.log(`    总量第一: ${r.topTotal.userName} (${r.topTotal.totalCount}次, 成功率${Math.round(r.topTotal.successRate * 100)}%)`);
    }
    if (r.mostImproved) {
      console.log(`    进步最快: ${r.mostImproved.userName} (${r.mostImproved.startValue}% → ${r.mostImproved.endValue}%, +${Math.round(r.mostImproved.improvementRate * 100)}%)`);
    }
  });
}

if (ballCoachSummary.memberDetails) {
  console.log('\n  动作短板:');
  ballCoachSummary.memberDetails.forEach(m => {
    if (m.ballWeakPoints && m.ballWeakPoints.length > 0) {
      console.log(`    ${m.userName}: ${m.ballWeakPoints.join('、')}`);
    }
  });
}

// ==========================================
// 测试总结
// ==========================================
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                       测试总结                              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const total = results.passed + results.failed;
console.log(`  总检查项: ${total}`);
console.log(`  通过: ${results.passed}`);
console.log(`  失败: ${results.failed}\n`);

if (results.failed > 0) {
  console.log('  失败项详情:');
  results.failures.forEach((f, i) => {
    console.log(`    ${i + 1}. ${f.name}`);
    if (f.detail) console.log(`       ${f.detail}`);
  });
  console.log();
}

const groups = ['骑行功率 Golden Case', '篮球分段周报', '4周负荷趋势 + ACWR', '课程交叉汇总 + 教练视角'];
console.log('  覆盖场景:');
groups.forEach(g => console.log(`    ✓ ${g}`));

console.log();

if (results.failed === 0) {
  console.log('🎉 所有检查通过！SDK 核心指标符合预期。\n');
  process.exit(0);
} else {
  console.log(`⚠️  ${results.failed} 项检查未通过，请查看上方失败详情。\n`);
  process.exit(1);
}
