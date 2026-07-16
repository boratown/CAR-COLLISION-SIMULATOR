import { PresetScenario, CAR_SPECS_PRESETS } from './types';

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'head_on',
    name: '정면 충돌 (Head-on Collision)',
    description: '서로 마주 보고 주행하던 두 차량이 정면으로 부딪히는 시나리오입니다. 속도가 더해져 매우 큰 충격력이 발생하며, 질량이 큰 차가 더 높은 안전성을 유지합니다.',
    elasticity: 0.15, // Highly inelastic (crumple)
    friction: 0.7, // Dry asphalt
    cars: [
      {
        id: 'A',
        type: 'sports',
        name: '공격 차량 (람보르기니)',
        mass: CAR_SPECS_PRESETS.sports.defaultMass,
        initialSpeed: 80, // km/h
        color: '#ef4444',
        angle: 0, // Facing East (positive X)
        x: -25, // Start on the left
        z: 0,
        isStationary: false,
      },
      {
        id: 'B',
        type: 'suv',
        name: '방어 차량 (SUV)',
        mass: CAR_SPECS_PRESETS.suv.defaultMass,
        initialSpeed: 60, // km/h
        color: '#10b981',
        angle: 180, // Facing West (negative X)
        x: 25, // Start on the right
        z: 0,
        isStationary: false,
      }
    ],
  },
  {
    id: 't_bone',
    name: '측면 수직 충돌 (T-Bone Intersection)',
    description: '교차로에서 신호위반 등으로 직진하는 차량의 측면을 다른 차량이 들이받는 시나리오입니다. 측면 에어백과 변형 흡수 한계를 평가하기 좋습니다.',
    elasticity: 0.1,
    friction: 0.7,
    cars: [
      {
        id: 'A',
        type: 'sedan',
        name: '교차 주행 차 (세단)',
        mass: CAR_SPECS_PRESETS.sedan.defaultMass,
        initialSpeed: 65,
        color: '#3b82f6',
        angle: 90, // Facing North (positive Z)
        x: 0,
        z: -25, // Start at bottom
        isStationary: false,
      },
      {
        id: 'B',
        type: 'suv',
        name: '직진 주행 차 (SUV)',
        mass: CAR_SPECS_PRESETS.suv.defaultMass,
        initialSpeed: 45,
        color: '#f59e0b',
        angle: 0, // Facing East (positive X)
        x: -25, // Start on the left
        z: 0,
        isStationary: false,
      }
    ],
  },
  {
    id: 'rear_end',
    name: '후방 충돌 (Rear-end Collision)',
    description: '앞차가 신호대기 혹은 저속 주행 중일 때, 뒤따르던 화물차가 제동 장치 이상 등으로 후방을 추돌하는 시나리오입니다. 충돌 후 앞차가 튕겨 나가는 현상이 두드러집니다.',
    elasticity: 0.25,
    friction: 0.7,
    cars: [
      {
        id: 'A',
        type: 'truck',
        name: '후방 충돌차 (봉고 화물차)',
        mass: CAR_SPECS_PRESETS.truck.defaultMass,
        initialSpeed: 70,
        color: '#4b5563',
        angle: 0, // Facing East
        x: -30,
        z: 0,
        isStationary: false,
      },
      {
        id: 'B',
        type: 'sedan',
        name: '선행 대기차 (세단)',
        mass: CAR_SPECS_PRESETS.sedan.defaultMass,
        initialSpeed: 20, // Slowly moving or stationary
        color: '#3b82f6',
        angle: 0, // Facing East
        x: 5,
        z: 0,
        isStationary: false,
      }
    ],
  },
  {
    id: 'wall',
    name: '콘크리트 벽 충돌 테스트 (Barrier Crash Test)',
    description: '차량이 주행 중 감속 없이 단단한 옹벽이나 방호벽에 정면 충돌하는 시나리오입니다. 벽의 질량은 무한대로 가정되며, 가해진 모든 충격 에너지가 차량 변형으로 고스란히 흡수됩니다.',
    elasticity: 0.05, // Minimal bounce, mostly crumpling
    friction: 0.7,
    cars: [
      {
        id: 'A',
        type: 'sports',
        name: '테스트 차량 (람보르기니)',
        mass: CAR_SPECS_PRESETS.sports.defaultMass,
        initialSpeed: 100, // Very fast
        color: '#ef4444',
        angle: 0, // Facing East
        x: -25,
        z: 0,
        isStationary: false,
      }
      // Car B is skipped or acts as a stationary rigid wall (handled in rendering engine)
    ],
  },
  {
    id: 'multi_pileup',
    name: '3중 연쇄 충돌 (3-Vehicle Pile-up)',
    description: '주행 차량이 대기 중인 차량을 추돌하고, 그 충격으로 튕겨 나간 차가 그 앞의 또 다른 차를 추돌하는 다중 연쇄 충돌 사고를 재현합니다.',
    elasticity: 0.2,
    friction: 0.65,
    cars: [
      {
        id: 'A',
        type: 'truck',
        name: '유발 차량 (봉고 화물차)',
        mass: CAR_SPECS_PRESETS.truck.defaultMass,
        initialSpeed: 80,
        color: '#f59e0b',
        angle: 0, // Facing East
        x: -30,
        z: 0,
        isStationary: false,
      },
      {
        id: 'B',
        type: 'sedan',
        name: '중간 대기차 (세단)',
        mass: CAR_SPECS_PRESETS.sedan.defaultMass,
        initialSpeed: 0, // Stationary
        color: '#3b82f6',
        angle: 0, // Facing East
        x: 0,
        z: 0,
        isStationary: true,
      },
      {
        id: 'C',
        type: 'suv',
        name: '최선두 대기차 (SUV)',
        mass: CAR_SPECS_PRESETS.suv.defaultMass,
        initialSpeed: 0, // Stationary
        color: '#10b981',
        angle: 0, // Facing East
        x: 12,
        z: 0,
        isStationary: true,
      }
    ],
  }
];
