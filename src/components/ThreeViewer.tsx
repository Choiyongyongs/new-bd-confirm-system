import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { CameraState, CasePin, StlItem, formatStlUrl, getModelExtension, PRESET_COLORS, DEFAULT_STL_COLOR, PinCreator } from '../types';
import { Camera, MapPin, Eye, EyeOff, FileText, MousePointerClick, Check, Upload, X, Loader2, Palette, Trash2, ChevronDown, ChevronUp, Pencil } from 'lucide-react';

interface ThreeViewerProps {
  stlUrl?: string | null;            // URL or file-object url for STL
  stlUrls?: (string | null)[];       // Multiple URLs for STLs
  stlFileName?: string;              // Custom original filename for the STL model
  stlFileNames?: (string | undefined)[]; // Custom filenames for multiple STLs
  stlItems?: StlItem[];               // Detailed STL items array with names and colors
  onStlItemsChange?: (items: StlItem[]) => void; // Callback when STL items list changes
  pins: CasePin[];                   // Current pins
  onAddPin?: (pin: { position: [number, number, number]; note: string }) => void; // Call when adding pin
  onSaveAngle?: (cameraState: CameraState) => void; // Call when technician saves custom angle
  savedCameraState?: CameraState | null; // Saved custom angle to restore
  customViews?: CameraState[];       // List of custom camera views
  onSelectView?: (view: CameraState) => void; // Callback when custom view is selected
  onDeleteView?: (index: number, viewId?: string) => void; // Callback when a custom view is deleted
  readOnly?: boolean;                // If true, can see pins but can't add pins unless custom dentist pin enabled
  allowDentistPin?: boolean;         // If readOnly is true but dentist is allowed to add pins
  dentistPinCallback?: (pins: CasePin[]) => void; // Custom callback when dentist adds a pin
  onDeletePin?: (pinId: string) => void; // Delete pin callback
  onUpdatePinNote?: (pinId: string, newNote: string) => void; // Callback to update pin note
  showStlUpload?: boolean;            // Whether to show STL 추가 button
  onLocalFileUpload?: (files: File[]) => void; // Callback when local files are uploaded inside viewer
}

// Multi STL Models Interface
interface LoadedModel {
  id: string;
  name: string;
  originalName?: string;
  format?: 'stl' | 'ply' | 'obj';
  colorMode?: 'color' | 'mono';
  visible: boolean;
  opacity: number;
  color: string;
  url: string;
  isLocal: boolean;
}

// Unified model normalizer to prevent render ping-pong loops
function normalizeLoadedModel(
  raw: {
    id?: string;
    name?: string;
    originalName?: string;
    format?: 'stl' | 'ply' | 'obj' | string;
    colorMode?: 'color' | 'mono';
    color?: string;
    url: string;
    visible?: boolean;
    opacity?: number;
    isLocal?: boolean;
  },
  fallbackIdx: number = 0
): LoadedModel {
  const formattedUrl = formatStlUrl(raw.url) || raw.url;
  const ext = getModelExtension(formattedUrl, raw.name, (raw.format === 'ply' || raw.format === 'obj' || raw.format === 'stl') ? raw.format : undefined, raw.originalName);
  const isPlyOrObj = ext === 'ply' || ext === 'obj';

  let resolvedColor = raw.color && typeof raw.color === 'string' && raw.color.trim() ? raw.color.trim() : '';
  if (!resolvedColor) {
    resolvedColor = isPlyOrObj ? '#ffffff' : PRESET_COLORS[fallbackIdx % PRESET_COLORS.length].value;
  }

  const resolvedColorMode: 'color' | 'mono' = isPlyOrObj
    ? (raw.colorMode === 'mono' ? 'mono' : 'color')
    : 'mono';

  let resolvedOpacity = typeof raw.opacity === 'number' && !isNaN(raw.opacity) && raw.opacity > 0 ? raw.opacity : 1.0;
  if (resolvedOpacity > 1.0) resolvedOpacity = 1.0;

  return {
    id: raw.id || `model-${fallbackIdx}-${formattedUrl}`,
    name: raw.name || (raw.originalName || `3D 모델 #${fallbackIdx + 1}`),
    originalName: raw.originalName || raw.name || '',
    format: ext,
    colorMode: resolvedColorMode,
    color: resolvedColor,
    url: formattedUrl,
    visible: raw.visible !== false,
    opacity: resolvedOpacity,
    isLocal: raw.isLocal !== undefined ? raw.isLocal : formattedUrl.startsWith('blob:')
  };
}

// Helper to check if two LoadedModel lists are deeply equivalent to avoid redundant state updates
function areModelsEqual(a: LoadedModel[], b: LoadedModel[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ma = a[i];
    const mb = b[i];
    if (
      ma.id !== mb.id ||
      ma.name !== mb.name ||
      ma.url !== mb.url ||
      ma.visible !== mb.visible ||
      Math.abs((ma.opacity ?? 1.0) - (mb.opacity ?? 1.0)) > 0.001 ||
      ma.color.toLowerCase() !== mb.color.toLowerCase() ||
      ma.colorMode !== mb.colorMode ||
      ma.format !== mb.format ||
      ma.originalName !== mb.originalName ||
      ma.isLocal !== mb.isLocal
    ) {
      return false;
    }
  }
  return true;
}

function serializeStlItems(
  items: Array<{
    id?: string;
    name?: string;
    originalName?: string;
    format?: 'stl' | 'ply' | 'obj' | string;
    colorMode?: 'color' | 'mono';
    color?: string;
    url: string;
    visible?: boolean;
    opacity?: number;
  }>
): string {
  return JSON.stringify(
    items.map((m, idx) => {
      const norm = normalizeLoadedModel(m, idx);
      return {
        id: norm.id,
        name: norm.name,
        originalName: norm.originalName,
        format: norm.format,
        colorMode: norm.colorMode,
        color: norm.color,
        url: norm.url,
        visible: norm.visible,
        opacity: norm.opacity
      };
    })
  );
}

// PLY/OBJ 버텍스 컬러: Float32 [0-1] 범위로 정규화만 수행
// LinearSRGBColorSpace 출력으로 스캔 원본 색상을 그대로 디스플레이에 전달
function sanitizeGeometryColors(geometry: THREE.BufferGeometry): boolean {
  try {
    if ((geometry.attributes as any).colors && !geometry.attributes.color) {
      geometry.setAttribute('color', (geometry.attributes as any).colors);
    }

    const colorAttr = geometry.attributes.color;
    if (!colorAttr || colorAttr.count === 0) return false;

    const array = colorAttr.array;
    const itemSize = colorAttr.itemSize || 3; 

    // 이미 정규화된 Float32 데이터인 경우 재처리 방지
    if (array instanceof Float32Array && itemSize === 3) {
      let maxVal = 0;
      const checkLen = Math.min(array.length, 3000);
      for (let i = 0; i < checkLen; i++) {
        if (array[i] > maxVal) maxVal = array[i];
      }
      // 이미 0-1 범위의 Float32이면 그대로 유지
      if (maxVal <= 1.01) return true;
    }

    let maxVal = 0;
    const checkLen = Math.min(array.length, 3000);
    for (let i = 0; i < checkLen; i++) {
      if (array[i] > maxVal) maxVal = array[i];
    }

    const isUint8 = array instanceof Uint8Array || array instanceof Uint8ClampedArray || maxVal > 1.05;
    
    // Three.js 표준 RGB(3채널) 부동소수점 Float32Array 생성
    const floatArray = new Float32Array(colorAttr.count * 3);

    let targetIdx = 0;
    for (let i = 0; i < array.length; i += itemSize) {
      let r = array[i];
      let g = array[i + 1];
      let b = array[i + 2];

      if (isUint8) {
        r /= 255.0;
        g /= 255.0;
        b /= 255.0;
      }

      // 원본 색상값 그대로 유지 — 색공간 변환 없이 0~1 범위 클램핑만 적용
      floatArray[targetIdx] = Math.min(Math.max(r, 0.0), 1.0);
      floatArray[targetIdx + 1] = Math.min(Math.max(g, 0.0), 1.0);
      floatArray[targetIdx + 2] = Math.min(Math.max(b, 0.0), 1.0);
      targetIdx += 3;
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(floatArray, 3));
    return true;
  } catch (e) {
    return false;
  }
}

// Fallback vertex color extractor for dental OBJ files with 'v x y z r g b' syntax
function extractOBJVertexColors(objText: string, geometry: THREE.BufferGeometry): void {
  try {
    if (geometry.attributes.color && geometry.attributes.color.count > 0) {
      sanitizeGeometryColors(geometry);
      return;
    }

    const lines = objText.split('\n');
    const vertexColors: number[][] = [];
    let hasVertexColors = false;

    // 1. First pass: extract all vertex colors from 'v x y z r g b [a]'
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('v ')) {
        const parts = line.split(/\s+/);
        if (parts.length >= 7) {
          let r = parseFloat(parts[4]);
          let g = parseFloat(parts[5]);
          let b = parseFloat(parts[6]);

          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            if (r > 1.05 || g > 1.05 || b > 1.05) {
              r /= 255.0;
              g /= 255.0;
              b /= 255.0;
            }
            // 원본 색상값 그대로 유지 (색공간 변환 없음)
            vertexColors.push([
              Math.min(Math.max(r, 0.0), 1.0),
              Math.min(Math.max(g, 0.0), 1.0),
              Math.min(Math.max(b, 0.0), 1.0)
            ]);
            hasVertexColors = true;
          } else {
            vertexColors.push([1.0, 1.0, 1.0]);
          }
        } else {
          vertexColors.push([1.0, 1.0, 1.0]);
        }
      }
    }

    if (!hasVertexColors || vertexColors.length === 0) return;

    // 2. Map colors through face indices if faces are triangulated
    const faceColors: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('f ')) {
        const parts = line.split(/\s+/).slice(1);
        const faceIndices: number[] = [];
        for (const p of parts) {
          const vIdx = parseInt(p.split('/')[0], 10);
          if (!isNaN(vIdx)) {
            const actualIdx = vIdx > 0 ? vIdx - 1 : vertexColors.length + vIdx;
            faceIndices.push(actualIdx);
          }
        }
        for (let j = 1; j < faceIndices.length - 1; j++) {
          const i0 = faceIndices[0];
          const i1 = faceIndices[j];
          const i2 = faceIndices[j + 1];

          const c0 = vertexColors[i0] || [1.0, 1.0, 1.0];
          const c1 = vertexColors[i1] || [1.0, 1.0, 1.0];
          const c2 = vertexColors[i2] || [1.0, 1.0, 1.0];

          faceColors.push(...c0, ...c1, ...c2);
        }
      }
    }

    if (faceColors.length > 0 && geometry.attributes.position) {
      if (faceColors.length / 3 === geometry.attributes.position.count) {
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(faceColors, 3));
        return;
      }
    }

    // Direct mapping if vertex count matches
    if (geometry.attributes.position && vertexColors.length === geometry.attributes.position.count) {
      const flat: number[] = [];
      for (const vc of vertexColors) flat.push(...vc);
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(flat, 3));
    }
  } catch (err) {
    console.warn('[ThreeViewer] OBJ color extraction fallback error:', err);
  }
}

function mergeOBJGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  try {
    let totalPositions = 0;
    let totalNormals = 0;
    let anyHasColor = false;

    geometries.forEach(g => {
      sanitizeGeometryColors(g);
      if (g.attributes.position) totalPositions += g.attributes.position.array.length;
      if (g.attributes.normal) totalNormals += g.attributes.normal.array.length;
      if (g.attributes.color) anyHasColor = true;
    });

    const mergedPositions = new Float32Array(totalPositions);
    const mergedNormals = totalNormals > 0 ? new Float32Array(totalNormals) : null;
    const mergedColors = anyHasColor ? new Float32Array(totalPositions) : null;

    let posOffset = 0;
    let normOffset = 0;
    let colOffset = 0;

    geometries.forEach(g => {
      const posLen = g.attributes.position ? g.attributes.position.array.length : 0;
      if (g.attributes.position) {
        mergedPositions.set(g.attributes.position.array, posOffset);
        posOffset += posLen;
      }
      if (mergedNormals && g.attributes.normal) {
        mergedNormals.set(g.attributes.normal.array, normOffset);
        normOffset += g.attributes.normal.array.length;
      }
      if (mergedColors) {
        if (g.attributes.color && g.attributes.color.array.length === posLen) {
          mergedColors.set(g.attributes.color.array, colOffset);
        } else if (g.attributes.color) {
          const src = g.attributes.color.array;
          const count = Math.min(src.length, posLen);
          for (let i = 0; i < count; i++) {
            mergedColors[colOffset + i] = src[i];
          }
          for (let i = count; i < posLen; i++) {
            mergedColors[colOffset + i] = 1.0;
          }
        } else {
          for (let i = 0; i < posLen; i++) {
            mergedColors[colOffset + i] = 1.0;
          }
        }
        colOffset += posLen;
      }
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    if (mergedNormals) {
      merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    }
    if (mergedColors) {
      merged.setAttribute('color', new THREE.BufferAttribute(mergedColors, 3));
    }
    return merged;
  } catch (err) {
    return geometries[0];
  }
}

export default function ThreeViewer({
  stlUrl,
  stlUrls,
  stlFileName,
  stlFileNames,
  stlItems,
  onStlItemsChange,
  pins,
  onAddPin,
  onSaveAngle,
  savedCameraState,
  customViews,
  onSelectView,
  onDeleteView,
  readOnly = false,
  allowDentistPin = false,
  dentistPinCallback,
  onDeletePin,
  onUpdatePinNote,
  showStlUpload = true,
  onLocalFileUpload
}: ThreeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  
  // Three.js instances stored in refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<TrackballControls | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);
  const pinsGroupRef = useRef<THREE.Group | null>(null);
  const fitCameraRef = useRef<(() => void) | null>(null);
  const hasAutoFittedRef = useRef<boolean>(false);
  
  // Ref to store last projected pins key to prevent continuous React state re-renders
  const lastProjectedRef = useRef<string>('');

  // Ref to always hold fresh pins without triggering scene re-initialization
  const pinsRef = useRef<CasePin[]>(pins);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  // Overlay state for pins projected into 2D coordinates with index number
  const [projectedPins, setProjectedPins] = useState<Array<{
    id: string;
    note: string;
    creator: PinCreator;
    x: number;
    y: number;
    visible: boolean;
    index: number;
  }>>([]);

  // State to track which pin memos are toggled open in the 3D viewer
  const [openMemoIds, setOpenMemoIds] = useState<string[]>([]);

  const toggleMemo = (pinId: string) => {
    setOpenMemoIds(prev => 
      prev.includes(pinId) 
        ? prev.filter(id => id !== pinId) 
        : [...prev, pinId]
    );
  };

  // Fly camera to a specific pin position
  const handleFlyToPin = (pin: CasePin) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const [px, py, pz] = pin.position;
    
    transitionRef.current = {
      active: true,
      startPos: camera.position.clone(),
      startLook: controls.target.clone(),
      startUp: camera.up.clone(),
      targetPos: new THREE.Vector3(px, py + 4, pz + 6),
      targetLook: new THREE.Vector3(px, py, pz),
      targetUp: new THREE.Vector3(0, 1, 0),
      startTime: performance.now(),
      duration: 800
    };
  };

  // States for adding a pin dialog
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [tempPinPos, setTempPinPos] = useState<[number, number, number] | null>(null);
  const [newPinNote, setNewPinNote] = useState('');

  // Pin Note editing state
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [editingPinNote, setEditingPinNote] = useState<string>('');

  const handleStartEditPinNote = (pinId: string, currentNote: string) => {
    setEditingPinId(pinId);
    setEditingPinNote(currentNote);
  };

  const handleSavePinNote = (pinId: string) => {
    const updatedText = editingPinNote.trim();
    if (updatedText) {
      if (onUpdatePinNote) {
        onUpdatePinNote(pinId, updatedText);
      } else if (readOnly && allowDentistPin && dentistPinCallback) {
        const updated = pins.map(p => p.id === pinId ? { ...p, note: updatedText } : p);
        dentistPinCallback(updated);
      }
    }
    setEditingPinId(null);
    setEditingPinNote('');
  };

  const [loadedModels, setLoadedModels] = useState<LoadedModel[]>(() => {
    if (stlItems !== undefined && stlItems.length > 0) {
      return stlItems.map((item, idx) => normalizeLoadedModel(item, idx));
    }

    let rawUrls: (string | null | undefined)[] = [];
    if (stlUrls && stlUrls.length > 0) {
      rawUrls = stlUrls;
    } else if (stlUrl) {
      rawUrls = [stlUrl];
    }

    const formattedList = rawUrls
      .map((u) => formatStlUrl(u))
      .filter((u): u is string => Boolean(u));

    if (formattedList.length > 0) {
      return formattedList.map((url, idx) => {
        let filename = stlFileNames && stlFileNames[idx] ? stlFileNames[idx] : (idx === 0 ? stlFileName : undefined);
        if (!filename) {
          try {
            const parts = url.split('/');
            const lastPart = parts[parts.length - 1];
            if (lastPart) {
              const decoded = decodeURIComponent(lastPart).replace(/^\d+-/, '');
              if (decoded && !decoded.startsWith('blob:') && !decoded.startsWith('http')) {
                filename = decoded;
              }
            }
          } catch (e) {}
        }
        if (!filename) {
          filename = `3D 모델 #${idx + 1}`;
        }

        return normalizeLoadedModel({
          id: `prop-model-${idx}-${url}`,
          name: filename,
          originalName: filename,
          url: url
        }, idx);
      });
    }

    return [];
  });

  const loadedModelsRef = useRef<LoadedModel[]>(loadedModels);
  const loadingModelIdsRef = useRef<Set<string>>(new Set());
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  
  // Loading progress state per model id
  const [loadingProgress, setLoadingProgress] = useState<{ [id: string]: number }>({});

  // STL Model Name editing state
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editingModelName, setEditingModelName] = useState<string>('');
  // Collapsible overlay card states
  const [isModelListCollapsed, setIsModelListCollapsed] = useState<boolean>(false);
  const [isPinListCollapsed, setIsPinListCollapsed] = useState<boolean>(false);
  const [isGuideCollapsed, setIsGuideCollapsed] = useState<boolean>(true);

  // Color picker popover state for STL & PLY models
  const [activeColorPickerModelId, setActiveColorPickerModelId] = useState<string | null>(null);
  const colorPickerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerContainerRef.current && !colorPickerContainerRef.current.contains(e.target as Node)) {
        setActiveColorPickerModelId(null);
      }
    };
    if (activeColorPickerModelId) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [activeColorPickerModelId]);

  const handleStartRenameModel = (model: LoadedModel) => {
    setEditingModelId(model.id);
    setEditingModelName(model.name);
  };

  const handleSaveModelName = (id: string) => {
    if (editingModelName.trim()) {
      setLoadedModels(prev =>
        prev.map(m => (m.id === id ? { ...m, name: editingModelName.trim() } : m))
      );
    }
    setEditingModelId(null);
  };

  const onStlItemsChangeRef = useRef(onStlItemsChange);
  useEffect(() => {
    onStlItemsChangeRef.current = onStlItemsChange;
  }, [onStlItemsChange]);

  // Keep track of the last emitted serialized items to avoid redundant calls to parent
  const lastEmittedStlItemsRef = useRef<string>(serializeStlItems(loadedModels));

  // Sync loadedModels changes back to parent callback ONLY when actual serialized content differs
  useEffect(() => {
    loadedModelsRef.current = loadedModels;
    if (onStlItemsChangeRef.current) {
      const items: StlItem[] = loadedModels.map((m, idx) => {
        const norm = normalizeLoadedModel(m, idx);
        return {
          id: norm.id,
          name: norm.name,
          originalName: norm.originalName,
          format: norm.format,
          colorMode: norm.colorMode,
          color: norm.color,
          url: norm.url,
          visible: norm.visible,
          opacity: norm.opacity
        };
      });
      const serialized = serializeStlItems(items);
      if (lastEmittedStlItemsRef.current !== serialized) {
        lastEmittedStlItemsRef.current = serialized;
        onStlItemsChangeRef.current(items);
      }
    }
  }, [loadedModels]);

  // Synchronize stlItems or stlUrl / stlUrls props to loadedModels state with deep equality guard
  useEffect(() => {
    let targetLoaded: LoadedModel[] = [];

    if (stlItems !== undefined && stlItems.length > 0) {
      targetLoaded = stlItems.map((item, idx) => normalizeLoadedModel(item, idx));
    } else {
      let rawUrls: (string | null | undefined)[] = [];
      if (stlUrls && stlUrls.length > 0) {
        rawUrls = stlUrls;
      } else if (stlUrl) {
        rawUrls = [stlUrl];
      }

      const formattedList = rawUrls
        .map((u) => formatStlUrl(u))
        .filter((u): u is string => Boolean(u));

      if (formattedList.length > 0) {
        const existingMap = new Map<string, LoadedModel>(loadedModelsRef.current.map(m => [m.url, m]));
        targetLoaded = formattedList.map((url, idx) => {
          const existing = existingMap.get(url);
          if (existing) {
            return existing;
          }

          let filename = stlFileNames && stlFileNames[idx] ? stlFileNames[idx] : (idx === 0 ? stlFileName : undefined);
          if (!filename) {
            try {
              const parts = url.split('/');
              const lastPart = parts[parts.length - 1];
              if (lastPart) {
                const decoded = decodeURIComponent(lastPart).replace(/^\d+-/, '');
                if (decoded && !decoded.startsWith('blob:') && !decoded.startsWith('http')) {
                  filename = decoded;
                }
              }
            } catch (e) {}
          }
          if (!filename) {
            filename = `3D 모델 #${idx + 1}`;
          }

          return normalizeLoadedModel({
            id: `prop-model-${idx}-${url}`,
            name: filename,
            originalName: filename,
            url: url
          }, idx);
        });
      }
    }

    // Deep compare to prevent infinite re-render loop
    if (!areModelsEqual(loadedModelsRef.current, targetLoaded)) {
      lastEmittedStlItemsRef.current = serializeStlItems(targetLoaded);
      setLoadedModels(targetLoaded);
    }
  }, [
    stlUrl,
    stlFileName,
    JSON.stringify(stlUrls),
    JSON.stringify(stlFileNames),
    JSON.stringify(stlItems)
  ]);

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files) as File[];

    if (onLocalFileUpload) {
      onLocalFileUpload(fileArray);
    } else {
      const newModels: LoadedModel[] = [];
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        const objectUrl = URL.createObjectURL(file);
        const ext = getModelExtension(objectUrl, file.name);
        const isPlyOrObj = ext === 'ply' || ext === 'obj';
        const colorPreset = isPlyOrObj ? '#ffffff' : PRESET_COLORS[(loadedModels.length + i) % PRESET_COLORS.length].value;

        newModels.push({
          id: `local-${Date.now()}-${i}`,
          name: file.name,
          originalName: file.name,
          format: ext,
          colorMode: 'color',
          visible: true,
          opacity: 1.0,
          color: colorPreset,
          url: objectUrl,
          isLocal: true
        });
      }
      setLoadedModels(prev => [...prev, ...newModels]);
    }
    e.target.value = '';
  };

  const handleRemoveModel = (id: string) => {
    setLoadedModels(prev => {
      const model = prev.find(m => m.id === id);
      if (model && model.isLocal) {
        URL.revokeObjectURL(model.url);
      }
      return prev.filter(m => m.id !== id);
    });
  };

  const handleToggleVisibility = (id: string) => {
    setLoadedModels(prev =>
      prev.map(m => (m.id === id ? { ...m, visible: !m.visible } : m))
    );
  };

  const handleOpacityChange = (id: string, opacity: number) => {
    setLoadedModels(prev =>
      prev.map(m => (m.id === id ? { ...m, opacity } : m))
    );
  };

  const handleColorChange = (id: string, color: string) => {
    setLoadedModels(prev =>
      prev.map(m => {
        if (m.id === id) {
          const ext = getModelExtension(m.url, m.name, m.format, m.originalName);
          const isPlyOrObj = ext === 'ply' || ext === 'obj';
          return {
            ...m,
            color,
            colorMode: isPlyOrObj ? 'mono' : m.colorMode || 'mono'
          };
        }
        return m;
      })
    );

    // Immediately update 3D mesh material for instant visual response
    const activeGroup = modelGroupRef.current;
    if (activeGroup) {
      const targetMesh = activeGroup.children.find(child => child.userData.modelId === id) as THREE.Mesh | undefined;
      if (targetMesh && targetMesh.material) {
        const mat = targetMesh.material as THREE.MeshStandardMaterial;
        mat.vertexColors = false;
        mat.color.set(color);
        mat.needsUpdate = true;
      }
    }
  };

  const handleColorModeChange = (id: string, mode: 'color' | 'mono') => {
    setLoadedModels(prev =>
      prev.map(m => {
        if (m.id === id) {
          let nextColor = m.color;
          if (mode === 'mono' && (!nextColor || nextColor === '#ffffff')) {
            nextColor = DEFAULT_STL_COLOR;
          }
          return { ...m, colorMode: mode, color: nextColor };
        }
        return m;
      })
    );

    const activeGroup = modelGroupRef.current;
    if (activeGroup) {
      const targetMesh = activeGroup.children.find(child => child.userData.modelId === id) as THREE.Mesh | undefined;
      if (targetMesh && targetMesh.material) {
        const mat = targetMesh.material as THREE.MeshStandardMaterial;
        const hasVertexColors = Boolean(targetMesh.geometry?.attributes?.color && targetMesh.geometry.attributes.color.count > 0);
        if (mode === 'mono') {
          mat.vertexColors = false;
          mat.color.set(DEFAULT_STL_COLOR);
        } else {
          mat.vertexColors = hasVertexColors;
          if (hasVertexColors) {
            mat.color.setHex(0xffffff);
          } else {
            mat.color.set(DEFAULT_STL_COLOR);
          }
        }
        mat.needsUpdate = true;
      }
    }
  };

  // Cleanup object URLs on unmount (only for internally created local models)
  useEffect(() => {
    return () => {
      loadedModelsRef.current.forEach(m => {
        if (m.isLocal && !m.url.startsWith('blob:http') && !m.url.startsWith('data:')) {
          try { URL.revokeObjectURL(m.url); } catch (_) {}
        }
      });
    };
  }, []);
  
  // Camera transition state for custom angle flying
  const transitionRef = useRef<{
    active: boolean;
    startPos: THREE.Vector3;
    startLook: THREE.Vector3;
    startUp: THREE.Vector3;
    targetPos: THREE.Vector3;
    targetLook: THREE.Vector3;
    targetUp: THREE.Vector3;
    startTime: number;
    duration: number;
  } | null>(null);

  // Trigger smooth angle restore
  const [showAngleRestoredToast, setShowAngleRestoredToast] = useState(false);

  // Initialize Scene, Camera, Renderer, Controls (Run ONCE on mount)
  useEffect(() => {
    const canvasContainer = canvasContainerRef.current;
    if (!canvasContainer) return;

    // 1. Scene (ExoCAD signature neutral studio backdrop)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#cbd2dc');
    sceneRef.current = scene;

    // 2. Camera (Using 16-degree ultra-low distortion telephoto FOV matching ExoCAD parallel CAD projection)
    const initialWidth = canvasContainer.clientWidth || containerRef.current?.clientWidth || 800;
    const initialHeight = canvasContainer.clientHeight || containerRef.current?.clientHeight || 600;
    const initialAspect = initialHeight > 0 ? initialWidth / initialHeight : 1.333;
    const camera = new THREE.PerspectiveCamera(
      16,
      initialAspect,
      0.1,
      20000
    );
    camera.position.set(0, 15, 35);
    cameraRef.current = camera;

    // 3. Renderer (configured for rich, true-to-life sRGB color reproduction)
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(initialWidth, initialHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = false;
    renderer.domElement.className = "w-full h-full cursor-grab active:cursor-grabbing block focus:outline-none touch-none select-none";
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.userSelect = "none";
    (renderer.domElement.style as any).webkitUserSelect = "none";
    (renderer.domElement.style as any).webkitTouchCallout = "none";
    rendererRef.current = renderer;

    // Append exclusively into canvasContainer DOM
    canvasContainer.style.touchAction = "none";
    canvasContainer.appendChild(renderer.domElement);

    // Prevent default touch gestures (pinch-zoom/page scroll) from triggering on 3D canvas
    const preventTouchScroll = (e: TouchEvent) => {
      if (e.cancelable) {
        e.preventDefault();
      }
    };
    renderer.domElement.addEventListener('touchstart', preventTouchScroll, { passive: false });
    renderer.domElement.addEventListener('touchmove', preventTouchScroll, { passive: false });

    // 4. Controls (Unrestricted 360-degree trackball rotation)
    const controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 2.2;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.35; // Fine-tuned smooth pan sensitivity for right-click & 2-finger touch
    controls.staticMoving = false;
    controls.dynamicDampingFactor = 0.25;
    controls.minDistance = 0.01;
    controls.maxDistance = 50000;
    controls.handleResize();
    controlsRef.current = controls;

    // 5. ExoCAD Studio Lighting Rig (Sharp cavity definition, crisp occlusion & zero specular glare)
    scene.add(camera);

    // Ambient base — allows deep grooves and fissure valleys to retain depth contrast
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    // Hemisphere light — subtle vertical soft gradient
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x667788, 0.35);
    scene.add(hemiLight);

    // Primary Key Light (Top-Right-Front)
    const headLight = new THREE.DirectionalLight(0xffffff, 0.85);
    headLight.position.set(6, 12, 8);
    camera.add(headLight);

    // Secondary Fill Light (Bottom-Left-Front)
    const fillHeadLight = new THREE.DirectionalLight(0xdce5ed, 0.45);
    fillHeadLight.position.set(-7, -4, 6);
    camera.add(fillHeadLight);

    // Top Overhead Light
    const topLight = new THREE.DirectionalLight(0xffffff, 0.4);
    topLight.position.set(0, 12, 1);
    camera.add(topLight);

    // Back / Rim Light: Silhouette clarity
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.35);
    rimLight.position.set(0, -6, -8);
    camera.add(rimLight);

    // 6. Model Group
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // 7. Pins Group
    const pinsGroup = new THREE.Group();
    scene.add(pinsGroup);
    pinsGroupRef.current = pinsGroup;

    // 8. Handle Resize & Auto-fit Trigger
    const handleResize = () => {
      const containerEl = canvasContainerRef.current || containerRef.current;
      if (!containerEl || !cameraRef.current || !rendererRef.current) return;
      const width = containerEl.clientWidth;
      const height = containerEl.clientHeight;
      if (width <= 10 || height <= 10) return;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      
      rendererRef.current.setSize(width, height);
      if (controlsRef.current) {
        controlsRef.current.handleResize();
      }

      if (!hasAutoFittedRef.current && fitCameraRef.current) {
        fitCameraRef.current();
        hasAutoFittedRef.current = true;
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (canvasContainerRef.current) {
      resizeObserver.observe(canvasContainerRef.current);
    }
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // 9. Single Render/Animation Loop
    let animationFrameId: number;
    let isDisposed = false;
    const tempV = new THREE.Vector3();

    const animate = () => {
      if (isDisposed) return;
      animationFrameId = requestAnimationFrame(animate);

      // Smooth camera interpolation
      if (transitionRef.current && transitionRef.current.active) {
        const trans = transitionRef.current;
        const now = performance.now();
        const elapsed = now - trans.startTime;
        const progress = Math.min(Math.max(elapsed / trans.duration, 0), 1);
        
        const ease = progress < 0.5 
          ? 4 * progress * progress * progress 
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        camera.position.lerpVectors(trans.startPos, trans.targetPos, ease);
        controls.target.lerpVectors(trans.startLook, trans.targetLook, ease);
        camera.up.lerpVectors(trans.startUp, trans.targetUp, ease).normalize();
        camera.lookAt(controls.target);

        if (progress >= 1) {
          camera.position.copy(trans.targetPos);
          controls.target.copy(trans.targetLook);
          camera.up.copy(trans.targetUp);
          camera.lookAt(trans.targetLook);
          controls.update();
          trans.active = false;
          transitionRef.current = null;
        }
      } else {
        controls.update();
      }

      renderer.render(scene, camera);

      // Project 3D pins to 2D screen space coordinates using fresh pinsRef
      const targetEl = canvasContainerRef.current || containerRef.current;
      if (pinsGroup && camera && targetEl && pinsRef.current.length > 0) {
        const width = targetEl.clientWidth;
        const height = targetEl.clientHeight;
        const widthHalf = width / 2;
        const heightHalf = height / 2;

        const currentPins = pinsRef.current;
        const updatedProjected = currentPins
          .filter(pin => pin && Array.isArray(pin.position) && pin.position.length >= 3)
          .map((pin, idx) => {
            const [px, py, pz] = pin.position;
            tempV.set(px, py, pz);
            tempV.project(camera);

            const visible = tempV.z <= 1;
            const x = Math.round((tempV.x * widthHalf) + widthHalf);
            const y = Math.round(-(tempV.y * heightHalf) + heightHalf);

            return {
              id: pin.id,
              note: pin.note || '',
              creator: pin.creator,
              x,
              y,
              visible,
              index: idx + 1
            };
          });

        const key = updatedProjected.map(p => `${p.id}:${p.x}:${p.y}:${p.visible}`).join('|');
        if (key !== lastProjectedRef.current) {
          lastProjectedRef.current = key;
          setProjectedPins(updatedProjected);
        }
      } else if (pinsRef.current.length === 0 && lastProjectedRef.current !== '') {
        lastProjectedRef.current = '';
        setProjectedPins([]);
      }
    };
    animate();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (renderer.domElement) {
        renderer.domElement.removeEventListener('touchstart', preventTouchScroll);
        renderer.domElement.removeEventListener('touchmove', preventTouchScroll);
      }
      controls.dispose();
      renderer.dispose();
      if (canvasContainer && renderer.domElement && canvasContainer.contains(renderer.domElement)) {
        canvasContainer.removeChild(renderer.domElement);
      }
    };
  }, []); // Run ONCE on mount! Scene never destroyed on pin addition

  // Handle STL loaded models syncing & Auto-Fit Box logic
  useEffect(() => {
    let isMounted = true;

    const scene = sceneRef.current;
    const modelGroup = modelGroupRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !modelGroup || !camera || !controls) return;

    const hasStl = loadedModels.length > 0;

    // Prune removed children
    const childrenToRemove: THREE.Object3D[] = [];
    const activeGroup = modelGroupRef.current || modelGroup;
    activeGroup.children.forEach(child => {
      const modelId = child.userData.modelId;
      if (modelId) {
        const stillExists = loadedModels.some(m => m.id === modelId);
        if (!stillExists) {
          childrenToRemove.push(child);
        }
      } else {
        childrenToRemove.push(child);
      }
    });

    childrenToRemove.forEach(child => {
      const currentGrp = modelGroupRef.current || modelGroup;
      currentGrp.remove(child);
      if (child instanceof THREE.Mesh) {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });

    if (!hasStl) {
      hasAutoFittedRef.current = false;
      return () => {
        isMounted = false;
      };
    }

    const fitCameraToModelGroup = () => {
      if (!cameraRef.current || !controlsRef.current || !modelGroupRef.current) return;
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;
      const grp = modelGroupRef.current;

      const containerEl = canvasContainerRef.current || containerRef.current;
      const containerWidth = containerEl?.clientWidth || 0;
      const containerHeight = containerEl?.clientHeight || 0;

      if (containerWidth <= 10 || containerHeight <= 10) return;

      cam.aspect = containerWidth / containerHeight;
      if (rendererRef.current) {
        rendererRef.current.setSize(containerWidth, containerHeight);
      }
      cam.updateProjectionMatrix();

      if (ctrl.handleResize) {
        ctrl.handleResize();
      }

      grp.updateMatrixWorld(true);

      if (grp.children.length === 0) return;

      const box = new THREE.Box3();
      let hasVisibleMesh = false;

      grp.traverse((child) => {
        if ((child as THREE.Mesh).isMesh && child.visible) {
          const mesh = child as THREE.Mesh;
          if (mesh.geometry) {
            if (!mesh.geometry.boundingBox) {
              mesh.geometry.computeBoundingBox();
            }
            if (mesh.geometry.boundingBox) {
              const meshBox = mesh.geometry.boundingBox.clone();
              meshBox.applyMatrix4(mesh.matrixWorld);
              box.union(meshBox);
              hasVisibleMesh = true;
            }
          }
        }
      });

      if (!hasVisibleMesh || box.isEmpty()) return;

      const center = new THREE.Vector3();
      box.getCenter(center);

      const size = new THREE.Vector3();
      box.getSize(size);

      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim <= 0 || !isFinite(maxDim) || !isFinite(center.x) || !isFinite(center.y) || !isFinite(center.z)) {
        return;
      }

      hasAutoFittedRef.current = true;

      const fov = cam.fov * (Math.PI / 180);
      let cameraDistance = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.25;
      if (!isFinite(cameraDistance) || cameraDistance < 5) cameraDistance = 5;

      cam.near = Math.max(0.01, cameraDistance / 100);
      cam.far = Math.max(20000, cameraDistance * 60);
      cam.updateProjectionMatrix();

      // Clear transition interpolation so camera position isn't overridden
      if (transitionRef.current) {
        transitionRef.current = null;
      }

      ctrl.target.copy(center);
      cam.position.set(center.x, center.y + maxDim * 0.35, center.z + cameraDistance);
      cam.lookAt(center);

      // Set minDistance to prevent extreme slowdown at close zoom
      ctrl.minDistance = Math.max(0.05, maxDim * 0.02);

      if (ctrl.handleResize) {
        ctrl.handleResize();
      }
      ctrl.target.copy(center);
      ctrl.update();
    };

    fitCameraRef.current = fitCameraToModelGroup;

    const processGeometry = (model: LoadedModel, geometry: THREE.BufferGeometry) => {
      if (!isMounted) {
        geometry.dispose();
        return;
      }

      loadingModelIdsRef.current.delete(model.id);
      setLoadingProgress(prev => {
        if (prev[model.id] === undefined) return prev;
        const next = { ...prev };
        delete next[model.id];
        return next;
      });
      setModelLoadError(null);

      const targetGroup = modelGroupRef.current || modelGroup;
      if (!targetGroup) {
        geometry.dispose();
        return;
      }

      // Check if model is still present in loadedModels
      const isStillLoaded = loadedModelsRef.current.some(m => m.id === model.id);
      if (!isStillLoaded) {
        geometry.dispose();
        return;
      }

      // Check if mesh for this model ID already exists
      const existingMesh = targetGroup.children.find(child => child.userData.modelId === model.id);
      if (existingMesh) {
        geometry.dispose();
        return;
      }

      // 1. Preserve original file coordinates (Do not call geometry.center())
      if (!geometry.attributes.normal || geometry.attributes.normal.count === 0) {
        geometry.computeVertexNormals();
      }
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();

      // Vertex Colors & File Format support (e.g., PLY / OBJ scan data)
      const ext = getModelExtension(model.url, model.name, model.format, model.originalName);
      const isPlyOrObj = ext === 'ply' || ext === 'obj';
      if (isPlyOrObj) {
        sanitizeGeometryColors(geometry);
      } else if (geometry.attributes.color) {
        geometry.deleteAttribute('color');
      }

      const hasVertexColors = isPlyOrObj && Boolean(geometry.attributes.color && geometry.attributes.color.count > 0);
      const isMono = !isPlyOrObj || model.colorMode === 'mono';

      // Chosen model color (e.g. #8c9ba5, #ded5c2, #ffffff, etc.)
      const modelColor = model.color || DEFAULT_STL_COLOR;
      let targetOpacity = (model.opacity !== undefined && model.opacity !== null && !isNaN(model.opacity)) ? model.opacity : 1.0;
      if (targetOpacity <= 0) {
        targetOpacity = 1.0;
      }

      let materialColor: THREE.Color;
      let useVertexColors = false;

      if (isPlyOrObj) {
        if (isMono) {
          useVertexColors = false;
          materialColor = new THREE.Color(model.color && model.color !== '#ffffff' ? model.color : DEFAULT_STL_COLOR);
        } else {
          useVertexColors = hasVertexColors;
          materialColor = hasVertexColors ? new THREE.Color(0xffffff) : new THREE.Color(model.color || DEFAULT_STL_COLOR);
        }
      } else {
        // STL Models: Always use the exact user-selected color with solid shading (never vertex colors)
        useVertexColors = false;
        try {
          materialColor = new THREE.Color(modelColor);
        } catch (_) {
          materialColor = new THREE.Color(DEFAULT_STL_COLOR);
        }
      }

      // ExoCAD Satin Matte Shading: Roughness 0.80 completely diffuses light, carving deep fissure shadows
      const isStl = !isPlyOrObj;
      const material = new THREE.MeshStandardMaterial({
        color: materialColor,
        vertexColors: useVertexColors,
        metalness: 0.0,
        roughness: isStl ? 0.80 : (isMono ? 0.80 : 0.88),
        side: THREE.DoubleSide,
        transparent: targetOpacity < 0.99,
        opacity: targetOpacity,
        depthWrite: true
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.visible = model.visible !== false;
      mesh.userData = { modelId: model.id };

      mesh.updateMatrixWorld(true);
      targetGroup.add(mesh);
      targetGroup.updateMatrixWorld(true);

      if (!hasAutoFittedRef.current) {
        fitCameraToModelGroup();
        hasAutoFittedRef.current = true;
      }
    };

    loadedModels.forEach(model => {
      const activeGroup = modelGroupRef.current || modelGroup;
      const existingMesh = activeGroup.children.find(child => child.userData.modelId === model.id) as THREE.Mesh | undefined;

      if (existingMesh) {
        existingMesh.visible = model.visible !== false;

        if (existingMesh.material && existingMesh.geometry) {
          const ext = getModelExtension(model.url, model.name, model.format, model.originalName);
          const isPlyOrObj = ext === 'ply' || ext === 'obj';
          if (!isPlyOrObj && existingMesh.geometry.attributes.color) {
            existingMesh.geometry.deleteAttribute('color');
          }

          const mat = existingMesh.material as THREE.MeshStandardMaterial;
          const modelColor = model.color || DEFAULT_STL_COLOR;
          let targetOpacity = (model.opacity !== undefined && model.opacity !== null && !isNaN(model.opacity)) ? model.opacity : 1.0;
          if (targetOpacity <= 0) {
            targetOpacity = 1.0;
          }
          const hasVertexColors = isPlyOrObj && Boolean(existingMesh.geometry?.attributes?.color && existingMesh.geometry.attributes.color.count > 0);
          const isMono = !isPlyOrObj || model.colorMode === 'mono';

          if (isPlyOrObj) {
            if (isMono) {
              mat.vertexColors = false;
              mat.color.set(model.color && model.color !== '#ffffff' ? model.color : DEFAULT_STL_COLOR);
            } else {
              mat.vertexColors = hasVertexColors;
              if (hasVertexColors) {
                mat.color.setHex(0xffffff);
              } else {
                mat.color.set(model.color || DEFAULT_STL_COLOR);
              }
            }
          } else {
            mat.vertexColors = false;
            try {
              mat.color.set(modelColor);
            } catch (_) {
              mat.color.set(DEFAULT_STL_COLOR);
            }
          }
          const isStl = !isPlyOrObj;
          mat.roughness = isStl ? 0.80 : (isMono ? 0.80 : 0.88);
          mat.metalness = 0.0;
          mat.transparent = targetOpacity < 0.99;
          mat.opacity = targetOpacity;
          mat.depthWrite = true;
          mat.needsUpdate = true;
        }
      } else {
        if (!model.url || model.url.trim() === '') {
          return;
        }

        if (loadingModelIdsRef.current.has(model.id)) {
          return;
        }
        loadingModelIdsRef.current.add(model.id);
        setLoadingProgress(prev => ({ ...prev, [model.id]: 0 }));

        const loadModelAsync = async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout safeguard

          try {
            let arrayBuffer: ArrayBuffer | null = null;

            if (model.url.startsWith('blob:') || model.url.startsWith('data:')) {
              const res = await fetch(model.url, { signal: controller.signal });
              if (!res.ok && res.status !== 0) {
                throw new Error(`Blob HTTP Error status: ${res.status}`);
              }
              arrayBuffer = await res.arrayBuffer();
            } else {
              let fetchTargetUrl = model.url;
              if (!fetchTargetUrl.startsWith('http://') && !fetchTargetUrl.startsWith('https://') && !fetchTargetUrl.startsWith('/')) {
                fetchTargetUrl = '/' + fetchTargetUrl;
              }

              try {
                const decoded = decodeURIComponent(fetchTargetUrl);
                fetchTargetUrl = encodeURI(decoded);
              } catch (e) {
                fetchTargetUrl = model.url;
              }

              let res: Response | null = null;
              try {
                res = await fetch(fetchTargetUrl, { signal: controller.signal });
              } catch (e) {
                if (fetchTargetUrl !== model.url) {
                  res = await fetch(model.url, { signal: controller.signal });
                } else {
                  throw e;
                }
              }

              if (!res || !res.ok) {
                if (fetchTargetUrl !== model.url) {
                  const fallbackRes = await fetch(model.url, { signal: controller.signal });
                  if (fallbackRes.ok) {
                    res = fallbackRes;
                  }
                }
              }

              if (!res || !res.ok) {
                throw new Error(`HTTP Error status: ${res?.status || 'Unknown'} ${res?.statusText || ''}`);
              }

              const contentType = res.headers.get('content-type') || '';
              if (contentType.includes('text/html')) {
                throw new Error(`파일을 찾을 수 없거나 HTML 응답을 받았습니다 (URL: ${model.url})`);
              }

              arrayBuffer = await res.arrayBuffer();
            }

            clearTimeout(timeoutId);

            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
              throw new Error('3D 모델 파일 데이터가 비어 있습니다.');
            }

            const ext = getModelExtension(model.url, model.name, model.format, model.originalName);
            let geometry: THREE.BufferGeometry | null = null;

            if (ext === 'ply') {
              const loader = new PLYLoader();
              geometry = loader.parse(arrayBuffer);
              sanitizeGeometryColors(geometry);
            } else if (ext === 'obj') {
              const loader = new OBJLoader();
              const text = new TextDecoder('utf-8').decode(arrayBuffer);
              const objGroup = loader.parse(text);

              const geometries: THREE.BufferGeometry[] = [];
              objGroup.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                  const m = child as THREE.Mesh;
                  if (m.geometry) {
                    sanitizeGeometryColors(m.geometry);
                    geometries.push(m.geometry.clone());
                  }
                }
              });

              if (geometries.length === 1) {
                geometry = geometries[0];
                sanitizeGeometryColors(geometry);
                extractOBJVertexColors(text, geometry);
              } else if (geometries.length > 1) {
                geometry = mergeOBJGeometries(geometries);
                extractOBJVertexColors(text, geometry);
              } else {
                throw new Error('OBJ 파일에서 3D 메쉬를 찾을 수 없습니다.');
              }
            } else {
              const loader = new STLLoader();
              geometry = loader.parse(arrayBuffer);
              if (geometry.attributes.color) {
                geometry.deleteAttribute('color');
              }
            }

            if (!geometry || !geometry.attributes || !geometry.attributes.position || geometry.attributes.position.count === 0) {
              throw new Error(`3D ${ext.toUpperCase()} 파일에서 형상 좌표를 파싱하지 못했습니다.`);
            }

            processGeometry(model, geometry);
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
              fitCameraToModelGroup();
            }
          } catch (err: any) {
            clearTimeout(timeoutId);
            console.warn(`[ThreeViewer WARNING] Failed to load 3D model (${model.name}):`, err);
            setModelLoadError(`3D 보철 파일 (${model.name}) 로딩에 실패했습니다.`);
          } finally {
            loadingModelIdsRef.current.delete(model.id);
            setLoadingProgress(prev => {
              if (prev[model.id] === undefined) return prev;
              const next = { ...prev };
              delete next[model.id];
              return next;
            });
          }
        };

        loadModelAsync();
      }
    });

    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      if (!hasAutoFittedRef.current) {
        fitCameraToModelGroup();
        hasAutoFittedRef.current = true;
      }
    }

    return () => {
      isMounted = false;
    };
  }, [loadedModels]);

  // Sync pins to 3D sphere meshes
  useEffect(() => {
    const pinsGroup = pinsGroupRef.current;
    if (!pinsGroup) return;

    while (pinsGroup.children.length > 0) {
      const obj = pinsGroup.children[0];
      pinsGroup.remove(obj);
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
          else obj.material.dispose();
        }
      }
    }
  }, [pins]);

  // Restore saved camera state
  useEffect(() => {
    if (!savedCameraState || !cameraRef.current || !controlsRef.current) return;
    if (!Array.isArray(savedCameraState.position) || !Array.isArray(savedCameraState.target)) return;
    if (savedCameraState.position.length < 3 || savedCameraState.target.length < 3) return;

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    const [px, py, pz] = savedCameraState.position;
    const [tx, ty, tz] = savedCameraState.target;
    const [ux, uy, uz] = (Array.isArray(savedCameraState.up) && savedCameraState.up.length >= 3)
      ? savedCameraState.up
      : [0, 1, 0];

    transitionRef.current = {
      active: true,
      startPos: camera.position.clone(),
      startLook: controls.target.clone(),
      startUp: camera.up.clone(),
      targetPos: new THREE.Vector3(px, py, pz),
      targetLook: new THREE.Vector3(tx, ty, tz),
      targetUp: new THREE.Vector3(ux, uy, uz).normalize(),
      startTime: performance.now(),
      duration: 800
    };

    setShowAngleRestoredToast(true);
    const timer = setTimeout(() => setShowAngleRestoredToast(false), 3000);
    return () => clearTimeout(timer);
  }, [savedCameraState]);

  // DOUBLE CLICK on 3D mesh surface to drop feedback pin
  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!containerRef.current || !cameraRef.current || !modelGroupRef.current) return;

    const canDropPin = !readOnly || allowDentistPin || Boolean(dentistPinCallback) || Boolean(onAddPin);
    if (!canDropPin) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), cameraRef.current);

    const intersects = raycaster.intersectObjects(modelGroupRef.current.children, true);

    if (intersects.length > 0) {
      const point = intersects[0].point;
      setTempPinPos([
        Number(point.x.toFixed(2)),
        Number(point.y.toFixed(2)),
        Number(point.z.toFixed(2))
      ]);
      setNewPinNote('');
      setIsAddingPin(true);
    }
  };

  const handleSavePin = () => {
    if (!tempPinPos) return;

    const noteToSave = newPinNote.trim() || (dentistPinCallback ? '답변자 피드백 포인트' : '작성자 피드백 포인트');

    if (dentistPinCallback) {
      const newPin: CasePin = {
        id: `respondent-pin-${Date.now()}`,
        position: tempPinPos,
        note: noteToSave,
        creator: '답변자',
        createdAt: new Date().toISOString()
      };
      dentistPinCallback([...pins, newPin]);
    } else if (onAddPin) {
      onAddPin({
        position: tempPinPos,
        note: noteToSave
      });
    }

    setIsAddingPin(false);
    setTempPinPos(null);
    setNewPinNote('');
  };

  const handleSaveCurrentAngle = () => {
    if (!cameraRef.current || !controlsRef.current || !onSaveAngle) return;

    const cam = cameraRef.current;
    const ctrl = controlsRef.current;

    const currentAngle: CameraState = {
      position: [
        Number(cam.position.x.toFixed(2)),
        Number(cam.position.y.toFixed(2)),
        Number(cam.position.z.toFixed(2))
      ],
      target: [
        Number(ctrl.target.x.toFixed(2)),
        Number(ctrl.target.y.toFixed(2)),
        Number(ctrl.target.z.toFixed(2))
      ],
      up: [
        Number(cam.up.x.toFixed(4)),
        Number(cam.up.y.toFixed(4)),
        Number(cam.up.z.toFixed(4))
      ]
    };

    onSaveAngle(currentAngle);
  };

  // Automatically prune stale model IDs from loadingProgress when loadedModels updates
  useEffect(() => {
    const currentModelIds = new Set(loadedModels.map(m => m.id));
    setLoadingProgress(prev => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach(id => {
        if (!currentModelIds.has(id)) {
          delete next[id];
          loadingModelIdsRef.current.delete(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [loadedModels]);

  const isLoadingModels = loadedModels.some(m => loadingProgress[m.id] !== undefined);

  // Drag and drop STL files onto ThreeViewer container
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const handleViewerDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleViewerDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingFile(false);
  };

  const handleViewerDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = (Array.from(e.dataTransfer.files) as File[]).filter(file => {
        const name = file.name.toLowerCase();
        return name.endsWith('.stl') || name.endsWith('.ply') || name.endsWith('.obj') ||
               file.type.includes('stl') || file.type.includes('ply') || file.type.includes('obj') || file.type.includes('sla');
      });
      if (droppedFiles.length > 0 && onLocalFileUpload) {
        onLocalFileUpload(droppedFiles);
      } else if (droppedFiles.length === 0) {
        alert('3D 모델 파일(.stl, .ply, .obj)만 업로드할 수 있습니다.');
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onDoubleClick={handleCanvasDoubleClick}
      onDragOver={handleViewerDragOver}
      onDragLeave={handleViewerDragLeave}
      onDrop={handleViewerDrop}
      style={{ touchAction: 'none' }}
      className="w-full h-full relative overflow-hidden bg-[#4c3b6e] rounded-2xl border border-slate-200 shadow-inner group touch-none select-none overscroll-none"
    >
      {/* Exclusive 3D Canvas Container */}
      <div
        ref={canvasContainerRef}
        style={{ touchAction: 'none' }}
        className="absolute inset-0 w-full h-full pointer-events-auto touch-none select-none overscroll-none"
      />

      {/* Drag & Drop Visual Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-blue-900/85 backdrop-blur-md flex flex-col items-center justify-center text-white border-4 border-dashed border-blue-400 rounded-2xl pointer-events-none transition-all">
          <Upload className="w-12 h-12 mb-3 text-blue-300 animate-bounce" />
          <p className="text-base font-extrabold">여기에 3D 모델 파일(STL, PLY, OBJ)을 드롭하여 추가</p>
          <p className="text-xs text-blue-200 mt-1">다중 3D 파일 (STL, PLY, OBJ) 드래그 & 드롭 가능</p>
        </div>
      )}
      
      {/* Top Header Floating Controls Bar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-center pointer-events-none">
        {/* Custom View Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {customViews && customViews.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {customViews
                .filter(view => view && Array.isArray(view.position) && Array.isArray(view.target) && view.position.length >= 3 && view.target.length >= 3)
                .map((view, idx) => {
                const displayName = view.name || `뷰 #${idx + 1}`;
                return (
                  <div
                    key={view.id || `view-${idx}-${displayName}`}
                    className="flex items-center gap-1 bg-white/95 backdrop-blur-md p-1 pl-2.5 rounded-xl shadow-sm border border-slate-200/80 hover:border-blue-300 transition-all"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (onSelectView) onSelectView(view);
                        const camera = cameraRef.current;
                        const controls = controlsRef.current;
                        if (!camera || !controls) return;
                        const [px, py, pz] = view.position;
                        const [tx, ty, tz] = view.target;
                        const [ux, uy, uz] = (Array.isArray(view.up) && view.up.length >= 3) ? view.up : [0, 1, 0];
                        transitionRef.current = {
                          active: true,
                          startPos: camera.position.clone(),
                          startLook: controls.target.clone(),
                          startUp: camera.up.clone(),
                          targetPos: new THREE.Vector3(px, py, pz),
                          targetLook: new THREE.Vector3(tx, ty, tz),
                          targetUp: new THREE.Vector3(ux, uy, uz).normalize(),
                          startTime: performance.now(),
                          duration: 800
                        };
                      }}
                      className="text-[11px] font-extrabold text-slate-700 hover:text-blue-600 flex items-center gap-1 cursor-pointer"
                      title={`${displayName}로 이동`}
                    >
                      <Eye className="w-3 h-3 text-blue-500" />
                      <span>{displayName}</span>
                    </button>

                    {onDeleteView && !readOnly && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteView(idx, view.id);
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title={`${displayName} 삭제`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Action Controls Right Side */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {onSaveAngle && !readOnly && (
            <button
              type="button"
              onClick={handleSaveCurrentAngle}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              title="현재 카메라 시점을 커스텀 뷰로 저장"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>각도저장</span>
            </button>
          )}

          {showStlUpload && !readOnly && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl shadow-md active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
              title="3D 파일 추가 (.stl, .ply, .obj)"
            >
              <Upload className="w-3.5 h-3.5 text-blue-400" />
              <span>파일추가</span>
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".stl,.ply,.obj"
            onChange={handleLocalFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Multi 3D Model Layer Manager Drawer / Card */}
      <div ref={colorPickerContainerRef} className="absolute top-14 sm:top-16 right-2 sm:right-4 z-10 pointer-events-auto w-36 sm:w-42">
        {loadedModels.length > 0 && (
          <div className="relative bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/90 p-2 sm:p-2.5 flex flex-col gap-1.5 transition-all">
            <div
              className="flex items-center justify-between border-b border-slate-100 pb-1 cursor-pointer select-none"
              onClick={() => setIsModelListCollapsed(prev => !prev)}
            >
              <span className="text-[11px] sm:text-xs font-extrabold text-slate-800 flex items-center gap-1">
                <FileText className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-blue-500" />
                3D 모델 ({loadedModels.length})
              </span>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
                title={isModelListCollapsed ? '목록 펼치기' : '목록 접기'}
              >
                {isModelListCollapsed ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            {!isModelListCollapsed && (
              <div className="flex flex-col gap-1 max-h-80 sm:max-h-96 overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {loadedModels.map((model) => {
                  const ext = getModelExtension(model.url, model.name, model.format, model.originalName);
                  const isPlyOrObj = ext === 'ply' || ext === 'obj';
                  const isMono = model.colorMode === 'mono';
                  const isPickerOpen = activeColorPickerModelId === model.id;

                  return (
                    <div
                      key={model.id}
                      className={`flex flex-col gap-1 p-1.5 rounded-xl transition-all border ${
                        model.visible 
                          ? isPickerOpen
                            ? 'bg-blue-50/60 border-blue-300 ring-1 ring-blue-300'
                            : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/80' 
                          : 'bg-slate-100/50 border-slate-200/40 opacity-60'
                      }`}
                    >
                      {/* Title & Actions Row */}
                      <div className="flex items-center justify-between gap-1 min-h-[20px]">
                        <div className="flex items-center min-w-0 flex-1">
                          <span className="font-bold text-slate-800 text-[10px] sm:text-[11px] truncate max-w-[95px] sm:max-w-[125px]" title={model.name}>
                            {model.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Color Button / Indicator */}
                          {(() => {
                            const matchedPreset = PRESET_COLORS.find(
                              p => p.value.toLowerCase() === (model.color || '').toLowerCase()
                            );
                            const colorTitle = (isPlyOrObj && !isMono)
                              ? '스캔 원본 색상'
                              : (matchedPreset ? `${matchedPreset.name} (${model.color || DEFAULT_STL_COLOR})` : (model.color || DEFAULT_STL_COLOR));

                            if (!readOnly) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isPickerOpen) {
                                      setActiveColorPickerModelId(null);
                                    } else {
                                      setActiveColorPickerModelId(model.id);
                                      setEditingModelName(model.name);
                                    }
                                  }}
                                  className={`p-1 rounded-md transition-all cursor-pointer shadow-3xs flex items-center justify-center border ${
                                    isPickerOpen
                                      ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-400'
                                      : 'bg-white hover:bg-slate-100 border-slate-300/80 hover:border-slate-400'
                                  }`}
                                  title={`색상 및 이름 설정 (${colorTitle})`}
                                >
                                  {isPlyOrObj && !isMono ? (
                                    <span
                                      className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-amber-400 via-rose-400 to-indigo-500 border border-slate-300/80 shrink-0 shadow-2xs"
                                      title="스캔 원본"
                                    />
                                  ) : (
                                    <span
                                      className="w-3.5 h-3.5 rounded-full border border-slate-300/80 shrink-0 shadow-2xs"
                                      style={{ backgroundColor: model.color || DEFAULT_STL_COLOR }}
                                    />
                                  )}
                                </button>
                              );
                            }

                            return (
                              <div
                                className="flex items-center justify-center p-0.5 rounded bg-white border border-slate-300/80 shadow-2xs select-none"
                                title={`적용 색상: ${colorTitle} (수정 불가)`}
                              >
                                {isPlyOrObj && !isMono ? (
                                  <span
                                    className="w-3.5 h-3.5 rounded-full bg-gradient-to-tr from-amber-400 via-rose-400 to-indigo-500 border border-slate-300/80 shrink-0 shadow-3xs"
                                    title="스캔 원본 색상"
                                  />
                                ) : (
                                  <span
                                    className="w-3.5 h-3.5 rounded-full border border-slate-300/80 shrink-0 shadow-3xs"
                                    style={{ backgroundColor: model.color || DEFAULT_STL_COLOR }}
                                    title={`현재 색상: ${colorTitle}`}
                                  />
                                )}
                              </div>
                            );
                          })()}

                          <button
                            type="button"
                            onClick={() => handleToggleVisibility(model.id)}
                            className={`p-0.5 rounded transition-colors cursor-pointer ${
                              model.visible ? 'text-blue-600 bg-blue-50 hover:bg-blue-100' : 'text-slate-400 bg-slate-100 hover:bg-slate-200'
                            }`}
                            title={model.visible ? '숨기기' : '보이기'}
                          >
                            {model.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                          </button>
                          
                          {!readOnly && model.id !== 'default-model' && (
                            <button
                              type="button"
                              onClick={() => handleRemoveModel(model.id)}
                              className="p-0.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                              title="레이어 제거"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Opacity slider */}
                      <div className="flex items-center gap-1 pt-0.5 border-t border-slate-200/80">
                        <span className="text-[8px] sm:text-[8.5px] text-slate-400 font-semibold shrink-0">투명도</span>
                        <input
                          type="range"
                          min="0.1"
                          max="1.0"
                          step="0.05"
                          value={model.opacity}
                          onChange={(e) => handleOpacityChange(model.id, parseFloat(e.target.value))}
                          className="w-full h-1 bg-slate-200 rounded appearance-none cursor-pointer accent-blue-600"
                        />
                        <span className="text-[8px] sm:text-[8.5px] font-mono text-slate-500 shrink-0">
                          {Math.round(model.opacity * 100)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Floating Color Picker Popover */}
            {activeColorPickerModelId && (() => {
              const activeModel = loadedModels.find(m => m.id === activeColorPickerModelId);
              if (!activeModel) return null;
              const activeExt = getModelExtension(activeModel.url, activeModel.name, activeModel.format, activeModel.originalName);
              const activeIsPlyOrObj = activeExt === 'ply' || activeExt === 'obj';

              return (
                <div
                  ref={colorPickerContainerRef}
                  className="absolute right-full top-0 mr-2 z-50 w-56 bg-white/98 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200 p-3 flex flex-col gap-2.5 animate-in fade-in slide-in-from-right-3 duration-150"
                >
                  {/* Popover Header with Editable Model Name */}
                  <div className="flex flex-col gap-1.5 border-b border-slate-200/80 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                        3D 모델 설정
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveColorPickerModelId(null)}
                        className="p-0.5 text-slate-400 hover:text-slate-600 rounded transition-colors cursor-pointer"
                        title="닫기"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={editingModelName}
                        onChange={(e) => setEditingModelName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSaveModelName(activeModel.id);
                          }
                        }}
                        placeholder="모델 이름 입력..."
                        className="flex-1 text-xs font-bold px-2 py-1 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-none text-slate-800 transition-colors shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveModelName(activeModel.id)}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow-2xs shrink-0 flex items-center gap-0.5"
                        title="이름 저장"
                      >
                        <Check className="w-3 h-3" />
                        <span>저장</span>
                      </button>
                    </div>
                  </div>

                  {/* PLY/OBJ 전용: 스캔 원본 vs 지정 색상 토글 */}
                  {activeIsPlyOrObj && (
                    <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleColorModeChange(activeModel.id, 'color')}
                        className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          activeModel.colorMode !== 'mono'
                            ? 'bg-white text-blue-600 shadow-xs border border-slate-200'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-gradient-to-tr from-amber-400 via-rose-400 to-indigo-500 shrink-0" />
                        <span>스캔 원본</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleColorModeChange(activeModel.id, 'mono')}
                        className={`flex-1 py-1 px-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          activeModel.colorMode === 'mono'
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <span>지정 색상</span>
                      </button>
                    </div>
                  )}

                  {/* Body: 직접 선택 */}
                  <div className="flex items-center justify-between bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-700">직접 선택</span>
                    <label className="relative flex items-center gap-1.5 cursor-pointer px-1.5 py-0.5 rounded bg-white border border-slate-300 hover:border-blue-400 transition-colors shadow-2xs">
                      <div
                        className="w-3.5 h-3.5 rounded-full border border-slate-300 shadow-2xs shrink-0"
                        style={{ backgroundColor: activeModel.color }}
                      />
                      <span className="text-[9px] font-mono text-slate-700 font-bold uppercase">
                        {activeModel.color}
                      </span>
                      <input
                        type="color"
                        value={activeModel.color}
                        onChange={(e) => handleColorChange(activeModel.id, e.target.value)}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  {/* 6 Preset colors in a single row */}
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-500">추천 덴탈 색상 (6종)</span>
                    <div className="grid grid-cols-6 gap-1 pt-0.5">
                      {PRESET_COLORS.map((p) => {
                        const isSelected = activeModel.color.toLowerCase() === p.value.toLowerCase();
                        return (
                          <button
                            key={p.value}
                            type="button"
                            onClick={() => handleColorChange(activeModel.id, p.value)}
                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                              isSelected
                                ? 'ring-2 ring-blue-500 ring-offset-1 scale-110 shadow-sm'
                                : 'hover:scale-110 hover:ring-1 hover:ring-slate-300'
                            }`}
                            title={p.name}
                          >
                            <span
                              className="w-4.5 h-4.5 rounded-full border border-slate-300 shrink-0 shadow-2xs"
                              style={{ backgroundColor: p.value }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Pins Summary Sidebar Overlay */}
      <div className="hidden sm:block absolute top-16 left-4 z-10 pointer-events-auto w-44">
        {pins.length > 0 && (
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200/80 p-2.5 flex flex-col gap-2">
            <div
              className="flex items-center justify-between border-b border-slate-100 pb-1.5 cursor-pointer select-none"
              onClick={() => setIsPinListCollapsed(prev => !prev)}
            >
              <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-red-500" />
                피드백핀 ({pins.length})
              </span>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
                title={isPinListCollapsed ? '목록 펼치기' : '목록 접기'}
              >
                {isPinListCollapsed ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronUp className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {!isPinListCollapsed && (
              <div className="flex flex-col gap-1 max-h-[380px] overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {pins.map((pin, idx) => {
                  const isRespondent = pin.creator === '치과의사' || (pin.creator as string) === '원장님' || pin.creator === '답변자';
                  const isTech = !isRespondent;
                  const isDentist = isRespondent;
                  const creatorLabel = isRespondent ? '답변자' : '작성자';
                  const isMemoOpen = openMemoIds.includes(pin.id);
                  const isEditing = editingPinId === pin.id;

                  return (
                    <div
                      key={pin.id}
                      onClick={() => handleFlyToPin(pin)}
                      className="p-1.5 bg-slate-50 hover:bg-blue-50/60 rounded-xl border border-slate-200/60 cursor-pointer transition-all flex flex-col gap-0.5 group/pin"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-extrabold ${
                            isTech ? 'bg-red-500 text-white' : (isDentist ? 'bg-amber-400 text-slate-900 font-black' : 'bg-blue-500 text-white')
                          }`}>
                            {idx + 1}
                          </span>
                          <span className={`text-[9px] font-extrabold px-1 py-0.2 rounded ${
                            isTech 
                              ? 'bg-red-50 text-red-700 border border-red-100' 
                              : (isDentist 
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                                  : 'bg-blue-50 text-blue-700 border border-blue-100')
                          }`}>
                            {creatorLabel}
                          </span>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isEditing) {
                                handleSavePinNote(pin.id);
                              } else {
                                handleStartEditPinNote(pin.id, pin.note);
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                            title={isEditing ? "메모 저장" : "메모 수정"}
                          >
                            {isEditing ? <Check className="w-3 h-3 text-emerald-600" /> : <Pencil className="w-2.5 h-2.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleMemo(pin.id);
                            }}
                            className={`px-1 py-0.5 text-[8px] font-bold border rounded transition-colors cursor-pointer ${
                              isMemoOpen
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-slate-500 hover:text-blue-600 border-slate-200 hover:border-blue-200'
                            }`}
                          >
                            {isMemoOpen ? '닫기' : '열기'}
                          </button>

                          {onDeletePin && (!isTech || !allowDentistPin) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeletePin(pin.id);
                              }}
                              className="p-1 bg-white hover:bg-red-50 hover:text-red-600 text-slate-400 hover:border-red-200 border border-slate-200 rounded-md transition-all cursor-pointer"
                              title="핀 삭제"
                            >
                              <X className="w-3 h-3 text-slate-400 group-hover/pin:text-red-500" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isEditing ? (
                        <div className="flex flex-col gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            value={editingPinNote}
                            onChange={(e) => setEditingPinNote(e.target.value)}
                            className="w-full text-[10px] p-1.5 border border-blue-400 rounded-lg bg-white focus:outline-none resize-none h-14"
                            autoFocus
                          />
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingPinId(null)}
                              className="text-[9px] px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 rounded cursor-pointer"
                            >
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSavePinNote(pin.id)}
                              className="text-[9px] px-2 py-0.5 bg-blue-600 text-white font-bold rounded cursor-pointer"
                            >
                              저장
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-700 font-medium leading-normal whitespace-pre-wrap pl-0.5">
                          {pin.note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Guide Note Overlay */}
      <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
        <div className="flex flex-col gap-1.5 bg-white/95 backdrop-blur-md p-2.5 sm:p-3 rounded-2xl shadow-lg border border-slate-200/80 max-w-xs pointer-events-auto transition-all">
          <div
            className="flex items-center justify-between gap-2 cursor-pointer select-none"
            onClick={() => setIsGuideCollapsed(prev => !prev)}
          >
            <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-extrabold text-slate-800">
              <MousePointerClick className="w-3.5 h-3.5 text-blue-500" />
              <span>조작 안내</span>
            </div>
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition-colors"
              title={isGuideCollapsed ? '안내 펼치기' : '안내 접기'}
            >
              {isGuideCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {!isGuideCollapsed && (
            <div className="text-[10.5px] sm:text-[11px] leading-relaxed text-slate-700 font-bold flex flex-col gap-0.5 pt-1 border-t border-slate-100/80">
              {/* PC Mouse Controls Guide */}
              <div className="hidden sm:flex flex-col gap-0.5">
                <div>• 모델 표면 더블클릭 ➔ 피드백 핀</div>
                <div>• 마우스 드래그 ➔ 360° 자유 회전</div>
                <div>• 휠 스크롤 ➔ 확대 / 축소</div>
                <div>• 우클릭 / Shift+드래그 ➔ 이동 (Pan)</div>
              </div>
              {/* Mobile / Touch Gesture Guide */}
              <div className="flex sm:hidden flex-col gap-0.5 text-[10px]">
                <div>• 1손가락 드래그 ➔ 360° 모델 회전</div>
                <div>• 2손가락 핀치 ➔ 확대 / 축소 (Zoom)</div>
                <div>• 2손가락 드래그 ➔ 화면 이동 (Pan)</div>
                <div>• 모델 표면 더블탭 ➔ 피드백 핀 추가</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating 2D Projective Tooltips from 3D space */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20">
        {projectedPins.map((pin) => {
          if (!pin.visible) return null;
          const isRespondent = pin.creator === '치과의사' || (pin.creator as string) === '원장님' || pin.creator === '답변자';
          const isTech = !isRespondent;
          const isDentist = isRespondent;
          const creatorLabel = isRespondent ? '답변자' : '작성자';
          const isMemoOpen = openMemoIds.includes(pin.id);
          const isEditing = editingPinId === pin.id;

          return (
            <div
              key={pin.id}
              className="absolute pointer-events-auto"
              style={{ left: `${pin.x}px`, top: `${pin.y}px` }}
            >
              <div 
                className={`absolute bottom-[44px] left-1/2 -translate-x-1/2 min-w-[160px] max-w-[220px] bg-amber-50 text-slate-800 p-2.5 rounded-xl border border-amber-200 shadow-xl transition-all duration-300 flex flex-col gap-1.5 origin-bottom ${
                  isMemoOpen 
                    ? 'opacity-100 scale-100 translate-y-0 z-30' 
                    : 'opacity-0 scale-75 translate-y-2 pointer-events-none hover:opacity-100 hover:scale-100 hover:translate-y-0 hover:pointer-events-auto z-10'
                }`}
                id={`memo-pad-${pin.id}`}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400 rounded-t-xl" />
                
                <div className="flex justify-between items-center border-b border-amber-200 pb-1 mt-0.5">
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${
                    isTech 
                      ? 'bg-red-100 text-red-700 border border-red-200' 
                      : (isDentist 
                          ? 'bg-amber-100 text-amber-900 border border-amber-300' 
                          : 'bg-blue-100 text-blue-700 border border-blue-200')
                  }`}>
                    #{pin.index} · {creatorLabel}
                  </span>
                  
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isEditing) {
                          handleSavePinNote(pin.id);
                        } else {
                          handleStartEditPinNote(pin.id, pin.note);
                        }
                      }}
                      className="text-slate-500 hover:text-blue-600 px-1 py-0.5 rounded hover:bg-amber-100 transition-colors text-[9px] font-bold cursor-pointer"
                      title={isEditing ? "메모 저장" : "메모 수정"}
                    >
                      {isEditing ? <Check className="w-3 h-3 text-emerald-600" /> : <Pencil className="w-2.5 h-2.5" />}
                    </button>

                    {onDeletePin && (!isTech || !allowDentistPin) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePin(pin.id);
                        }}
                        className="text-rose-400 hover:text-rose-600 px-1 py-0.5 rounded hover:bg-rose-100 transition-colors cursor-pointer"
                        title="핀 삭제"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    )}

                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMemo(pin.id);
                      }}
                      className="text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-amber-100 transition-colors text-[9px] font-bold cursor-pointer"
                      title="메모 창 닫기"
                    >
                      닫기
                    </button>
                  </div>
                </div>
                
                {isEditing ? (
                  <div className="flex flex-col gap-1 my-1">
                    <textarea
                      value={editingPinNote}
                      onChange={(e) => setEditingPinNote(e.target.value)}
                      className="w-full text-[10px] p-1.5 border border-amber-400 rounded-lg bg-white focus:outline-none resize-none h-16"
                      autoFocus
                    />
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingPinId(null)}
                        className="text-[9px] px-1.5 py-0.5 text-slate-500 hover:bg-amber-200 rounded cursor-pointer"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSavePinNote(pin.id)}
                        className="text-[9px] px-2 py-0.5 bg-blue-600 text-white font-bold rounded cursor-pointer"
                      >
                        저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] leading-relaxed font-semibold break-all text-slate-700 font-sans whitespace-pre-wrap">
                    {pin.note}
                  </p>
                )}
                
                <div className="border-t border-dashed border-amber-200/50 pt-1 text-[8px] text-slate-400 font-mono text-right">
                  feedback note
                </div>
              </div>

              {/* Arrow Pin pointing directly to the clicked surface coordinate */}
              <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-full flex flex-col items-center group/pin">
                {/* Number Badge at the top end of the arrow */}
                <button
                  type="button"
                  onClick={() => toggleMemo(pin.id)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shadow-md border-2 border-white transition-all transform active:scale-90 hover:scale-110 cursor-pointer ${
                    isTech 
                      ? 'bg-red-500 hover:bg-red-600 shadow-red-500/40 text-white font-black' 
                      : (isDentist 
                          ? 'bg-amber-400 hover:bg-amber-500 shadow-amber-500/40 text-slate-900 font-black' 
                          : 'bg-blue-500 hover:bg-blue-600 shadow-blue-500/40 text-white font-black')
                  } ${isMemoOpen ? 'ring-2 ring-offset-1 ' + (isTech ? 'ring-red-500' : (isDentist ? 'ring-amber-400' : 'ring-blue-500')) : ''}`}
                  title={`핀 #${pin.index} (${creatorLabel}): 클릭 시 메모장을 여닫습니다.`}
                >
                  {pin.index}
                </button>

                {/* Arrow Stem */}
                <div className={`w-[2px] h-3.5 -mt-0.5 ${
                  isTech ? 'bg-red-500' : (isDentist ? 'bg-amber-500' : 'bg-blue-500')
                }`}></div>

                {/* Arrowhead pointing down to the coordinate tip */}
                <div className={`w-0 h-0 -mt-0.5 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[8px] ${
                  isTech ? 'border-t-red-500' : (isDentist ? 'border-t-amber-500' : 'border-t-blue-500')
                }`}></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3D Model Loading Spinner & Progress Overlay */}
      {isLoadingModels && (
        <div className="absolute inset-0 z-30 bg-slate-900/40 backdrop-blur-xs flex flex-col items-center justify-center gap-3 text-white pointer-events-none">
          <div className="bg-slate-900/90 border border-slate-700 p-5 rounded-2xl shadow-2xl flex flex-col items-center gap-3 max-w-xs w-full">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
            <div className="text-center">
              <p className="text-sm font-bold text-slate-100">3D 모델 로딩 중...</p>
              {loadedModels
                .filter(m => loadingProgress[m.id] !== undefined)
                .map((m) => {
                  const pct = loadingProgress[m.id] || 0;
                  return (
                    <p key={m.id} className="text-xs text-blue-400 font-mono mt-1 font-semibold">
                      {m.name}: {pct > 0 ? `${pct}%` : '데이터 수신 중...'}
                    </p>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Load Error Alert Banner */}
      {modelLoadError && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 bg-rose-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 max-w-md animate-in fade-in slide-in-from-top-2">
          <span>{modelLoadError}</span>
          <button 
            type="button" 
            onClick={() => setModelLoadError(null)}
            className="p-1 hover:bg-rose-700 rounded-lg cursor-pointer ml-auto"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Add Pin Popup Modal over Canvas */}
      {isAddingPin && tempPinPos && (
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-5 w-full max-w-sm animate-in fade-in zoom-in duration-200">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className={`w-5 h-5 ${readOnly ? 'text-blue-600' : 'text-red-500'}`} />
              <h3 className="text-sm font-bold text-slate-900">3D 피드백 핀 추가</h3>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              선택한 보철물 부위에 남길 의견을 적어주세요. 핀은 3D 공간 상에 고정됩니다.
            </p>
            <div className="mb-4">
              <textarea
                value={newPinNote}
                onChange={(e) => setNewPinNote(e.target.value)}
                placeholder="예: 마진 부분이 다소 얇아 보입니다. 보강해 주세요."
                className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-24"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsAddingPin(false);
                  setTempPinPos(null);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSavePin}
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                의견 저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification for Angle flight */}
      {showAngleRestoredToast && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom duration-300 z-50">
          <Check className="w-4 h-4" />
          <span>저장된 커스텀 뷰 각도로 이동했습니다.</span>
        </div>
      )}
    </div>
  );
}
