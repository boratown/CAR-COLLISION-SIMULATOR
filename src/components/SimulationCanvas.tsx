import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  CarConfig, 
  SimulationState, 
  CollisionEvent, 
  TelemetryPoint, 
  CAR_SPECS_PRESETS,
  CarType
} from '../types';
import { Play, Pause, RotateCcw, Eye, Zap, Grid, HelpCircle, Shield, Sparkles, Volume2, Info } from 'lucide-react';

interface SimulationCanvasProps {
  cars: CarConfig[];
  simulationState: SimulationState;
  setSimulationState: React.Dispatch<React.SetStateAction<SimulationState>>;
  onCollision: (event: CollisionEvent) => void;
  onTelemetryUpdate: (point: TelemetryPoint) => void;
  resetTrigger: number;
  setResetTrigger: React.Dispatch<React.SetStateAction<number>>;
  manualCarId: 'A' | 'B' | 'C' | null;
  setManualCarId: (id: 'A' | 'B' | 'C' | null) => void;
}

// Internal state representation of a vehicle in the physics loop
interface PhysicsVehicle {
  id: 'A' | 'B' | 'C';
  type: CarType;
  x: number;
  z: number;
  y?: number; // 3D vertical position
  vy?: number; // 3D vertical velocity
  pitch?: number; // 3D pitch angle (radians)
  roll?: number; // 3D roll angle (radians)
  vPitch?: number; // 3D pitch angular velocity
  vRoll?: number; // 3D roll angular velocity
  vAngle?: number; // 3D yaw angular velocity
  vx: number;
  vz: number;
  angle: number; // in radians
  mass: number;
  width: number;
  length: number;
  height: number;
  color: string;
  damage: number;
  isStationary: boolean;
  steerAngle: number;
  engineForce: number;
  braking: boolean;
  group: THREE.Group | null;
  bodyMesh: THREE.Mesh | null;
  originalPositions: THREE.Vector3[] | null; // For restoring geometry on reset
  cabinMesh: THREE.Mesh | null;
  originalCabinPositions: THREE.Vector3[] | null;
  doorLOpenAngle?: number;
  doorROpenAngle?: number;
  doorLIsHanging?: boolean;
  doorRIsHanging?: boolean;
  isSuspensionCollapsed?: boolean;
  prevVx?: number;
  prevVy?: number;
  prevVz?: number;
  occupant?: {
    group: THREE.Group;
    upperBodyPivot: THREE.Group;
    headPivot: THREE.Group;
    seatbeltGroup: THREE.Group;
    airbagMesh: THREE.Mesh;
    pitch: number;
    vPitch: number;
    roll: number;
    vRoll: number;
    headPitch: number;
    vHeadPitch: number;
    ejected: boolean;
    worldPos?: THREE.Vector3;
    worldVel?: THREE.Vector3;
    worldRot?: THREE.Vector3;
    worldVRot?: THREE.Vector3;
    airbagScale: number;
    airbagDeploying: boolean;
    airbagDeployTime: number;
    hasSeatbelt: boolean;
    hasAirbag: boolean;
  };
  isSandwiched?: boolean;
  sandwichPressure?: number;
  maxSandwichPressure?: number;
  crushScaleZ?: number;
  crushScaleX?: number;
  crushScaleY?: number;
  isCrushedFatal?: boolean;
  activeCollisions?: Array<{ targetId: string; normal: THREE.Vector3; forceKN: number }>;
}

const createSuspensionStrut = (color: string, height: number) => {
  const strut = new THREE.Group();
  
  // Damper shaft (inner piston)
  const shaftGeo = new THREE.CylinderGeometry(0.016, 0.016, height, 8);
  const shaftMat = new THREE.MeshStandardMaterial({ 
    color: '#cbd5e1', 
    metalness: 0.95, 
    roughness: 0.1 
  });
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  shaft.position.y = height / 2;
  strut.add(shaft);

  // Outer cylinder housing (bottom sleeve)
  const sleeveGeo = new THREE.CylinderGeometry(0.042, 0.042, height * 0.45, 8);
  const sleeveMat = new THREE.MeshStandardMaterial({ 
    color: '#1e293b', 
    metalness: 0.8, 
    roughness: 0.3 
  });
  const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
  sleeve.position.y = height * 0.225;
  strut.add(sleeve);

  // Helical coil springs (stacked rings around the shaft)
  const coilCount = 7;
  const coilMat = new THREE.MeshStandardMaterial({ 
    color: color, 
    metalness: 0.8, 
    roughness: 0.2 
  });
  const ringGeo = new THREE.TorusGeometry(0.065, 0.014, 8, 16);
  ringGeo.rotateX(Math.PI / 2);
  
  // Stack them with equal spacing
  const coilHeight = height * 0.65;
  const startY = height * 0.3;
  const step = coilHeight / (coilCount - 1);
  for (let i = 0; i < coilCount; i++) {
    const ring = new THREE.Mesh(ringGeo, coilMat);
    ring.position.y = startY + (i * step);
    strut.add(ring);
  }

  return strut;
};

const createOccupantDummy = () => {
  const dummyGroup = new THREE.Group();
  dummyGroup.name = 'occupant_dummy';

  const dummyMat = new THREE.MeshStandardMaterial({ 
    color: '#fbbf24', // Crash test dummy yellow-orange
    roughness: 0.35, 
    metalness: 0.15 
  });
  const blackMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.8 });
  const beltMat = new THREE.MeshStandardMaterial({ 
    color: '#f97316', // Bright safety orange seatbelt!
    roughness: 0.7 
  });

  // Hips / Pelvis
  const hipsGeo = new THREE.BoxGeometry(0.24, 0.08, 0.18);
  const hips = new THREE.Mesh(hipsGeo, dummyMat);
  hips.position.y = 0.04;
  hips.castShadow = true;
  hips.receiveShadow = true;
  dummyGroup.add(hips);

  // Thighs (resting horizontal/slightly angled)
  const thighGeo = new THREE.CylinderGeometry(0.042, 0.034, 0.22, 8);
  thighGeo.rotateX(Math.PI / 2); // extend forward along Z
  
  const thighL = new THREE.Mesh(thighGeo, dummyMat);
  thighL.position.set(-0.08, 0.04, 0.1);
  thighL.castShadow = true;
  dummyGroup.add(thighL);

  const thighR = new THREE.Mesh(thighGeo, dummyMat);
  thighR.position.set(0.08, 0.04, 0.1);
  thighR.castShadow = true;
  dummyGroup.add(thighR);

  // Upper Body pivot (Hips to Torso joint)
  const upperBodyPivot = new THREE.Group();
  upperBodyPivot.name = 'upper_body_pivot';
  upperBodyPivot.position.set(0, 0.06, 0); // pivot at top of hips
  dummyGroup.add(upperBodyPivot);

  // Torso / Chest
  const torsoGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.28, 8);
  const torso = new THREE.Mesh(torsoGeo, dummyMat);
  torso.position.y = 0.14; // half height of chest
  torso.castShadow = true;
  torso.receiveShadow = true;
  upperBodyPivot.add(torso);

  // Chest target sticker (Crash test symbol)
  const stickerGeo = new THREE.CylinderGeometry(0.092, 0.092, 0.04, 8);
  const stickerMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.5 });
  const sticker = new THREE.Mesh(stickerGeo, stickerMat);
  sticker.position.y = 0.16;
  upperBodyPivot.add(sticker);

  // Arms
  const armGeo = new THREE.CylinderGeometry(0.026, 0.022, 0.24, 8);
  const armL = new THREE.Mesh(armGeo, dummyMat);
  armL.position.set(-0.11, 0.14, 0.06);
  armL.rotation.x = 0.4; // lean slightly forward
  armL.rotation.z = -0.1;
  armL.castShadow = true;
  upperBodyPivot.add(armL);

  const armR = new THREE.Mesh(armGeo, dummyMat);
  armR.position.set(0.11, 0.14, 0.06);
  armR.rotation.x = 0.4;
  armR.rotation.z = 0.1;
  armR.castShadow = true;
  upperBodyPivot.add(armR);

  // Neck + Head group
  const headPivot = new THREE.Group();
  headPivot.name = 'head_pivot';
  headPivot.position.set(0, 0.28, 0); // neck position
  upperBodyPivot.add(headPivot);

  // Neck
  const neckGeo = new THREE.CylinderGeometry(0.025, 0.03, 0.05, 8);
  const neck = new THREE.Mesh(neckGeo, blackMat);
  neck.position.y = 0.025;
  headPivot.add(neck);

  // Head
  const headGeo = new THREE.SphereGeometry(0.08, 12, 12);
  const head = new THREE.Mesh(headGeo, dummyMat);
  head.position.y = 0.095;
  head.castShadow = true;
  headPivot.add(head);

  // Head target sticker (left and right sides of head)
  const targetMarkGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.165, 8);
  targetMarkGeo.rotateZ(Math.PI / 2);
  const targetMark = new THREE.Mesh(targetMarkGeo, blackMat);
  targetMark.position.y = 0.095;
  headPivot.add(targetMark);

  // Let's add seatbelt mesh across the torso!
  // It's a diagonal strap starting from top-right of torso to bottom-left of hips
  const seatbeltGroup = new THREE.Group();
  seatbeltGroup.name = 'seatbelt';
  
  const beltGeo = new THREE.BoxGeometry(0.012, 0.38, 0.18);
  // Rotate the belt diagonal across the chest
  beltGeo.rotateZ(-0.48); // diagonal angle
  const beltMesh = new THREE.Mesh(beltGeo, beltMat);
  beltMesh.position.set(0, 0.14, 0.05); // slightly forward of chest center
  seatbeltGroup.add(beltMesh);

  // Add lap belt
  const lapGeo = new THREE.BoxGeometry(0.24, 0.012, 0.15);
  const lapMesh = new THREE.Mesh(lapGeo, beltMat);
  lapMesh.position.set(0, 0.05, 0.08);
  seatbeltGroup.add(lapMesh);

  dummyGroup.add(seatbeltGroup);

  return {
    group: dummyGroup,
    upperBodyPivot: upperBodyPivot,
    headPivot: headPivot,
    seatbeltGroup: seatbeltGroup
  };
};

const createDoorGroup = (side: 'L' | 'R', spec: any, color: string) => {
  const doorGroup = new THREE.Group();
  doorGroup.name = `door_${side}`;
  
  const isTruck = spec.type === 'truck';
  const doorLength = isTruck ? 0.85 : spec.length * 0.32;
  const doorHeight = isTruck ? 1.15 : spec.height * 0.38;
  
  // Outer sheet metal panel (shifted back by half-length so pivot is at front edge/hinge)
  const panelGeo = new THREE.BoxGeometry(0.03, doorHeight, doorLength);
  const panelMat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: 0.2,
    metalness: 0.8,
    flatShading: true
  });
  const panel = new THREE.Mesh(panelGeo, panelMat);
  panel.position.set(0, 0, -doorLength / 2);
  panel.castShadow = true;
  panel.receiveShadow = true;
  doorGroup.add(panel);
  
  // Window glass (shifted back as well)
  const glassHeight = isTruck ? 0.68 : spec.height * 0.28;
  const glassGeo = new THREE.BoxGeometry(0.015, glassHeight, doorLength * 0.95);
  const glassMat = new THREE.MeshStandardMaterial({
    color: '#0f172a',
    roughness: 0.1,
    metalness: 0.9,
    transparent: true,
    opacity: 0.65
  });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  const glassY = isTruck ? 0.35 : spec.height * 0.31;
  glass.position.set(0, glassY, -doorLength / 2);
  doorGroup.add(glass);
  
  // Door handle
  const handleGeo = new THREE.BoxGeometry(0.02, 0.015, 0.06);
  const handleMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.9, roughness: 0.1 });
  const handle = new THREE.Mesh(handleGeo, handleMat);
  // handle placed on the rear part of the door panel (which is further negative along Z)
  const handleZ = isTruck ? -doorLength * 0.78 : -doorLength * 0.85;
  const handleY = isTruck ? -0.05 : 0.05;
  handle.position.set(side === 'L' ? -0.022 : 0.022, handleY, handleZ);
  doorGroup.add(handle);
  
  return doorGroup;
};

const createSideMirror = (side: 'L' | 'R', spec: any, color: string) => {
  const mirrorGroup = new THREE.Group();
  mirrorGroup.name = `mirror_${side}`;
  
  const isTruck = spec.type === 'truck';
  // Mirror body (vertical for truck, horizontal for others)
  const bodyGeo = isTruck 
    ? new THREE.BoxGeometry(0.08, 0.18, 0.08) 
    : new THREE.BoxGeometry(0.12, 0.08, 0.08);
  const bodyMat = new THREE.MeshStandardMaterial({ 
    color: isTruck ? '#1e293b' : color, 
    roughness: isTruck ? 0.7 : 0.2, 
    metalness: isTruck ? 0.2 : 0.8 
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  mirrorGroup.add(body);
  
  // Mirror stalk (connects to car)
  const stalkLength = isTruck ? 0.12 : 0.06;
  const stalkGeo = new THREE.BoxGeometry(stalkLength, 0.03, 0.03);
  const stalk = new THREE.Mesh(stalkGeo, bodyMat);
  stalk.position.set(side === 'L' ? stalkLength * 0.7 : -stalkLength * 0.7, -0.02, 0);
  stalk.castShadow = true;
  mirrorGroup.add(stalk);
  
  // Mirror glass face
  const glassGeo = isTruck 
    ? new THREE.BoxGeometry(0.01, 0.16, 0.07) 
    : new THREE.BoxGeometry(0.01, 0.07, 0.07);
  const glassMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.95, roughness: 0.05 });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(side === 'L' ? -0.041 : 0.041, 0, 0);
  mirrorGroup.add(glass);
  
  return mirrorGroup;
};

const computeInjuryAndSurvival = (
  mass: number, 
  impactForceKN: number, 
  hasSeatbelt: boolean = true, 
  hasAirbag: boolean = true,
  isCrushedFatal: boolean = false
) => {
  const decelerationG = (impactForceKN * 1000) / mass;
  const isEjected = decelerationG > 18.0 && !hasSeatbelt;
  const airbagDeployed = decelerationG > 3.5 && hasAirbag;
  const beltPretensioner = decelerationG > 2.0 && hasSeatbelt;

  // Let's model injury values realistically based on safety systems!
  // If NO seatbelt, HIC and Chest G are MUCH higher because head and chest slam into the steering wheel/dash/glass,
  // and they can get ejected! Ejected occupants have near-zero survival rates on heavy crashes.
  let headFactor = 1.0;
  let chestFactor = 1.0;
  let femurFactor = 1.0;
  
  if (hasSeatbelt) {
    headFactor = airbagDeployed ? 0.33 : 0.72;
    chestFactor = airbagDeployed ? 0.42 : 0.68;
    femurFactor = beltPretensioner ? 0.72 : 1.1;
  } else {
    // No seatbelt! Severe contact injuries
    headFactor = airbagDeployed ? 0.85 : 1.95; // catastrophic without seatbelt or airbag
    chestFactor = airbagDeployed ? 0.9 : 1.85;
    femurFactor = 1.6; // flying forward, knees hit dashboard!
  }

  // HIC (Head Injury Criterion): head impact index
  let hic = Math.round(Math.pow(decelerationG * headFactor, 2.15) * 0.11);
  
  // Chest Deceleration (G)
  let chestG = Math.round(decelerationG * chestFactor);

  // Femur Force (kN) - load on the thighs
  let femurForce = parseFloat((decelerationG * 0.06 * femurFactor).toFixed(2));

  // Survival Rate (%) based on a logistic curve
  // Base threshold is much higher with a seatbelt
  let threshold = 32; // basic rating without safety
  if (hasSeatbelt) {
    threshold = airbagDeployed ? 72 : 52;
  } else {
    threshold = airbagDeployed ? 38 : 16; // very low threshold without seatbelts
  }
  
  let slope = hasSeatbelt ? (airbagDeployed ? 13 : 10) : 6;
  
  let survivalRate = Math.round(100 / (1 + Math.exp((decelerationG - threshold) / slope)));

  // If ejected, they tumble on asphalt, further dropping survival rate
  if (isEjected) {
    survivalRate = Math.min(survivalRate, Math.round(Math.max(4, 85 - decelerationG * 1.8)));
  }

  if (survivalRate < 0) survivalRate = 0;
  if (survivalRate > 100) survivalRate = 100;

  // FATAL CRUSH / SANDWICH OVERRIDE
  if (isCrushedFatal) {
    survivalRate = 0;
    hic = 9999;
    chestG = 999;
    femurForce = 999.0;
  }

  return {
    survivalRate,
    metrics: {
      hic,
      chestG,
      femurForce,
      airbagDeployed,
      beltPretensioner,
      isEjected,
      isCrushedFatal
    }
  };
};

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({
  cars,
  simulationState,
  setSimulationState,
  onCollision,
  onTelemetryUpdate,
  resetTrigger,
  setResetTrigger,
  manualCarId,
  setManualCarId,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  
  // Keep refs of react states for use inside the RAF loop without re-triggering useEffect
  const simStateRef = useRef<SimulationState>(simulationState);
  useEffect(() => {
    simStateRef.current = simulationState;
  }, [simulationState]);

  const carsConfigRef = useRef<CarConfig[]>(cars);
  useEffect(() => {
    carsConfigRef.current = cars;
  }, [cars]);

  // Keep a manual controller ref for keystrokes
  const keysPressed = useRef<Record<string, boolean>>({});
  const manualCarIdRef = useRef<'A' | 'B' | 'C' | null>(manualCarId);
  useEffect(() => {
    manualCarIdRef.current = manualCarId;
  }, [manualCarId]);

  // Scene references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  
  // Lighting references for time-of-day changes
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);

  // Simulation physics variables
  const vehiclesRef = useRef<PhysicsVehicle[]>([]);
  const wallMeshRef = useRef<THREE.Mesh | null>(null);
  const particleSystemRef = useRef<{
    sparks: { points: THREE.Points; velocities: THREE.Vector3[]; ages: number[]; maxAge: number };
    smoke: { points: THREE.Points; velocities: THREE.Vector3[]; ages: number[]; sizes: number[]; maxAge: number };
    debris: { meshes: THREE.Mesh[]; velocities: THREE.Vector3[]; angularVelocities: THREE.Vector3[]; ages: number[]; maxAge: number };
  } | null>(null);

  // Audio simulation / Visual text popups
  const popupsRef = useRef<{ element: HTMLDivElement; worldPos: THREE.Vector3; age: number; maxAge: number }[]>([]);
  
  // Tracking simulation time
  const simulationTimeRef = useRef<number>(0);
  const collisionOccurredRef = useRef<boolean>(false);
  const totalDeformationSumRef = useRef<number>(0);

  // Camera shake intensity
  const cameraShakeIntensityRef = useRef<number>(0);

  // Capture keystrokes for manual driving
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Set up the Three.js scene once
  useEffect(() => {
    if (!mountRef.current) return;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color('#0f172a'); // Slate 900
    scene.fog = new THREE.FogExp2('#0f172a', 0.015);

    // Create camera
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    cameraRef.current = camera;
    camera.position.set(-30, 20, 40);

    // Create WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    rendererRef.current = renderer;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    mountRef.current.appendChild(renderer.domElement);

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
    controls.minDistance = 5;
    controls.maxDistance = 150;

    // Ambient Lighting
    const ambientLight = new THREE.AmbientLight('#1e293b', 1.5);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    // Directional Sunlight (Casts shadows)
    const dirLight = new THREE.DirectionalLight('#ffffff', 3.0);
    dirLight.position.set(40, 50, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    const d = 40;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    // Grid ground / testing pad
    const createGround = () => {
      const groundGroup = new THREE.Group();
      
      // Main concrete floor
      const floorGeo = new THREE.PlaneGeometry(300, 300);
      const floorMat = new THREE.MeshStandardMaterial({
        color: '#1e293b', // Slate 800
        roughness: 0.8,
        metalness: 0.2,
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      groundGroup.add(floor);

      // Dynamic Grid
      const gridHelper = new THREE.GridHelper(200, 100, '#475569', '#334155');
      gridHelper.position.y = 0.01;
      groundGroup.add(gridHelper);

      // Testing Ring / Markings (Center target area)
      const ringGeo = new THREE.RingGeometry(14.8, 15, 64);
      const ringMat = new THREE.MeshBasicMaterial({ color: '#f59e0b', side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015;
      groundGroup.add(ring);

      const centerCrossGeo1 = new THREE.PlaneGeometry(30, 0.15);
      const centerCrossGeo2 = new THREE.PlaneGeometry(0.15, 30);
      const markingMat = new THREE.MeshBasicMaterial({ color: '#475569' });
      
      const cross1 = new THREE.Mesh(centerCrossGeo1, markingMat);
      cross1.rotation.x = -Math.PI / 2;
      cross1.position.set(0, 0.012, 0);
      groundGroup.add(cross1);

      const cross2 = new THREE.Mesh(centerCrossGeo2, markingMat);
      cross2.rotation.x = -Math.PI / 2;
      cross2.position.set(0, 0.012, 0);
      groundGroup.add(cross2);

      // Crash Wall (Placed dynamically in scene if needed, but we build it here)
      const wallGeo = new THREE.BoxGeometry(6, 10, 40);
      
      // Canvas text for Crash Wall texture
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#64748b'; // Concrete
        ctx.fillRect(0, 0, 256, 256);
        // Yellow hazard lines
        ctx.fillStyle = '#f59e0b';
        ctx.lineWidth = 15;
        for (let i = -10; i < 20; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 30, 0);
          ctx.lineTo(i * 30 + 30, 256);
          ctx.lineTo(i * 30 + 50, 256);
          ctx.lineTo(i * 30 + 20, 0);
          ctx.fill();
        }
        // Border and Text
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(20, 100, 216, 56);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CRASH TEST', 128, 128);
      }
      const wallTexture = new THREE.CanvasTexture(canvas);
      const wallMat = new THREE.MeshStandardMaterial({
        map: wallTexture,
        roughness: 0.9,
        metalness: 0.1
      });
      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.position.set(15, 5, 0); // Wall is located 15m east
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      wallMesh.visible = false; // Toggle visible depending on preset
      groundGroup.add(wallMesh);
      wallMeshRef.current = wallMesh;

      scene.add(groundGroup);
    };

    createGround();

    // Create particle systems
    const initParticles = () => {
      // 1. Sparks
      const sparkCount = 300;
      const sparkGeo = new THREE.BufferGeometry();
      const sparkPos = new Float32Array(sparkCount * 3);
      sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
      
      const sparkMat = new THREE.PointsMaterial({
        color: '#ff7700',
        size: 0.35,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
      scene.add(sparkPoints);

      // 2. Smoke
      const smokeCount = 150;
      const smokeGeo = new THREE.BufferGeometry();
      const smokePos = new Float32Array(smokeCount * 3);
      smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePos, 3));
      
      const smokeMat = new THREE.PointsMaterial({
        color: '#64748b',
        size: 0.8,
        transparent: true,
        opacity: 0.0,
        blending: THREE.NormalBlending,
        depthWrite: false
      });
      const smokePoints = new THREE.Points(smokeGeo, smokeMat);
      scene.add(smokePoints);

      particleSystemRef.current = {
        sparks: {
          points: sparkPoints,
          velocities: Array.from({ length: sparkCount }, () => new THREE.Vector3()),
          ages: Array(sparkCount).fill(100),
          maxAge: 45 // Frames
        },
        smoke: {
          points: smokePoints,
          velocities: Array.from({ length: smokeCount }, () => new THREE.Vector3()),
          ages: Array(smokeCount).fill(100),
          sizes: Array(smokeCount).fill(0.8),
          maxAge: 90
        },
        debris: {
          meshes: [],
          velocities: [],
          angularVelocities: [],
          ages: [],
          maxAge: 120
        }
      };
    };

    initParticles();

    // Handle container resizing securely using ResizeObserver (safe and robust)
    let resizeAnimationFrameId: number | null = null;
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      const adjustedHeight = Math.max(height, 100); // Guard minimum height

      if (resizeAnimationFrameId !== null) {
        cancelAnimationFrame(resizeAnimationFrameId);
      }

      resizeAnimationFrameId = requestAnimationFrame(() => {
        if (cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = width / adjustedHeight;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(width, adjustedHeight);
        }
      });
    });

    if (mountRef.current) {
      resizeObserver.observe(mountRef.current);
    }

    // Set up cleanup
    return () => {
      if (resizeAnimationFrameId !== null) {
        cancelAnimationFrame(resizeAnimationFrameId);
      }
      resizeObserver.disconnect();
      if (controlsRef.current && typeof controlsRef.current.dispose === 'function') {
        controlsRef.current.dispose();
      }
      if (rendererRef.current) {
        if (typeof rendererRef.current.dispose === 'function') {
          rendererRef.current.dispose();
        }
        if (mountRef.current && rendererRef.current.domElement) {
          try {
            mountRef.current.removeChild(rendererRef.current.domElement);
          } catch (e) {
            // ignore
          }
        }
      }
    };
  }, []);

  // Re-run whenever scene parameters, preset, or reset trigger changes to spawn the vehicles
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear existing vehicle mesh groups
    vehiclesRef.current.forEach((veh) => {
      if (veh.group) scene.remove(veh.group);
    });

    // Clear flying debris meshes
    if (particleSystemRef.current) {
      particleSystemRef.current.debris.meshes.forEach((mesh) => scene.remove(mesh));
      particleSystemRef.current.debris.meshes = [];
      particleSystemRef.current.debris.velocities = [];
      particleSystemRef.current.debris.angularVelocities = [];
      particleSystemRef.current.debris.ages = [];
    }

    // Reset collision state
    collisionOccurredRef.current = false;
    simulationTimeRef.current = 0;
    totalDeformationSumRef.current = 0;

    // Set Wall Visibility
    const isWallPreset = carsConfigRef.current.length === 1; // Wall preset only has 1 car
    if (wallMeshRef.current) {
      wallMeshRef.current.visible = isWallPreset;
    }

    // Build vehicles based on cars configuration
    const activeVehicles: PhysicsVehicle[] = carsConfigRef.current.map((cfg) => {
      const spec = CAR_SPECS_PRESETS[cfg.type];
      const carGroup = new THREE.Group();
      carGroup.castShadow = true;
      carGroup.receiveShadow = true;

      // Chassis group acts as the sprung mass (everything supported by the suspension)
      const chassisGroup = new THREE.Group();
      chassisGroup.name = 'chassis';
      carGroup.add(chassisGroup);

      // Create vehicle body as a segmented box to support deformation with high detail
      // BoxGeometry (width, height, depth, widthSegments, heightSegments, depthSegments)
      // Three's coordinates: X=width, Y=height, Z=length
      const isTruck = cfg.type === 'truck';
      const isSports = cfg.type === 'sports';
      const bodyGeo = isTruck
        ? new THREE.BoxGeometry(spec.width, spec.height * 0.18, spec.length, 10, 5, 18)
        : isSports
        ? new THREE.BoxGeometry(spec.width, spec.height * 0.42, spec.length, 12, 6, 20)
        : new THREE.BoxGeometry(spec.width, spec.height * 0.5, spec.length, 10, 5, 18);
      
      // Perform programmatic Lamborghini wedge shape molding if sports type
      if (isSports) {
        const posAttr = bodyGeo.attributes.position;
        const halfLength = spec.length / 2;
        for (let i = 0; i < posAttr.count; i++) {
          let x = posAttr.getX(i);
          let y = posAttr.getY(i);
          let z = posAttr.getZ(i);
          
          // Slope down towards the front (wedge profile)
          if (z > 0) {
            const factor = 1 - (z / halfLength) * 0.65;
            y = y * factor;
            posAttr.setY(i, y);
          }
          
          // Pointed nose tapering
          if (z > -halfLength * 0.2) {
            const t = (z + halfLength * 0.2) / (halfLength * 1.2);
            const factor = 1 - t * 0.18;
            x = x * factor;
            posAttr.setX(i, x);
          }
        }
        bodyGeo.computeVertexNormals();
      }
      
      // Standardize colors & create a glossy metallic car paint material
      const bodyMat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: 0.2,
        metalness: 0.8,
        flatShading: true, // Flat shading gives an incredible stylized mechanical look!
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.position.y = isTruck ? spec.height * 0.16 : isSports ? spec.height * 0.38 : spec.height * 0.45;
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      chassisGroup.add(bodyMesh);

      // Save original vertex positions so we can crumple and reset cleanly
      const posAttr = bodyGeo.attributes.position;
      const originalPositions: THREE.Vector3[] = [];
      for (let i = 0; i < posAttr.count; i++) {
        originalPositions.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
      }

      // Add Cabin (Windshields & glass) with high segments for deformation
      const cabinGeo = isTruck
        ? new THREE.BoxGeometry(spec.width * 0.94, spec.height * 0.55, spec.length * 0.28, 6, 6, 10)
        : isSports
        ? new THREE.BoxGeometry(spec.width * 0.88, spec.height * 0.42, spec.length * 0.55, 10, 5, 14)
        : new THREE.BoxGeometry(spec.width * 0.9, spec.height * 0.5, spec.length * 0.45, 6, 4, 10);
      
      // Slant windshield and roofline for Lamborghini fastback canopy
      if (isSports) {
        const posAttr = cabinGeo.attributes.position;
        const halfLength = (spec.length * 0.55) / 2;
        for (let i = 0; i < posAttr.count; i++) {
          let y = posAttr.getY(i);
          let z = posAttr.getZ(i);
          
          if (z > 0) {
            const factor = 1 - (z / halfLength) * 0.72; // aggressive windshield slope
            y = y * factor;
            posAttr.setY(i, y);
          }
          if (z < 0) {
            const factor = 1 - (Math.abs(z) / halfLength) * 0.35; // sleek fastback roofline
            y = y * factor;
            posAttr.setY(i, y);
          }
        }
        cabinGeo.computeVertexNormals();
      }

      const cabinMat = isTruck
        ? bodyMat
        : new THREE.MeshStandardMaterial({
            color: '#0f172a',
            roughness: 0.1,
            metalness: 0.9,
            transparent: true,
            opacity: 0.85
          });
      const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
      cabinMesh.name = 'cabin';
      if (isTruck) {
        cabinMesh.position.set(0, spec.height * 0.52, spec.length * 0.36);
      } else if (isSports) {
        cabinMesh.position.set(0, spec.height * 0.56, spec.length * 0.02);
      } else {
        cabinMesh.position.set(0, spec.height * 0.8, -spec.length * 0.05);
      }
      cabinMesh.castShadow = true;
      chassisGroup.add(cabinMesh);

      // Save original cabin vertex positions so we can deform it on heavy crash
      const cabinPosAttr = cabinGeo.attributes.position;
      const originalCabinPositions: THREE.Vector3[] = [];
      for (let i = 0; i < cabinPosAttr.count; i++) {
        originalCabinPositions.push(new THREE.Vector3(cabinPosAttr.getX(i), cabinPosAttr.getY(i), cabinPosAttr.getZ(i)));
      }

      if (isTruck) {
        // Front Windshield (curved flat panel at the front of the cab)
        const windShieldGeo = new THREE.BoxGeometry(spec.width * 0.88, spec.height * 0.28, 0.02);
        const windShieldMat = new THREE.MeshStandardMaterial({
          color: '#111827',
          roughness: 0.05,
          metalness: 0.9,
          transparent: true,
          opacity: 0.85
        });
        const windShield = new THREE.Mesh(windShieldGeo, windShieldMat);
        // Place it slightly tilted on the front face of the cab
        windShield.position.set(0, spec.height * 0.64, spec.length * 0.499);
        windShield.rotation.x = -0.08; // slight aerodynamic tilt back
        chassisGroup.add(windShield);

        // Side Windows
        const sideWindowGeo = new THREE.BoxGeometry(0.02, spec.height * 0.22, spec.length * 0.12);
        const sideWindowL = new THREE.Mesh(sideWindowGeo, windShieldMat);
        sideWindowL.position.set(-spec.width * 0.472, spec.height * 0.62, spec.length * 0.36);
        chassisGroup.add(sideWindowL);

        const sideWindowR = new THREE.Mesh(sideWindowGeo, windShieldMat);
        sideWindowR.position.set(spec.width * 0.472, spec.height * 0.62, spec.length * 0.36);
        chassisGroup.add(sideWindowR);

        // Front Grille Accent & Emblem (Kia Bongo Style)
        // A black horizontal strip with an emblem in the center
        const grilleAccentGeo = new THREE.BoxGeometry(spec.width * 0.6, 0.08, 0.02);
        const grilleAccentMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.7 });
        const grilleAccent = new THREE.Mesh(grilleAccentGeo, grilleAccentMat);
        grilleAccent.position.set(0, spec.height * 0.46, spec.length * 0.501);
        chassisGroup.add(grilleAccent);

        // Silver Emblem
        const emblemGeo = new THREE.BoxGeometry(0.08, 0.025, 0.01);
        const emblemMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.95, roughness: 0.1 });
        const emblem = new THREE.Mesh(emblemGeo, emblemMat);
        emblem.position.set(0, spec.height * 0.46, spec.length * 0.512);
        chassisGroup.add(emblem);

        // Front Lower Bumper Foglights & Air Intakes
        const intakeGeo = new THREE.BoxGeometry(spec.width * 0.45, 0.1, 0.03);
        const intakeMat = new THREE.MeshStandardMaterial({ color: '#090d16', roughness: 0.9 });
        const intake = new THREE.Mesh(intakeGeo, intakeMat);
        intake.position.set(0, spec.height * 0.26, spec.length * 0.501);
        chassisGroup.add(intake);

        // Foglights (lower corners of the bumper)
        const fogGeo = new THREE.BoxGeometry(0.12, 0.04, 0.02);
        const fogMat = new THREE.MeshBasicMaterial({ color: '#fef08a' }); // amber glow
        const fogL = new THREE.Mesh(fogGeo, fogMat);
        fogL.position.set(-spec.width * 0.32, spec.height * 0.26, spec.length * 0.502);
        chassisGroup.add(fogL);

        const fogR = new THREE.Mesh(fogGeo, fogMat);
        fogR.position.set(spec.width * 0.32, spec.height * 0.26, spec.length * 0.502);
        chassisGroup.add(fogR);

        // Beautiful rear mudguards behind rear wheels
        const mudguardGeo = new THREE.BoxGeometry(0.1, 0.35, 0.38);
        const mudguardMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.9 });
        
        const mudguardRL = new THREE.Mesh(mudguardGeo, mudguardMat);
        mudguardRL.position.set(-spec.width * 0.46, spec.height * 0.12, -spec.length * 0.38);
        chassisGroup.add(mudguardRL);

        const mudguardRR = new THREE.Mesh(mudguardGeo, mudguardMat);
        mudguardRR.position.set(spec.width * 0.46, spec.height * 0.12, -spec.length * 0.38);
        chassisGroup.add(mudguardRR);

        // Under-bed accessories: Black battery/fuel box and a Spare Tire!
        // Battery/fuel box
        const fuelTankGeo = new THREE.BoxGeometry(0.45, 0.35, 0.9);
        const fuelTankMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.8 });
        const fuelTank = new THREE.Mesh(fuelTankGeo, fuelTankMat);
        fuelTank.position.set(-spec.width * 0.32, spec.height * 0.12, -spec.length * 0.08);
        chassisGroup.add(fuelTank);

        // Spare tire mounted underneath rear flatbed
        const spareTireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.24, 12);
        spareTireGeo.rotateX(Math.PI / 2);
        const spareTireMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.95 });
        const spareTire = new THREE.Mesh(spareTireGeo, spareTireMat);
        spareTire.position.set(spec.width * 0.2, spec.height * 0.12, -spec.length * 0.26);
        chassisGroup.add(spareTire);
      }

      // Add High-fidelity Front Headlight Assemblies (Rexton-inspired / Bongo-inspired / Lamborghini Y-shaped)
      const createHeadlightAssembly = (side: 'L' | 'R') => {
        const lightGroup = new THREE.Group();
        lightGroup.name = `headlight_${side}`;
        
        // Headlight casing (dark housing)
        const casingGeo = isTruck
          ? new THREE.BoxGeometry(spec.width * 0.08, spec.height * 0.16, 0.12)
          : isSports
          ? new THREE.BoxGeometry(spec.width * 0.18, spec.height * 0.06, 0.08)
          : new THREE.BoxGeometry(spec.width * 0.16, spec.height * 0.08, 0.12);
        const casingMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.6, metalness: 0.5 });
        const casing = new THREE.Mesh(casingGeo, casingMat);
        lightGroup.add(casing);
        
        // Chrome back reflector
        const refGeo = isTruck
          ? new THREE.BoxGeometry(spec.width * 0.07, spec.height * 0.15, 0.02)
          : isSports
          ? new THREE.BoxGeometry(spec.width * 0.17, spec.height * 0.05, 0.02)
          : new THREE.BoxGeometry(spec.width * 0.15, spec.height * 0.07, 0.02);
        const refMat = new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.95, roughness: 0.08 });
        const reflector = new THREE.Mesh(refGeo, refMat);
        reflector.position.z = 0.02;
        lightGroup.add(reflector);

        // High-tech dual-lens LED projectors
        if (isTruck) {
          // Vertically stacked dual halogens for Bongo III
          const lensRadius = 0.026;
          const lensGeo = new THREE.CylinderGeometry(lensRadius, lensRadius, 0.04, 8);
          lensGeo.rotateX(Math.PI / 2);
          const lensMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });

          const lens1 = new THREE.Mesh(lensGeo, lensMat);
          lens1.position.set(0, spec.height * 0.038, 0.04);
          lightGroup.add(lens1);

          const lens2 = new THREE.Mesh(lensGeo, lensMat);
          lens2.position.set(0, -spec.height * 0.038, 0.04);
          lightGroup.add(lens2);

          // Orange Amber Blinker on outer side of vertical assembly
          const amberGeo = new THREE.BoxGeometry(spec.width * 0.015, spec.height * 0.14, 0.02);
          const amberMat = new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.1, metalness: 0.5 });
          const amber = new THREE.Mesh(amberGeo, amberMat);
          amber.position.set(side === 'L' ? -spec.width * 0.032 : spec.width * 0.032, 0, 0.04);
          lightGroup.add(amber);
        } else if (isSports) {
          // Lamborghini aggressive angled headlights with signature Y-shaped glowing LED DRLs!
          const lensRadius = 0.016;
          const lensGeo = new THREE.CylinderGeometry(lensRadius, lensRadius, 0.03, 8);
          lensGeo.rotateX(Math.PI / 2);
          const lensMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
          
          const lens = new THREE.Mesh(lensGeo, lensMat);
          // place projector lens slightly towards the inner side
          lens.position.set(side === 'L' ? spec.width * 0.025 : -spec.width * 0.025, -0.005, 0.022);
          lightGroup.add(lens);

          // Signature Y-shaped DRL: composed of 3 glowing tubes/boxes
          const drlMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' }); // Intense ice-blue glow
          
          // Stem of the Y (horizontal part pointing outwards)
          const stemGeo = new THREE.BoxGeometry(spec.width * 0.05, 0.006, 0.01);
          const stem = new THREE.Mesh(stemGeo, drlMat);
          stem.position.set(side === 'L' ? -spec.width * 0.03 : spec.width * 0.03, 0, 0.025);
          lightGroup.add(stem);

          // Upper branch of the Y
          const branch1Geo = new THREE.BoxGeometry(spec.width * 0.04, 0.006, 0.01);
          const branch1 = new THREE.Mesh(branch1Geo, drlMat);
          branch1.rotation.z = side === 'L' ? Math.PI / 6 : -Math.PI / 6;
          branch1.position.set(side === 'L' ? 0.005 : -0.005, 0.01, 0.025);
          lightGroup.add(branch1);

          // Lower branch of the Y
          const branch2Geo = new THREE.BoxGeometry(spec.width * 0.04, 0.006, 0.01);
          const branch2 = new THREE.Mesh(branch2Geo, drlMat);
          branch2.rotation.z = side === 'L' ? -Math.PI / 6 : Math.PI / 6;
          branch2.position.set(side === 'L' ? 0.005 : -0.005, -0.01, 0.025);
          lightGroup.add(branch2);
        } else {
          const lensRadius = cfg.type === 'suv' ? 0.032 : 0.024;
          const lensGeo = new THREE.CylinderGeometry(lensRadius, lensRadius, 0.04, 8);
          lensGeo.rotateX(Math.PI / 2);
          const lensMat = new THREE.MeshBasicMaterial({ color: '#ffffff' }); // Glowing cool white
          
          const lens1 = new THREE.Mesh(lensGeo, lensMat);
          lens1.position.set(-spec.width * 0.032, 0, 0.04);
          lightGroup.add(lens1);

          const lens2 = new THREE.Mesh(lensGeo, lensMat);
          lens2.position.set(spec.width * 0.025, 0, 0.04);
          lightGroup.add(lens2);

          // Sharp LED brow / eyebrow DRL (from image)
          const browGeo = new THREE.BoxGeometry(spec.width * 0.15, spec.height * 0.012, 0.03);
          const browMat = new THREE.MeshBasicMaterial({ color: '#f0f9ff' }); // bright ice blue/white
          const brow = new THREE.Mesh(browGeo, browMat);
          brow.position.set(0, spec.height * 0.03, 0.045);
          lightGroup.add(brow);
        }

        return lightGroup;
      };

      const leftLight = createHeadlightAssembly('L');
      if (isTruck) {
        leftLight.position.set(-spec.width * 0.36, spec.height * 0.38, spec.length * 0.5);
      } else {
        leftLight.position.set(-spec.width * 0.38, spec.height * 0.44, spec.length * 0.5);
      }
      chassisGroup.add(leftLight);

      const rightLight = createHeadlightAssembly('R');
      if (isTruck) {
        rightLight.position.set(spec.width * 0.36, spec.height * 0.38, spec.length * 0.5);
      } else {
        rightLight.position.set(spec.width * 0.38, spec.height * 0.44, spec.length * 0.5);
      }
      chassisGroup.add(rightLight);

      // Spotlights for Night mode
      if (simulationState.timeOfDay === 'night') {
        const spotLightLeft = new THREE.SpotLight('#ffffff', 12, 40, Math.PI / 6, 0.5, 1);
        spotLightLeft.position.set(-spec.width * 0.38, spec.height * 0.4, spec.length * 0.51);
        const targetLeft = new THREE.Object3D();
        targetLeft.position.set(-spec.width * 0.38, spec.height * 0.4, spec.length * 0.51 + 5);
        chassisGroup.add(targetLeft);
        spotLightLeft.target = targetLeft;
        spotLightLeft.castShadow = true;
        spotLightLeft.shadow.mapSize.width = 512;
        spotLightLeft.shadow.mapSize.height = 512;
        chassisGroup.add(spotLightLeft);

        const spotLightRight = new THREE.SpotLight('#ffffff', 12, 40, Math.PI / 6, 0.5, 1);
        spotLightRight.position.set(spec.width * 0.38, spec.height * 0.4, spec.length * 0.51);
        const targetRight = new THREE.Object3D();
        targetRight.position.set(spec.width * 0.38, spec.height * 0.4, spec.length * 0.51 + 5);
        chassisGroup.add(targetRight);
        spotLightRight.target = targetRight;
        spotLightRight.castShadow = true;
        spotLightRight.shadow.mapSize.width = 512;
        spotLightRight.shadow.mapSize.height = 512;
        chassisGroup.add(spotLightRight);
      }

      // Add Brake/Tail lights
      const tailGeo = new THREE.BoxGeometry(0.25, 0.1, 0.05);
      const tailMat = new THREE.MeshStandardMaterial({ color: '#dc2626', emissive: '#991b1b', emissiveIntensity: 0.5 });
      
      const leftTail = new THREE.Mesh(tailGeo, tailMat);
      leftTail.name = 'brake_L';
      leftTail.position.set(-spec.width * 0.38, isTruck ? spec.height * 0.16 : spec.height * 0.4, -spec.length * 0.5);
      chassisGroup.add(leftTail);

      const rightTail = new THREE.Mesh(tailGeo, tailMat);
      rightTail.name = 'brake_R';
      rightTail.position.set(spec.width * 0.38, isTruck ? spec.height * 0.16 : spec.height * 0.4, -spec.length * 0.5);
      chassisGroup.add(rightTail);

      // --- NEW HIGH FIDELITY EXTRAS FOR REALISM ---

      // 1. Detailed Front & Rear Bumpers (Detachable on heavy impact)
      const bumperMat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        roughness: 0.2,
        metalness: 0.8,
        flatShading: true
      });
      
      const bumperFrontGeo = new THREE.BoxGeometry(spec.width * 0.98, spec.height * 0.15, spec.length * 0.08, 4, 2, 2);
      const bumperFront = new THREE.Mesh(bumperFrontGeo, bumperMat);
      bumperFront.name = 'bumper_front';
      bumperFront.position.set(0, spec.height * 0.22, spec.length * 0.5);
      bumperFront.castShadow = true;
      chassisGroup.add(bumperFront);

      const bumperRearGeo = isTruck
        ? new THREE.BoxGeometry(spec.width * 0.9, 0.08, 0.08, 2, 2, 2) // realistic rear crash bar for trucks
        : new THREE.BoxGeometry(spec.width * 0.98, spec.height * 0.15, spec.length * 0.08, 4, 2, 2);
      const bumperRearMat = isTruck
        ? new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.6, metalness: 0.8 })
        : bumperMat;
      const bumperRear = new THREE.Mesh(bumperRearGeo, bumperRearMat);
      bumperRear.name = 'bumper_rear';
      bumperRear.position.set(0, isTruck ? spec.height * 0.14 : spec.height * 0.22, -spec.length * 0.5);
      bumperRear.castShadow = true;
      chassisGroup.add(bumperRear);

      if (isTruck) {
        // --- SsangYong Bongo III / Hyundai Porter II style High-Fidelity Flatbed ---
        // Let's create a group for the flatbed drop gates
        const flatbedGroup = new THREE.Group();
        flatbedGroup.name = 'flatbed';

        const gateMat = new THREE.MeshStandardMaterial({
          color: cfg.color,
          roughness: 0.2,
          metalness: 0.8,
          flatShading: true
        });

        // Horizontal rib lines on the gates (gives the realistic corrugated metal look of Porter/Bongo gates!)
        const ribMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5 }); // dark horizontal lines

        // 1. Left Gate
        const gateL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, spec.length * 0.71), gateMat);
        gateL.position.set(-spec.width * 0.49, 1.025 - 0.8, -spec.length * 0.14); // relative to chassis base
        gateL.castShadow = true;
        flatbedGroup.add(gateL);

        // Ribs on left gate
        for (let r = -1; r <= 1; r++) {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, spec.length * 0.705), ribMat);
          rib.position.set(-spec.width * 0.49, 1.025 - 0.8 + r * 0.12, -spec.length * 0.14);
          flatbedGroup.add(rib);
        }

        // 2. Right Gate
        const gateR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, spec.length * 0.71), gateMat);
        gateR.position.set(spec.width * 0.49, 1.025 - 0.8, -spec.length * 0.14);
        gateR.castShadow = true;
        flatbedGroup.add(gateR);

        // Ribs on right gate
        for (let r = -1; r <= 1; r++) {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, spec.length * 0.705), ribMat);
          rib.position.set(spec.width * 0.49, 1.025 - 0.8 + r * 0.12, -spec.length * 0.14);
          flatbedGroup.add(rib);
        }

        // 3. Rear Gate
        const gateRear = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.97, 0.45, 0.04), gateMat);
        gateRear.position.set(0, 1.025 - 0.8, -spec.length * 0.49);
        gateRear.castShadow = true;
        flatbedGroup.add(gateRear);

        // Ribs on rear gate
        for (let r = -1; r <= 1; r++) {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.96, 0.02, 0.045), ribMat);
          rib.position.set(0, 1.025 - 0.8 + r * 0.12, -spec.length * 0.49);
          flatbedGroup.add(rib);
        }

        // 4. Protective Headboard (Grid/Frame behind the cabover cabin)
        const headboardMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.9, roughness: 0.2 });
        const headboardFrame = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.94, 0.95, 0.04), headboardMat);
        headboardFrame.position.set(0, 1.275 - 0.8, spec.length * 0.215);
        headboardFrame.castShadow = true;
        flatbedGroup.add(headboardFrame);

        // Inner frame cutout grid effect
        const gridBar1 = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.88, 0.04, 0.05), ribMat);
        gridBar1.position.set(0, 1.275 - 0.8 + 0.2, spec.length * 0.215);
        flatbedGroup.add(gridBar1);

        const gridBar2 = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.88, 0.04, 0.05), ribMat);
        gridBar2.position.set(0, 1.275 - 0.8 - 0.2, spec.length * 0.215);
        flatbedGroup.add(gridBar2);

        // 5. Cargo Load (Wooden shipping crates sitting in the flatbed loading bay!)
        // Wood colored crate 1
        const crate1Geo = new THREE.BoxGeometry(1.3, 1.1, 1.3);
        const crate1Mat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.9 }); // golden-brown wood
        const crate1 = new THREE.Mesh(crate1Geo, crate1Mat);
        crate1.position.set(-spec.width * 0.12, 1.025 - 0.8 + 0.35, -spec.length * 0.08);
        crate1.castShadow = true;
        flatbedGroup.add(crate1);

        // Industrial blue crate 2
        const crate2Geo = new THREE.BoxGeometry(1.0, 0.9, 1.0);
        const crate2Mat = new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.7 }); // blue plastic
        const crate2 = new THREE.Mesh(crate2Geo, crate2Mat);
        crate2.position.set(spec.width * 0.15, 1.025 - 0.8 + 0.25, -spec.length * 0.25);
        crate2.castShadow = true;
        flatbedGroup.add(crate2);

        // Metal drums/barrels
        const drumGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.75, 12);
        const drumMat = new THREE.MeshStandardMaterial({ color: '#4b5563', metalness: 0.7, roughness: 0.3 });
        const drum1 = new THREE.Mesh(drumGeo, drumMat);
        drum1.position.set(-spec.width * 0.2, 1.025 - 0.8 + 0.18, -spec.length * 0.34);
        drum1.castShadow = true;
        flatbedGroup.add(drum1);

        // Position the flatbed group on top of the bodyMesh
        flatbedGroup.position.set(0, spec.height * 0.16 + spec.height * 0.09, 0); // starts exactly at flatbed floor level
        chassisGroup.add(flatbedGroup);
      }

      // 2. Front Radiator Grille (Upgraded SsangYong Rexton style)
      const grilleGroup = new THREE.Group();
      grilleGroup.name = 'grille';
      
      if (cfg.type === 'suv') {
        // --- KG Rexton Huge Hexagonal Diamond Chrome Grille ---
        const gWidth = spec.width * 0.72;
        const gHeight = spec.height * 0.38; // Tall, massive grille!
        
        // Grille backing (dark matte background)
        const grilleBackGeo = new THREE.BoxGeometry(gWidth, gHeight, 0.02);
        const grilleBackMat = new THREE.MeshStandardMaterial({ color: '#090d16', roughness: 0.9 });
        const grilleBack = new THREE.Mesh(grilleBackGeo, grilleBackMat);
        grilleGroup.add(grilleBack);

        // Outer Hexagonal Chrome Frame
        const frameMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.95, roughness: 0.08 });
        
        // Horizontal top and bottom frame borders
        const borderT = new THREE.Mesh(new THREE.BoxGeometry(gWidth, 0.03, 0.04), frameMat);
        borderT.position.set(0, gHeight / 2, 0.01);
        grilleGroup.add(borderT);

        const borderB = new THREE.Mesh(new THREE.BoxGeometry(gWidth * 0.8, 0.03, 0.04), frameMat);
        borderB.position.set(0, -gHeight / 2, 0.01);
        grilleGroup.add(borderB);

        // Slanted side borders to form the hexagonal shield
        const borderL = new THREE.Mesh(new THREE.BoxGeometry(0.03, gHeight, 0.04), frameMat);
        borderL.position.set(-gWidth / 2, 0, 0.01);
        borderL.rotation.z = -0.12; // slightly tapered inwards at the bottom
        grilleGroup.add(borderL);

        const borderR = new THREE.Mesh(new THREE.BoxGeometry(0.03, gHeight, 0.04), frameMat);
        borderR.position.set(gWidth / 2, 0, 0.01);
        borderR.rotation.z = 0.12; // slightly tapered inwards
        grilleGroup.add(borderR);

        // Diamond-pattern chrome mesh inside (slanted diagonal bars crossing each other)
        const diamondMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', metalness: 0.95, roughness: 0.1 });
        
        // Left-slanted bars (\)
        for (let i = -4; i <= 4; i++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.008, gHeight * 1.3, 0.015), diamondMat);
          bar.position.set(i * (gWidth / 6), 0, 0.008);
          bar.rotation.z = Math.PI / 4; // 45 degrees
          grilleGroup.add(bar);
        }
        
        // Right-slanted bars (/)
        for (let i = -4; i <= 4; i++) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(0.008, gHeight * 1.3, 0.015), diamondMat);
          bar.position.set(i * (gWidth / 6), 0, 0.008);
          bar.rotation.z = -Math.PI / 4; // -45 degrees
          grilleGroup.add(bar);
        }

        // SsangYong Rexton winged/circular central luxury emblem (circular badge + wings)
        const emblemCenterGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16);
        emblemCenterGeo.rotateX(Math.PI / 2);
        const emblemCenter = new THREE.Mesh(emblemCenterGeo, frameMat);
        emblemCenter.position.set(0, 0.02, 0.018);
        grilleGroup.add(emblemCenter);

        const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.016, 0.015), frameMat);
        wingL.position.set(-0.08, 0.02, 0.015);
        wingL.rotation.z = 0.1;
        grilleGroup.add(wingL);

        const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.016, 0.015), frameMat);
        wingR.position.set(0.08, 0.02, 0.015);
        wingR.rotation.z = -0.1;
        grilleGroup.add(wingR);

        // Position on SUV front face
        grilleGroup.position.set(0, spec.height * 0.38, spec.length * 0.502);
      } else if (cfg.type === 'truck') {
        // Truck's bumper grille (subtle mesh inside front bumper)
        const bumperGrilleGeo = new THREE.BoxGeometry(spec.width * 0.5, 0.08, 0.01);
        const bumperGrilleMat = new THREE.MeshStandardMaterial({ color: '#090d16', roughness: 0.9 });
        const bumperGrille = new THREE.Mesh(bumperGrilleGeo, bumperGrilleMat);
        bumperGrille.position.set(0, spec.height * 0.28, spec.length * 0.501);
        grilleGroup.add(bumperGrille);
      } else if (isSports) {
        // --- Lamborghini Aggressive Dual Angular Front Air Intakes ---
        // Left air intake (trapezoidal, massive black mesh)
        const intakeMat = new THREE.MeshStandardMaterial({ color: '#090d16', roughness: 0.85 });
        const leftIntakeGeo = new THREE.BoxGeometry(spec.width * 0.28, spec.height * 0.16, 0.02);
        const leftIntake = new THREE.Mesh(leftIntakeGeo, intakeMat);
        leftIntake.position.set(-spec.width * 0.22, -0.02, 0.01);
        grilleGroup.add(leftIntake);

        // Intakes accents/slats
        const wingletMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5 });
        const leftWinglet = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.26, 0.012, 0.02), wingletMat);
        leftWinglet.position.set(-spec.width * 0.22, 0.01, 0.015);
        leftWinglet.rotation.z = -0.15; // angular slant
        grilleGroup.add(leftWinglet);

        // Right air intake
        const rightIntake = new THREE.Mesh(leftIntakeGeo, intakeMat);
        rightIntake.position.set(spec.width * 0.22, -0.02, 0.01);
        grilleGroup.add(rightIntake);

        const rightWinglet = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.26, 0.012, 0.02), wingletMat);
        rightWinglet.position.set(spec.width * 0.22, 0.01, 0.015);
        rightWinglet.rotation.z = 0.15; // angular slant
        grilleGroup.add(rightWinglet);

        // Center carbon-fiber aerodynamic splitter edge
        const splitterMat = new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.9, roughness: 0.3 });
        const splitter = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.85, 0.024, 0.08), splitterMat);
        splitter.position.set(0, -spec.height * 0.08, 0.03);
        grilleGroup.add(splitter);

        // Elegant tiny gold/yellow Lamborghini Shield Badge in the center front nose
        const shieldGeo = new THREE.BoxGeometry(0.02, 0.025, 0.01);
        const shieldMat = new THREE.MeshStandardMaterial({ color: '#d97706', metalness: 0.9, roughness: 0.1 });
        const shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.position.set(0, spec.height * 0.06, 0.02);
        grilleGroup.add(shield);

        grilleGroup.position.set(0, spec.height * 0.28, spec.length * 0.502);
      } else {
        // Standard high-fidelity slotted horizontal/vertical grille for other vehicles
        const grilleBackGeo = new THREE.BoxGeometry(spec.width * 0.65, spec.height * 0.15, 0.02);
        const grilleBackMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.9, metalness: 0.2 });
        const grilleBack = new THREE.Mesh(grilleBackGeo, grilleBackMat);
        grilleGroup.add(grilleBack);
        
        for (let s = -2; s <= 2; s++) {
          const slatGeo = new THREE.BoxGeometry(spec.width * 0.63, 0.012, 0.025);
          const slatMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.95, roughness: 0.15 });
          const slat = new THREE.Mesh(slatGeo, slatMat);
          slat.position.y = s * 0.025;
          grilleGroup.add(slat);
        }
        grilleGroup.position.set(0, spec.height * 0.4, spec.length * 0.501);
      }
      chassisGroup.add(grilleGroup);

      // --- SsangYong Rexton Muscular Flared Fenders / Arches ---
      if (cfg.type === 'suv') {
        const fenderMat = new THREE.MeshStandardMaterial({
          color: cfg.color,
          roughness: 0.2,
          metalness: 0.8,
          flatShading: true
        });

        // Loop over wheels to add fender flares slightly above and wrapping them
        const fenderArcGeo = new THREE.TorusGeometry(0.48, 0.035, 8, 24, Math.PI);
        fenderArcGeo.rotateY(Math.PI / 2); // align flat face in Y-Z plane

        const wheelPositions = [
          { name: 'FL', x: -spec.width * 0.505, z: spec.length * 0.3 },
          { name: 'FR', x: spec.width * 0.505, z: spec.length * 0.3 },
          { name: 'RL', x: -spec.width * 0.505, z: -spec.length * 0.3 },
          { name: 'RR', x: spec.width * 0.505, z: -spec.length * 0.3 },
        ];

        wheelPositions.forEach((wp) => {
          const fender = new THREE.Mesh(fenderArcGeo, fenderMat);
          fender.castShadow = true;
          fender.receiveShadow = true;
          fender.position.set(wp.x, 0.42, wp.z);
          chassisGroup.add(fender);
        });
      }

      // --- SsangYong Rexton Silver Roof Rails ---
      if (cfg.type === 'suv') {
        const railGroup = new THREE.Group();
        railGroup.name = 'roof_rails';
        
        const railMat = new THREE.MeshStandardMaterial({
          color: '#cbd5e1',
          metalness: 0.95,
          roughness: 0.15
        });

        const railLength = spec.length * 0.45;

        // Left Roof Rail
        const railL = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, railLength, 8), railMat);
        railL.rotation.x = Math.PI / 2;
        railL.position.set(-spec.width * 0.42, spec.height * 1.05, -spec.length * 0.05);
        railL.castShadow = true;
        railGroup.add(railL);

        // Left Roof Rail stands (front & rear supports)
        const standLF = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.04), railMat);
        standLF.position.set(-spec.width * 0.42, spec.height * 1.03, -spec.length * 0.05 + railLength / 2 - 0.05);
        railGroup.add(standLF);

        const standLR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.04), railMat);
        standLR.position.set(-spec.width * 0.42, spec.height * 1.03, -spec.length * 0.05 - railLength / 2 + 0.05);
        railGroup.add(standLR);

        // Right Roof Rail
        const railR = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, railLength, 8), railMat);
        railR.rotation.x = Math.PI / 2;
        railR.position.set(spec.width * 0.42, spec.height * 1.05, -spec.length * 0.05);
        railR.castShadow = true;
        railGroup.add(railR);

        // Right Roof Rail stands
        const standRF = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.04), railMat);
        standRF.position.set(spec.width * 0.42, spec.height * 1.03, -spec.length * 0.05 + railLength / 2 - 0.05);
        railGroup.add(standRF);

        const standRR = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.04), railMat);
        standRR.position.set(spec.width * 0.42, spec.height * 1.03, -spec.length * 0.05 - railLength / 2 + 0.05);
        railGroup.add(standRR);

        chassisGroup.add(railGroup);
      }

      // --- SsangYong Rexton Silver Side Steps ---
      if (cfg.type === 'suv') {
        const stepMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.9, roughness: 0.2 });
        const rubberMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.8 });

        const stepLength = spec.length * 0.48;
        const stepWidth = 0.08;

        // Left Side Step
        const stepLGroup = new THREE.Group();
        const plateL = new THREE.Mesh(new THREE.BoxGeometry(stepWidth, 0.015, stepLength), stepMat);
        plateL.castShadow = true;
        stepLGroup.add(plateL);
        // Rubber grip strips on top
        const gripL = new THREE.Mesh(new THREE.BoxGeometry(stepWidth * 0.7, 0.018, stepLength * 0.95), rubberMat);
        stepLGroup.add(gripL);
        
        stepLGroup.position.set(-spec.width * 0.51, spec.height * 0.18, 0);
        chassisGroup.add(stepLGroup);

        // Right Side Step
        const stepRGroup = new THREE.Group();
        const plateR = new THREE.Mesh(new THREE.BoxGeometry(stepWidth, 0.015, stepLength), stepMat);
        plateR.castShadow = true;
        stepRGroup.add(plateR);
        const gripR = new THREE.Mesh(new THREE.BoxGeometry(stepWidth * 0.7, 0.018, stepLength * 0.95), rubberMat);
        stepRGroup.add(gripR);

        stepRGroup.position.set(spec.width * 0.51, spec.height * 0.18, 0);
        chassisGroup.add(stepRGroup);
      }

      // --- SsangYong Rexton Muscular Bonnet (Hood) Creases ---
      if (cfg.type === 'suv') {
        const hoodMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.2, metalness: 0.8, flatShading: true });
        
        // Let's place twin parallel wedge/narrow box shapes on the hood
        const creaseL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, spec.length * 0.24), hoodMat);
        creaseL.position.set(-spec.width * 0.18, spec.height * 0.71, spec.length * 0.3);
        creaseL.rotation.y = 0.03; // slightly angled inwards
        chassisGroup.add(creaseL);

        const creaseR = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, spec.length * 0.24), hoodMat);
        creaseR.position.set(spec.width * 0.18, spec.height * 0.71, spec.length * 0.3);
        creaseR.rotation.y = -0.03; // slightly angled inwards
        chassisGroup.add(creaseR);
      }

      // --- Lamborghini High-Fidelity Styling Extras ---
      if (isSports) {
        const carbonMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.3, metalness: 0.9 });
        
        // 1. Carbon-Fiber Side Skirts
        const skirtLength = spec.length * 0.52;
        const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, skirtLength), carbonMat);
        skirtL.position.set(-spec.width * 0.495, spec.height * 0.16, -spec.length * 0.04);
        skirtL.castShadow = true;
        chassisGroup.add(skirtL);

        const skirtR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, skirtLength), carbonMat);
        skirtR.position.set(spec.width * 0.495, spec.height * 0.16, -spec.length * 0.04);
        skirtR.castShadow = true;
        chassisGroup.add(skirtR);

        // 2. Dynamic Side Air Intakes (behind doors)
        const intakeInnerMat = new THREE.MeshStandardMaterial({ color: '#090d16', roughness: 0.9 });
        const intakeFinMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.4, metalness: 0.8 });

        const intakeGroupL = new THREE.Group();
        const backL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.32), intakeInnerMat);
        intakeGroupL.add(backL);
        const finL = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.34), intakeFinMat);
        finL.rotation.y = -0.15;
        intakeGroupL.add(finL);
        intakeGroupL.position.set(-spec.width * 0.485, spec.height * 0.34, -spec.length * 0.18);
        chassisGroup.add(intakeGroupL);

        const intakeGroupR = new THREE.Group();
        const backR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.32), intakeInnerMat);
        intakeGroupR.add(backR);
        const finR = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.34), intakeFinMat);
        finR.rotation.y = 0.15;
        intakeGroupR.add(finR);
        intakeGroupR.position.set(spec.width * 0.485, spec.height * 0.34, -spec.length * 0.18);
        chassisGroup.add(intakeGroupR);

        // 3. Louvered Glass Engine Bay Cover
        const coverGroup = new THREE.Group();
        coverGroup.name = 'engine_cover';
        const glassCoverGeo = new THREE.BoxGeometry(spec.width * 0.65, 0.015, spec.length * 0.28);
        const glassCoverMat = new THREE.MeshStandardMaterial({ color: '#090d16', transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.9 });
        const glassCover = new THREE.Mesh(glassCoverGeo, glassCoverMat);
        coverGroup.add(glassCover);

        for (let l = -1; l <= 1; l++) {
          const louver = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.58, 0.01, 0.04), carbonMat);
          louver.rotation.x = -0.18;
          louver.position.set(0, 0.015, l * 0.08);
          coverGroup.add(louver);
        }
        coverGroup.position.set(0, spec.height * 0.48, -spec.length * 0.26);
        chassisGroup.add(coverGroup);

        // 4. Center Twin Hexagonal Exhaust pipes with orange heat glow
        const exhaustGroup = new THREE.Group();
        const shield = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.08), carbonMat);
        exhaustGroup.add(shield);

        const pipeMat = new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 0.95, roughness: 0.1 });
        const tipGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.04, 6);
        tipGeo.rotateX(Math.PI / 2);
        
        const tipL = new THREE.Mesh(tipGeo, pipeMat);
        tipL.position.set(-0.035, 0, 0.02);
        exhaustGroup.add(tipL);

        const tipR = new THREE.Mesh(tipGeo, pipeMat);
        tipR.position.set(0.035, 0, 0.02);
        exhaustGroup.add(tipR);

        const flameGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.02, 6);
        flameGeo.rotateX(Math.PI / 2);
        const flameMat = new THREE.MeshBasicMaterial({ color: '#ea580c' });
        const flameL = new THREE.Mesh(flameGeo, flameMat);
        flameL.position.set(-0.035, 0, 0.021);
        exhaustGroup.add(flameL);
        const flameR = new THREE.Mesh(flameGeo, flameMat);
        flameR.position.set(0.035, 0, 0.021);
        exhaustGroup.add(flameR);

        exhaustGroup.position.set(0, spec.height * 0.18, -spec.length * 0.5);
        chassisGroup.add(exhaustGroup);
      }

      // 3. Breakable/Hanging Doors (Left & Right)
      const door_L = createDoorGroup('L', spec, cfg.color);
      if (isTruck) {
        door_L.position.set(-spec.width * 0.48, spec.height * 0.36, spec.length * 0.36);
      } else if (isSports) {
        door_L.position.set(-spec.width * 0.495, spec.height * 0.35, spec.length * 0.12);
      } else {
        door_L.position.set(-spec.width * 0.505, spec.height * 0.44, spec.length * 0.14);
      }
      chassisGroup.add(door_L);

      const door_R = createDoorGroup('R', spec, cfg.color);
      if (isTruck) {
        door_R.position.set(spec.width * 0.48, spec.height * 0.36, spec.length * 0.36);
      } else if (isSports) {
        door_R.position.set(spec.width * 0.495, spec.height * 0.35, spec.length * 0.12);
      } else {
        door_R.position.set(spec.width * 0.505, spec.height * 0.44, spec.length * 0.14);
      }
      chassisGroup.add(door_R);

      // 4. Side Mirrors (Breakable)
      const mirror_L = createSideMirror('L', spec, cfg.color);
      if (isTruck) {
        mirror_L.position.set(-spec.width * 0.49, spec.height * 0.58, spec.length * 0.44);
      } else if (isSports) {
        mirror_L.position.set(-spec.width * 0.495, spec.height * 0.42, spec.length * 0.22);
      } else {
        mirror_L.position.set(-spec.width * 0.51, spec.height * 0.61, spec.length * 0.17);
      }
      chassisGroup.add(mirror_L);

      const mirror_R = createSideMirror('R', spec, cfg.color);
      if (isTruck) {
        mirror_R.position.set(spec.width * 0.49, spec.height * 0.58, spec.length * 0.44);
      } else if (isSports) {
        mirror_R.position.set(spec.width * 0.495, spec.height * 0.42, spec.length * 0.22);
      } else {
        mirror_R.position.set(spec.width * 0.51, spec.height * 0.61, spec.length * 0.17);
      }
      chassisGroup.add(mirror_R);

      // 5. Sport Rear Spoiler (For sports cars and supercars)
      if (isSports || cfg.type === 'sport' || spec.name.toLowerCase().includes('sport') || cfg.type === 'super') {
        const spoilerGroup = new THREE.Group();
        spoilerGroup.name = 'spoiler';
        
        const strutMat = new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.8, roughness: 0.2 });
        const strutL = new THREE.Mesh(new THREE.BoxGeometry(0.03, spec.height * 0.16, 0.05), strutMat);
        strutL.position.set(-spec.width * 0.35, spec.height * 0.08, -spec.length * 0.44);
        spoilerGroup.add(strutL);

        const strutR = new THREE.Mesh(new THREE.BoxGeometry(0.03, spec.height * 0.16, 0.05), strutMat);
        strutR.position.set(spec.width * 0.35, spec.height * 0.08, -spec.length * 0.44);
        spoilerGroup.add(strutR);

        const wingBarMat = new THREE.MeshStandardMaterial({ color: cfg.color, metalness: 0.8, roughness: 0.2 });
        const wingBar = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 1.05, 0.024, 0.18), wingBarMat);
        wingBar.position.set(0, spec.height * 0.16, -spec.length * 0.44);
        spoilerGroup.add(wingBar);

        // Add small aerodynamic side winglets to the spoiler for high-speed downforce styling!
        const wingletGeo = new THREE.BoxGeometry(0.02, 0.08, 0.2);
        const wingletMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.3 });
        
        const wingletL = new THREE.Mesh(wingletGeo, wingletMat);
        wingletL.position.set(-spec.width * 0.525, spec.height * 0.16, -spec.length * 0.44);
        spoilerGroup.add(wingletL);

        const wingletR = new THREE.Mesh(wingletGeo, wingletMat);
        wingletR.position.set(spec.width * 0.525, spec.height * 0.16, -spec.length * 0.44);
        spoilerGroup.add(wingletR);

        spoilerGroup.position.set(0, isSports ? spec.height * 0.38 : spec.height * 0.4, 0);
        chassisGroup.add(spoilerGroup);
      }

      // Create Wheels with custom alloy spokes
      const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 16);
      wheelGeo.rotateZ(Math.PI / 2); // Make cylinder horizontal
      const wheelMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.8 }); // dark grey
      const rimMat = new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.3, metalness: 0.8 }); // shiny hubcaps
      
      // Helper to add wheel hubs visually
      const createWheelMesh = (isRear: boolean = false) => {
        const wheelObj = new THREE.Group();
        
        // If it's a truck's rear wheels, we create dual wheels side-by-side
        const offsets = (isTruck && isRear) ? [-0.14, 0.14] : [0];
        
        offsets.forEach((offsetX) => {
          const tireGroup = new THREE.Group();
          
          // Tire
          const tire = new THREE.Mesh(wheelGeo, wheelMat);
          tire.castShadow = true;
          tireGroup.add(tire);
          
          // Shiny Outer Rim ring
          const rimOuterGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.31, 16);
          rimOuterGeo.rotateZ(Math.PI / 2);
          const rimOuterMat = new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.9, roughness: 0.15 });
          const rimOuter = new THREE.Mesh(rimOuterGeo, rimOuterMat);
          tireGroup.add(rimOuter);

          // Center hub
          const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.32, 8);
          hubGeo.rotateZ(Math.PI / 2);
          const hub = new THREE.Mesh(hubGeo, rimMat);
          tireGroup.add(hub);

          // Alloy Spokes (15 luxury chrome spokes for SUV, matching SsangYong Rexton wheels)
          const isSUV = cfg.type === 'suv';
          const spokeCount = isSUV ? 15 : isSports ? 10 : 5;
          const spokeThickness = isSUV ? 0.015 : isSports ? 0.016 : 0.04;
          const spokeMaterial = isSUV 
            ? new THREE.MeshStandardMaterial({ color: '#f1f5f9', metalness: 0.95, roughness: 0.08 }) // high-polished chrome
            : isSports
            ? new THREE.MeshStandardMaterial({ color: '#111827', metalness: 0.9, roughness: 0.3 }) // matte-black wheels
            : rimMat;

          for (let s = 0; s < spokeCount; s++) {
            const spokeGeo = new THREE.BoxGeometry(spokeThickness, 0.32, 0.32);
            const spoke = new THREE.Mesh(spokeGeo, spokeMaterial);
            spoke.rotation.x = (s * 2 * Math.PI) / spokeCount;
            if (isSports) {
              spoke.rotation.z = (s % 2 === 0 ? 0.12 : -0.12); // gorgeous Y-spoke design!
            }
            tireGroup.add(spoke);
          }

          // Yellow performance brake calipers inside Lamborghini's wheels
          if (isSports) {
            const caliperGeo = new THREE.BoxGeometry(0.06, 0.15, 0.07);
            const caliperMat = new THREE.MeshStandardMaterial({ color: '#eab308', roughness: 0.2, metalness: 0.9 });
            const caliper = new THREE.Mesh(caliperGeo, caliperMat);
            caliper.position.set(-0.06, 0.12, 0); // inboard placement
            tireGroup.add(caliper);
          }

          // tread line for rotation visualization
          const treadGeo = new THREE.BoxGeometry(0.03, 0.85, 0.31);
          const treadMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', emissive: '#475569', emissiveIntensity: 0.2 });
          const tread = new THREE.Mesh(treadGeo, treadMat);
          tireGroup.add(tread);

          tireGroup.position.x = offsetX;
          wheelObj.add(tireGroup);
        });

        return wheelObj;
      };

      const wheelLocations = [
        { name: 'FL', x: -spec.width * 0.48, z: spec.length * 0.3 }, // Front Left
        { name: 'FR', x: spec.width * 0.48, z: spec.length * 0.3 },  // Front Right
        { name: 'RL', x: -spec.width * 0.48, z: -spec.length * 0.3 }, // Rear Left
        { name: 'RR', x: spec.width * 0.48, z: -spec.length * 0.3 },  // Rear Right
      ];

      wheelLocations.forEach((loc) => {
        // 1. Add wheel mesh
        const isRear = loc.name.startsWith('R');
        const wMesh = createWheelMesh(isRear);
        wMesh.name = `wheel_${loc.name}`;
        wMesh.rotation.order = 'YXZ';
        wMesh.position.set(loc.x, 0.42, loc.z);
        carGroup.add(wMesh);

        // 2. Add visual suspension strut right inboard of wheel
        const suspHeight = spec.height * 0.45;
        const strut = createSuspensionStrut('#ef4444', suspHeight); // Aggressive sport red spring!
        strut.name = `suspension_${loc.name}`;
        strut.position.set(loc.x * 0.72, 0.42, loc.z);
        carGroup.add(strut);
      });

      // Position the entire group based on config
      carGroup.position.set(cfg.x, 0, cfg.z);
      
      // Three's rotation revolves around Y.
      // angle is in degrees: we convert it to radians.
      // Note: By default, 3D model faces forward in positive Z (or negative Z depending on orientation).
      // Let's assume model faces positive Z. Angle 0 is facing positive X (East).
      // Angle 0 in radians should map to rotation.y = Math.PI/2
      const angleRad = (cfg.angle * Math.PI) / 180;
      carGroup.rotation.y = Math.PI / 2 - angleRad;

      scene.add(carGroup);

      // Convert speed in km/h to m/s
      const speedMs = (cfg.initialSpeed * 1000) / 3600;
      const vx = speedMs * Math.cos(angleRad);
      const vz = speedMs * Math.sin(angleRad);

      // Create Occupant Dummy
      const dummyData = createOccupantDummy();
      const seatX = -spec.width * 0.22;
      const seatY = isTruck ? spec.height * 0.35 : isSports ? spec.height * 0.38 : spec.height * 0.45;
      const seatZ = isTruck ? spec.length * 0.32 : isSports ? spec.length * 0.02 : -spec.length * 0.05;
      
      dummyData.group.position.set(seatX, seatY, seatZ);
      chassisGroup.add(dummyData.group);

      // Create Airbag Mesh (placed relative to the driver's steering wheel)
      const airbagGeo = new THREE.SphereGeometry(0.18, 16, 16);
      airbagGeo.scale(1.3, 0.9, 1.3); // squashed sphere shape
      const airbagMat = new THREE.MeshStandardMaterial({ 
        color: '#f1f5f9', 
        roughness: 0.6,
        transparent: true,
        opacity: 0.0 // invisible initially, inflates on crash
      });
      const airbagMesh = new THREE.Mesh(airbagGeo, airbagMat);
      airbagMesh.name = 'airbag';
      airbagMesh.position.set(seatX, seatY + 0.18, seatZ + 0.35);
      chassisGroup.add(airbagMesh);

      // Configure initial seatbelt state
      const hasBelt = cfg.hasSeatbelt !== false;
      dummyData.seatbeltGroup.visible = hasBelt;

      return {
        id: cfg.id,
        type: cfg.type,
        x: cfg.x,
        z: cfg.z,
        y: 0,
        vy: 0,
        pitch: 0,
        roll: 0,
        vPitch: 0,
        vRoll: 0,
        vAngle: 0,
        vx: cfg.isStationary ? 0 : vx,
        vz: cfg.isStationary ? 0 : vz,
        angle: angleRad,
        mass: cfg.mass,
        width: spec.width,
        length: spec.length,
        height: spec.height,
        color: cfg.color,
        damage: 0,
        isStationary: cfg.isStationary,
        steerAngle: 0,
        engineForce: 0,
        braking: false,
        group: carGroup,
        bodyMesh: bodyMesh,
        originalPositions: originalPositions,
        cabinMesh: cabinMesh,
        originalCabinPositions: originalCabinPositions,
        occupant: {
          group: dummyData.group,
          upperBodyPivot: dummyData.upperBodyPivot,
          headPivot: dummyData.headPivot,
          seatbeltGroup: dummyData.seatbeltGroup,
          airbagMesh: airbagMesh,
          pitch: 0,
          vPitch: 0,
          roll: 0,
          vRoll: 0,
          headPitch: 0,
          vHeadPitch: 0,
          ejected: false,
          airbagScale: 0.0,
          airbagDeploying: false,
          airbagDeployTime: 0,
          hasSeatbelt: hasBelt,
          hasAirbag: cfg.hasAirbag !== false,
        }
      };
    });

    vehiclesRef.current = activeVehicles;

    // Apply lighting style according to time of day
    if (dirLightRef.current && ambientLightRef.current) {
      if (simulationState.timeOfDay === 'day') {
        scene.background = new THREE.Color('#0f172a'); // Dark slate sky
        scene.fog = new THREE.FogExp2('#0f172a', 0.01);
        dirLightRef.current.color.set('#f1f5f9');
        dirLightRef.current.intensity = 3.5;
        dirLightRef.current.position.set(50, 60, 30);
        ambientLightRef.current.color.set('#334155');
        ambientLightRef.current.intensity = 1.8;
      } else if (simulationState.timeOfDay === 'sunset') {
        scene.background = new THREE.Color('#31102f'); // Sunset purplish-orange
        scene.fog = new THREE.FogExp2('#31102f', 0.012);
        dirLightRef.current.color.set('#ea580c'); // Deep orange
        dirLightRef.current.intensity = 3.0;
        dirLightRef.current.position.set(80, 20, 10);
        ambientLightRef.current.color.set('#4c1d95'); // Violet ambient
        ambientLightRef.current.intensity = 1.4;
      } else {
        // Night
        scene.background = new THREE.Color('#030712'); // Very dark grey/black
        scene.fog = new THREE.FogExp2('#030712', 0.02);
        dirLightRef.current.color.set('#38bdf8'); // Soft moonlight tint
        dirLightRef.current.intensity = 0.3;
        dirLightRef.current.position.set(-10, 40, -10);
        ambientLightRef.current.color.set('#0f172a');
        ambientLightRef.current.intensity = 0.3;
      }
    }

    // Set camera preset once on reset
    if (cameraRef.current && controlsRef.current) {
      const mode = simulationState.cameraMode;
      controlsRef.current.target.set(0, 0, 0);
      if (mode === 'top') {
        cameraRef.current.position.set(0, 50, 0.01); // Looking straight down
      } else if (mode === 'cinematic') {
        cameraRef.current.position.set(-15, 6, -18);
      } else {
        cameraRef.current.position.set(-30, 20, 35);
      }
      controlsRef.current.update();
    }

  }, [resetTrigger, cars, simulationState.timeOfDay, simulationState.cameraMode]);

  // Main animation / physical integration loop
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const currentTime = performance.now();
      let dt = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // Prevent huge dt jumps from tab sleep
      if (dt > 0.1) dt = 0.1;

      const state = simStateRef.current;
      const vehicles = vehiclesRef.current;
      const scene = sceneRef.current;

      // Handle custom physics simulation ticks
      if (state.isRunning && vehicles.length > 0) {
        // Scale time step according to simulation speed (Slow Motion!)
        const scaledDt = dt * state.timeScale;
        simulationTimeRef.current += scaledDt;

        // Reset active collisions for sandwich pressure calculation
        vehicles.forEach((v) => {
          v.activeCollisions = [];
          v.sandwichPressure = 0;
        });

        // 1. Process manual user steering & throttle if a car is being driven!
        const controlledId = manualCarIdRef.current;
        if (controlledId) {
          const userCar = vehicles.find(v => v.id === controlledId);
          if (userCar) {
            // Apply controls
            userCar.isStationary = false;
            
            // Check if user car is currently flipped
            const uRoll = userCar.roll || 0;
            const uPitch = userCar.pitch || 0;
            const rollStates = [0, -Math.PI / 2, Math.PI / 2, Math.PI, -Math.PI];
            let targetRoll = 0;
            let minDiff = Infinity;
            rollStates.forEach((stateVal) => {
              const diff = Math.abs(uRoll - stateVal);
              if (diff < minDiff) {
                minDiff = diff;
                targetRoll = stateVal;
              }
            });
            const isFlipped = targetRoll !== 0 || Math.abs(uPitch) > 0.6;

            // Steer Angle
            let targetSteer = 0;
            if (!isFlipped) {
              if (keysPressed.current['a'] || keysPressed.current['arrowleft']) targetSteer = 0.45; // ~25 deg
              if (keysPressed.current['d'] || keysPressed.current['arrowright']) targetSteer = -0.45;
            }
            
            // Smooth steering interpolation
            userCar.steerAngle += (targetSteer - userCar.steerAngle) * 8 * scaledDt;

            // Engine force & braking
            let acc = 0;
            userCar.braking = false;
            if (!isFlipped) {
              if (keysPressed.current['w'] || keysPressed.current['arrowup']) {
                acc = 18.0; // Acceleration m/s2
              }
              if (keysPressed.current['s'] || keysPressed.current['arrowdown']) {
                // If driving forward, S acts as brake. If stationary, S goes backward.
                const speedAlongHeading = userCar.vx * Math.cos(userCar.angle) + userCar.vz * Math.sin(userCar.angle);
                if (speedAlongHeading > 0.1) {
                  userCar.braking = true;
                  acc = -25.0; // Strong brakes
                } else {
                  acc = -8.0; // Reverse engine
                }
              }
            }

            // Adjust heading angle based on velocity and steering
            const currentSpeed = Math.sqrt(userCar.vx * userCar.vx + userCar.vz * userCar.vz);
            const speedAlongHeading = userCar.vx * Math.cos(userCar.angle) + userCar.vz * Math.sin(userCar.angle);
            const turningRadius = userCar.length / Math.sin(Math.max(Math.abs(userCar.steerAngle), 0.01));
            
            if (currentSpeed > 0.5 && !isFlipped) {
              const direction = speedAlongHeading > 0 ? 1 : -1;
              const dAngle = (currentSpeed / turningRadius) * direction * Math.sign(userCar.steerAngle) * scaledDt;
              userCar.angle -= dAngle; // Subtract instead of add to turn left when steerAngle is positive
            }

            // Apply acceleration along heading
            const forceX = acc * Math.cos(userCar.angle);
            const forceZ = acc * Math.sin(userCar.angle);

            userCar.vx += forceX * scaledDt;
            userCar.vz += forceZ * scaledDt;
          }
        }

        // 2. Perform Physical Integration for positions
        vehicles.forEach((veh) => {
          // Skip static/stationary cars that haven't been hit yet
          if (veh.isStationary) return;

          // Determine if car is currently flipped (settled or settling on side or roof)
          const rollStates = [0, -Math.PI / 2, Math.PI / 2, Math.PI, -Math.PI];
          let targetRoll = 0;
          let minDiff = Infinity;
          const currentRollVal = veh.roll || 0;
          rollStates.forEach((stateVal) => {
            const diff = Math.abs(currentRollVal - stateVal);
            if (diff < minDiff) {
              minDiff = diff;
              targetRoll = stateVal;
            }
          });
          const isFlipped = targetRoll !== 0 || Math.abs(veh.pitch || 0) > 0.6;

          // Project velocity onto longitudinal (heading) and lateral (perpendicular) axes
          const hx = Math.cos(veh.angle);
          const hz = Math.sin(veh.angle);
          const lx = -hz;
          const lz = hx;

          const speedAlongHeading = veh.vx * hx + veh.vz * hz;
          const speedLateral = veh.vx * lx + veh.vz * lz;

          // Drag and tire friction deceleration
          // Coefficient of sliding/rolling friction based on road condition and vehicle attitude
          let frictionCoeff = state.roadFriction * 0.15; // default rolling scale
          
          if (isFlipped) {
            // On side/roof, slide with lower friction (metal-on-road) and no tire rolling
            frictionCoeff = 0.12 * state.roadFriction;
          } else if (veh.braking) {
            // Braking: tyres lock up, much stronger deceleration
            frictionCoeff = state.roadFriction * 0.85;
          }

          const g = 9.81;
          const normalForce = veh.mass * g;
          const frictionMag = frictionCoeff * normalForce * scaledDt; // force integration: dv = F/m * dt

          // Decelerate longitudinal speed (along heading)
          let newSpeedAlong = speedAlongHeading;
          const fDecel = frictionMag / veh.mass;
          if (Math.abs(speedAlongHeading) > 0.05) {
            const sign = Math.sign(speedAlongHeading);
            if (Math.abs(speedAlongHeading) < fDecel) {
              newSpeedAlong = 0;
            } else {
              newSpeedAlong -= sign * fDecel;
            }
          }

          // Apply lateral grip damping
          // Flipped cars have no tire lateral grip, so they slide sideways without resistance
          const lateralGrip = isFlipped ? 0.35 : (state.roadFriction * 22.0); // Very strong grip coefficient for standard roads
          const newSpeedLateral = speedLateral * Math.exp(-lateralGrip * scaledDt);

          // Reconstruct velocity vector from longitudinal and lateral components
          veh.vx = newSpeedAlong * hx + newSpeedLateral * lx;
          veh.vz = newSpeedAlong * hz + newSpeedLateral * lz;

          const speed = Math.sqrt(veh.vx * veh.vx + veh.vz * veh.vz);

          // --- 3D Gravity and Air/Ground Friction Physics ---
          const yVal = veh.y || 0;
          let vyVal = veh.vy || 0;
          let pitchVal = veh.pitch || 0;
          let rollVal = veh.roll || 0;
          let vPitchVal = veh.vPitch || 0;
          let vRollVal = veh.vRoll || 0;
          let vAngleVal = veh.vAngle || 0;

          const gravity = 9.81;

          if (yVal > 0 || vyVal !== 0) {
            // Apply gravity
            vyVal -= gravity * scaledDt;
            
            // Apply rotational velocity changes
            pitchVal += vPitchVal * scaledDt;
            rollVal += vRollVal * scaledDt;
            veh.angle += vAngleVal * scaledDt;

            // Air resistance/damping for flying angular and linear velocities
            const airDamping = Math.exp(-0.8 * scaledDt);
            vPitchVal *= airDamping;
            vRollVal *= airDamping;
            vAngleVal *= airDamping;
            
            const linearAirDamping = Math.exp(-0.2 * scaledDt);
            veh.vx *= linearAirDamping;
            veh.vz *= linearAirDamping;
            vyVal *= linearAirDamping;
          } else {
            // On the ground (yVal === 0)
            // Normal angular rotation (angle yaw speed damping / spin decay)
            veh.angle += vAngleVal * scaledDt;
            vAngleVal *= Math.exp(-8.0 * scaledDt); // very strong ground friction to stop spinning quickly

            // Smoothly align pitch and roll to the nearest stable posture
            // Stable roll angles: 0 (upright), -PI/2 (left side), PI/2 (right side), PI or -PI (inverted roof)
            const stableRolls = [0, -Math.PI / 2, Math.PI / 2, Math.PI, -Math.PI];
            let targetRoll = 0;
            let minDiff = Infinity;
            stableRolls.forEach((stateVal) => {
              const diff = Math.abs(rollVal - stateVal);
              if (diff < minDiff) {
                minDiff = diff;
                targetRoll = stateVal;
              }
            });

            // For pitch, on flat ground, the target is 0
            const targetPitch = 0;

            pitchVal += (targetPitch - pitchVal) * 7.5 * scaledDt;
            rollVal += (targetRoll - rollVal) * 7.5 * scaledDt;
            
            vPitchVal = 0;
            vRollVal = 0;
          }

          // Update Y position
          let newY = yVal + vyVal * scaledDt;

          // 8-corner 3D ground collision physics
          const w = veh.width;
          const h = veh.height;
          const l = veh.length;
          const localCorners = [
            new THREE.Vector3(-w / 2, 0, -l / 2),
            new THREE.Vector3(w / 2, 0, -l / 2),
            new THREE.Vector3(-w / 2, 0, l / 2),
            new THREE.Vector3(w / 2, 0, l / 2),
            new THREE.Vector3(-w / 2, h, -l / 2),
            new THREE.Vector3(w / 2, h, -l / 2),
            new THREE.Vector3(-w / 2, h, l / 2),
            new THREE.Vector3(w / 2, h, l / 2),
          ];

          // Compute world orientations
          const euler = new THREE.Euler(pitchVal, Math.PI / 2 - veh.angle, rollVal, 'YXZ');
          const quaternion = new THREE.Quaternion().setFromEuler(euler);

          // Find deepest penetrating corner
          let deepestCornerIdx = -1;
          let maxPenetration = 0;
          const worldCorners: THREE.Vector3[] = [];

          localCorners.forEach((localCorner, idx) => {
            const worldCorner = localCorner.clone().applyQuaternion(quaternion).add(new THREE.Vector3(veh.x, newY, veh.z));
            worldCorners.push(worldCorner);
            const pen = -worldCorner.y;
            if (pen > maxPenetration) {
              maxPenetration = pen;
              deepestCornerIdx = idx;
            }
          });

          if (maxPenetration > 0) {
            // Positional correction: push the center up so the deepest corner is exactly on the ground
            newY += maxPenetration;

            // Re-calculate the world corner position and lever arm after push
            const worldCorner = worldCorners[deepestCornerIdx];
            worldCorner.y = 0; // after correction
            const r = new THREE.Vector3().subVectors(worldCorner, new THREE.Vector3(veh.x, newY, veh.z));

            // Compute corner velocity
            const fX = Math.cos(veh.angle);
            const fZ = Math.sin(veh.angle);
            const forward = new THREE.Vector3(fX, 0, fZ);
            const lateral = new THREE.Vector3(-fZ, 0, fX);
            const up = new THREE.Vector3(0, 1, 0);

            const omega = new THREE.Vector3()
              .addScaledVector(forward, vRollVal)
              .addScaledVector(lateral, vPitchVal)
              .addScaledVector(up, vAngleVal);

            const v_linear = new THREE.Vector3(veh.vx, vyVal, veh.vz);
            const v_rot = new THREE.Vector3().crossVectors(omega, r);
            const v_corner = new THREE.Vector3().addVectors(v_linear, v_rot);

            // If the corner is moving downward into the ground, apply an impulse
            if (v_corner.y < -0.5) {
              // Target vertical velocity after bounce
              // If relative velocity is small (-1.2 to -0.5), use 0 restitution to settle smoothly
              const restitution = v_corner.y < -1.2 ? (0.15 * state.elasticity) : 0;
              const deltaV = -(1 + restitution) * v_corner.y;

              // Compute rn = r x (0, 1, 0) = (r.z, 0, -r.x)
              const rn = new THREE.Vector3(r.z, 0, -r.x);
              const rn_roll = rn.dot(forward);
              const rn_pitch = rn.dot(lateral);

              // Moment of inertia
              const m = veh.mass;
              const inertiaRoll = (1 / 12) * m * (w * w + h * h);
              const inertiaPitch = (1 / 12) * m * (h * h + l * l);

              const invM_eff = (1 / m) + (rn_roll * rn_roll / inertiaRoll) + (rn_pitch * rn_pitch / inertiaPitch);
              
              const J = deltaV / invM_eff;

              // Apply linear and angular impulse updates - Moderated for stability!
              vyVal += J / m;
              vRollVal += (rn_roll * J) / inertiaRoll * 0.45;
              vPitchVal += (rn_pitch * J) / inertiaPitch * 0.45;

              // Apply sliding friction to linear horizontal velocity
              const frictionCoeff = 0.4 * state.roadFriction;
              veh.vx *= Math.max(0.6, 1 - frictionCoeff * scaledDt);
              veh.vz *= Math.max(0.6, 1 - frictionCoeff * scaledDt);
              vAngleVal *= Math.max(0.6, 1 - frictionCoeff * scaledDt);

              // Spawn particles on impact
              if (Math.abs(v_corner.y) > 1.0) {
                const groundImpactPoint = new THREE.Vector3(worldCorner.x, 0, worldCorner.z);
                triggerCollisionBurst(groundImpactPoint, new THREE.Vector3(0, 1, 0), Math.abs(v_corner.y) * 120);
              }
            } else {
              // If it is resting on the ground, damp the vertical and angular velocities
              vyVal = 0;
              
              // Smoothly align pitch and roll to the nearest stable posture
              const stableRolls = [0, -Math.PI / 2, Math.PI / 2, Math.PI, -Math.PI];
              let targetRoll = 0;
              let minDiff = Infinity;
              stableRolls.forEach((stateVal) => {
                const diff = Math.abs(rollVal - stateVal);
                if (diff < minDiff) {
                  minDiff = diff;
                  targetRoll = stateVal;
                }
              });

              const targetPitch = 0;

              pitchVal += (targetPitch - pitchVal) * 8.0 * scaledDt;
              rollVal += (targetRoll - rollVal) * 8.0 * scaledDt;

              vPitchVal = 0;
              vRollVal = 0;
              
              // Apply ground friction when sliding/dragging on the ground
              const frictionCoeff = 0.5 * state.roadFriction;
              veh.vx *= Math.max(0.5, 1 - frictionCoeff * scaledDt);
              veh.vz *= Math.max(0.5, 1 - frictionCoeff * scaledDt);
              vAngleVal *= Math.max(0.5, 1 - frictionCoeff * scaledDt);
            }
          }

          // Save back
          veh.y = newY;
          veh.vy = vyVal;
          veh.pitch = pitchVal;
          veh.roll = rollVal;
          veh.vPitch = vPitchVal;
          veh.vRoll = vRollVal;
          veh.vAngle = vAngleVal;

          // Update position
          veh.x += veh.vx * scaledDt;
          veh.z += veh.vz * scaledDt;

          // If moving forward, align wheel yaw with steer.
          //FL/FR wheels steering yaw
          if (veh.group) {
            // Synchronize Three.js mesh group with physical position and 3D Euler angles
            veh.group.position.set(veh.x, veh.y, veh.z);
            veh.group.rotation.set(veh.pitch, Math.PI / 2 - veh.angle, veh.roll, 'YXZ');

            const wheelFL = veh.group.getObjectByName('wheel_FL');
            const wheelFR = veh.group.getObjectByName('wheel_FR');
            if (wheelFL) wheelFL.rotation.y = veh.steerAngle;
            if (wheelFR) wheelFR.rotation.y = veh.steerAngle;

            // Spin wheels based on speed
            const wheelSpeed = (speed / 0.42) * scaledDt; // speed / wheel radius
            // direction of spinning
            const isForward = (veh.vx * Math.cos(veh.angle) + veh.vz * Math.sin(veh.angle)) >= 0;
            const sign = isForward ? 1 : -1;

            ['FL', 'FR', 'RL', 'RR'].forEach((wheelName) => {
              const wheel = veh.group?.getObjectByName(`wheel_${wheelName}`);
              if (wheel) {
                // Cylinders roll around their local horizontal X axis with 'YXZ' rotation order
                wheel.rotation.x += sign * wheelSpeed;
              }
            });

            // --- SUSPENSION AND CHASSIS ANIMATION ---
            const chassis = veh.group.getObjectByName('chassis');
            if (chassis) {
              // Calculate vehicle pitch based on control forces
              let pitch = 0;
              if (veh.braking) {
                pitch = 0.05 * Math.min(speed / 5, 1.0); // Nose dives forward
              } else if (veh.id === manualCarIdRef.current && (keysPressed.current['w'] || keysPressed.current['arrowup'])) {
                pitch = -0.02 * Math.min(speed / 10, 1.0); // Rear squats down
              }

              // Calculate body roll based on turning radius and lateral speed
              const rollAmount = (veh.steerAngle || 0) * (speed / 12) * 0.12;

              // Gentle highway micro-bump vibrations that scale with speed
              const bounce = Math.sin(simulationTimeRef.current * 20) * 0.007 * Math.min(speed / 8, 1.0);

              // Apply translation and rotations to the chassis group (sprung mass)
              chassis.position.set(0, bounce, 0);
              chassis.rotation.set(pitch, 0, -rollAmount);

              // Apply sandwich compression scales if active
              if (veh.crushScaleZ !== undefined) {
                chassis.scale.set(
                  veh.crushScaleX !== undefined ? veh.crushScaleX : 1.0,
                  veh.crushScaleY !== undefined ? veh.crushScaleY : 1.0,
                  veh.crushScaleZ
                );
                
                // Pull wheels closer to center as body is compressed!
                const spec = CAR_SPECS_PRESETS[veh.type];
                const lengthRef = spec.length;
                ['FL', 'FR', 'RL', 'RR'].forEach((wheelName) => {
                  const wheel = veh.group?.getObjectByName(`wheel_${wheelName}`);
                  if (wheel) {
                    const originalZ = (wheelName.startsWith('F') ? 1 : -1) * lengthRef * 0.3;
                    wheel.position.z = originalZ * veh.crushScaleZ!;
                    
                    // Tilt wheels outwards as they are crushed
                    if (veh.crushScaleZ! < 0.8) {
                      wheel.rotation.z = (wheelName.endsWith('L') ? 0.38 : -0.38) * (1.0 - veh.crushScaleZ!);
                      wheel.position.y = -0.12 * (1.0 - veh.crushScaleZ!); // drop slightly upwards relative to body
                    }
                  }
                });
              } else {
                chassis.scale.set(1.0, 1.0, 1.0);
              }

              // If suspension has collapsed due to crash, sag the chassis heavily and twist it
              if (veh.isSuspensionCollapsed) {
                chassis.position.y -= 0.14;
                chassis.rotation.z += 0.08; // heavy list to the side
                chassis.rotation.x += 0.04; // nose down
              }



              // Wobble/Dangle loose broken doors on their hinges as the car moves
              if (veh.doorLIsHanging) {
                const doorL = chassis.getObjectByName('door_L');
                if (doorL && veh.doorLOpenAngle !== undefined) {
                  const wobble = Math.sin(simulationTimeRef.current * 22) * 0.07 * Math.min(speed / 8, 1.0);
                  doorL.rotation.y = veh.doorLOpenAngle + wobble;
                }
              }
              if (veh.doorRIsHanging) {
                const doorR = chassis.getObjectByName('door_R');
                if (doorR && veh.doorROpenAngle !== undefined) {
                  const wobble = Math.sin(simulationTimeRef.current * 22) * 0.07 * Math.min(speed / 8, 1.0);
                  doorR.rotation.y = veh.doorROpenAngle + wobble;
                }
              }

              // 4-corner active coilover spring scaling
              ['FL', 'FR', 'RL', 'RR'].forEach((corner) => {
                const susp = veh.group?.getObjectByName(`suspension_${corner}`);
                if (susp) {
                  let cornerScaleY = 1.0;
                  
                  if (veh.isSuspensionCollapsed) {
                    // Left front collapsed or both front collapsed depending on side of tilt
                    if (corner === 'FL' || corner === 'FR') {
                      cornerScaleY = 0.42; // compressed/broken spring
                    } else {
                      cornerScaleY = 0.85;
                    }
                  } else {
                    // Scale coilovers based on dynamic loads
                    if (corner === 'FL') cornerScaleY = 1.0 + bounce + pitch - rollAmount;
                    if (corner === 'FR') cornerScaleY = 1.0 + bounce + pitch + rollAmount;
                    if (corner === 'RL') cornerScaleY = 1.0 + bounce - pitch - rollAmount;
                    if (corner === 'RR') cornerScaleY = 1.0 + bounce - pitch + rollAmount;
                  }
                  
                  susp.scale.y = Math.max(0.35, Math.min(1.4, cornerScaleY));
                }
              });
            }

            // Handle glowing brake tail lights
            const isDecelerating = veh.braking;
            ['brake_L', 'brake_R'].forEach((lightName) => {
              const light = veh.group?.getObjectByName(lightName) as THREE.Mesh;
              if (light && light.material) {
                const mat = light.material as THREE.MeshStandardMaterial;
                if (isDecelerating) {
                  mat.emissive.set('#ef4444');
                  mat.emissiveIntensity = 4.0;
                } else {
                  mat.emissive.set('#991b1b');
                  mat.emissiveIntensity = 0.5;
                }
              }
            });

            // --- OCCUPANT SIMULATION ---
            if (veh.occupant) {
              const occ = veh.occupant;
              
              // Calculate vehicle world acceleration
              const dtUsed = Math.max(0.001, scaledDt);
              const prevXVel = veh.prevVx !== undefined ? veh.prevVx : veh.vx;
              const prevYVel = veh.prevVy !== undefined ? veh.prevVy : (veh.vy || 0);
              const prevZVel = veh.prevVz !== undefined ? veh.prevVz : veh.vz;
              
              const ax = (veh.vx - prevXVel) / dtUsed;
              const ay = ((veh.vy || 0) - prevYVel) / dtUsed;
              const az = (veh.vz - prevZVel) / dtUsed;
              
              // Project world acceleration onto car's local coordinates
              const cosH = Math.cos(veh.angle);
              const sinH = Math.sin(veh.angle);
              
              const accForward = ax * cosH + az * sinH;
              const accLateral = -ax * sinH + az * cosH;
              
              const totalDecelG = Math.sqrt(ax * ax + az * az) / 9.81;

              // Trigger Airbag if decel is above 7G and car has airbag config enabled
              if (totalDecelG > 7.0 && occ.hasAirbag && !occ.airbagDeploying && occ.airbagScale === 0) {
                occ.airbagDeploying = true;
                occ.airbagDeployTime = simulationTimeRef.current;
              }

              // Airbag scale management (inflation and deflation)
              if (occ.airbagDeploying) {
                const elapsed = simulationTimeRef.current - occ.airbagDeployTime;
                if (elapsed < 0.08) {
                  occ.airbagScale = elapsed / 0.08;
                  if (occ.airbagMesh && occ.airbagMesh.material) {
                    (occ.airbagMesh.material as THREE.MeshStandardMaterial).opacity = 0.95;
                  }
                } else if (elapsed < 1.5) {
                  occ.airbagScale = 1.0;
                } else if (elapsed < 3.5) {
                  const deflateFactor = 1.0 - (elapsed - 1.5) / 2.0;
                  occ.airbagScale = Math.max(0, deflateFactor);
                  if (occ.airbagMesh && occ.airbagMesh.material) {
                    (occ.airbagMesh.material as THREE.MeshStandardMaterial).opacity = 0.95 * occ.airbagScale;
                  }
                } else {
                  occ.airbagDeploying = false;
                  occ.airbagScale = 0.0;
                  if (occ.airbagMesh && occ.airbagMesh.material) {
                    (occ.airbagMesh.material as THREE.MeshStandardMaterial).opacity = 0.0;
                  }
                }
                if (occ.airbagMesh) {
                  occ.airbagMesh.scale.set(occ.airbagScale, occ.airbagScale, occ.airbagScale);
                }
              }

              if (!occ.ejected) {
                if (totalDecelG > 18.0 && !occ.hasSeatbelt) {
                  occ.ejected = true;
                  
                  if (veh.group && sceneRef.current) {
                    const chassisObj = veh.group.getObjectByName('chassis');
                    if (chassisObj) {
                      chassisObj.remove(occ.group);
                      sceneRef.current.add(occ.group);
                    }
                    
                    const localSeatPos = new THREE.Vector3(
                      -veh.width * 0.22,
                      veh.type === 'truck' ? veh.height * 0.35 : veh.type === 'sports' ? veh.height * 0.38 : veh.height * 0.45,
                      veh.type === 'truck' ? veh.length * 0.32 : veh.type === 'sports' ? veh.length * 0.02 : -veh.length * 0.05
                    );
                    localSeatPos.applyMatrix4(chassisObj ? chassisObj.matrixWorld : veh.group.matrixWorld);
                    
                    occ.worldPos = localSeatPos;
                    
                    const speedAlong = veh.vx * cosH + veh.vz * sinH;
                    const ejectSpeed = Math.max(speedAlong * 1.1, 5.0);
                    
                    occ.worldVel = new THREE.Vector3(
                      ejectSpeed * cosH,
                      (veh.vy || 0) + 4.5,
                      ejectSpeed * sinH
                    );
                    
                    occ.worldRot = new THREE.Vector3(0, Math.PI / 2 - veh.angle, 0);
                    occ.worldVRot = new THREE.Vector3(
                      (Math.random() - 0.5) * 15,
                      (Math.random() - 0.5) * 5,
                      (Math.random() - 0.5) * 15
                    );

                    // Spawn windshield glass shards
                    const systems = particleSystemRef.current;
                    if (systems && sceneRef.current) {
                      const glassCount = 18;
                      for (let d = 0; d < glassCount; d++) {
                        const w = Math.random() * 0.15 + 0.05;
                        const h = 0.01;
                        const l = Math.random() * 0.15 + 0.05;
                        const glassGeo = new THREE.BoxGeometry(w, h, l);
                        const glassMat = new THREE.MeshStandardMaterial({
                          color: '#bae6fd',
                          metalness: 0.9,
                          roughness: 0.1,
                          transparent: true,
                          opacity: 0.7
                        });
                        const gMesh = new THREE.Mesh(glassGeo, glassMat);
                        gMesh.position.copy(occ.worldPos).add(new THREE.Vector3(
                          (Math.random() - 0.5) * 0.6,
                          (Math.random() - 0.5) * 0.4 + 0.2,
                          (Math.random() - 0.5) * 0.6 + 0.3
                        ));
                        gMesh.castShadow = true;
                        sceneRef.current.add(gMesh);
                        
                        systems.debris.meshes.push(gMesh);
                        systems.debris.velocities.push(new THREE.Vector3(
                          occ.worldVel.x + (Math.random() - 0.5) * 5,
                          occ.worldVel.y + Math.random() * 3 + 2,
                          occ.worldVel.z + (Math.random() - 0.5) * 5
                        ));
                        systems.debris.angularVelocities.push(new THREE.Vector3(
                          (Math.random() - 0.5) * 20,
                          (Math.random() - 0.5) * 20,
                          (Math.random() - 0.5) * 20
                        ));
                        systems.debris.ages.push(0);
                      }
                    }
                  }
                }
              }

              if (occ.ejected) {
                if (occ.worldPos && occ.worldVel && occ.worldRot && occ.worldVRot) {
                  occ.worldVel.y -= 9.81 * dtUsed;
                  occ.worldVel.x *= Math.exp(-0.15 * dtUsed);
                  occ.worldVel.y *= Math.exp(-0.1 * dtUsed);
                  occ.worldVel.z *= Math.exp(-0.15 * dtUsed);
                  
                  occ.worldPos.addScaledVector(occ.worldVel, dtUsed);
                  occ.worldRot.addScaledVector(occ.worldVRot, dtUsed);
                  occ.worldVRot.multiplyScalar(Math.exp(-0.3 * dtUsed));
                  
                  const groundY = 0.05;
                  if (occ.worldPos.y < groundY) {
                    occ.worldPos.y = groundY;
                    if (occ.worldVel.y < -1.5) {
                      occ.worldVel.y = -0.4 * occ.worldVel.y;
                      occ.worldVRot.x += (Math.random() - 0.5) * 8;
                      occ.worldVRot.z += (Math.random() - 0.5) * 8;
                    } else {
                      occ.worldVel.y = 0;
                    }
                    occ.worldVel.x *= Math.exp(-3.5 * dtUsed);
                    occ.worldVel.z *= Math.exp(-3.5 * dtUsed);
                    occ.worldRot.x += (0 - occ.worldRot.x) * 5 * dtUsed;
                    occ.worldRot.z += (0 - occ.worldRot.z) * 5 * dtUsed;
                  }
                  
                  occ.group.position.copy(occ.worldPos);
                  occ.group.rotation.set(occ.worldRot.x, occ.worldRot.y, occ.worldRot.z, 'YXZ');
                  occ.upperBodyPivot.rotation.x = -0.2;
                  occ.headPivot.rotation.x = -0.4;
                }
              } else {
                let stiffnessPitch = 120.0;
                let dampingPitch = 14.0;
                let maxPitch = 1.3;
                
                let stiffnessRoll = 100.0;
                let dampingRoll = 12.0;
                let maxRoll = 0.7;
                
                if (occ.hasSeatbelt) {
                  stiffnessPitch = 600.0;
                  dampingPitch = 40.0;
                  maxPitch = 0.35;
                  
                  stiffnessRoll = 400.0;
                  dampingRoll = 30.0;
                  maxRoll = 0.25;
                }
                
                if (occ.airbagScale > 0.5) {
                  if (occ.pitch > 0.05) {
                    stiffnessPitch += 500.0 * occ.airbagScale;
                    dampingPitch += 35.0 * occ.airbagScale;
                    maxPitch = Math.min(maxPitch, 0.22);
                  }
                }
                
                const fForwardInertial = -accForward;
                const fLateralInertial = accLateral;
                
                const aPitch = fForwardInertial * 0.15 - stiffnessPitch * occ.pitch - dampingPitch * occ.vPitch;
                const aRoll = fLateralInertial * 0.15 - stiffnessRoll * occ.roll - dampingRoll * occ.vRoll;
                
                occ.vPitch += aPitch * dtUsed;
                occ.vRoll += aRoll * dtUsed;
                
                occ.pitch += occ.vPitch * dtUsed;
                occ.roll += occ.vRoll * dtUsed;
                
                if (Math.abs(occ.pitch) > maxPitch) {
                  occ.pitch = Math.sign(occ.pitch) * maxPitch;
                  occ.vPitch = 0;
                }
                if (Math.abs(occ.roll) > maxRoll) {
                  occ.roll = Math.sign(occ.roll) * maxRoll;
                  occ.vRoll = 0;
                }
                
                occ.upperBodyPivot.rotation.set(occ.pitch, 0, -occ.roll, 'YXZ');
                
                let stiffnessHead = 180.0;
                let dampingHead = 12.0;
                
                const fHeadInertial = -accForward * 0.12 - occ.vPitch * 2.5;
                const aHeadPitch = fHeadInertial - stiffnessHead * occ.headPitch - dampingHead * occ.vHeadPitch;
                
                occ.vHeadPitch += aHeadPitch * dtUsed;
                occ.headPitch += occ.vHeadPitch * dtUsed;
                
                const maxHeadPitch = 0.8;
                if (Math.abs(occ.headPitch) > maxHeadPitch) {
                  occ.headPitch = Math.sign(occ.headPitch) * maxHeadPitch;
                  occ.vHeadPitch = 0;
                }
                
                occ.headPivot.rotation.set(occ.headPitch, 0, -occ.roll * 0.5, 'YXZ');
              }
            }

            // Save previous velocities for next frame acceleration derivative
            veh.prevVx = veh.vx;
            veh.prevVy = veh.vy || 0;
            veh.prevVz = veh.vz;
          }
        });

        // 3. Collision Resolution via SAT (Separating Axis Theorem)
        // Check collisions between all pairs of vehicles
        for (let i = 0; i < vehicles.length; i++) {
          const vA = vehicles[i];

          // Check boundary wall collision if Wall Test preset is loaded
          const isWallPreset = carsConfigRef.current.length === 1;
          if (isWallPreset) {
            const wallX = 12.0; // Wall front edge is at X=12.0 meters (wall center X=15, width=6, so front is at 15 - 3 = 12)
            const halfLen = vA.length / 2;
            
            // Project front of car facing East (angle near 0)
            const carFrontWorldX = vA.x + halfLen * Math.cos(vA.angle);
            const carFrontWorldZ = vA.z + halfLen * Math.sin(vA.angle);

            if (carFrontWorldX >= wallX && vA.vx > 0) {
              // Collision with the wall!
              // Resolve collision
              const collisionPoint = new THREE.Vector3(wallX, vA.height * 0.45, carFrontWorldZ);
              const relativeSpeedKmH = Math.abs(vA.vx) * 3.6;

              // Calculate impact force: F = dp / dt = m * dv / 0.1s duration (approximate)
              const impactDuration = 0.08; // seconds
              const velocityChange = Math.abs(vA.vx); // full stop
              const impactForceKN = (vA.mass * velocityChange) / impactDuration / 1000;

              // Record active collision for sandwich pressure check
              if (!vA.activeCollisions) vA.activeCollisions = [];
              vA.activeCollisions.push({
                targetId: 'wall',
                normal: new THREE.Vector3(-1, 0, 0), // wall normal pushes West
                forceKN: impactForceKN
              });

              // Kinetic energy dissipated: Ek = 0.5 * m * v^2
              const energyDissipatedKJ = (0.5 * vA.mass * vA.vx * vA.vx) / 1000;

              // Bounce slightly or crumple
              vA.vx = -vA.vx * state.elasticity;
              vA.x = wallX - halfLen * Math.cos(vA.angle) - 0.05; // Position correction
              vA.isStationary = false;

              // 3D gravity launch reaction on wall collision
              if (impactForceKN > 150) {
                const posA = new THREE.Vector3(vA.x, (vA.y || 0) + vA.height * 0.45, vA.z);
                const rA = new THREE.Vector3().subVectors(collisionPoint, posA);

                // Compute horizontal impulse scale
                const impulseScalar = vA.mass * Math.abs(vA.vx) * (1 + state.elasticity);
                const impulseX = -impulseScalar; // wall pushes to the left
                const impulseY = impulseScalar * 0.14; // wall wedge climbing factor
                const impulseVec = new THREE.Vector3(impulseX, impulseY, 0);

                const torque = new THREE.Vector3().crossVectors(rA, impulseVec);

                // Convert world torque to local frame of vehicle A
                const fX = Math.cos(vA.angle);
                const fZ = Math.sin(vA.angle);
                const forward = new THREE.Vector3(fX, 0, fZ);
                const lateral = new THREE.Vector3(-fZ, 0, fX);
                const up = new THREE.Vector3(0, 1, 0);

                 const localTorque = {
                  roll: torque.dot(forward),
                  pitch: torque.dot(lateral),
                  yaw: -torque.dot(up) // NEGATED because the XZ coordinate system is left-handed for Y-rotation!
                };

                // Moments of inertia
                const m = vA.mass;
                const w = vA.width;
                const h = vA.height;
                const l = vA.length;
                const inertia = {
                  roll: (1 / 12) * m * (w * w + h * h),
                  pitch: (1 / 12) * m * (h * h + l * l),
                  yaw: (1 / 12) * m * (w * w + l * l),
                };

                const multiplierRoll = 0.1;
                const multiplierPitch = 0.1;
                const multiplierYaw = 0.95;

                vA.vRoll = (vA.vRoll || 0) + (localTorque.roll / inertia.roll) * multiplierRoll;
                vA.vPitch = (vA.vPitch || 0) + (localTorque.pitch / inertia.pitch) * multiplierPitch;
                vA.vAngle = (vA.vAngle || 0) + (localTorque.yaw / inertia.yaw) * multiplierYaw;

                // Vertical launch velocity - Moderated for realism!
                vA.vy = (vA.vy || 0) + (impulseY / vA.mass) * 0.08;

                // Cap the spin rates
                const maxSpin = 1.2;
                const maxYawSpin = 3.5;
                vA.vRoll = Math.max(-maxSpin, Math.min(maxSpin, vA.vRoll));
                vA.vPitch = Math.max(-maxSpin, Math.min(maxSpin, vA.vPitch));
                vA.vAngle = Math.max(-maxYawSpin, Math.min(maxYawSpin, vA.vAngle));
              }

              // Trigger mesh deformation
              triggerMeshCrumple(vA, collisionPoint, impactForceKN);

              // Spawn bursts of sparks, dust/smoke, and flying debris
              triggerCollisionBurst(collisionPoint, new THREE.Vector3(-1, 0.2, 0), impactForceKN);

              // Visual popup text
              spawnCrashText('BOOM!', collisionPoint);

              // Dispatch event to parent UI
              if (!collisionOccurredRef.current) {
                collisionOccurredRef.current = true;
                
                // Determine safety rating
                let rating: 'S' | 'A' | 'B' | 'C' | 'D' | 'F' = 'S';
                if (impactForceKN > 2500) rating = 'F';
                else if (impactForceKN > 1600) rating = 'D';
                else if (impactForceKN > 1000) rating = 'C';
                else if (impactForceKN > 500) rating = 'B';
                else rating = 'A';

                const beltA = vA.occupant ? vA.occupant.hasSeatbelt : true;
                const airbagA = vA.occupant ? vA.occupant.hasAirbag : true;
                const statsA = computeInjuryAndSurvival(vA.mass, impactForceKN, beltA, airbagA, !!vA.isCrushedFatal);

                onCollision({
                  time: simulationTimeRef.current,
                  impactForce: parseFloat(impactForceKN.toFixed(1)),
                  energyLoss: parseFloat(energyDissipatedKJ.toFixed(1)),
                  relativeSpeed: parseFloat(relativeSpeedKmH.toFixed(1)),
                  safetyRating: rating,
                  survivalRateA: statsA.survivalRate,
                  survivalRateB: null,
                  injuryMetricsA: statsA.metrics,
                  injuryMetricsB: null
                });
              }
            }
          }

          // Check pairwise vehicle-to-vehicle collision
          for (let j = i + 1; j < vehicles.length; j++) {
            const vB = vehicles[j];

            const col = checkOBBCollision(vA, vB);
            if (col && col.overlap > 0) {
              // Trigger collision response!
              resolveVehicleCollision(vA, vB, col, state.elasticity);
            }
          }
        }

        // --- 3.5 SANDWICH COMPRESSION / CRUSH PHYSICS SOLVER ---
        vehicles.forEach((veh) => {
          if (!veh.activeCollisions || veh.activeCollisions.length < 2) {
            return;
          }

          // Find if there are two collisions that are opposing each other
          for (let m = 0; m < veh.activeCollisions.length; m++) {
            for (let n = m + 1; n < veh.activeCollisions.length; n++) {
              const c1 = veh.activeCollisions[m];
              const c2 = veh.activeCollisions[n];

              const dot = c1.normal.dot(c2.normal);
              // If dot product is negative, they are pushing in roughly opposite directions
              if (dot < -0.38) {
                // We have sandwich compression!
                veh.isSandwiched = true;
                
                // Pressure calculated by minimum force (since you need both sides to pinch)
                // plus a fraction of the total force
                const opposingPressure = Math.min(c1.forceKN, c2.forceKN) + (c1.forceKN + c2.forceKN) * 0.12;
                veh.sandwichPressure = (veh.sandwichPressure || 0) + opposingPressure;
                veh.maxSandwichPressure = Math.max(veh.maxSandwichPressure || 0, veh.sandwichPressure);

                // Calculate real-time 3D deformation scales
                // At 100kN, we begin visual scaling. At 900kN, we compress up to 25% (0.25)
                const pFactor = Math.min(Math.max((veh.maxSandwichPressure - 100) / 800, 0), 1.0);
                if (pFactor > 0) {
                  veh.crushScaleZ = Math.max(0.18, 1.0 - pFactor * 0.78); // dramatic Z compression
                  veh.crushScaleX = Math.max(0.65, 1.0 - pFactor * 0.15); // slightly crushed sides
                  veh.crushScaleY = Math.max(0.45, 1.0 - pFactor * 0.45); // squished vertically as well!
                }

                // If compression pressure exceeds 350 kN, it's fatal and occupant cannot survive
                if (veh.maxSandwichPressure > 350) {
                  veh.isCrushedFatal = true;
                  
                  // Trigger catastrophic crush text popup
                  if (Math.random() < 0.1) {
                    spawnCrashText('CRUSHED!', new THREE.Vector3(veh.x, (veh.y || 0) + 1.5, veh.z));
                  }
                  
                  // Spawn massive glass and metal sparks
                  const systems = particleSystemRef.current;
                  if (systems && sceneRef.current && Math.random() < 0.3) {
                    triggerCollisionBurst(new THREE.Vector3(veh.x, (veh.y || 0) + 0.5, veh.z), new THREE.Vector3(0, 1, 0), 1200);
                  }
                }
              }
            }
          }
        });

        // 4. Emit real-time telemetry points
        if (simulationTimeRef.current > 0) {
          const carA = vehicles.find(v => v.id === 'A');
          const carB = vehicles.find(v => v.id === 'B');
          
          const speedA = carA ? Math.sqrt(carA.vx * carA.vx + carA.vz * carA.vz) * 3.6 : 0;
          const speedB = carB ? Math.sqrt(carB.vx * carB.vx + carB.vz * carB.vz) * 3.6 : 0;

          const ekA = carA ? (0.5 * carA.mass * (carA.vx * carA.vx + carA.vz * carA.vz)) / 1000 : 0;
          const ekB = carB ? (0.5 * carB.mass * (carB.vx * carB.vx + carB.vz * carB.vz)) / 1000 : 0;

          onTelemetryUpdate({
            time: parseFloat(simulationTimeRef.current.toFixed(2)),
            carASpeed: parseFloat(speedA.toFixed(1)),
            carBSpeed: parseFloat(speedB.toFixed(1)),
            carAKineticEnergy: parseFloat(ekA.toFixed(1)),
            carBKineticEnergy: parseFloat(ekB.toFixed(1)),
            totalDeformation: totalDeformationSumRef.current,
          });
        }
      }

      // Update particle positions, ages, sizes
      updateParticles(dt);

      // Render update
      if (scene && cameraRef.current && rendererRef.current) {
        // Adjust camera to follow selected target
        adjustCameraFollow(vehicles);

        if (controlsRef.current) controlsRef.current.update();

        // Update screen shake decay
        if (cameraShakeIntensityRef.current > 0) {
          cameraShakeIntensityRef.current -= dt * 2.5; // decay shake over time
          if (cameraShakeIntensityRef.current < 0) {
            cameraShakeIntensityRef.current = 0;
          }
        }

        const camera = cameraRef.current;
        const originalPos = camera.position.clone();
        const intensity = cameraShakeIntensityRef.current;
        
        if (intensity > 0.01) {
          const shakeX = (Math.random() - 0.5) * intensity;
          const shakeY = (Math.random() - 0.5) * intensity;
          const shakeZ = (Math.random() - 0.5) * intensity;
          camera.position.add(new THREE.Vector3(shakeX, shakeY, shakeZ));
        }

        rendererRef.current.render(scene, camera);

        // Restore original camera position for OrbitControls and subsequent frames
        if (intensity > 0.01) {
          camera.position.copy(originalPos);
        }
      }

      // Update 3D overlay text elements
      updateCrashTexts();
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [onCollision, onTelemetryUpdate, manualCarId]);

  // Adjust camera position in Follow/Cinematic modes
  const adjustCameraFollow = (vehicles: PhysicsVehicle[]) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls || vehicles.length === 0) return;

    const mode = simStateRef.current.cameraMode;
    if (mode === 'free' || mode === 'top') return;

    let targetCar: PhysicsVehicle | undefined;
    if (mode === 'followA') {
      targetCar = vehicles.find((v) => v.id === 'A');
    } else if (mode === 'followB') {
      targetCar = vehicles.find((v) => v.id === 'B');
    }

    if (targetCar && targetCar.group) {
      const carPos = targetCar.group.position;
      
      // Look at the target car
      controls.target.copy(carPos);

      // Smooth camera position behind the car based on heading angle
      const angle = targetCar.angle;
      const behindX = carPos.x - 14 * Math.cos(angle);
      const behindZ = carPos.z - 14 * Math.sin(angle);
      const heightY = carPos.y + 4.5;

      const targetCamPos = new THREE.Vector3(behindX, heightY, behindZ);
      camera.position.lerp(targetCamPos, 0.08); // smooth transition
    } else if (mode === 'cinematic') {
      // Find mid-point between Car A and Car B (or just center of focus)
      const carA = vehicles.find((v) => v.id === 'A');
      const carB = vehicles.find((v) => v.id === 'B');

      if (carA && carB) {
        const midPoint = new THREE.Vector3()
          .addVectors(carA.group!.position, carB.group!.position)
          .multiplyScalar(0.5);

        controls.target.lerp(midPoint, 0.1);

        // Keep camera at a cinematic panning position slightly rotated
        const camDistance = carA.group!.position.distanceTo(carB.group!.position);
        if (camDistance > 5) {
          const sideX = midPoint.x - (camDistance * 0.4 + 5);
          const sideZ = midPoint.z + 12;
          const targetCamPos = new THREE.Vector3(sideX, 6.0 + camDistance * 0.1, sideZ);
          camera.position.lerp(targetCamPos, 0.05);
        }
      }
    }
  };

  // Separating Axis Theorem (SAT) math for vehicle collision detection
  interface SATResult {
    overlap: number;
    normal: THREE.Vector3; // points from B to A
  }

  const checkOBBCollision = (vA: PhysicsVehicle, vB: PhysicsVehicle): SATResult | null => {
    if (!vA.group || !vB.group) return null;

    // 3D vertical height overlap check
    const bottomA = vA.y || 0;
    const topA = bottomA + vA.height;
    const bottomB = vB.y || 0;
    const topB = bottomB + vB.height;

    if (topA < bottomB || topB < bottomA) {
      return null; // No 3D vertical overlap, skip collision
    }

    // Get center points
    const cA = new THREE.Vector3(vA.x, vA.height / 2, vA.z);
    const cB = new THREE.Vector3(vB.x, vB.height / 2, vB.z);

    // HALF EXTENTS
    // X axis (local width), Z axis (local length)
    const hWA = vA.width / 2;
    const hLA = vA.length / 2;
    const hWB = vB.width / 2;
    const hLB = vB.length / 2;

    // Axes
    const axA = new THREE.Vector3(Math.cos(vA.angle + Math.PI/2), 0, Math.sin(vA.angle + Math.PI/2)); // Local X (lat)
    const azA = new THREE.Vector3(Math.cos(vA.angle), 0, Math.sin(vA.angle)); // Local Z (lon)

    const axB = new THREE.Vector3(Math.cos(vB.angle + Math.PI/2), 0, Math.sin(vB.angle + Math.PI/2));
    const azB = new THREE.Vector3(Math.cos(vB.angle), 0, Math.sin(vB.angle));

    const axes = [axA, azA, axB, azB];
    let minOverlap = Infinity;
    let collisionNormal = new THREE.Vector3();

    // Loop through all 4 local axes
    for (const axis of axes) {
      // Project A
      // Corners of OBB A relative to center
      const projA_radius = 
        hWA * Math.abs(axA.dot(axis)) + 
        hLA * Math.abs(azA.dot(axis));

      // Project B
      const projB_radius = 
        hWB * Math.abs(axB.dot(axis)) + 
        hLB * Math.abs(azB.dot(axis));

      // Project distance between centers
      const deltaC = new THREE.Vector3().subVectors(cA, cB);
      const centerDistProj = Math.abs(deltaC.dot(axis));

      const overlap = (projA_radius + projB_radius) - centerDistProj;
      if (overlap <= 0) {
        return null; // Separating axis found! No collision
      }

      if (overlap < minOverlap) {
        minOverlap = overlap;
        collisionNormal.copy(axis);

        // Ensure collision normal points from B to A
        if (deltaC.dot(collisionNormal) < 0) {
          collisionNormal.negate();
        }
      }
    }

    return {
      overlap: minOverlap,
      normal: collisionNormal.normalize()
    };
  };

  // Solve collision impulse & apply forces
  const resolveVehicleCollision = (vA: PhysicsVehicle, vB: PhysicsVehicle, col: SATResult, elasticity: number) => {
    // Relative velocity
    const rvx = vA.vx - vB.vx;
    const rvz = vA.vz - vB.vz;
    const relativeVel = new THREE.Vector3(rvx, 0, rvz);

    // Velocity along normal
    const velAlongNormal = relativeVel.dot(col.normal);

    // If already moving away, skip
    if (velAlongNormal > 0) return;

    // Relative speed (km/h) for telemetry
    const relativeSpeedKmH = Math.abs(velAlongNormal) * 3.6;

    // Calculate restitution
    const e = elasticity;

    // Calculate impulse scalar
    const totalMassReciprocal = (1 / vA.mass) + (1 / vB.mass);
    const impulseScalar = -(1 + e) * velAlongNormal / totalMassReciprocal;

    // Calculate impact force for visual triggers: F = J / dt
    const impactDuration = 0.08; // duration of crumple (approx 80ms)
    const impactForceKN = impulseScalar / impactDuration / 1000;

    // Record active collisions for sandwich pressure check
    if (!vA.activeCollisions) vA.activeCollisions = [];
    vA.activeCollisions.push({
      targetId: vB.id,
      normal: col.normal.clone(),
      forceKN: impactForceKN
    });

    if (!vB.activeCollisions) vB.activeCollisions = [];
    vB.activeCollisions.push({
      targetId: vA.id,
      normal: col.normal.clone().negate(),
      forceKN: impactForceKN
    });

    // Kinetic Energy Dissipated
    const keA_before = 0.5 * vA.mass * (vA.vx * vA.vx + vA.vz * vA.vz);
    const keB_before = 0.5 * vB.mass * (vB.vx * vB.vx + vB.vz * vB.vz);

    // Apply impulse vector
    const impulseX = impulseScalar * col.normal.x;
    const impulseZ = impulseScalar * col.normal.z;

    if (!vA.isStationary) {
      vA.vx += impulseX / vA.mass;
      vA.vz += impulseZ / vA.mass;
    } else {
      // Stationary car gets activated upon impact!
      vA.isStationary = false;
      vA.vx = impulseX / vA.mass;
      vA.vz = impulseZ / vA.mass;
    }

    if (!vB.isStationary) {
      vB.vx -= impulseX / vB.mass;
      vB.vz -= impulseZ / vB.mass;
    } else {
      vB.isStationary = false;
      vB.vx = -impulseX / vB.mass;
      vB.vz = -impulseZ / vB.mass;
    }

    // 3D gravity launch reaction on vehicle-to-vehicle collision
    if (impactForceKN > 150) {
      const posA_com = new THREE.Vector3(vA.x, (vA.y || 0) + vA.height * 0.45, vA.z);
      const posB_com = new THREE.Vector3(vB.x, (vB.y || 0) + vB.height * 0.45, vB.z);

      // Helper to calculate the closest point on an OBB to a target position
      const getClosestPointOnOBB = (v: PhysicsVehicle, target: THREE.Vector3) => {
        const dx = target.x - v.x;
        const dz = target.z - v.z;
        const cosA = Math.cos(v.angle);
        const sinA = Math.sin(v.angle);
        const localZ = dx * cosA + dz * sinA;
        const localX = -dx * sinA + dz * cosA;
        const halfLen = v.length / 2;
        const halfWid = v.width / 2;
        const clampedZ = Math.max(-halfLen, Math.min(halfLen, localZ));
        const clampedX = Math.max(-halfWid, Math.min(halfWid, localX));
        return new THREE.Vector3(
          v.x + (clampedZ * cosA - clampedX * sinA),
          (v.y || 0) + v.height * 0.45,
          v.z + (clampedZ * sinA + clampedX * cosA)
        );
      };

      const ptOnA = getClosestPointOnOBB(vA, posB_com);
      const ptOnB = getClosestPointOnOBB(vB, posA_com);

      // The 3D collision contact point is the average of the closest points on both vehicles' hulls
      const colPoint_3d = new THREE.Vector3().addVectors(ptOnA, ptOnB).multiplyScalar(0.5);

      // Lever arms from center of mass to the real collision contact point on hulls
      const rA = new THREE.Vector3().subVectors(colPoint_3d, posA_com);
      const rB = new THREE.Vector3().subVectors(colPoint_3d, posB_com);

      // Dynamic 3D Impulse Vector (horizontal components + vertical lift wedge factor)
      const horizImpulseMag = Math.sqrt(impulseX * impulseX + impulseZ * impulseZ);
      
      // Sports cars with lower wedge profile slide underneath, exerting more lift on others
      let liftRatioA = 0.02;
      let liftRatioB = 0.02;
      if (vA.type === 'sports') { liftRatioB += 0.03; liftRatioA -= 0.01; }
      if (vB.type === 'sports') { liftRatioA += 0.03; liftRatioB -= 0.01; }

      const impulseY_A = horizImpulseMag * liftRatioA;
      const impulseY_B = horizImpulseMag * liftRatioB;

      const impulseVecA = new THREE.Vector3(impulseX, impulseY_A, impulseZ);
      const impulseVecB = new THREE.Vector3(-impulseX, impulseY_B, -impulseZ);

      // 3D torque = lever_arm x impulse
      const torqueA = new THREE.Vector3().crossVectors(rA, impulseVecA);
      const torqueB = new THREE.Vector3().crossVectors(rB, impulseVecB);

      // Project torque vectors onto each vehicle's local principal axes
      const getLocalTorques = (v: PhysicsVehicle, torqueWorld: THREE.Vector3) => {
        const fX = Math.cos(v.angle);
        const fZ = Math.sin(v.angle);
        const forward = new THREE.Vector3(fX, 0, fZ);
        const lateral = new THREE.Vector3(-fZ, 0, fX);
        const up = new THREE.Vector3(0, 1, 0);

        return {
          roll: torqueWorld.dot(forward),  // torque around forward axis causes roll
          pitch: torqueWorld.dot(lateral), // torque around side axis causes pitch
          yaw: -torqueWorld.dot(up)        // NEGATED because the XZ coordinate system is left-handed for Y-rotation!
        };
      };

      const localTorqueA = getLocalTorques(vA, torqueA);
      const localTorqueB = getLocalTorques(vB, torqueB);

      // Moment of inertia tensor approximations
      const getInertia = (v: PhysicsVehicle) => {
        const m = v.mass;
        const w = v.width;
        const h = v.height;
        const l = v.length;
        return {
          roll: (1 / 12) * m * (w * w + h * h),
          pitch: (1 / 12) * m * (h * h + l * l),
          yaw: (1 / 12) * m * (w * w + l * l),
        };
      };

      const inertiaA = getInertia(vA);
      const inertiaB = getInertia(vB);

      // Apply angular velocity deltas (Torque / Inertia) - Moderated for realism!
      const multiplierRoll = 0.1;
      const multiplierPitch = 0.1;
      const multiplierYaw = 0.95;

      vA.vRoll = (vA.vRoll || 0) + (localTorqueA.roll / inertiaA.roll) * multiplierRoll;
      vA.vPitch = (vA.vPitch || 0) + (localTorqueA.pitch / inertiaA.pitch) * multiplierPitch;
      vA.vAngle = (vA.vAngle || 0) + (localTorqueA.yaw / inertiaA.yaw) * multiplierYaw;

      vB.vRoll = (vB.vRoll || 0) + (localTorqueB.roll / inertiaB.roll) * multiplierRoll;
      vB.vPitch = (vB.vPitch || 0) + (localTorqueB.pitch / inertiaB.pitch) * multiplierPitch;
      vB.vAngle = (vB.vAngle || 0) + (localTorqueB.yaw / inertiaB.yaw) * multiplierYaw;

      // Apply linear vertical boost from collision lift forces - Moderated for realism!
      vA.vy = (vA.vy || 0) + (impulseY_A / vA.mass) * 0.08;
      vB.vy = (vB.vy || 0) + (impulseY_B / vB.mass) * 0.08;

      // Cap the angular rates to keep simulation stable
      const maxSpin = 1.2; // rads/sec for roll/pitch
      const maxYawSpin = 3.5; // rads/sec for yaw/spin
      vA.vRoll = Math.max(-maxSpin, Math.min(maxSpin, vA.vRoll));
      vA.vPitch = Math.max(-maxSpin, Math.min(maxSpin, vA.vPitch));
      vA.vAngle = Math.max(-maxYawSpin, Math.min(maxYawSpin, vA.vAngle));

      vB.vRoll = Math.max(-maxSpin, Math.min(maxSpin, vB.vRoll));
      vB.vPitch = Math.max(-maxSpin, Math.min(maxSpin, vB.vPitch));
      vB.vAngle = Math.max(-maxYawSpin, Math.min(maxYawSpin, vB.vAngle));
    }

    // Positional correction (Prevent sinking into each other)
    const percent = 0.6; // Penetration percentage to resolve
    const slop = 0.01; // Penetration allowance
    const correctionScale = Math.max(col.overlap - slop, 0) / totalMassReciprocal * percent;
    const correctionX = correctionScale * col.normal.x;
    const correctionZ = correctionScale * col.normal.z;

    if (!vA.isStationary) {
      vA.x += correctionX / vA.mass;
      vA.z += correctionZ / vA.mass;
    }
    if (!vB.isStationary) {
      vB.x -= correctionX / vB.mass;
      vB.z -= correctionZ / vB.mass;
    }

    // Determine collision mid-point for effects
    const posA = new THREE.Vector3(vA.x, (vA.y || 0) + vA.height * 0.45, vA.z);
    const posB = new THREE.Vector3(vB.x, (vB.y || 0) + vB.height * 0.45, vB.z);
    const collisionPoint = new THREE.Vector3()
      .addVectors(posA, posB)
      .multiplyScalar(0.5);

    // Trigger Mesh crumpling/deformation on both vehicles
    triggerMeshCrumple(vA, collisionPoint, impactForceKN);
    triggerMeshCrumple(vB, collisionPoint, impactForceKN);

    // Particle flash burst at point
    triggerCollisionBurst(collisionPoint, col.normal, impactForceKN);

    // Playful kinetic cartoon popup
    spawnCrashText(impactForceKN > 1500 ? 'SLAM!' : 'CRASH!', collisionPoint);

    // Calculate energy loss
    const keA_after = 0.5 * vA.mass * (vA.vx * vA.vx + vA.vz * vA.vz);
    const keB_after = 0.5 * vB.mass * (vB.vx * vB.vx + vB.vz * vB.vz);
    const energyDissipatedKJ = Math.max((keA_before + keB_before) - (keA_after + keB_after), 0) / 1000;

    // Record the main impact stats
    if (!collisionOccurredRef.current) {
      collisionOccurredRef.current = true;

      // Map impact force to a safety letter grade
      let rating: 'S' | 'A' | 'B' | 'C' | 'D' | 'F' = 'S';
      if (impactForceKN > 1800) rating = 'F';
      else if (impactForceKN > 1200) rating = 'D';
      else if (impactForceKN > 700) rating = 'C';
      else if (impactForceKN > 300) rating = 'B';
      else rating = 'A';

      const carA = vA.id === 'A' ? vA : (vB.id === 'A' ? vB : null);
      const carB = vA.id === 'B' ? vA : (vB.id === 'B' ? vB : null);

      const beltA = carA?.occupant ? carA.occupant.hasSeatbelt : (vA.occupant ? vA.occupant.hasSeatbelt : true);
      const airbagA = carA?.occupant ? carA.occupant.hasAirbag : (vA.occupant ? vA.occupant.hasAirbag : true);
      const statsA = carA 
        ? computeInjuryAndSurvival(carA.mass, impactForceKN, beltA, airbagA, !!carA.isCrushedFatal) 
        : computeInjuryAndSurvival(vA.mass, impactForceKN, beltA, airbagA, !!vA.isCrushedFatal);

      const beltB = carB?.occupant ? carB.occupant.hasSeatbelt : (vB.occupant ? vB.occupant.hasSeatbelt : true);
      const airbagB = carB?.occupant ? carB.occupant.hasAirbag : (vB.occupant ? vB.occupant.hasAirbag : true);
      const statsB = carB 
        ? computeInjuryAndSurvival(carB.mass, impactForceKN, beltB, airbagB, !!carB.isCrushedFatal) 
        : null;

      onCollision({
        time: simulationTimeRef.current,
        impactForce: parseFloat(impactForceKN.toFixed(1)),
        energyLoss: parseFloat(energyDissipatedKJ.toFixed(1)),
        relativeSpeed: parseFloat(relativeSpeedKmH.toFixed(1)),
        safetyRating: rating,
        survivalRateA: statsA.survivalRate,
        survivalRateB: statsB ? statsB.survivalRate : null,
        injuryMetricsA: statsA.metrics,
        injuryMetricsB: statsB ? statsB.metrics : null
      });
    }
  };

  // Perform surgical vertex distortion representing plastic deformation (crumple zone!)
  const triggerMeshCrumple = (veh: PhysicsVehicle, colPoint: THREE.Vector3, forceKN: number) => {
    if (!veh.bodyMesh || !veh.originalPositions) return;

    const mesh = veh.bodyMesh;
    const geometry = mesh.geometry as THREE.BoxGeometry;
    const posAttr = geometry.attributes.position;
    
    // Scale maximum deformation based on impact force
    // Force threshold: 50kN to start deforming, cap at 3.0 meters
    const forceFactor = Math.min(Math.max((forceKN - 50) / 1000, 0), 1.5);
    if (forceFactor <= 0) return;

    const maxDeform = 1.8 * forceFactor; // Max distance a vertex can be pushed in meters
    const deformRadius = 3.8; // Radius of impact sphere in meters

    // Temporary variables for math
    const localColPoint = mesh.worldToLocal(colPoint.clone());

    let carDeformSum = 0;

    // 1. Deform main body mesh with realistic sheet-metal wrinkle noise
    for (let i = 0; i < posAttr.count; i++) {
      const origX = veh.originalPositions[i].x;
      const origY = veh.originalPositions[i].y;
      const origZ = veh.originalPositions[i].z;

      const currentX = posAttr.getX(i);
      const currentY = posAttr.getY(i);
      const currentZ = posAttr.getZ(i);

      // Distance in local coordinates
      const dist = localColPoint.distanceTo(new THREE.Vector3(currentX, currentY, currentZ));

      if (dist < deformRadius) {
        // Falloff of distortion
        const falloff = 1.0 - (dist / deformRadius);
        const deformMag = maxDeform * falloff;

        // Vector pointing from vertex to collision point (or local origin)
        // Shifting vertex inwards representing a crush
        const localOrigin = new THREE.Vector3(0, origY * 0.15, origZ * 0.15); // push toward center
        const crushDir = new THREE.Vector3(localOrigin.x - currentX, localOrigin.y - currentY, localOrigin.z - currentZ).normalize();

        // Add random high-frequency wrinkling/jaggedness representing crumpled sheet metal folds!
        const wrinkleScale = 0.28 * forceFactor; // More force -> bigger/deeper metal folds
        const noiseX = (Math.sin(origX * 18 + origZ * 15) * Math.cos(origY * 22)) * wrinkleScale;
        const noiseY = (Math.cos(origX * 15 + origY * 20) * Math.sin(origZ * 18)) * wrinkleScale;
        const noiseZ = (Math.sin(origZ * 22 + origX * 12) * Math.cos(origY * 15)) * wrinkleScale;

        const newX = currentX + crushDir.x * deformMag + noiseX * falloff;
        const newY = currentY + crushDir.y * deformMag * 0.35 + noiseY * falloff;
        const newZ = currentZ + crushDir.z * deformMag + noiseZ * falloff;

        // Apply deformation limits (don't invert the car fully)
        const totalDistFromOrig = new THREE.Vector3(newX, newY, newZ).distanceTo(new THREE.Vector3(origX, origY, origZ));
        if (totalDistFromOrig < 2.0) {
          posAttr.setXYZ(i, newX, newY, newZ);
          carDeformSum += deformMag;
        }
      }
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();

    // 2. Deform cabin mesh if present
    if (veh.cabinMesh && veh.originalCabinPositions) {
      const cabMesh = veh.cabinMesh;
      const cabGeom = cabMesh.geometry as THREE.BoxGeometry;
      const cabPosAttr = cabGeom.attributes.position;
      const cabLocalColPoint = cabMesh.worldToLocal(colPoint.clone());

      for (let i = 0; i < cabPosAttr.count; i++) {
        const origX = veh.originalCabinPositions[i].x;
        const origY = veh.originalCabinPositions[i].y;
        const origZ = veh.originalCabinPositions[i].z;

        const currentX = cabPosAttr.getX(i);
        const currentY = cabPosAttr.getY(i);
        const currentZ = cabPosAttr.getZ(i);

        const dist = cabLocalColPoint.distanceTo(new THREE.Vector3(currentX, currentY, currentZ));

        if (dist < deformRadius) {
          const falloff = 1.0 - (dist / deformRadius);
          const deformMag = maxDeform * 0.65 * falloff; // Cabin glass is harder or deforms slightly less

          const localOrigin = new THREE.Vector3(0, origY * 0.2, origZ * 0.2);
          const crushDir = new THREE.Vector3(localOrigin.x - currentX, localOrigin.y - currentY, localOrigin.z - currentZ).normalize();

          // Glass cracking fracture effect
          const crackScale = 0.16 * forceFactor;
          const noiseX = (Math.sin(origX * 25 + origZ * 20) * Math.cos(origY * 25)) * crackScale;
          const noiseY = (Math.cos(origX * 20 + origY * 25) * Math.sin(origZ * 20)) * crackScale;
          const noiseZ = (Math.sin(origZ * 25 + origX * 15) * Math.cos(origY * 20)) * crackScale;

          const newX = currentX + crushDir.x * deformMag + noiseX * falloff;
          const newY = currentY + crushDir.y * deformMag * 0.4 + noiseY * falloff;
          const newZ = currentZ + crushDir.z * deformMag + noiseZ * falloff;

          const totalDistFromOrig = new THREE.Vector3(newX, newY, newZ).distanceTo(new THREE.Vector3(origX, origY, origZ));
          if (totalDistFromOrig < 1.6) {
            cabPosAttr.setXYZ(i, newX, newY, newZ);
          }
        }
      }
      cabPosAttr.needsUpdate = true;
      cabGeom.computeVertexNormals();
      
      // Make the windshield color look frosted/cracked on high force!
      if (forceKN > 350 && cabMesh.material) {
        const mat = cabMesh.material as THREE.MeshStandardMaterial;
        mat.color.set('#cbd5e1'); // crack frosted look
        mat.opacity = 0.95;
        mat.roughness = 0.7;
      }
    }

    // Increment vehicle damage level
    const damagePercent = Math.min(veh.damage + Math.round(forceFactor * 80), 100);
    veh.damage = damagePercent;

    totalDeformationSumRef.current += Math.round(carDeformSum * 10);

    // --- DETACHABLE PARTS & SUSPENSION CRASH PHYSICS ---
    if (veh.group) {
      const chassis = veh.group.getObjectByName('chassis');
      if (chassis) {
        // Convert collision point into vehicle's local coordinates
        const localCol = veh.bodyMesh ? veh.bodyMesh.worldToLocal(colPoint.clone()) : new THREE.Vector3(0,0,0);
        const spec = CAR_SPECS_PRESETS[veh.type];
        const halfLen = spec ? spec.length * 0.5 : 2.2;
        const halfWid = spec ? spec.width * 0.5 : 0.9;
        
        // Parts catalog with mass/force rupture limits
        const breakableParts = [
          { name: 'bumper_front', threshold: 170, isBumper: true, front: true },
          { name: 'bumper_rear', threshold: 170, isBumper: true, rear: true },
          { name: 'door_L', threshold: 260, isDoor: true, left: true },
          { name: 'door_R', threshold: 260, isDoor: true, right: true },
          { name: 'mirror_L', threshold: 95, isMirror: true, left: true },
          { name: 'mirror_R', threshold: 95, isMirror: true, right: true },
          { name: 'spoiler', threshold: 180, isSpoiler: true, rear: true },
          { name: 'headlight_L', threshold: 120, isHeadlight: true, front: true, left: true },
          { name: 'headlight_R', threshold: 120, isHeadlight: true, front: true, right: true },
          { name: 'brake_L', threshold: 120, isTailLight: true, rear: true, left: true },
          { name: 'brake_R', threshold: 120, isTailLight: true, rear: true, right: true },
          { name: 'grille', threshold: 140, isGrille: true, front: true },
          { name: 'roof_rails', threshold: 220, isRoofRails: true, top: true },
          { name: 'engine_cover', threshold: 190, isEngineCover: true, front: true },
          { name: 'flatbed', threshold: 300, isFlatbed: true, rear: true }
        ];

        breakableParts.forEach((partInfo) => {
          let partMesh = chassis.getObjectByName(partInfo.name);
          if (!partMesh && veh.group) {
            partMesh = veh.group.getObjectByName(partInfo.name);
          }
          if (partMesh) {
            // Determine if the part is in the direct impact sector (Highly precise quadrant/octant check!)
            let isImpactedZone = false;
            
            if (partInfo.top) {
              isImpactedZone = true;
            } else {
              // Check longitudinal sector (Z-axis)
              let zMatch = true;
              if (partInfo.front && localCol.z < -halfLen * 0.15) zMatch = false; // front parts can't break if hit is behind front 35% of car
              if (partInfo.rear && localCol.z > halfLen * 0.15) zMatch = false;  // rear parts can't break if hit is in front 35% of car
              
              // Check lateral sector (X-axis)
              let xMatch = true;
              if (partInfo.left && localCol.x > halfWid * 0.1) xMatch = false;   // left parts can't break if hit is on the right side
              if (partInfo.right && localCol.x < -halfWid * 0.1) xMatch = false; // right parts can't break if hit is on the left side
              
              isImpactedZone = zMatch && xMatch;
            }

            const varianceFactor = 0.85 + Math.random() * 0.3; // Adds organic physical variance (85%-115%)
            const limit = partInfo.threshold * varianceFactor;

            if (isImpactedZone && forceKN > limit) {
              // RIP OFF THE PART!
              // Acquire global world position & rotation before detaching
              const worldPos = new THREE.Vector3();
              partMesh.getWorldPosition(worldPos);
              const worldQuat = new THREE.Quaternion();
              partMesh.getWorldQuaternion(worldQuat);

              // Remove from parent group
              partMesh.parent?.remove(partMesh);

              // Bind to main scene so it floats freely
              if (sceneRef.current) {
                sceneRef.current.add(partMesh);
                partMesh.position.copy(worldPos);
                partMesh.quaternion.copy(worldQuat);

                // Add to active debris list
                const systems = particleSystemRef.current;
                if (systems) {
                  systems.debris.meshes.push(partMesh as THREE.Mesh);

                  // Calculate velocity of flying part: vehicle speed + explosive bounce away from center
                  const partVel = new THREE.Vector3(veh.vx, 3.2 + Math.random() * 4.0, veh.vz);
                  const pushDir = new THREE.Vector3(worldPos.x - colPoint.x, 0.45, worldPos.z - colPoint.z).normalize();
                  const pushSpeed = 4.0 + Math.random() * 7.0 + (forceKN * 0.004);
                  partVel.addScaledVector(pushDir, pushSpeed);
                  systems.debris.velocities.push(partVel);

                  // Set high-velocity spinning inertia
                  systems.debris.angularVelocities.push(new THREE.Vector3(
                    (Math.random() - 0.5) * 18,
                    (Math.random() - 0.5) * 18,
                    (Math.random() - 0.5) * 18
                  ));
                  systems.debris.ages.push(0);
                }
              }

              // Display high-fidelity feedback text
              if (partInfo.isBumper) {
                spawnCrashText('범퍼 탈락! (Bumper Detached)', worldPos);
              } else if (partInfo.isDoor) {
                spawnCrashText('문짝 이탈! (Door Torn Off)', worldPos);
              } else if (partInfo.isMirror) {
                spawnCrashText('사이드미러 파손! (Mirror Broken)', worldPos);
              } else if (partInfo.isSpoiler) {
                spawnCrashText('스포일러 이탈! (Spoiler Detached)', worldPos);
              } else if (partInfo.isHeadlight) {
                spawnCrashText('헤드라이트 파손! (Headlight Shattered)', worldPos);
              } else if (partInfo.isTailLight) {
                spawnCrashText('테일램프 파손! (Taillight Shattered)', worldPos);
              } else if (partInfo.isGrille) {
                spawnCrashText('그릴 파손! (Grille Shattered)', worldPos);
              } else if (partInfo.isRoofRails) {
                spawnCrashText('루프레일 이탈! (Roof Rails Detached)', worldPos);
              } else if (partInfo.isEngineCover) {
                spawnCrashText('엔진 보닛 탈탈! (Engine Hood Flyoff)', worldPos);
              } else if (partInfo.isFlatbed) {
                spawnCrashText('화물칸 분리! (Cargo Flatbed Detached)', worldPos);
              }
            } else if (isImpactedZone && partInfo.isDoor && forceKN > 85) {
              // DOOR DOES NOT TEAR OFF COMPLETELY - SWINGS OPEN / HANGS AJAR!
              const worldPos = new THREE.Vector3();
              partMesh.getWorldPosition(worldPos);

              if (partInfo.name === 'door_L') {
                veh.doorLIsHanging = true;
                veh.doorLOpenAngle = -0.45 - Math.random() * 0.35;
                partMesh.rotation.y = veh.doorLOpenAngle;
                spawnCrashText('문짝 유격! (Door Hanging Loose)', worldPos);
              } else if (partInfo.name === 'door_R') {
                veh.doorRIsHanging = true;
                veh.doorROpenAngle = 0.45 + Math.random() * 0.35;
                partMesh.rotation.y = veh.doorROpenAngle;
                spawnCrashText('문짝 유격! (Door Hanging Loose)', worldPos);
              }
            }
          }
        });
      }

      // Check if suspension collapsed (chance is very high on heavy impacts > 240 kN)
      if (forceKN > 240 && !veh.isSuspensionCollapsed && Math.random() > 0.3) {
        veh.isSuspensionCollapsed = true;
        spawnCrashText('서스펜션 파손! (Suspension Collapsed)', colPoint);
      }
    }
  };

  // Trigger particle emissions (sparks, glass, smoke) at collision center
  const triggerCollisionBurst = (colPoint: THREE.Vector3, normal: THREE.Vector3, forceKN: number) => {
    // Disabled as requested (충돌 파티클 제거)

    // 화면 흔들림 효과 설정 (충격 크기에 비례)
    const baseShake = Math.min(forceKN / 700, 1.5); // 최대 흔들림 세기 제한
    if (baseShake > 0.05) {
      cameraShakeIntensityRef.current = baseShake;
    }
  };

  // Render and update particle dynamics
  const updateParticles = (dt: number) => {
    const systems = particleSystemRef.current;
    if (!systems) return;

    // Sparks (Gravity + Fading)
    const sparkPos = systems.sparks.points.geometry.attributes.position as THREE.BufferAttribute;
    const g = 9.81;

    for (let i = 0; i < systems.sparks.ages.length; i++) {
      if (systems.sparks.ages[i] < systems.sparks.maxAge) {
        systems.sparks.ages[i]++;

        // Update velocity with gravity
        systems.sparks.velocities[i].y -= g * dt * 2.0;

        // Update position
        const px = sparkPos.getX(i) + systems.sparks.velocities[i].x * dt;
        let py = sparkPos.getY(i) + systems.sparks.velocities[i].y * dt;
        const pz = sparkPos.getZ(i) + systems.sparks.velocities[i].z * dt;

        // Bounce off floor
        if (py < 0.05) {
          py = 0.05;
          systems.sparks.velocities[i].y = -systems.sparks.velocities[i].y * 0.4; // damp bounce
          systems.sparks.velocities[i].x *= 0.6;
          systems.sparks.velocities[i].z *= 0.6;
        }

        sparkPos.setXYZ(i, px, py, pz);
      } else {
        // Hide dead particles underground
        sparkPos.setY(i, -999);
      }
    }
    systems.sparks.points.geometry.attributes.position.needsUpdate = true;

    // Smoke (Expanding + Rising)
    const smokePos = systems.smoke.points.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < systems.smoke.ages.length; i++) {
      if (systems.smoke.ages[i] < systems.smoke.maxAge) {
        systems.smoke.ages[i]++;
        
        // Rise and disperse slightly
        const px = smokePos.getX(i) + systems.smoke.velocities[i].x * dt;
        const py = smokePos.getY(i) + systems.smoke.velocities[i].y * dt;
        const pz = smokePos.getZ(i) + systems.smoke.velocities[i].z * dt;

        smokePos.setXYZ(i, px, py, pz);
      } else {
        smokePos.setY(i, -999);
      }
    }
    systems.smoke.points.geometry.attributes.position.needsUpdate = true;

    // Flying Solid Debris (Gravitational physics + Friction)
    const scene = sceneRef.current;
    if (scene) {
      const activeDebrisMeshes: THREE.Mesh[] = [];
      const activeDebrisVelocities: THREE.Vector3[] = [];
      const activeDebrisAngular: THREE.Vector3[] = [];
      const activeDebrisAges: number[] = [];

      for (let i = 0; i < systems.debris.meshes.length; i++) {
        const mesh = systems.debris.meshes[i];
        let age = systems.debris.ages[i];
        
        if (age < systems.debris.maxAge) {
          age++;
          
          // gravity
          systems.debris.velocities[i].y -= g * dt * 2.0;

          // update position
          mesh.position.addScaledVector(systems.debris.velocities[i], dt);
          
          // Bounce off asphalt floor
          if (mesh.position.y < 0.1) {
            mesh.position.y = 0.1;
            systems.debris.velocities[i].y = -systems.debris.velocities[i].y * 0.3; // bounce dampening
            systems.debris.velocities[i].x *= 0.6;
            systems.debris.velocities[i].z *= 0.6;
            
            // stop rotation speed slightly on ground
            systems.debris.angularVelocities[i].multiplyScalar(0.7);
          }

          // Spin debris
          mesh.rotateX(systems.debris.angularVelocities[i].x * dt);
          mesh.rotateY(systems.debris.angularVelocities[i].y * dt);
          mesh.rotateZ(systems.debris.angularVelocities[i].z * dt);

          // Fade out via scale
          if (age > systems.debris.maxAge * 0.7) {
            const lifeLeft = 1.0 - (age - systems.debris.maxAge * 0.7) / (systems.debris.maxAge * 0.3);
            mesh.scale.set(lifeLeft, lifeLeft, lifeLeft);
          }

          activeDebrisMeshes.push(mesh);
          activeDebrisVelocities.push(systems.debris.velocities[i]);
          activeDebrisAngular.push(systems.debris.angularVelocities[i]);
          activeDebrisAges.push(age);
        } else {
          // Dispose mesh
          scene.remove(mesh);
          if (mesh.geometry && typeof mesh.geometry.dispose === 'function') {
            mesh.geometry.dispose();
          }
          if (mesh.material) {
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((m) => {
                if (m && typeof m.dispose === 'function') m.dispose();
              });
            } else if (typeof mesh.material.dispose === 'function') {
              mesh.material.dispose();
            }
          }
        }
      }

      systems.debris.meshes = activeDebrisMeshes;
      systems.debris.velocities = activeDebrisVelocities;
      systems.debris.angularVelocities = activeDebrisAngular;
      systems.debris.ages = activeDebrisAges;
    }
  };

  // Generate a kinetic overlay cartoon text floater in the 3D space
  const spawnCrashText = (text: string, pos: THREE.Vector3) => {
    // Disabled as requested (충돌 텍스트 제거)
    return;
  };

  // Project 3D coordinate onto 2D viewport coordinates to keep alerts in correct visual space
  const updateCrashTexts = () => {
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    const popups = popupsRef.current;
    if (!camera || !renderer) return;

    const activePopups: typeof popups = [];

    popups.forEach((pop) => {
      pop.age++;
      if (pop.age < pop.maxAge) {
        // Project 3D vector to screen space
        const screenPos = pop.worldPos.clone().project(camera);
        
        // Map to percentage layout
        const x = (screenPos.x * .5 + .5) * renderer.domElement.clientWidth;
        const y = (-(screenPos.y * .5) + .5) * renderer.domElement.clientHeight;

        pop.element.style.left = `${x}px`;
        pop.element.style.top = `${y - pop.age * 1.5}px`; // Float up over time

        // Scale & opacity over time
        const scale = 1.0 + Math.sin(pop.age * 0.1) * 0.3;
        const opacity = Math.max(1.0 - pop.age / pop.maxAge, 0);
        pop.element.style.transform = `translate(-50%, -50%) scale(${scale})`;
        pop.element.style.opacity = `${opacity}`;

        activePopups.push(pop);
      } else {
        // Remove from document
        if (pop.element.parentNode) {
          pop.element.parentNode.removeChild(pop.element);
        }
      }
    });

    popupsRef.current = activePopups;
  };

  return (
    <div className="relative w-full h-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800" id="canvas-container">
      {/* 3D Render Port */}
      <div ref={mountRef} className="w-full h-full" id="webgl-viewport" />

      {/* Manual Controller Help overlay */}
      {manualCarId && (
        <div className="absolute top-4 left-4 bg-slate-950/80 backdrop-blur-md border border-amber-500/50 rounded-xl p-3 max-w-[280px] z-10 animate-fade-in text-xs text-slate-200">
          <div className="flex items-center gap-1.5 font-bold text-amber-400 mb-1">
            <Zap className="w-3.5 h-3.5 fill-current" />
            실시간 수동 주행 모드 활성화됨
          </div>
          <p className="mb-2 text-[11px] text-slate-400 leading-normal">
            선택한 차량(<span className="font-semibold text-white">{manualCarId}</span>)을 직접 운전할 수 있습니다.
          </p>
          <div className="grid grid-cols-2 gap-1.5 text-center text-[10px]">
            <div className="bg-slate-900 border border-slate-800 rounded p-1">
              <kbd className="bg-slate-800 px-1 rounded font-mono text-white text-xs">W</kbd> / <kbd className="bg-slate-800 px-1 rounded font-mono text-white text-xs">↑</kbd>
              <span className="block mt-0.5 text-slate-400">가속 (전진)</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded p-1">
              <kbd className="bg-slate-800 px-1 rounded font-mono text-white text-xs">S</kbd> / <kbd className="bg-slate-800 px-1 rounded font-mono text-white text-xs">↓</kbd>
              <span className="block mt-0.5 text-slate-400">감속 / 후진</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded p-1 col-span-2">
              <kbd className="bg-slate-800 px-1 rounded font-mono text-white text-xs">A</kbd> <kbd className="bg-slate-800 px-1 rounded font-mono text-white text-xs">D</kbd> / <kbd className="bg-slate-800 px-1 rounded font-mono text-white text-xs">←</kbd> <kbd className="bg-slate-800 px-1 rounded font-mono text-white text-xs">→</kbd>
              <span className="block mt-0.5 text-slate-400">좌우 스티어링 회전</span>
            </div>
          </div>
          <button 
            onClick={() => setManualCarId(null)}
            className="w-full mt-2.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-medium py-1 rounded transition-colors"
          >
            수동 운전 취소
          </button>
        </div>
      )}

      {/* Floating Canvas Quick Utility overlay */}
      <div className="absolute bottom-4 left-4 flex gap-1.5 bg-slate-950/80 backdrop-blur-md border border-slate-800 rounded-xl p-1.5 z-10 text-xs">
        {/* Toggle Grid */}
        <button
          title="그리드 토글"
          onClick={() => setSimulationState(prev => ({ ...prev, showGrid: !prev.showGrid }))}
          className={`p-1.5 rounded-lg transition-colors ${simulationState.showGrid ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <Grid className="w-4 h-4" />
        </button>

        {/* Change Lighting Time */}
        <button
          title={`시간대 변경: 현재 ${simulationState.timeOfDay === 'day' ? '주간' : simulationState.timeOfDay === 'sunset' ? '일몰' : '야간'}`}
          onClick={() => {
            const nextMap: Record<'day' | 'sunset' | 'night', 'day' | 'sunset' | 'night'> = {
              day: 'sunset',
              sunset: 'night',
              night: 'day'
            };
            setSimulationState(prev => ({ ...prev, timeOfDay: nextMap[prev.timeOfDay] }));
          }}
          className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
        </button>

        {/* Camera Views Selector */}
        <div className="flex items-center gap-1 border-l border-slate-800 pl-1.5 ml-0.5">
          <Eye className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={simulationState.cameraMode}
            onChange={(e) => setSimulationState(prev => ({ ...prev, cameraMode: e.target.value as any }))}
            className="bg-transparent text-slate-300 font-medium focus:outline-none cursor-pointer pr-1"
          >
            <option value="free" className="bg-slate-950">자유 시점</option>
            <option value="followA" className="bg-slate-950">공격차 A 추적</option>
            <option value="followB" className="bg-slate-950">방어차 B 추적</option>
            <option value="top" className="bg-slate-950">수직 탑다운</option>
            <option value="cinematic" className="bg-slate-950">영화적 구도</option>
          </select>
        </div>
      </div>

      {/* Speed Controls floating overlay */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-slate-950/80 backdrop-blur-md border border-slate-800 rounded-xl p-2 z-10">
        <button
          onClick={() => {
            if (!simulationState.isRunning && collisionOccurredRef.current) {
              setResetTrigger(prev => prev + 1);
              setTimeout(() => {
                setSimulationState(prev => ({ ...prev, isRunning: true }));
              }, 60);
            } else {
              setSimulationState(prev => ({ ...prev, isRunning: !prev.isRunning }));
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            simulationState.isRunning 
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/20' 
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20'
          }`}
        >
          {simulationState.isRunning ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          {simulationState.isRunning ? '일시 정지' : '시작'}
        </button>
        
        <button
          onClick={() => setResetTrigger(prev => prev + 1)}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
          title="시뮬레이션 초기화"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          리셋
        </button>

        <div className="h-5 w-[1px] bg-slate-800 mx-0.5" />

        <div className="flex gap-1">
          {([0.25, 0.5, 1.0] as const).map((scale) => (
            <button
              key={scale}
              onClick={() => setSimulationState(prev => ({ ...prev, timeScale: scale }))}
              className={`px-1.5 py-1 text-[10px] font-bold rounded ${
                simulationState.timeScale === scale 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                  : 'text-slate-400 hover:text-slate-200 bg-slate-900 border border-transparent'
              }`}
            >
              {scale === 1.0 ? '실시간' : `${scale}x 슬로우`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
