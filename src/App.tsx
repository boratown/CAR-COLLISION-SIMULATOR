import { useState, useEffect, useRef } from 'react';
import { 
  CarConfig, 
  SimulationState, 
  CollisionEvent, 
  TelemetryPoint 
} from './types';
import { PRESET_SCENARIOS } from './presets';
import { SimulationCanvas } from './components/SimulationCanvas';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ControlPanel } from './components/ControlPanel';
import { 
  ShieldAlert, 
  Layers, 
  Sparkles, 
  GitCommit, 
  HelpCircle, 
  Volume2, 
  Database,
  Terminal,
  Play
} from 'lucide-react';

export default function App() {
  // Preset Selection
  const [selectedPreset, setSelectedPreset] = useState<string>('head_on');
  
  // Cars configurations initialized from standard Head-On Preset
  const [cars, setCars] = useState<CarConfig[]>(() => {
    const headOn = PRESET_SCENARIOS.find(p => p.id === 'head_on')!;
    return JSON.parse(JSON.stringify(headOn.cars));
  });

  // Global Simulation State
  const [simulationState, setSimulationState] = useState<SimulationState>({
    isRunning: false,
    timeScale: 1.0,
    elasticity: 0.15,
    roadFriction: 0.7,
    cameraMode: 'free',
    showVectors: false,
    showDebris: true,
    showGrid: true,
    timeOfDay: 'day',
  });

  // High-frequency telemetry history
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>([]);
  
  // Realtime collision event statistics
  const [collisionEvent, setCollisionEvent] = useState<CollisionEvent | null>(null);
  
  // Counter to trigger full simulation reset
  const [resetTrigger, setResetTrigger] = useState<number>(0);

  // Keyboard manual steering target vehicle ID
  const [manualCarId, setManualCarId] = useState<'A' | 'B' | 'C' | null>(null);

  // Clear histories and reset whenever the reset trigger changes
  useEffect(() => {
    setTelemetryHistory([]);
    setCollisionEvent(null);
    setSimulationState(prev => ({ ...prev, isRunning: false }));
  }, [resetTrigger]);

  // Handle incoming real-time collision data from physics engine
  const handleCollision = (event: CollisionEvent) => {
    setCollisionEvent(event);
  };

  // Append new telemetry frame safely with maximum buffer cap of 350 frames to avoid memory leaks
  const handleTelemetryUpdate = (point: TelemetryPoint) => {
    setTelemetryHistory((prev) => {
      // Avoid duplicate timestamp additions
      if (prev.length > 0 && prev[prev.length - 1].time === point.time) {
        return prev;
      }
      const newHistory = [...prev, point];
      if (newHistory.length > 350) {
        newHistory.shift(); // remove oldest point
      }
      return newHistory;
    });
  };

  const handleReset = () => {
    setResetTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans select-none antialiased">
      
      {/* Dynamic Glow Background Accents */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

      {/* TOP HEADER BAR */}
      <header className="border-b border-slate-900 bg-slate-950/70 backdrop-blur-md px-6 py-3 sticky top-0 z-40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Procedural Icon/Logo */}
          <div className="relative p-2 bg-indigo-600/10 border border-indigo-500/30 rounded-xl flex items-center justify-center overflow-hidden">
            <ShieldAlert className="w-5 h-5 text-indigo-400 animate-pulse" />
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-indigo-400/10 to-transparent animate-shimmer" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-tight text-slate-100">
                3D 차량 충돌 물리 시뮬레이터
              </h1>
              <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-mono font-bold px-1.5 py-0.5 rounded border border-indigo-500/20 uppercase">
                PHYSICS CORE v1.2
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              실시간 SAT 물리 솔버 기반 강체 충돌, 차량 파손 변형 시각화, 에너지 보존 법칙 연동 및 탑승자 안전 진단 연구 모델
            </p>
          </div>
        </div>

        {/* Quick status specs (Technical Lab aesthetics) */}
        <div className="hidden lg:flex items-center gap-4 text-[10px] font-mono text-slate-400 border-l border-slate-800 pl-4">
          <div>
            <span className="text-slate-500">ENGINE:</span> <span className="text-emerald-500 font-bold">THREE.JS WEBGL</span>
          </div>
          <div className="h-4 w-[1px] bg-slate-800" />
          <div>
            <span className="text-slate-500">INTEGRATOR:</span> <span className="text-slate-300">EULER-VERLET 2.5D</span>
          </div>
          <div className="h-4 w-[1px] bg-slate-800" />
          <div>
            <span className="text-slate-500">SOLVER:</span> <span className="text-indigo-400 font-bold">SAT OBB IMPULSE</span>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT WRAPPER */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 md:p-4 lg:p-4 xl:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-6 z-10 lg:overflow-hidden min-h-0">
        
        {/* LEFT VIEWPORT AREA: 3D Canvas and Live Graphs (8 columns) */}
        <div className="lg:col-span-8 flex flex-col gap-4 h-full min-h-0 overflow-hidden">
          
          {/* Main 3D Simulator Section */}
          <div className="flex flex-col gap-1.5 flex-1 min-h-0">
            <div className="flex items-center justify-between text-xs px-1 shrink-0">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold uppercase">
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                3D 충돌 테스트 베드 (WebGL Sandbox View)
              </div>
              <div className="flex items-center gap-2 text-slate-500 font-mono text-[10px]">
                <span>ORBIT CONTROL: 드래그 회전 / 스크롤 줌</span>
              </div>
            </div>
            
            <div className="flex-1 min-h-0">
              <SimulationCanvas
                cars={cars}
                simulationState={simulationState}
                setSimulationState={setSimulationState}
                onCollision={handleCollision}
                onTelemetryUpdate={handleTelemetryUpdate}
                resetTrigger={resetTrigger}
                setResetTrigger={setResetTrigger}
                manualCarId={manualCarId}
                setManualCarId={setManualCarId}
              />
            </div>
          </div>

          {/* Telemetry Curves & Damage Heatmaps Section */}
          <div className="h-[280px] lg:h-[220px] xl:h-[280px] shrink-0 min-h-0">
            <TelemetryPanel
              telemetryHistory={telemetryHistory}
              collisionEvent={collisionEvent}
              cars={cars}
            />
          </div>

        </div>

        {/* RIGHT SIDEBAR PANEL: Config and parameters (4 columns) */}
        <div className="lg:col-span-4 flex flex-col h-full min-h-0 overflow-hidden">
          <ControlPanel
            cars={cars}
            setCars={setCars}
            simulationState={simulationState}
            setSimulationState={setSimulationState}
            selectedPreset={selectedPreset}
            setSelectedPreset={setSelectedPreset}
            resetSimulation={handleReset}
            manualCarId={manualCarId}
            setManualCarId={setManualCarId}
          />
        </div>

      </main>

      {/* FOOTER BAR */}
      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-2.5 mt-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-1.5 font-mono">
          <Database className="w-3.5 h-3.5" />
          <span>SIMULATION TIME: {telemetryHistory.length > 0 ? telemetryHistory[telemetryHistory.length - 1].time.toFixed(2) : '0.00'} s</span>
        </div>
        <p className="text-center sm:text-right text-[10px]">
          차량의 속도, 질량, 탄성에 의한 물리 변수는 실제 충돌 시험 표준 규격을 근사화한 물리 수식에 의해 실시간 해석됩니다.
        </p>
      </footer>

    </div>
  );
}
