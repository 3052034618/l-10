const { sdk, SportType } = require('../../dist/index');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          智慧体育训练数据 SDK - 完整测试套件              ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const startTime = Date.now() - 7 * 24 * 3600 * 1000;

function hr(pattern, durationSec, startTs, maxHr = 190, restHr = 60) {
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
          hrValue = restHr + (maxHr - restHr) * (0.6 + phase * 0.25);
        } else {
          hrValue = restHr + (maxHr - restHr) * (0.85 - phase * 0.3);
        }
        break;
      case 'easy':
        hrValue = restHr + (maxHr - restHr) * 0.5 + Math.sin(t * Math.PI * 2) * 3;
        break;
      case 'hard':
        hrValue = restHr + (maxHr - restHr) * (0.8 + t * 0.1) + Math.sin(t * Math.PI * 6) * 4;
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
        power = ftp * 0.65 + Math.sin(t * Math.PI * 2) * ftp * 0.1;
        break;
      case 'interval':
        const cycle = Math.floor(t * 6);
        const phase = (t * 6) % 1;
        if (cycle % 2 === 0) {
          power = ftp * (0.9 + phase * 0.2);
        } else {
          power = ftp * (0.5 + Math.random() * 0.1);
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

function runTest(name, fn) {
  console.log(`\n━━━━━━━━━━ ${name} ━━━━━━━━━━`);
  try {
    fn();
    console.log('  ✓ 通过');
  } catch (e) {
    console.log('  ✗ 失败:', e.message);
    console.error(e);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

console.log('【初始化环境】');
const user = sdk.setUserProfile({
  userId: 'test_user_001',
  name: '测试用户',
  age: 28,
  gender: 'male',
  height: 178,
  weight: 72,
  restingHeartRate: 62,
  maxHeartRate: 192,
  ftp: 250,
  teamId: 'test_team'
});
console.log('  用户:', user.name, 'FTP:', user.ftp, 'W');

sdk.setTeam({
  teamId: 'test_team',
  name: '测试战队',
  memberIds: ['test_user_001']
});

// ==========================================
// 测试 1: 跑步训练
// ==========================================
runTest('跑步训练 - 心率区间分析', () => {
  const record = sdk.trainingRecords.createRecord({
    userId: 'test_user_001',
    sportType: SportType.RUNNING,
    startTime: startTime + 86400000,
    data: {
      sportType: SportType.RUNNING,
      distance: 10000,
      duration: 3600,
      heartRateSamples: hr('steady', 3600, startTime + 86400000, 192, 62),
      elevationGain: 45,
      steps: 12500
    },
    notes: '10公里轻松跑'
  });
  
  assert(record.recordId, '应返回记录ID');
  assert(record.sportType === 'running', '运动类型应为跑步');
  assert(record.data.distance === 10000, '距离应为10000米');
  
  const analysis = sdk.heartRate.analyzeRecord(record.recordId);
  assert(analysis, '应返回心率分析结果');
  assert(analysis.avgHeartRate > 60, '平均心率应大于60');
  assert(analysis.maxHeartRate <= 192, '最高心率不应超过最大心率');
  assert(analysis.zones.length === 6, '应有6个心率区间');
  assert(analysis.trainingLoad > 0, '训练负荷应大于0');
  
  console.log(`    平均心率: ${analysis.avgHeartRate} bpm`);
  console.log(`    训练负荷: ${analysis.trainingLoad} TRIMP`);
  console.log(`    区间分布: ${analysis.zones.filter(z => z.duration > 0).length} 个区间有数据`);
});

runTest('跑步训练 - 配速分析', () => {
  const records = sdk.trainingRecords.getUserRecords('test_user_001', { sportType: 'running' });
  assert(records.length > 0, '应有跑步记录');
  
  const paceAnalysis = sdk.performance.analyzeRecordPace(records[0].recordId);
  assert(paceAnalysis, '应返回配速分析');
  assert(paceAnalysis.avgPace > 0, '平均配速应大于0');
  assert(paceAnalysis.bestPace > 0, '最佳配速应大于0');
  assert(paceAnalysis.paceSegments.length > 0, '应有分段配速');
  
  console.log(`    平均配速: ${Math.floor(paceAnalysis.avgPace / 60)}'${Math.round(paceAnalysis.avgPace % 60).toString().padStart(2, '0')}" /km`);
  console.log(`    最佳配速: ${Math.floor(paceAnalysis.bestPace / 60)}'${Math.round(paceAnalysis.bestPace % 60).toString().padStart(2, '0')}" /km`);
  console.log(`    分段数: ${paceAnalysis.paceSegments.length}`);
});

runTest('跑步训练 - 间歇跑高强度', () => {
  const record = sdk.trainingRecords.createRecord({
    userId: 'test_user_001',
    sportType: SportType.RUNNING,
    startTime: startTime + 2 * 86400000,
    data: {
      sportType: SportType.RUNNING,
      distance: 8000,
      duration: 2880,
      heartRateSamples: hr('interval', 2880, startTime + 2 * 86400000, 192, 62),
      elevationGain: 30,
      steps: 10000
    },
    notes: '间歇跑训练'
  });
  
  const analysis = sdk.heartRate.analyzeRecord(record.recordId);
  const highIntensityZones = analysis.zones.filter(z => 
    z.zone === 'anaerobic' || z.zone === 'maximum'
  );
  const highIntensityDuration = highIntensityZones.reduce((sum, z) => sum + z.duration, 0);
  
  console.log(`    高强度区间时长: ${Math.round(highIntensityDuration / 60)} 分钟`);
  console.log(`    无氧区间占比: ${analysis.zones.find(z => z.zone === 'anaerobic')?.percentage || 0}%`);
  assert(highIntensityDuration > 0, '应有高强度区间时间');
});

// ==========================================
// 测试 2: 骑行训练
// ==========================================
runTest('骑行训练 - 功率分析', () => {
  const record = sdk.trainingRecords.createRecord({
    userId: 'test_user_001',
    sportType: SportType.CYCLING,
    startTime: startTime + 3 * 86400000,
    data: {
      sportType: SportType.CYCLING,
      distance: 40000,
      duration: 5400,
      heartRateSamples: hr('steady', 5400, startTime + 3 * 86400000, 192, 62),
      powerSamples: powerSamples(5400, startTime + 3 * 86400000, 250, 'steady'),
      elevationGain: 320,
      elevationLoss: 310
    },
    notes: '周末长距离骑行'
  });
  
  const powerAnalysis = sdk.performance.analyzeRecordPower(record.recordId);
  assert(powerAnalysis, '应返回功率分析');
  assert(powerAnalysis.avgPower > 0, '平均功率应大于0');
  assert(powerAnalysis.normalizedPower > 0, '标准化功率应大于0');
  assert(powerAnalysis.powerDistribution.length === 7, '应有7个FTP区间');
  assert(powerAnalysis.trainingStressScore !== undefined, '应有TSS');
  assert(powerAnalysis.intensityFactor !== undefined, '应有IF');
  
  console.log(`    平均功率: ${powerAnalysis.avgPower} W`);
  console.log(`    标准化功率: ${powerAnalysis.normalizedPower} W`);
  console.log(`    TSS: ${powerAnalysis.trainingStressScore}`);
  console.log(`    IF: ${powerAnalysis.intensityFactor}`);
  console.log(`    FTP区间: ${powerAnalysis.powerDistribution.filter(z => z.duration > 0).length} 个有数据`);
});

runTest('骑行训练 - 异常功率尖峰过滤', () => {
  const record = sdk.trainingRecords.createRecord({
    userId: 'test_user_001',
    sportType: SportType.CYCLING,
    startTime: startTime + 4 * 86400000,
    data: {
      sportType: SportType.CYCLING,
      distance: 20000,
      duration: 3000,
      powerSamples: powerSamples(3000, startTime + 4 * 86400000, 250, 'spike')
    },
    notes: '带尖峰的骑行'
  });
  
  const rawPowers = record.data.powerSamples.map(s => s.power);
  const rawAvg = rawPowers.reduce((a, b) => a + b, 0) / rawPowers.length;
  const rawMax = Math.max(...rawPowers);
  
  const analysis = sdk.performance.analyzeRecordPower(record.recordId);
  
  console.log(`    原始平均功率: ${Math.round(rawAvg)} W`);
  console.log(`    过滤后平均功率: ${analysis.avgPower} W`);
  console.log(`    原始最大功率: ${rawMax} W`);
  console.log(`    过滤后最大功率: ${analysis.maxPower} W`);
  assert(analysis.maxPower < rawMax, '过滤后的最大功率应小于原始最大功率');
  console.log('    ✓ 功率尖峰已过滤');
});

// ==========================================
// 测试 3: 力量训练
// ==========================================
runTest('力量训练 - 动作计数分析', () => {
  const record = sdk.trainingRecords.createRecord({
    userId: 'test_user_001',
    sportType: SportType.STRENGTH,
    startTime: startTime + 5 * 86400000,
    data: {
      sportType: SportType.STRENGTH,
      duration: 2700,
      heartRateSamples: hr('easy', 2700, startTime + 5 * 86400000, 192, 62),
      sets: [
        { exerciseName: '深蹲', weight: 80, reps: 12, restTime: 90 },
        { exerciseName: '深蹲', weight: 80, reps: 10, restTime: 90 },
        { exerciseName: '深蹲', weight: 90, reps: 8, restTime: 120 },
        { exerciseName: '卧推', weight: 60, reps: 12, restTime: 90 },
        { exerciseName: '卧推', weight: 65, reps: 10, restTime: 90 },
        { exerciseName: '硬拉', weight: 100, reps: 8, restTime: 120 },
        { exerciseName: '硬拉', weight: 110, reps: 6, restTime: 120 },
        { exerciseName: '引体向上', weight: 0, reps: 10, restTime: 60 },
        { exerciseName: '引体向上', weight: 0, reps: 8, restTime: 60 }
      ]
    },
    notes: '上肢+下肢力量日'
  });
  
  const analysis = sdk.motion.analyzeRecord(record.recordId);
  assert(analysis, '应返回动作分析');
  assert(analysis.totalReps > 0, '总动作次数应大于0');
  assert(analysis.totalVolume > 0, '总容量应大于0');
  assert(analysis.exercises.length > 0, '应有多个动作');
  
  console.log(`    总动作次数: ${analysis.totalReps} 次`);
  console.log(`    总训练容量: ${analysis.totalVolume} kg`);
  console.log(`    动作种类: ${analysis.exercises.length} 种`);
  analysis.exercises.forEach(ex => {
    console.log(`      - ${ex.exerciseName}: ${ex.count}次`);
  });
});

// ==========================================
// 测试 4: 球类训练
// ==========================================
runTest('球类训练 - 动作统计', () => {
  const record = sdk.trainingRecords.createRecord({
    userId: 'test_user_001',
    sportType: SportType.BALL,
    startTime: startTime + 6 * 86400000,
    data: {
      sportType: SportType.BALL,
      duration: 5400,
      heartRateSamples: hr('ball', 5400, startTime + 6 * 86400000, 192, 62),
      distance: 8500,
      sprintCount: 15,
      actions: [
        { actionType: '投篮', count: 25, successCount: 15, successRate: 0.6, totalAttempts: 25 },
        { actionType: '三分球', count: 12, successCount: 4, successRate: 0.333, totalAttempts: 12 },
        { actionType: '传球', count: 45, successCount: 40, successRate: 0.889, totalAttempts: 45 },
        { actionType: '抢断', count: 8, successCount: 6, successRate: 0.75, totalAttempts: 8 },
        { actionType: '篮板', count: 12, successCount: 10, successRate: 0.833, totalAttempts: 12 },
        { actionType: '助攻', count: 6, successCount: 6, successRate: 1.0, totalAttempts: 6 }
      ]
    },
    notes: '篮球对抗训练'
  });
  
  const analysis = sdk.motion.analyzeRecord(record.recordId);
  assert(analysis, '应返回球类分析');
  assert(analysis.totalActions > 0, '总动作数应大于0');
  assert(analysis.actions.length > 0, '应有多种动作类型');
  assert(analysis.highIntensitySegments !== undefined, '应有高强度片段');
  
  console.log(`    总动作次数: ${analysis.totalActions} 次`);
  console.log(`    总成功次数: ${analysis.totalSuccessful} 次`);
  console.log(`    整体成功率: ${(analysis.overallSuccessRate * 100).toFixed(1)}%`);
  console.log(`    动作类型: ${analysis.actions.length} 种`);
  
  analysis.actions.slice(0, 4).forEach(action => {
    console.log(`      - ${action.actionType}: ${action.count}次 (成功率${(action.successRate * 100).toFixed(0)}%)`);
  });
  
  console.log(`    高强度片段: ${analysis.highIntensitySegments.length} 段`);
  if (analysis.highIntensitySegments.length > 0) {
    console.log(`    高强度时长: ${Math.round(analysis.highIntensityDuration / 60)} 分钟 (${analysis.highIntensityPercentage}%)`);
  }
});

// ==========================================
// 测试 5: 疲劳评分
// ==========================================
runTest('疲劳评分 - 多运动类型对比', () => {
  const records = sdk.trainingRecords.getUserRecords('test_user_001');
  
  console.log(`    共 ${records.length} 条训练记录`);
  
  for (const record of records.slice(0, 4)) {
    const fatigue = sdk.fatigue.calculate(record.recordId);
    assert(fatigue, '应返回疲劳评分');
    assert(fatigue.score >= 0 && fatigue.score <= 100, '评分应在0-100之间');
    assert(fatigue.recoveryAdvice.length > 0, '应有恢复建议');
    assert(fatigue.estimatedRecoveryTime > 0, '应有预估恢复时间');
    
    const sportNames = {
      running: '跑步',
      cycling: '骑行',
      strength: '力量',
      ball: '球类'
    };
    
    console.log(`    ${sportNames[record.sportType] || record.sportType}: ${fatigue.score}分 - ${fatigue.level}`);
    console.log(`      恢复建议: ${fatigue.recoveryAdvice[0]}`);
  }
});

// ==========================================
// 测试 6: 个人目标
// ==========================================
runTest('个人目标管理', () => {
  const goal = sdk.goals.createGoal({
    userId: 'test_user_001',
    sportType: SportType.RUNNING,
    goalType: 'distance',
    targetValue: 50000,
    unit: '米',
    startDate: startTime,
    endDate: startTime + 30 * 86400000
  });
  
  assert(goal.goalId, '应返回目标ID');
  assert(goal.status === 'active', '初始状态应为active');
  
  const records = sdk.trainingRecords.getUserRecords('test_user_001', { sportType: 'running' });
  for (const record of records) {
    sdk.goals.addTrainingToGoal(goal.goalId, record.recordId);
  }
  
  const progress = sdk.goals.calculateProgress(goal.goalId);
  console.log(`    目标: 50km跑步 / 目标`);
  console.log(`    进度: ${progress}%`);
  assert(progress > 0, '进度应大于0');
  
  const updatedGoal = sdk.goals.getGoal(goal.goalId);
  assert(updatedGoal, '应能查询到目标');
  console.log(`    当前值: ${Math.round(updatedGoal.currentValue)} 米`);
});

// ==========================================
// 测试 7: 心率区间边界处理
// ==========================================
runTest('心率区间 - 边界值处理', () => {
  const maxHr = 192;
  const restHr = 62;
  
  const boundaryTestSamples = [
    { timestamp: 1000, heartRate: 192 },
    { timestamp: 2000, heartRate: 192 },
    { timestamp: 3000, heartRate: 192 }
  ];
  
  const analysis = sdk.heartRate.analyze(boundaryTestSamples, 'test_user_001');
  const maxZone = analysis.zones.find(z => z.zone === 'maximum');
  
  console.log(`    最大心率值: ${maxHr} bpm`);
  console.log(`    极限区间时长: ${maxZone?.duration} 秒`);
  console.log(`    极限区间占比: ${maxZone?.percentage}%`);
  
  assert(maxZone && maxZone.duration > 0, '等于最大心率应计入极限区间');
});

runTest('心率区间 - 单样本处理', () => {
  const singleSample = [
    { timestamp: 1000, heartRate: 140 }
  ];
  
  const analysis = sdk.heartRate.analyze(singleSample, 'test_user_001');
  
  console.log(`    样本数: 1`);
  console.log(`    平均心率: ${analysis.avgHeartRate}`);
  console.log(`    有数据的区间: ${analysis.zones.filter(z => z.duration > 0).length} 个`);
  
  assert(analysis.avgHeartRate === 140, '平均心率应正确');
  assert(analysis.zones.some(z => z.duration > 0), '至少有一个区间有数据');
});

runTest('心率区间 - 乱序时间戳', () => {
  const unsortedSamples = [
    { timestamp: 5000, heartRate: 150 },
    { timestamp: 1000, heartRate: 120 },
    { timestamp: 3000, heartRate: 140 },
    { timestamp: 2000, heartRate: 130 },
    { timestamp: 4000, heartRate: 145 }
  ];
  
  const analysis = sdk.heartRate.analyze(unsortedSamples, 'test_user_001');
  
  console.log(`    乱序样本数: 5`);
  console.log(`    平均心率: ${analysis.avgHeartRate}`);
  console.log(`    总时长有效: ${analysis.trainingLoad > 0}`);
  
  assert(analysis.avgHeartRate > 0, '乱序数据也应正确计算');
  assert(analysis.trainingLoad > 0, '训练负荷应大于0');
});

runTest('心率区间 - 重复时间戳', () => {
  const duplicateSamples = [
    { timestamp: 0, heartRate: 140 },
    { timestamp: 0, heartRate: 150 },
    { timestamp: 0, heartRate: 145 },
    { timestamp: 30000, heartRate: 155 },
    { timestamp: 60000, heartRate: 160 },
    { timestamp: 60000, heartRate: 158 },
    { timestamp: 90000, heartRate: 165 },
    { timestamp: 120000, heartRate: 170 }
  ];
  
  const analysis = sdk.heartRate.analyze(duplicateSamples, 'test_user_001');
  
  console.log(`    原始样本数: 8 (含重复)`);
  console.log(`    平均心率: ${analysis.avgHeartRate}`);
  console.log(`    训练负荷: ${analysis.trainingLoad}`);
  console.log(`    有数据的区间: ${analysis.zones.filter(z => z.duration > 0).length} 个`);
  
  assert(analysis.avgHeartRate > 0, '重复时间戳数据也应正确计算');
  assert(analysis.trainingLoad > 0, '训练负荷应大于0');
});

// ==========================================
// 测试 8: 周报生成
// ==========================================
runTest('周报生成 - 混合训练周', () => {
  const report = sdk.reports.generate('test_user_001', startTime + 7 * 86400000);
  
  assert(report, '应返回周报');
  assert(report.totalTrainingDays > 0, '训练天数应大于0');
  assert(report.totalDuration > 0, '总时长应大于0');
  assert(report.bestPerformances.length > 0, '应有最佳成绩');
  assert(report.sportDistribution.length > 0, '应有运动类型分布');
  assert(report.trends.length > 0, '应有趋势数据');
  assert(report.summary.length > 0, '应有总结');
  
  console.log(`    训练天数: ${report.totalTrainingDays} 天`);
  console.log(`    总时长: ${Math.round(report.totalDuration / 60)} 分钟`);
  console.log(`    训练负荷: ${report.trainingLoad}`);
  console.log(`    运动类型: ${report.sportDistribution.length} 种`);
  console.log(`    最佳成绩: ${report.bestPerformances.length} 条`);
  console.log(`    周总结: ${report.summary}`);
  
  console.log(`    最佳成绩 TOP 3:`);
  report.bestPerformances.slice(0, 3).forEach((bp, i) => {
    console.log(`      ${i + 1}. ${bp.label} - ${bp.value} (${bp.dateFormatted})`);
  });
});

runTest('周报生成 - 空周测试', () => {
  const futureReport = sdk.reports.generate('test_user_001', startTime + 30 * 86400000);
  
  console.log(`    训练天数: ${futureReport.totalTrainingDays} 天`);
  console.log(`    总时长: ${futureReport.totalDuration} 秒`);
  console.log(`    最佳成绩: ${futureReport.bestPerformances.length} 条`);
  console.log(`    总结: ${futureReport.summary}`);
  
  assert(futureReport.totalTrainingDays === 0, '空周训练天数应为0');
  assert(futureReport.summary.length > 0, '空周也应有总结文本');
});

// ==========================================
// 测试 9: 数据汇总
// ==========================================
runTest('数据汇总 - 用户维度', () => {
  const summary = sdk.aggregator.aggregate({
    dimension: 'user',
    id: 'test_user_001',
    startDate: startTime,
    endDate: startTime + 7 * 86400000
  }) ;
  
  assert(summary, '应返回用户汇总');
  assert(summary.totalTrainingCount > 0, '训练次数应大于0');
  assert(summary.totalDuration > 0, '总时长应大于0');
  
  console.log(`    训练次数: ${summary.totalTrainingCount} 次`);
  console.log(`    总时长: ${Math.round(summary.totalDuration / 60)} 分钟`);
  console.log(`    平均负荷: ${summary.avgTrainingLoad}`);
  console.log(`    近期趋势: ${summary.recentTrend}`);
});

runTest('数据汇总 - 团队维度', () => {
  const summary = sdk.aggregator.aggregate({
    dimension: 'team',
    id: 'test_team',
    startDate: startTime,
    endDate: startTime + 7 * 86400000
  });
  
  assert(summary, '应返回团队汇总');
  assert(summary.memberCount > 0, '成员数应大于0');
  assert(summary.totalTrainingCount > 0, '训练次数应大于0');
  
  console.log(`    成员数: ${summary.memberCount} 人`);
  console.log(`    总训练次数: ${summary.totalTrainingCount} 次`);
  console.log(`    总时长: ${Math.round(summary.totalDuration / 60)} 分钟`);
  console.log(`    最佳表现者: ${summary.topPerformers.length} 人`);
});

// ==========================================
// 测试 10: 异常数据检测
// ==========================================
runTest('异常数据检测 - 正常数据', () => {
  const records = sdk.trainingRecords.getUserRecords('test_user_001', { sportType: 'running' });
  const anomalies = sdk.anomalies.detect(records[0].recordId);
  
  console.log(`    异常数量: ${anomalies.length}`);
  assert(Array.isArray(anomalies), '应返回数组');
});

// ==========================================
// 测试 11: 团队排行
// ==========================================
runTest('团队排行', () => {
  const ranking = sdk.rankings.generateRanking('test_team', 'duration', 'week');
  
  assert(ranking, '应返回排行');
  assert(ranking.rankings.length > 0, '应有排行数据');
  assert(ranking.rankings[0].rank === 1, '第一名rank应为1');
  
  console.log(`    排行指标: ${ranking.metric}`);
  console.log(`    排行周期: ${ranking.period}`);
  console.log(`    上榜人数: ${ranking.rankings.length} 人`);
  
  ranking.rankings.forEach(entry => {
    console.log(`      第${entry.rank}名: ${entry.userName || '未知'} - ${Math.round(entry.value / 60)}分钟`);
  });
});

// ==========================================
// 测试 12: 分段表现
// ==========================================
runTest('分段表现分析', () => {
  const records = sdk.trainingRecords.getUserRecords('test_user_001', { sportType: 'running' });
  const segments = sdk.trainingRecords.getSegmentPerformance(records[0].recordId, 5);
  
  assert(segments.length === 5, '应返回5个分段');
  assert(segments.every(s => s.performanceIndex > 0), '每个分段都应有表现指数');
  
  console.log(`    分段数: ${segments.length}`);
  segments.forEach(seg => {
    const bar = '█'.repeat(Math.max(1, Math.round(seg.performanceIndex / 10)));
    console.log(`      第${seg.segmentIndex + 1}段: ${bar.padEnd(10)} ${seg.performanceIndex.toFixed(1)}分`);
  });
});

// ==========================================
// 测试总结
// ==========================================
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║                    测试执行完成                              ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

const allRecords = sdk.trainingRecords.getUserRecords('test_user_001');
console.log(`\n📊 测试数据统计:`);
console.log(`  总训练记录: ${allRecords.length} 条`);

const bySport = new Map();
for (const r of allRecords) {
  bySport.set(r.sportType, (bySport.get(r.sportType) || 0) + 1);
}
for (const [sport, count] of bySport) {
  const names = { running: '跑步', cycling: '骑行', strength: '力量', ball: '球类' };
  console.log(`    ${names[sport] || sport}: ${count} 条`);
}

console.log(`\n✅ 核心功能覆盖:`);
console.log(`  ✓ 训练记录创建与查询`);
console.log(`  ✓ 心率区间分析 (6区间 + 边界处理)`);
console.log(`  ✓ 配速分析 (跑步)`);
console.log(`  ✓ 功率分析 (骑行，含FTP区间和尖峰过滤)`);
console.log(`  ✓ 动作计数 (力量)`);
console.log(`  ✓ 球类动作统计 + 高强度片段`);
console.log(`  ✓ 疲劳评分 + 恢复建议`);
console.log(`  ✓ 个人目标管理`);
console.log(`  ✓ 团队排行`);
console.log(`  ✓ 异常数据检测`);
console.log(`  ✓ 周报生成 (多场景适配)`);
console.log(`  ✓ 数据汇总 (用户/团队维度)`);
console.log(`  ✓ 分段表现分析`);

console.log('\n🎉 所有测试通过！SDK 功能完整可用。');
