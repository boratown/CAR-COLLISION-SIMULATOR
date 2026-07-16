export type CarType = 'sedan' | 'suv' | 'sports' | 'truck';

export interface CarSpecs {
  type: CarType;
  name: string;
  defaultMass: number; // kg
  maxSpeed: number; // km/h
  length: number; // meters
  width: number; // meters
  height: number; // meters
  color: string;
}

export const CAR_SPECS_PRESETS: Record<CarType, CarSpecs> = {
  sedan: {
    type: 'sedan',
    name: '세단 (Sedan)',
    defaultMass: 1500,
    maxSpeed: 180,
    length: 4.6,
    width: 1.8,
    height: 1.4,
    color: '#3b82f6', // Blue
  },
  suv: {
    type: 'suv',
    name: 'SUV (SUV)',
    defaultMass: 2200,
    maxSpeed: 160,
    length: 4.9,
    width: 2.0,
    height: 1.8,
    color: '#10b981', // Green
  },
  sports: {
    type: 'sports',
    name: '람보르기니 (Lamborghini)',
    defaultMass: 1575,
    maxSpeed: 350,
    length: 4.78,
    width: 2.03,
    height: 1.13,
    color: '#eab308', // Signature Lamborghini Giallo (Yellow)
  },
  truck: {
    type: 'truck',
    name: '화물차 (Bongo III)',
    defaultMass: 2600,
    maxSpeed: 140,
    length: 5.2,
    width: 1.85,
    height: 2.1,
    color: '#cbd5e1', // Sleek Korean truck blue-grey/white
  },
};

export interface CarConfig {
  id: 'A' | 'B' | 'C';
  type: CarType;
  name: string;
  mass: number; // kg
  initialSpeed: number; // km/h
  color: string;
  angle: number; // degrees (heading)
  x: number; // meters relative to center
  z: number; // meters relative to center
  isStationary: boolean;
  hasSeatbelt?: boolean;
  hasAirbag?: boolean;
}

export type PresetType = 'head_on' | 't_bone' | 'rear_end' | 'wall' | 'multi_pileup';

export interface PresetScenario {
  id: PresetType;
  name: string;
  description: string;
  cars: CarConfig[];
  elasticity: number; // 0 to 1
  friction: number; // 0 to 1
}

export interface TelemetryPoint {
  time: number; // seconds
  carASpeed: number; // km/h
  carBSpeed: number; // km/h
  carAKineticEnergy: number; // kJ
  carBKineticEnergy: number; // kJ
  totalDeformation: number; // overall damage sum
}

export interface InjuryMetrics {
  hic: number; // Head Injury Criterion
  chestG: number; // Chest Deceleration (G)
  femurForce: number; // Femur force (kN)
  airbagDeployed: boolean;
  beltPretensioner: boolean;
  isEjected?: boolean;
  isCrushedFatal?: boolean;
  sandwichPressure?: number;
}

export interface CollisionEvent {
  time: number;
  impactForce: number; // kN
  energyLoss: number; // kJ
  relativeSpeed: number; // km/h
  safetyRating: 'S' | 'A' | 'B' | 'C' | 'D' | 'F'; // Passenger safety rating
  survivalRateA: number; // 0 to 100%
  survivalRateB: number | null; // 0 to 100% (null if hit wall)
  injuryMetricsA: InjuryMetrics;
  injuryMetricsB: InjuryMetrics | null;
}

export interface SimulationState {
  isRunning: boolean;
  timeScale: number; // 0.1, 0.25, 0.5, 1.0 (slow motion controls)
  elasticity: number; // 0 (crumple/inelastic) to 1 (bounce/elastic)
  roadFriction: number; // 0.1 to 1.0
  cameraMode: 'free' | 'followA' | 'followB' | 'top' | 'cinematic';
  showVectors: boolean;
  showDebris: boolean;
  showGrid: boolean;
  timeOfDay: 'day' | 'night' | 'sunset';
}
