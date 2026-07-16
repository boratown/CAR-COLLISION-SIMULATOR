import React, { useState } from 'react';
import { 
  CarConfig, 
  SimulationState, 
  PresetScenario, 
  CarType, 
  CAR_SPECS_PRESETS 
} from '../types';
import { PRESET_SCENARIOS } from '../presets';
import { 
  Sliders, 
  Settings, 
  Car, 
  Gauge, 
  Sparkles, 
  Wind, 
  HelpCircle, 
  Play, 
  Pause, 
  RotateCcw,
  Zap,
  Maximize2,
  Compass,
  Trophy,
  Activity,
  Heart
} from 'lucide-react';

interface ControlPanelProps {
  cars: CarConfig[];
  setCars: React.Dispatch<React.SetStateAction<CarConfig[]>>;
  simulationState: SimulationState;
  setSimulationState: React.Dispatch<React.SetStateAction<SimulationState>>;
  selectedPreset: string;
  setSelectedPreset: (id: string) => void;
  resetSimulation: () => void;
  manualCarId: 'A' | 'B' | 'C' | null;
  setManualCarId: (id: 'A' | 'B' | 'C' | null) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  cars,
  setCars,
  simulationState,
  setSimulationState,
  selectedPreset,
  setSelectedPreset,
  resetSimulation,
  manualCarId,
  setManualCarId,
}) => {
  // Local state for selecting which car to customize (segmented tabs)
  const [activeTab, setActiveTab] = useState<'A' | 'B' | 'C'>('A');

  // Load selected preset scenario
  const handlePresetChange = (presetId: string) => {
    const preset = PRESET_SCENARIOS.find(p => p.id === presetId);
    if (!preset) return;

    setSelectedPreset(presetId);
    setCars(JSON.parse(JSON.stringify(preset.cars))); // Deep clone cars configuration
    setSimulationState(prev => ({
      ...prev,
      elasticity: preset.elasticity,
      roadFriction: preset.friction,
      isRunning: true // Auto-run the simulation on preset load
    }));
  };

  // Update specific car properties
  const updateCarProperty = (id: 'A' | 'B' | 'C', prop: keyof CarConfig, value: any) => {
    setCars(prev => prev.map(car => {
      if (car.id === id) {
        let updatedCar = { ...car, [prop]: value };
        
        // If they change car type, reset its mass/dimensions to match standard specs
        if (prop === 'type') {
          const spec = CAR_SPECS_PRESETS[value as CarType];
          updatedCar.mass = spec.defaultMass;
          updatedCar.name = spec.name;
        }
        return updatedCar;
      }
      return car;
    }));
  };

  // Find available car IDs for tabs
  const availableIds = cars.map(c => c.id);
  // Ensure we fall back to an existing car ID if activeTab is not present
  const currentActiveCarId = availableIds.includes(activeTab) ? activeTab : (availableIds[0] || 'A');
  const activeCar = cars.find(c => c.id === currentActiveCarId);

  // Helper for preset category badges
  const getPresetBadge = (id: string) => {
    switch (id) {
      case 'head_on':
        return { text: '정면', style: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
      case 't_bone':
        return { text: '측면', style: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
      case 'rear_end':
        return { text: '후방', style: 'bg-blue-500/10 text-blue-400 border-blue-500/20' };
      case 'wall':
        return { text: '장벽', style: 'bg-orange-500/10 text-orange-400 border-orange-500/20' };
      case 'multi_pileup':
        return { text: '3중', style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      default:
        return { text: '기타', style: 'bg-slate-500/10 text-slate-400 border-slate-500/20' };
    }
  };

  return (
    <div className="flex flex-col gap-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 text-slate-200 h-full overflow-y-auto custom-scrollbar shadow-lg">
      
      {/* SECTION 1: Scenario Presets */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <Settings className="w-4 h-4 text-indigo-400" />
          <h3 className="font-bold text-xs text-slate-100 uppercase tracking-wider">충돌 시나리오 프리셋</h3>
        </div>

        {/* Visual Preset selection buttons */}
        <div className="grid grid-cols-1 gap-1.5">
          {PRESET_SCENARIOS.map((p) => {
            const isSelected = selectedPreset === p.id;
            const badge = getPresetBadge(p.id);
            return (
              <button
                key={p.id}
                onClick={() => handlePresetChange(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all duration-200 flex items-center justify-between text-xs font-semibold group ${
                  isSelected 
                    ? 'bg-indigo-600/15 border-indigo-500/50 text-white shadow-inner shadow-indigo-500/5' 
                    : 'bg-slate-950/40 border-slate-800/80 text-slate-300 hover:bg-slate-950/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase shrink-0 font-mono ${badge.style}`}>
                    {badge.text}
                  </span>
                  <span className="truncate group-hover:translate-x-0.5 transition-transform">{p.name.split(' (')[0]}</span>
                </div>
                
                {/* Accent indicator dots */}
                <span className={`w-1.5 h-1.5 rounded-full transition-all ${isSelected ? 'bg-indigo-400 scale-125' : 'bg-transparent group-hover:bg-slate-700'}`} />
              </button>
            );
          })}
        </div>

        {/* Selected Preset Description Box */}
        {(() => {
          const current = PRESET_SCENARIOS.find(p => p.id === selectedPreset);
          return current ? (
            <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/50 border border-slate-800/60 p-3 rounded-xl shadow-inner font-normal">
              {current.description}
            </p>
          ) : null;
        })()}
      </div>

      {/* SECTION 2: Dynamic Car Editors */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <Car className="w-4 h-4 text-indigo-400" />
          <h3 className="font-bold text-xs text-slate-100 uppercase tracking-wider">차량 물리 커스터마이징</h3>
        </div>

        {/* Segmented horizontal Tabs for clean UI layout */}
        <div className="flex p-1 bg-slate-950 border border-slate-800/80 rounded-xl gap-1">
          {cars.map((car) => {
            const isTabActive = currentActiveCarId === car.id;
            return (
              <button
                key={car.id}
                onClick={() => setActiveTab(car.id)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  isTabActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/30 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                }`}
              >
                <span className="w-2 h-2 rounded-full border border-black/20" style={{ backgroundColor: car.color }} />
                차량 {car.id}
              </button>
            );
          })}
        </div>

        {/* Single Visible Customizer Card */}
        {activeCar && (
          <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-800/60 space-y-4 shadow-inner">
            {/* Class and Mass Header Row */}
            <div className="grid grid-cols-2 gap-3.5">
              
              {/* Type Select */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">차종 분류</span>
                <select
                  value={activeCar.type}
                  onChange={(e) => updateCarProperty(activeCar.id, 'type', e.target.value as CarType)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 font-semibold focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                >
                  <option value="sedan">세단 (Sedan)</option>
                  <option value="suv">SUV (S-Utility)</option>
                  <option value="sports">슈퍼카 (Sports)</option>
                  <option value="truck">화물차 (Truck)</option>
                </select>
              </div>

              {/* Mass Customizer */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">차량 무게 (kg)</span>
                <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                  <input
                    type="number"
                    value={activeCar.mass}
                    onChange={(e) => updateCarProperty(activeCar.id, 'mass', Math.max(Number(e.target.value), 200))}
                    className="w-full bg-transparent px-2 py-1.5 text-xs text-slate-100 font-mono focus:outline-none"
                    min="200"
                    max="20000"
                  />
                  <span className="text-[10px] text-slate-500 px-2 font-bold select-none border-l border-slate-900 bg-slate-950">KG</span>
                </div>
              </div>

            </div>

            {/* Custom Interactive Color Picker Slider Row */}
            <div className="flex items-center justify-between bg-slate-950/50 border border-slate-800/40 p-2.5 rounded-xl">
              <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">차량 도색 커스텀</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-300 uppercase">{activeCar.color}</span>
                <input
                  type="color"
                  value={activeCar.color}
                  onChange={(e) => updateCarProperty(activeCar.id, 'color', e.target.value)}
                  className="w-8 h-6 rounded-md border border-slate-700 bg-transparent cursor-pointer overflow-hidden p-0"
                />
              </div>
            </div>

            {/* Speed slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">초기 주행 속도</span>
                <span className="text-sm font-bold font-mono text-indigo-400">{activeCar.initialSpeed} <span className="text-[10px] text-slate-500 font-semibold">km/h</span></span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="140"
                  step="5"
                  value={activeCar.initialSpeed}
                  onChange={(e) => updateCarProperty(activeCar.id, 'initialSpeed', Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* Launch Heading Angle slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-baseline">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">발사 각도 (방향)</span>
                <span className="text-sm font-bold font-mono text-indigo-400">{activeCar.angle}°</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="15"
                  value={activeCar.angle}
                  onChange={(e) => updateCarProperty(activeCar.id, 'angle', Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* SECTION: Occupant & Safety Systems */}
            <div className="bg-slate-950/40 border border-slate-800/40 p-3 rounded-xl space-y-3">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block border-b border-slate-900 pb-1.5">
                탑승자 안전 장치 설정 (Occupant Safety)
              </span>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Seatbelt Toggle */}
                <button
                  onClick={() => updateCarProperty(activeCar.id, 'hasSeatbelt', activeCar.hasSeatbelt === false ? true : false)}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                    activeCar.hasSeatbelt !== false
                      ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-950/20 border-rose-950/60 text-rose-400'
                  }`}
                >
                  <span className="text-[10px] text-slate-400">안전벨트 착용</span>
                  <span className="font-bold">
                    {activeCar.hasSeatbelt !== false ? '착용 중 (ON)' : '미착용 (OFF)'}
                  </span>
                </button>

                {/* Airbag Toggle */}
                <button
                  onClick={() => updateCarProperty(activeCar.id, 'hasAirbag', activeCar.hasAirbag === false ? true : false)}
                  className={`py-2 px-3 rounded-lg border text-xs font-semibold flex flex-col items-center gap-1.5 transition-all ${
                    activeCar.hasAirbag !== false
                      ? 'bg-indigo-950/40 border-indigo-500/30 text-indigo-400'
                      : 'bg-rose-950/20 border-rose-950/60 text-rose-400'
                  }`}
                >
                  <span className="text-[10px] text-slate-400">에어백 장착</span>
                  <span className="font-bold">
                    {activeCar.hasAirbag !== false ? '장착 됨 (ON)' : '장착 해제 (OFF)'}
                  </span>
                </button>
              </div>
            </div>

            {/* Interactive Engine Run / Stationary Button Toggle */}
            <button
              onClick={() => updateCarProperty(activeCar.id, 'isStationary', !activeCar.isStationary)}
              className={`w-full py-2.5 px-3 rounded-xl border transition-all text-xs font-semibold flex items-center justify-between ${
                activeCar.isStationary
                  ? 'bg-slate-950 border-amber-500/25 text-amber-400'
                  : 'bg-slate-950 border-indigo-500/25 text-indigo-400'
              }`}
            >
              <span>시뮬레이션 초기 상태:</span>
              <span className="font-bold flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${activeCar.isStationary ? 'bg-amber-400' : 'bg-indigo-400 animate-pulse'}`} />
                {activeCar.isStationary ? '대기 중 (Stationary)' : '추진 주행 (Active)'}
              </span>
            </button>

          </div>
        )}
      </div>

      {/* SECTION 3: Environmental Physics Coefficients */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <h3 className="font-bold text-xs text-slate-100 uppercase tracking-wider">물리 환경 변수 조절</h3>
        </div>

        <div className="space-y-4 bg-slate-950/20 border border-slate-800/50 p-4 rounded-xl">
          
          {/* Elasticity (Restitution) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300 font-semibold">반발 탄성 계수 (Elasticity)</span>
              <span className="text-sm font-bold font-mono text-indigo-400">{simulationState.elasticity}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={simulationState.elasticity}
              onChange={(e) => setSimulationState(prev => ({ ...prev, elasticity: Number(e.target.value) }))}
              className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-semibold font-mono">
              <span>0.0 (완전 소성 변형)</span>
              <span>1.0 (완전 탄성 충돌)</span>
            </div>
          </div>

          {/* Road Friction */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-slate-300 font-semibold">도로 마찰 계수 (Road Friction)</span>
              <span className="text-sm font-bold font-mono text-indigo-400">{simulationState.roadFriction}</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={simulationState.roadFriction}
              onChange={(e) => setSimulationState(prev => ({ ...prev, roadFriction: Number(e.target.value) }))}
              className="w-full accent-indigo-500 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500 font-semibold font-mono">
              <span>0.1 (극저 마찰 빙판)</span>
              <span>1.0 (드라이 아스팔트)</span>
            </div>
          </div>

        </div>
      </div>

      {/* SECTION 4: Interactive Sandbox Steer */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="font-bold text-xs text-slate-100 uppercase tracking-wider">사용자 개입 주행 컨트롤</h3>
        </div>

        <div className="bg-amber-500/5 border border-amber-500/15 p-3 rounded-xl flex flex-col gap-2.5">
          <p className="text-[10px] text-slate-400 leading-normal">
            선택된 차량을 키보드(<span className="text-slate-300 font-semibold">WASD / 방향키</span>)로 수동 운전하여 원하는 각도나 타점으로 충격을 직접 만들어 볼 수 있습니다.
          </p>
          
          {/* Quick Tab Segmented Buttons for selecting steer car */}
          <div className="flex gap-1 p-1 bg-slate-950/70 border border-slate-800/80 rounded-xl">
            <button
              onClick={() => setManualCarId(null)}
              className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                manualCarId === null
                  ? 'bg-slate-800 border-slate-700 text-slate-100 shadow-inner'
                  : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              🚫 자동 주행
            </button>
            {cars.map((car) => (
              <button
                key={car.id}
                onClick={() => {
                  setManualCarId(car.id);
                  setSimulationState(prev => ({ ...prev, isRunning: true }));
                }}
                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all flex items-center justify-center gap-1 ${
                  manualCarId === car.id
                    ? 'bg-amber-500/20 border-amber-500/30 text-amber-400 font-bold'
                    : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                🚗 차량 {car.id}
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};
