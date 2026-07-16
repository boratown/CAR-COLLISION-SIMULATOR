import React from 'react';
import { 
  TelemetryPoint, 
  CollisionEvent, 
  CarConfig, 
  CAR_SPECS_PRESETS 
} from '../types';
import { Shield, Zap, Flame, Gauge, TrendingUp, Info, Activity, AlertTriangle, Heart } from 'lucide-react';

interface TelemetryPanelProps {
  telemetryHistory: TelemetryPoint[];
  collisionEvent: CollisionEvent | null;
  cars: CarConfig[];
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({
  telemetryHistory,
  collisionEvent,
  cars,
}) => {
  const carA = cars.find(c => c.id === 'A');
  const carB = cars.find(c => c.id === 'B');

  const specA = carA ? CAR_SPECS_PRESETS[carA.type] : null;
  const specB = carB ? CAR_SPECS_PRESETS[carB.type] : null;

  // Compute latest metrics from history
  const latestPoint = telemetryHistory[telemetryHistory.length - 1] || {
    time: 0,
    carASpeed: carA && !carA.isStationary ? carA.initialSpeed : 0,
    carBSpeed: carB && !carB.isStationary ? carB.initialSpeed : 0,
    carAKineticEnergy: 0,
    carBKineticEnergy: 0,
    totalDeformation: 0
  };

  // Helper to generate dynamic SVG Path from telemetry values
  const generateSvgPath = (
    history: TelemetryPoint[], 
    valExtractor: (p: TelemetryPoint) => number, 
    maxVal: number, 
    width: number, 
    height: number
  ) => {
    if (history.length < 2) return '';
    const pointsCount = history.length;
    const maxTime = Math.max(history[pointsCount - 1].time, 1.5); // At least 1.5s scale
    
    return history.map((pt, index) => {
      const x = (pt.time / maxTime) * (width - 40) + 20;
      // Invert Y because SVG coordinates start from top-left
      const y = height - 20 - (valExtractor(pt) / (maxVal || 1)) * (height - 40);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  };

  // Graph Specs
  const graphWidth = 480;
  const graphHeight = 160;

  // Max Speed for Graph Scaling
  const allSpeeds = telemetryHistory.flatMap(p => [p.carASpeed, p.carBSpeed]);
  const initialMax = Math.max(carA?.initialSpeed || 0, carB?.initialSpeed || 0, 100);
  const maxSpeedScale = Math.max(...allSpeeds, initialMax, 1);

  // Max Energy for Scaling
  const allEnergies = telemetryHistory.flatMap(p => [p.carAKineticEnergy, p.carBKineticEnergy]);
  const initialMaxEnergy = 0.5 * (carA?.mass || 1500) * Math.pow(((carA?.initialSpeed || 60) * 1000) / 3600, 2) / 1000;
  const maxEnergyScale = Math.max(...allEnergies, initialMaxEnergy, 10);

  const speedPathA = generateSvgPath(telemetryHistory, p => p.carASpeed, maxSpeedScale, graphWidth, graphHeight);
  const speedPathB = generateSvgPath(telemetryHistory, p => p.carBSpeed, maxSpeedScale, graphWidth, graphHeight);

  const energyPathA = generateSvgPath(telemetryHistory, p => p.carAKineticEnergy, maxEnergyScale, graphWidth, graphHeight);
  const energyPathB = generateSvgPath(telemetryHistory, p => p.carBKineticEnergy, maxEnergyScale, graphWidth, graphHeight);

  // Calculate damage percents based on collision severity
  const damageFactor = collisionEvent ? Math.min(collisionEvent.impactForce / 12, 100) : 0;
  const damageA = carA ? Math.round(damageFactor * (1500 / carA.mass)) : 0; // SUVs get less damage
  const damageB = carB ? Math.round(damageFactor * (1500 / carB.mass)) : 0;

  // Map Safety Ratings
  const getSafetyDetails = (rating: 'S' | 'A' | 'B' | 'C' | 'D' | 'F') => {
    switch(rating) {
      case 'S':
        return {
          bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
          desc: '승객실 완전 보존. 안전 벨트 및 프리텐셔너의 정밀 전개로 경미한 찰과상 외 신체 상해율 2% 미만 극도로 안전함.',
          text: '최우수 (S-Grade Safety)'
        };
      case 'A':
        return {
          bg: 'bg-teal-500/10 border-teal-500/30 text-teal-400',
          desc: '크럼플 존이 충격력을 전량 흡수하였으며, 에어백 쿠션이 머리 및 흉부를 완전 보호함. 가벼운 타박상 가능성.',
          text: '우수 (A-Grade Safety)'
        };
      case 'B':
        return {
          bg: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
          desc: '안전 구역 내부 변형 극소화. 급격한 감속 G-Force로 인한 경추 및 목덜미의 인대 염좌 가능성이 농후함.',
          text: '보통 (B-Grade Safety)'
        };
      case 'C':
        return {
          bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
          desc: '엔진룸 밀림으로 인해 풋레스트 부근 소폭 수축. 스티어링 휠 및 대시보드 하단 접촉에 의한 무릎 및 다리 부상 주의.',
          text: '경고 (C-Grade Boundary)'
        };
      case 'D':
        return {
          bg: 'bg-orange-500/10 border-orange-500/30 text-orange-400',
          desc: 'A필러가 꺾이고 승객 내부 생존 공간의 침범이 시작됨. 갈비뼈 골절 및 뇌진탕 등 중대 상해율 45% 이상 도달.',
          text: '위험 (D-Grade Risk)'
        };
      case 'F':
        return {
          bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
          desc: '캐빈 구조 붕괴 및 시트 이탈. 충돌 에너지가 감쇄 없이 승객에게 직격하여 다발성 중상 혹은 생명 위협 위험 극대화.',
          text: '붕괴 위험 (F-Grade Fatal)'
        };
    }
  };

  const safetyInfo = collisionEvent ? getSafetyDetails(collisionEvent.safetyRating) : null;

  return (
    <div className="flex flex-col gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 text-slate-100 font-sans shadow-lg h-full overflow-y-auto custom-scrollbar">
      
      {/* Dynamic Header Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        {/* Metric 1 */}
        <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
            <span>A차량 실시간 속도</span>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: carA?.color || '#3b82f6' }} />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {latestPoint.carASpeed.toFixed(0)}
            </span>
            <span className="text-slate-400 text-xs">km/h</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            질량: {carA?.mass.toLocaleString()} kg
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
            <span>B차량 실시간 속도</span>
            {carB ? (
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: carB?.color || '#10b981' }} />
            ) : (
              <span className="text-[10px] text-rose-500 font-semibold uppercase">Barrier</span>
            )}
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-slate-100">
              {carB ? latestPoint.carBSpeed.toFixed(0) : '0'}
            </span>
            <span className="text-slate-400 text-xs">km/h</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            질량: {carB ? `${carB.mass.toLocaleString()} kg` : '무한대 (벽)'}
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
            <span>총 운동에너지 (Total Ek)</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-amber-400">
              {((latestPoint.carAKineticEnergy || 0) + (latestPoint.carBKineticEnergy || 0)).toFixed(1)}
            </span>
            <span className="text-amber-500 text-xs">kJ</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            A: {latestPoint.carAKineticEnergy.toFixed(0)}kJ | B: {latestPoint.carBKineticEnergy.toFixed(0)}kJ
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
            <span>누적 메쉬 변형량</span>
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono text-indigo-400">
              {latestPoint.totalDeformation.toLocaleString()}
            </span>
            <span className="text-indigo-500 text-xs">pts</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">
            {collisionEvent ? '충돌 흡수 완료' : '대기 상태'}
          </div>
        </div>

      </div>

      {/* Collision Safety Analysis Report */}
      {collisionEvent && safetyInfo && (
        <div className={`p-4 rounded-xl border ${safetyInfo.bg} flex flex-col md:flex-row gap-4 items-start`}>
          <div className="flex items-center justify-center p-3 rounded-xl bg-slate-950/60 font-black text-4xl w-16 h-16 shrink-0 font-mono shadow-inner">
            {collisionEvent.safetyRating}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 bg-slate-950/60 rounded uppercase tracking-wide">
                Crash Analysis Report
              </span>
              <span className="text-xs font-bold font-mono text-slate-300">
                시간: {collisionEvent.time.toFixed(3)}s
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-100 flex items-center gap-1.5">
              승객 생존 능력 등급: {safetyInfo.text}
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              {safetyInfo.desc}
            </p>
            
            {/* Impact numbers detailed */}
            <div className="grid grid-cols-3 gap-2 pt-2.5 text-center text-[11px] border-t border-slate-800/60 mt-1">
              <div>
                <span className="block text-slate-400">최대 충격력 (Peak Force)</span>
                <span className="font-bold text-sm font-mono text-slate-100">{collisionEvent.impactForce.toLocaleString()} kN</span>
              </div>
              <div>
                <span className="block text-slate-400">변형 손실 에너지</span>
                <span className="font-bold text-sm font-mono text-slate-100">{collisionEvent.energyLoss.toLocaleString()} kJ</span>
              </div>
              <div>
                <span className="block text-slate-400">상대 접근 속도</span>
                <span className="font-bold text-sm font-mono text-slate-100">{collisionEvent.relativeSpeed} km/h</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Driver Survivability & Injury Index Card */}
      {collisionEvent && (
        <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 flex flex-col gap-4">
          <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
            <Heart className="w-4 h-4 text-rose-500 animate-pulse" />
            인체 상해치 및 운전자 생존율 진단 (Driver Survivability & Injury Index)
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Occupant A */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: carA?.color || '#3b82f6' }} />
                  A 차량 운전자 (Driver A)
                </span>
                <span className={`text-xs font-black font-mono px-2 py-0.5 rounded ${
                  collisionEvent.injuryMetricsA.isCrushedFatal ? 'bg-red-600/30 text-red-400 border border-red-500/40 animate-pulse' :
                  collisionEvent.survivalRateA >= 80 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  collisionEvent.survivalRateA >= 50 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                  'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  {collisionEvent.injuryMetricsA.isCrushedFatal ? '생사 확인 불가능 (FATAL CRUSH)' : `생존률 ${collisionEvent.survivalRateA}%`}
                </span>
              </div>

              {/* Survival rate progress bar */}
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/50">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    collisionEvent.injuryMetricsA.isCrushedFatal ? 'bg-red-600' :
                    collisionEvent.survivalRateA >= 80 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' :
                    collisionEvent.survivalRateA >= 50 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
                    'bg-gradient-to-r from-rose-600 to-red-500'
                  }`}
                  style={{ width: `${collisionEvent.injuryMetricsA.isCrushedFatal ? 0 : collisionEvent.survivalRateA}%` }}
                />
              </div>

              {/* Occupant Status Banner */}
              <div className={`p-2 rounded-lg text-[11px] font-semibold flex flex-col gap-1.5 border transition-all ${
                collisionEvent.injuryMetricsA.isCrushedFatal
                  ? 'bg-red-950/40 border-red-500/30 text-red-400 animate-pulse'
                  : collisionEvent.injuryMetricsA.isEjected
                  ? 'bg-rose-950/40 border-rose-500/30 text-rose-400 animate-pulse'
                  : 'bg-emerald-950/20 border-emerald-500/15 text-emerald-400'
              }`}>
                <div className="flex items-center justify-between w-full">
                  <span>탑승자 생존 여유 상태:</span>
                  <span className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${collisionEvent.injuryMetricsA.isCrushedFatal ? 'bg-red-500 animate-ping' : collisionEvent.injuryMetricsA.isEjected ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
                    {collisionEvent.injuryMetricsA.isCrushedFatal ? '생사 확인 불가능 (CRUSHED)' : collisionEvent.injuryMetricsA.isEjected ? '차량 이탈 (EJECTED!)' : '차량 내부 안전 (CABIN-SAFE)'}
                  </span>
                </div>
                {collisionEvent.injuryMetricsA.isCrushedFatal && (
                  <div className="text-[10px] text-red-400/90 leading-relaxed border-t border-red-500/20 pt-1 mt-0.5">
                    경고: 차량 전/후방의 극단적 협착(Sandwich Pressure) 압력량 한계 돌파. 차체 완전 파괴로 인한 탑승자 안전확보 불능 판정.
                  </div>
                )}
              </div>

              {/* Active Safety Systems */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className={`p-1.5 rounded flex items-center justify-between ${
                  collisionEvent.injuryMetricsA.airbagDeployed ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/10' : 'bg-slate-950 text-slate-500 border border-slate-900'
                }`}>
                  <span>에어백 (Airbag)</span>
                  <span className="font-bold">{collisionEvent.injuryMetricsA.airbagDeployed ? '전개 완료' : '미작동'}</span>
                </div>
                <div className={`p-1.5 rounded flex items-center justify-between ${
                  collisionEvent.injuryMetricsA.beltPretensioner ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/10' : 'bg-slate-950 text-slate-500 border border-slate-900'
                }`}>
                  <span>안전벨트 텐셔너</span>
                  <span className="font-bold">{collisionEvent.injuryMetricsA.beltPretensioner ? '정밀체결' : '미작동'}</span>
                </div>
              </div>

              {/* Biometrics */}
              <div className="space-y-2 text-xs pt-1 border-t border-slate-800/40">
                
                {/* HIC */}
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-slate-400 flex items-center gap-1">머리 상해치 (HIC)</span>
                    <span className={`font-semibold font-mono ${collisionEvent.injuryMetricsA.hic > 1000 ? 'text-rose-500' : collisionEvent.injuryMetricsA.hic > 500 ? 'text-amber-500' : 'text-slate-300'}`}>
                      {collisionEvent.injuryMetricsA.hic} / 1000
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${collisionEvent.injuryMetricsA.hic > 1000 ? 'bg-rose-500' : collisionEvent.injuryMetricsA.hic > 500 ? 'bg-amber-500' : 'bg-indigo-400'}`}
                      style={{ width: `${Math.min((collisionEvent.injuryMetricsA.hic / 1000) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Chest G */}
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-slate-400">흉부 감속 가속도 (Chest G)</span>
                    <span className={`font-semibold font-mono ${collisionEvent.injuryMetricsA.chestG > 60 ? 'text-rose-500' : collisionEvent.injuryMetricsA.chestG > 40 ? 'text-amber-500' : 'text-slate-300'}`}>
                      {collisionEvent.injuryMetricsA.chestG} G / 60 G
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${collisionEvent.injuryMetricsA.chestG > 60 ? 'bg-rose-500' : collisionEvent.injuryMetricsA.chestG > 40 ? 'bg-amber-500' : 'bg-indigo-400'}`}
                      style={{ width: `${Math.min((collisionEvent.injuryMetricsA.chestG / 60) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Femur Force */}
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-slate-400">대퇴골 하중 (Femur Load)</span>
                    <span className={`font-semibold font-mono ${collisionEvent.injuryMetricsA.femurForce > 10.0 ? 'text-rose-500' : collisionEvent.injuryMetricsA.femurForce > 6.0 ? 'text-amber-500' : 'text-slate-300'}`}>
                      {collisionEvent.injuryMetricsA.femurForce} kN / 10.0 kN
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${collisionEvent.injuryMetricsA.femurForce > 10.0 ? 'bg-rose-500' : collisionEvent.injuryMetricsA.femurForce > 6.0 ? 'bg-amber-500' : 'bg-indigo-400'}`}
                      style={{ width: `${Math.min((collisionEvent.injuryMetricsA.femurForce / 10.0) * 100, 100)}%` }}
                    />
                  </div>
                </div>

              </div>
            </div>

            {/* Occupant B */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col gap-3">
              {collisionEvent.survivalRateB !== null && collisionEvent.injuryMetricsB ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: carB?.color || '#10b981' }} />
                      B 차량 운전자 (Driver B)
                    </span>
                    <span className={`text-xs font-black font-mono px-2 py-0.5 rounded ${
                      collisionEvent.injuryMetricsB.isCrushedFatal ? 'bg-red-600/30 text-red-400 border border-red-500/40 animate-pulse' :
                      collisionEvent.survivalRateB >= 80 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                      collisionEvent.survivalRateB >= 50 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}>
                      {collisionEvent.injuryMetricsB.isCrushedFatal ? '생사 확인 불가능 (FATAL CRUSH)' : `생존률 ${collisionEvent.survivalRateB}%`}
                    </span>
                  </div>

                  {/* Survival rate progress bar */}
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/50">
                    <div 
                      className={`h-full transition-all duration-1000 ${
                        collisionEvent.injuryMetricsB.isCrushedFatal ? 'bg-red-600' :
                        collisionEvent.survivalRateB >= 80 ? 'bg-gradient-to-r from-emerald-500 to-teal-400' :
                        collisionEvent.survivalRateB >= 50 ? 'bg-gradient-to-r from-amber-500 to-yellow-400' :
                        'bg-gradient-to-r from-rose-600 to-red-500'
                      }`}
                      style={{ width: `${collisionEvent.injuryMetricsB.isCrushedFatal ? 0 : collisionEvent.survivalRateB}%` }}
                    />
                  </div>

                  {/* Occupant Status Banner */}
                  <div className={`p-2 rounded-lg text-[11px] font-semibold flex flex-col gap-1.5 border transition-all ${
                    collisionEvent.injuryMetricsB.isCrushedFatal
                      ? 'bg-red-950/40 border-red-500/30 text-red-400 animate-pulse'
                      : collisionEvent.injuryMetricsB.isEjected
                      ? 'bg-rose-950/40 border-rose-500/30 text-rose-400 animate-pulse'
                      : 'bg-emerald-950/20 border-emerald-500/15 text-emerald-400'
                  }`}>
                    <div className="flex items-center justify-between w-full">
                      <span>탑승자 생존 여유 상태:</span>
                      <span className="font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${collisionEvent.injuryMetricsB.isCrushedFatal ? 'bg-red-500 animate-ping' : collisionEvent.injuryMetricsB.isEjected ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'}`} />
                        {collisionEvent.injuryMetricsB.isCrushedFatal ? '생사 확인 불가능 (CRUSHED)' : collisionEvent.injuryMetricsB.isEjected ? '차량 이탈 (EJECTED!)' : '차량 내부 안전 (CABIN-SAFE)'}
                      </span>
                    </div>
                    {collisionEvent.injuryMetricsB.isCrushedFatal && (
                      <div className="text-[10px] text-red-400/90 leading-relaxed border-t border-red-500/20 pt-1 mt-0.5">
                        경고: 차량 전/후방의 극단적 협착(Sandwich Pressure) 압력량 한계 돌파. 차체 완전 파괴로 인한 탑승자 안전확보 불능 판정.
                      </div>
                    )}
                  </div>

                  {/* Active Safety Systems */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className={`p-1.5 rounded flex items-center justify-between ${
                      collisionEvent.injuryMetricsB.airbagDeployed ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/10' : 'bg-slate-950 text-slate-500 border border-slate-900'
                    }`}>
                      <span>에어백 (Airbag)</span>
                      <span className="font-bold">{collisionEvent.injuryMetricsB.airbagDeployed ? '전개 완료' : '미작동'}</span>
                    </div>
                    <div className={`p-1.5 rounded flex items-center justify-between ${
                      collisionEvent.injuryMetricsB.beltPretensioner ? 'bg-emerald-500/5 text-emerald-400 border border-emerald-500/10' : 'bg-slate-950 text-slate-500 border border-slate-900'
                    }`}>
                      <span>안전벨트 텐셔너</span>
                      <span className="font-bold">{collisionEvent.injuryMetricsB.beltPretensioner ? '정밀체결' : '미작동'}</span>
                    </div>
                  </div>

                  {/* Biometrics */}
                  <div className="space-y-2 text-xs pt-1 border-t border-slate-800/40">
                    
                    {/* HIC */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-slate-400 flex items-center gap-1">머리 상해치 (HIC)</span>
                        <span className={`font-semibold font-mono ${collisionEvent.injuryMetricsB.hic > 1000 ? 'text-rose-500' : collisionEvent.injuryMetricsB.hic > 500 ? 'text-amber-500' : 'text-slate-300'}`}>
                          {collisionEvent.injuryMetricsB.hic} / 1000
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${collisionEvent.injuryMetricsB.hic > 1000 ? 'bg-rose-500' : collisionEvent.injuryMetricsB.hic > 500 ? 'bg-amber-500' : 'bg-indigo-400'}`}
                          style={{ width: `${Math.min((collisionEvent.injuryMetricsB.hic / 1000) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Chest G */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-slate-400">흉부 감속 가속도 (Chest G)</span>
                        <span className={`font-semibold font-mono ${collisionEvent.injuryMetricsB.chestG > 60 ? 'text-rose-500' : collisionEvent.injuryMetricsB.chestG > 40 ? 'text-amber-500' : 'text-slate-300'}`}>
                          {collisionEvent.injuryMetricsB.chestG} G / 60 G
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${collisionEvent.injuryMetricsB.chestG > 60 ? 'bg-rose-500' : collisionEvent.injuryMetricsB.chestG > 40 ? 'bg-amber-500' : 'bg-indigo-400'}`}
                          style={{ width: `${Math.min((collisionEvent.injuryMetricsB.chestG / 60) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Femur Force */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-slate-400">대퇴골 하중 (Femur Load)</span>
                        <span className={`font-semibold font-mono ${collisionEvent.injuryMetricsB.femurForce > 10.0 ? 'text-rose-500' : collisionEvent.injuryMetricsB.femurForce > 6.0 ? 'text-amber-500' : 'text-slate-300'}`}>
                          {collisionEvent.injuryMetricsB.femurForce} kN / 10.0 kN
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${collisionEvent.injuryMetricsB.femurForce > 10.0 ? 'bg-rose-500' : collisionEvent.injuryMetricsB.femurForce > 6.0 ? 'bg-amber-500' : 'bg-indigo-400'}`}
                          style={{ width: `${Math.min((collisionEvent.injuryMetricsB.femurForce / 10.0) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center py-6 text-slate-500 text-center gap-1.5">
                  <span className="text-[10px] font-mono border border-dashed border-slate-800 rounded px-2 py-0.5 uppercase tracking-wide">Rigid Boundary Wall</span>
                  <p className="text-[11px] max-w-[200px] leading-relaxed">
                    구조적 변형이 없는 견고한 콘크리트 인공 방어벽입니다. 탑승자가 존재하지 않습니다.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* 2D Vehicles Damage Heatmap */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Car A Heatmap */}
        <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs font-semibold mb-2">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: carA?.color }} />
              차량 A 파손 리포트 ({carA?.name.split(' ')[0]})
            </span>
            <span className={`font-bold font-mono text-xs ${damageA > 60 ? 'text-rose-500' : damageA > 30 ? 'text-amber-500' : 'text-emerald-500'}`}>
              파손율 {damageA}%
            </span>
          </div>

          <div className="flex items-center justify-center py-3 bg-slate-950/60 rounded-lg">
            {/* Vector wireframe top down vehicle */}
            <div className="relative w-48 h-12 border border-slate-800 rounded bg-slate-900/40 flex overflow-hidden">
              {/* Front bumper zone */}
              <div 
                className="w-1/4 h-full flex items-center justify-center border-r border-slate-800 transition-colors"
                style={{ backgroundColor: damageA > 0 ? `rgba(239, 68, 68, ${Math.min(damageA * 1.5, 100) / 100})` : 'transparent' }}
              >
                <span className="text-[9px] font-mono font-bold text-slate-400 rotate-90 md:rotate-0">FRNT</span>
              </div>
              {/* Cabin zone */}
              <div 
                className="w-2/4 h-full flex items-center justify-center border-r border-slate-800 transition-colors"
                style={{ backgroundColor: damageA > 30 ? `rgba(239, 68, 68, ${Math.min((damageA - 30) * 1.2, 100) / 100})` : 'transparent' }}
              >
                <span className="text-[9px] font-mono font-bold text-slate-400">CABIN</span>
              </div>
              {/* Rear trunk zone */}
              <div 
                className="w-1/4 h-full flex items-center justify-center transition-colors"
                style={{ backgroundColor: damageA > 70 ? `rgba(239, 68, 68, ${Math.min((damageA - 70) * 1.5, 100) / 100})` : 'transparent' }}
              >
                <span className="text-[9px] font-mono font-bold text-slate-400 -rotate-90 md:rotate-0">REAR</span>
              </div>

              {/* Tires wireframe indicators */}
              <div className={`absolute left-4 top-0 w-2.5 h-1 bg-slate-500 rounded-b ${damageA > 40 ? 'bg-amber-600 animate-pulse' : ''}`} />
              <div className={`absolute left-4 bottom-0 w-2.5 h-1 bg-slate-500 rounded-t ${damageA > 40 ? 'bg-amber-600 animate-pulse' : ''}`} />
              <div className={`absolute right-4 top-0 w-2.5 h-1 bg-slate-500 rounded-b ${damageA > 80 ? 'bg-rose-600 animate-pulse' : ''}`} />
              <div className={`absolute right-4 bottom-0 w-2.5 h-1 bg-slate-500 rounded-t ${damageA > 80 ? 'bg-rose-600 animate-pulse' : ''}`} />
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1.5">
            <span>크럼플 존 변형 흡수 한계치: {(specA?.defaultMass || 1500) * 1.2} kN</span>
            <span>중량: {carA?.mass} kg</span>
          </div>
        </div>

        {/* Car B Heatmap */}
        <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs font-semibold mb-2">
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: carB?.color || '#94a3b8' }} />
              방어 개체 B 파손 리포트 ({carB ? carB.name.split(' ')[0] : '방호 콘크리트 벽'})
            </span>
            <span className={`font-bold font-mono text-xs ${damageB > 60 ? 'text-rose-500' : damageB > 30 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {carB ? `파손율 ${damageB}%` : '변형량 0%'}
            </span>
          </div>

          <div className="flex items-center justify-center py-3 bg-slate-950/60 rounded-lg">
            {carB ? (
              /* Vector wireframe top down vehicle */
              <div className="relative w-48 h-12 border border-slate-800 rounded bg-slate-900/40 flex overflow-hidden">
                {/* Front bumper zone */}
                <div 
                  className="w-1/4 h-full flex items-center justify-center border-r border-slate-800 transition-colors"
                  style={{ backgroundColor: damageB > 0 ? `rgba(239, 68, 68, ${Math.min(damageB * 1.5, 100) / 100})` : 'transparent' }}
                >
                  <span className="text-[9px] font-mono font-bold text-slate-400 rotate-90 md:rotate-0">FRNT</span>
                </div>
                {/* Cabin zone */}
                <div 
                  className="w-2/4 h-full flex items-center justify-center border-r border-slate-800 transition-colors"
                  style={{ backgroundColor: damageB > 30 ? `rgba(239, 68, 68, ${Math.min((damageB - 30) * 1.2, 100) / 100})` : 'transparent' }}
                >
                  <span className="text-[9px] font-mono font-bold text-slate-400">CABIN</span>
                </div>
                {/* Rear trunk zone */}
                <div 
                  className="w-1/4 h-full flex items-center justify-center transition-colors"
                  style={{ backgroundColor: damageB > 70 ? `rgba(239, 68, 68, ${Math.min((damageB - 70) * 1.5, 100) / 100})` : 'transparent' }}
                >
                  <span className="text-[9px] font-mono font-bold text-slate-400 -rotate-90 md:rotate-0">REAR</span>
                </div>

                {/* Tires wireframe indicators */}
                <div className={`absolute left-4 top-0 w-2.5 h-1 bg-slate-500 rounded-b ${damageB > 40 ? 'bg-amber-600 animate-pulse' : ''}`} />
                <div className={`absolute left-4 bottom-0 w-2.5 h-1 bg-slate-500 rounded-t ${damageB > 40 ? 'bg-amber-600 animate-pulse' : ''}`} />
                <div className={`absolute right-4 top-0 w-2.5 h-1 bg-slate-500 rounded-b ${damageB > 80 ? 'bg-rose-600 animate-pulse' : ''}`} />
                <div className={`absolute right-4 bottom-0 w-2.5 h-1 bg-slate-500 rounded-t ${damageB > 80 ? 'bg-rose-600 animate-pulse' : ''}`} />
              </div>
            ) : (
              <div className="w-48 h-12 bg-slate-800 border-2 border-amber-600 flex items-center justify-center rounded">
                <span className="text-amber-500 font-mono text-xs font-bold tracking-wider uppercase">RIGID STATIC BARRIER</span>
              </div>
            )}
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-1.5">
            <span>{carB ? `크럼플 존 변형 흡수 한계치: ${(specB?.defaultMass || 1500) * 1.2} kN` : '물리적 에너지 완전 흡수체'}</span>
            <span>{carB ? `중량: ${carB.mass} kg` : '중량: 무한대 (M_inf)'}</span>
          </div>
        </div>

      </div>

      {/* SVG-based Telemetry Graphs (Speed & Energy over time) */}
      <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/80">
        <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-3 uppercase tracking-wider">
          <TrendingUp className="w-4 h-4 text-indigo-400" />
          실시간 물리 텔레메트리 연동 곡선
        </h4>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Speed Graph */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-slate-400 font-medium">속도 변화 그래프 (Velocity Curves - km/h)</span>
            <div className="relative bg-slate-950 border border-slate-900 rounded-lg overflow-hidden h-40">
              {telemetryHistory.length > 1 ? (
                <svg className="w-full h-full" viewBox={`0 0 ${graphWidth} ${graphHeight}`} preserveAspectRatio="none">
                  {/* Grid Lines */}
                  <line x1="0" y1="20" x2={graphWidth} y2="20" stroke="#1e293b" strokeDasharray="3,3" />
                  <line x1="0" y1="50" x2={graphWidth} y2="50" stroke="#1e293b" strokeDasharray="3,3" />
                  <line x1="0" y1="80" x2={graphWidth} y2="80" stroke="#1e293b" strokeDasharray="3,3" />
                  <line x1="0" y1="110" x2={graphWidth} y2="110" stroke="#1e293b" strokeDasharray="3,3" />
                  <line x1="0" y1="140" x2={graphWidth} y2="140" stroke="#1e293b" strokeDasharray="3,3" />

                  {/* Draw Paths */}
                  <path d={speedPathA} fill="none" stroke={carA?.color || '#3b82f6'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  {carB && <path d={speedPathB} fill="none" stroke={carB?.color || '#10b981'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                </svg>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-600 font-mono">
                  충돌 시뮬레이션을 시작하면 그래프가 그려집니다.
                </div>
              )}
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500 px-1">
              <div className="flex gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-1 rounded" style={{ backgroundColor: carA?.color || '#3b82f6' }} />
                  Vehicle A
                </span>
                {carB && (
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-1 rounded" style={{ backgroundColor: carB?.color || '#10b981' }} />
                    Vehicle B
                  </span>
                )}
              </div>
              <span className="font-mono">최대 스케일: {maxSpeedScale.toFixed(0)} km/h</span>
            </div>
          </div>

          {/* Energy Graph */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-slate-400 font-medium">운동에너지 변화 그래프 (Kinetic Energy - kJ)</span>
            <div className="relative bg-slate-950 border border-slate-900 rounded-lg overflow-hidden h-40">
              {telemetryHistory.length > 1 ? (
                <svg className="w-full h-full" viewBox={`0 0 ${graphWidth} ${graphHeight}`} preserveAspectRatio="none">
                  {/* Grid Lines */}
                  <line x1="0" y1="20" x2={graphWidth} y2="20" stroke="#1e293b" strokeDasharray="3,3" />
                  <line x1="0" y1="50" x2={graphWidth} y2="50" stroke="#1e293b" strokeDasharray="3,3" />
                  <line x1="0" y1="80" x2={graphWidth} y2="80" stroke="#1e293b" strokeDasharray="3,3" />
                  <line x1="0" y1="110" x2={graphWidth} y2="110" stroke="#1e293b" strokeDasharray="3,3" />
                  <line x1="0" y1="140" x2={graphWidth} y2="140" stroke="#1e293b" strokeDasharray="3,3" />

                  {/* Draw Paths */}
                  <path d={energyPathA} fill="none" stroke="#f43f5e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  {carB && <path d={energyPathB} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
                </svg>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-600 font-mono">
                  충돌 시뮬레이션을 시작하면 그래프가 그려집니다.
                </div>
              )}
            </div>
            <div className="flex justify-between items-center text-[10px] text-slate-500 px-1">
              <div className="flex gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-1 rounded bg-rose-500" />
                  Ek (A)
                </span>
                {carB && (
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-1 rounded bg-emerald-500" />
                    Ek (B)
                  </span>
                )}
              </div>
              <span className="font-mono">최대 스케일: {maxEnergyScale.toFixed(0)} kJ</span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
