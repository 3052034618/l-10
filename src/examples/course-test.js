const { sdk, SportType } = require('../../dist/index');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║       智慧体育训练数据 SDK - 课程维度完整测试             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const baseTime = Date.now() - 3 * 24 * 3600 * 1000;

function hr(pattern, durationSec, startTs, maxHr = 192, restHr = 62) {
  const samples = [];
  const interval = 5000;
  for (let i = 0; i < durationSec * 1000; i += interval) {
    let hrValue;
    const t = i / (durationSec * 1000);
    
    switch (pattern) {
      case 'steady':
        hrValue = restHr + (maxHr - restHr) * 0.65 + Math.sin(t * Math.PI * 4) * 5;
        break;
      case 'interval':
        const cycle = Math.floor(t * 8);
        const phase = (t * 8) % 1;
        if (cycle % 2 === 0) {
          hrValue = restHr + (maxHr - restHr) * (0.6 + phase * 0.3);
        } else {
          hrValue = restHr + (maxHr - restHr) * (0.85 - phase * 0.35);
        }
        break;
      case 'easy':
        hrValue = restHr + (maxHr - restHr) * 0.5 + Math.sin(t * Math.PI * 2) * 3;
        break;
      case 'hard':
        hrValue = restHr + (maxHr - restHr) * (0.75 + t * 0.1) + Math.sin(t * Math.PI * 6) * 4;
        break;
      case 'ball':
        hrValue = restHr + (maxHr - restHr) * (0.5 + Math.random() * 0.4);
        break;
      default:
        hrValue = restHr + (maxHr - restHr) * 0.6;
    }
    
    samples.push({
      timestamp: startTs + i,
      heartRate: Math.round(hrValue)
    });
  }
  return samples;
}

function powerSamples(durationSec, startTs, ftp = 250, pattern = 'steady') {
  const samples = [];
  const interval = 1000;
  for (let i = 0; i < durationSec * 1000; i += interval) {
    let power;
    const t = i / (durationSec * 1000);
    
    switch (pattern) {
      case 'steady':
        power = ftp * 0.65 + Math.sin(t * Math.PI * 2) * ftp * 0.08;
        break;
      case 'interval':
        const cycle = Math.floor(t * 6);
        const phase = (t * 6) % 1;
        if (cycle % 2 === 0) {
          power = ftp * (0.9 + phase * 0.2);
        } else {
          power = ftp * (0.45 + Math.random() * 0.1);
        }
        break;
      case 'spike':
        power = ftp * 0.7;
        if (Math.floor(t * 10) % 7 === 0) {
          power = ftp * 3.5;
        }
        break;
      default:
        power = ftp * 0.7;
    }
    
    samples.push({
      timestamp: startTs + i,
      power: Math.round(power)
    });
  }
  return samples;
}

console.log('【初始化环境】');
const user = sdk.setUserProfile({
  userId: 'course_user_001',
  name: '课程测试用户',
  age: 26,
  gender: 'male',
  height: 180,
  weight: 75,
  restingHeartRate: 62,
  maxHeartRate: 192,
  ftp: 250
});
console.log('  用户:', user.name, '体重:', user.weight, 'kg FTP:', user.ftp, 'W\n');

sdk.setCourse({
  courseId: 'course_running_001',
  name: '5公里有氧跑基础课',
  sportType: SportType.RUNNING,
  duration: 1800,
  difficulty: 2
});

sdk.setCourse({
  courseId: 'course_cycling_001',
  name: '30公里骑行耐力课',
  sportType: SportType.CYCLING,
  duration: 3600,
  difficulty: 3
});

sdk.setCourse({
  courseId: 'course_strength_001',
  name: '全身力量训练课',
  sportType: SportType.STRENGTH,
  duration: 2700,
  difficulty: 3
});

sdk.setCourse({
  courseId: 'course_basketball_001',
  name: '篮球技术训练课',
  sportType: SportType.BALL,
  duration: 5400,
  difficulty: 3
});

console.log('【已创建4门课程】');
console.log('  🏃 5公里有氧跑基础课');
console.log('  🚴 30公里骑行耐力课');
console.log('  💪 全身力量训练课');
console.log('  🏀 篮球技术训练课\n');

let runningRecs = [];
let cyclingRecs = [];
let strengthRecs = [];
let ballRecs = [];

// ==========================================
// 跑步课 - 3次记录
// ==========================================
console.log('━━━━━━━━━━ 跑步课程记录 ━━━━━━━━━━');

for (let i = 0; i < 3; i++) {
  const startTime = baseTime + i * 86400000 + 8 * 3600 * 1000;
  const duration = 1800 + i * 120;
  const distance = 5000 + i * 300;
  
  const record = sdk.trainingRecords.createRecord({
    userId: 'course_user_001',
    sportType: SportType.RUNNING,
    startTime,
    courseId: 'course_running_001',
    data: {
      sportType: SportType.RUNNING,
      distance,
      duration,
      heartRateSamples: hr('steady', duration, startTime),
      elevationGain: 20 + i * 5,
      steps: 6200 + i * 200
    },
    notes: `第${i + 1}次跑步课`
  });
  runningRecs.push(record);
  
  const pace = duration / (distance / 1000);
  const paceMin = Math.floor(pace / 60);
  const paceSec = Math.round(pace % 60);
  console.log(`  第${i + 1}次: ${(distance / 1000).toFixed(1)}km / 配速 ${paceMin}'${paceSec.toString().padStart(2, '0')}"`);
}

// ==========================================
// 骑行课 - 3次记录
// ==========================================
console.log('\n━━━━━━━━━━ 骑行课程记录 ━━━━━━━━━━');

for (let i = 0; i < 3; i++) {
  const startTime = baseTime + i * 86400000 + 17 * 3600 * 1000;
  const duration = 3600 + i * 300;
  const distance = 30000 + i * 2500;
  const pattern = i === 1 ? 'interval' : 'steady';
  
  const record = sdk.trainingRecords.createRecord({
    userId: 'course_user_001',
    sportType: SportType.CYCLING,
    startTime,
    courseId: 'course_cycling_001',
    data: {
      sportType: SportType.CYCLING,
      distance,
      duration,
      heartRateSamples: hr(pattern === 'interval' ? 'interval' : 'steady', duration, startTime),
      powerSamples: powerSamples(duration, startTime, 250, pattern),
      elevationGain: 200 + i * 30,
      elevationLoss: 195 + i * 25
    },
    notes: `第${i + 1}次骑行课 - ${pattern === 'interval' ? '间歇训练' : '耐力骑'}`
  });
  cyclingRecs.push(record);
  
  const powerAnalysis = sdk.performance.analyzeRecordPower(record.recordId);
  console.log(`  第${i + 1}次: ${(distance / 1000).toFixed(1)}km / 平均 ${powerAnalysis.avgPower}W / NP ${powerAnalysis.normalizedPower}W`);
  console.log(`         TSS ${powerAnalysis.trainingStressScore} / IF ${powerAnalysis.intensityFactor}`);
  
  if (powerAnalysis.peakPowerCurve) {
    const curveStr = powerAnalysis.peakPowerCurve.map(p => `${p.durationLabel}:${p.power}W`).join(' / ');
    console.log(`         峰值功率: ${curveStr}`);
  }
  
  if (i === 1) {
    const zones = powerAnalysis.powerDistribution.filter(z => z.duration > 0);
    console.log(`         FTP区间: ${zones.length}个有数据`);
    zones.forEach(z => {
      console.log(`           ${z.zoneName} (${z.range}): ${Math.round(z.duration / 60)}分钟 (${z.percentage}%)`);
    });
  }
}

// ==========================================
// 力量课 - 3次记录
// ==========================================
console.log('\n━━━━━━━━━━ 力量课程记录 ━━━━━━━━━━');

const strengthWorkouts = [
  {
    sets: [
      { exerciseName: '深蹲', weight: 70, reps: 12, restTime: 90 },
      { exerciseName: '深蹲', weight: 70, reps: 10, restTime: 90 },
      { exerciseName: '卧推', weight: 55, reps: 12, restTime: 90 },
      { exerciseName: '卧推', weight: 55, reps: 10, restTime: 90 },
      { exerciseName: '硬拉', weight: 90, reps: 8, restTime: 120 },
      { exerciseName: '引体向上', weight: 0, reps: 8, restTime: 60 }
    ]
  },
  {
    sets: [
      { exerciseName: '深蹲', weight: 75, reps: 12, restTime: 90 },
      { exerciseName: '深蹲', weight: 75, reps: 10, restTime: 90 },
      { exerciseName: '深蹲', weight: 80, reps: 6, restTime: 120 },
      { exerciseName: '卧推', weight: 60, reps: 12, restTime: 90 },
      { exerciseName: '卧推', weight: 60, reps: 10, restTime: 90 },
      { exerciseName: '硬拉', weight: 95, reps: 6, restTime: 120 },
      { exerciseName: '引体向上', weight: 0, reps: 10, restTime: 60 },
      { exerciseName: '坐姿划船', weight: 50, reps: 12, restTime: 60 }
    ]
  },
  {
    sets: [
      { exerciseName: '深蹲', weight: 80, reps: 10, restTime: 90 },
      { exerciseName: '深蹲', weight: 80, reps: 8, restTime: 90 },
      { exerciseName: '卧推', weight: 65, reps: 10, restTime: 90 },
      { exerciseName: '卧推', weight: 65, reps: 8, restTime: 90 },
      { exerciseName: '硬拉', weight: 100, reps: 5, restTime: 120 },
      { exerciseName: '硬拉', weight: 105, reps: 3, restTime: 120 },
      { exerciseName: '引体向上', weight: 10, reps: 8, restTime: 60 },
      { exerciseName: '坐姿划船', weight: 55, reps: 10, restTime: 60 },
      { exerciseName: '肩推', weight: 30, reps: 10, restTime: 60 }
    ]
  }
];

for (let i = 0; i < 3; i++) {
  const startTime = baseTime + i * 86400000 + 12 * 3600 * 1000;
  const duration = 2400 + i * 200;
  
  const record = sdk.trainingRecords.createRecord({
    userId: 'course_user_001',
    sportType: SportType.STRENGTH,
    startTime,
    courseId: 'course_strength_001',
    data: {
      sportType: SportType.STRENGTH,
      duration,
      heartRateSamples: hr('easy', duration, startTime),
      sets: strengthWorkouts[i].sets
    },
    notes: `第${i + 1}次力量课`
  });
  strengthRecs.push(record);
  
  const analysis = sdk.motion.analyzeRecord(record.recordId);
  const totalVolume = analysis?.totalVolume || 0;
  const exerciseCount = analysis?.exercises?.length || 0;
  console.log(`  第${i + 1}次: ${totalVolume}kg 容量 / ${exerciseCount}个动作 / ${Math.round(duration / 60)}分钟`);
}

// ==========================================
// 篮球课 - 3次记录
// ==========================================
console.log('\n━━━━━━━━━━ 篮球课程记录 ━━━━━━━━━━');

const ballWorkouts = [
  {
    distance: 6000,
    sprintCount: 8,
    actions: [
      { actionType: '投篮', count: 30, successCount: 18, successRate: 0.6 },
      { actionType: '三分球', count: 10, successCount: 3, successRate: 0.3 },
      { actionType: '传球', count: 40, successCount: 36, successRate: 0.9 },
      { actionType: '抢断', count: 5, successCount: 4, successRate: 0.8 },
      { actionType: '篮板', count: 8, successCount: 7, successRate: 0.875 }
    ]
  },
  {
    distance: 7500,
    sprintCount: 12,
    actions: [
      { actionType: '投篮', count: 20, successCount: 14, successRate: 0.7 },
      { actionType: '投篮', count: 15, successCount: 10, successRate: 0.667 },
      { actionType: '三分球', count: 12, successCount: 5, successRate: 0.417 },
      { actionType: '传球', count: 50, successCount: 46, successRate: 0.92 },
      { actionType: '抢断', count: 7, successCount: 5, successRate: 0.714 },
      { actionType: '篮板', count: 10, successCount: 9, successRate: 0.9 },
      { actionType: '助攻', count: 4, successCount: 4, successRate: 1.0 }
    ]
  },
  {
    distance: 9000,
    sprintCount: 18,
    actions: [
      { actionType: '投篮', count: 25, successCount: 18, successRate: 0.72 },
      { actionType: '三分球', count: 15, successCount: 6, successRate: 0.4 },
      { actionType: '传球', count: 55, successCount: 50, successRate: 0.909 },
      { actionType: '抢断', count: 10, successCount: 8, successRate: 0.8 },
      { actionType: '篮板', count: 12, successCount: 10, successRate: 0.833 },
      { actionType: '助攻', count: 8, successCount: 8, successRate: 1.0 },
      { actionType: '盖帽', count: 3, successCount: 2, successRate: 0.667 }
    ]
  }
];

for (let i = 0; i < 3; i++) {
  const startTime = baseTime + i * 86400000 + 19 * 3600 * 1000;
  const duration = 4800 + i * 300;
  const workout = ballWorkouts[i];
  
  const record = sdk.trainingRecords.createRecord({
    userId: 'course_user_001',
    sportType: SportType.BALL,
    startTime,
    courseId: 'course_basketball_001',
    data: {
      sportType: SportType.BALL,
      duration,
      distance: workout.distance,
      sprintCount: workout.sprintCount,
      heartRateSamples: hr('ball', duration, startTime),
      actions: workout.actions
    },
    notes: `第${i + 1}次篮球课 - 分段动作上报测试`
  });
  ballRecs.push(record);
  
  const analysis = sdk.motion.analyzeRecord(record.recordId);
  console.log(`  第${i + 1}次: ${analysis.totalActions}次动作 / 成功率${(analysis.overallSuccessRate * 100).toFixed(1)}%`);
  console.log(`         动作类型: ${analysis.actions.length}种`);
  
  if (i === 1) {
    console.log('         （第2次投篮分两段上报，应合并统计）');
  }
}

// ==========================================
// 课程汇总测试
// ==========================================
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                    课程汇总结果                              ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

const courseIds = [
  { id: 'course_running_001', name: '跑步课' },
  { id: 'course_cycling_001', name: '骑行课' },
  { id: 'course_strength_001', name: '力量课' },
  { id: 'course_basketball_001', name: '篮球课' }
];

for (const course of courseIds) {
  console.log(`\n━━━━━━━━━━ ${course.name}汇总 ━━━━━━━━━━`);
  const summary = sdk.aggregator.aggregate({
    dimension: 'course',
    id: course.id
  });
  
  if (!summary) {
    console.log('  无数据');
    continue;
  }
  
  console.log(`  课程名称: ${summary.courseName || '未知'}`);
  console.log(`  运动类型: ${summary.sportType || '未知'}`);
  console.log(`  完成次数: ${summary.totalCompletions} 次`);
  console.log(`  总时长: ${Math.round(summary.totalDuration / 60)} 分钟`);
  console.log(`  平均时长: ${Math.round(summary.avgDuration / 60)} 分钟`);
  console.log(`  平均负荷: ${summary.avgTrainingLoad || 0} 分`);
  console.log(`  总负荷: ${summary.totalTrainingLoad || 0} 分`);
  
  if (summary.totalDistance !== undefined) {
    console.log(`  总距离: ${(summary.totalDistance / 1000).toFixed(1)} km`);
    console.log(`  平均距离: ${(summary.avgDistance / 1000).toFixed(1)} km`);
  }
  
  if (summary.ballActionStats) {
    console.log(`  球类动作统计:`);
    console.log(`    总动作数: ${summary.ballActionStats.totalActions} 次`);
    console.log(`    总成功: ${summary.ballActionStats.totalSuccessful} 次`);
    console.log(`    整体成功率: ${(summary.ballActionStats.overallSuccessRate * 100).toFixed(1)}%`);
    console.log(`    动作明细 (${summary.ballActionStats.actions.length}种):`);
    summary.ballActionStats.actions.forEach(action => {
      console.log(`      - ${action.actionType}: ${action.count}次 (成功${action.successCount}次 / ${(action.successRate * 100).toFixed(0)}%)`);
    });
  }
  
  if (summary.highIntensityDuration !== undefined) {
    console.log(`  高强度时长: ${Math.round(summary.highIntensityDuration / 60)} 分钟`);
  }
  
  if (summary.bestPerformance) {
    console.log(`  最佳表现: ${summary.bestPerformance.label} - ${summary.bestPerformance.value}`);
    console.log(`    日期: ${summary.bestPerformance.dateFormatted}`);
  }
}

// ==========================================
// 周报 - 课程混合周
// ==========================================
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                    本周周报预览                              ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

const report = sdk.reports.generate('course_user_001', baseTime + 4 * 86400000);

console.log(`\n  训练天数: ${report.totalTrainingDays} 天`);
console.log(`  总训练时长: ${Math.round(report.totalDuration / 60)} 分钟`);
console.log(`  训练负荷: ${report.trainingLoad} 分`);
console.log(`  负荷变化: ${report.loadChange.trend} (${report.loadChange.changePercentage}%)`);
console.log(`  运动类型分布: ${report.sportDistribution.length} 种`);

report.sportDistribution.forEach(sd => {
  const names = { running: '跑步', cycling: '骑行', strength: '力量', ball: '球类' };
  console.log(`    - ${names[sd.sportType] || sd.sportType}: ${sd.count}次 / ${Math.round(sd.duration / 60)}分钟`);
});

console.log(`\n  最佳成绩 (${report.bestPerformances.length}条):`);
report.bestPerformances.forEach((bp, i) => {
  console.log(`    ${i + 1}. ${bp.label} - ${bp.value} (${bp.dateFormatted})`);
});

console.log(`\n  恢复建议:`);
report.recoveryAdvice.forEach(advice => {
  console.log(`    • ${advice}`);
});

console.log(`\n  周总结: ${report.summary}`);

// ==========================================
// 验证点
// ==========================================
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                    关键验证点                                ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

let allPassed = true;

const basketballSummary = sdk.aggregator.aggregate({
  dimension: 'course',
  id: 'course_basketball_001'
});

const shotAction = basketballSummary.ballActionStats?.actions.find(a => a.actionType === '投篮');
if (shotAction && shotAction.count === 30 + 20 + 15 + 25) {
  console.log(`✓ 投篮动作合并正确: ${shotAction.count}次 (30+35+25=90)`);
} else {
  console.log(`✗ 投篮动作合并不对: 期望值90, 实际${shotAction?.count || 0}`);
  allPassed = false;
}

const totalBallActions = basketballSummary.ballActionStats?.totalActions || 0;
const expectedTotal = ballWorkouts.reduce((sum, w) => sum + w.actions.reduce((s, a) => s + a.count, 0), 0);
if (totalBallActions === expectedTotal) {
  console.log(`✓ 动作总数正确: ${totalBallActions}次`);
} else {
  console.log(`✗ 动作总数不对: 期望${expectedTotal}, 实际${totalBallActions}`);
  allPassed = false;
}

const cyclingSummary = sdk.aggregator.aggregate({
  dimension: 'course',
  id: 'course_cycling_001'
});

if (cyclingSummary.totalCompletions === 3) {
  console.log(`✓ 骑行课完成次数正确: 3次`);
} else {
  console.log(`✗ 骑行课完成次数不对: 期望3, 实际${cyclingSummary.totalCompletions}`);
  allPassed = false;
}

if (report.sportDistribution.length === 4) {
  console.log(`✓ 周报包含全部4种运动类型`);
} else {
  console.log(`✗ 周报运动类型不对: 期望4, 实际${report.sportDistribution.length}`);
  allPassed = false;
}

if (report.recoveryAdvice.length >= 2) {
  console.log(`✓ 恢复建议合理: ${report.recoveryAdvice.length}条`);
} else {
  console.log(`✗ 恢复建议太少`);
  allPassed = false;
}

if (report.bestPerformances.length >= 3) {
  console.log(`✓ 最佳成绩丰富: ${report.bestPerformances.length}条`);
} else {
  console.log(`✗ 最佳成绩太少`);
  allPassed = false;
}

const cyclingRecord = cyclingRecs[1];
const powerAnalysis = sdk.performance.analyzeRecordPower(cyclingRecord.recordId);
if (powerAnalysis.peakPowerCurve && powerAnalysis.peakPowerCurve.length > 0) {
  console.log(`✓ 峰值功率曲线可用: ${powerAnalysis.peakPowerCurve.length}个点`);
  console.log(`  - 5秒峰值: ${powerAnalysis.peakPowerCurve[0]?.power}W`);
} else {
  console.log('✗ 峰值功率曲线为空');
  allPassed = false;
}

if (powerAnalysis.powerDistribution.length === 7) {
  console.log(`✓ FTP 7区间完整`);
} else {
  console.log(`✗ FTP区间数不对: 期望7, 实际${powerAnalysis.powerDistribution.length}`);
  allPassed = false;
}

console.log(`\n${allPassed ? '🎉 所有验证点通过！' : '⚠️ 部分验证未通过，请检查'}`);

console.log('\n✅ 课程维度测试完成！覆盖：');
console.log('   - 跑步课: 3次记录 / 距离配速统计');
console.log('   - 骑行课: 3次记录 / NP/TSS/IF/峰值功率/FTP区间');
console.log('   - 力量课: 3次记录 / 容量动作统计');
console.log('   - 篮球课: 3次记录 / 分段动作合并 / 高强度汇总');
console.log('   - 周报: 4种运动混合 / 最佳成绩/恢复建议/负荷变化');
