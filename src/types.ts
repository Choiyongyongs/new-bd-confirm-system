export type ConfirmStatus = '확인 전' | '확인 완료' | '수정 완료';
export type ConfirmRequestType = '원장님 확인부탁드려요.' | '담당기공사님 확인부탁드려요.' | '담당기공사 확인부탁드려요.';

export function formatStlUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:')
  ) {
    return trimmed;
  }
  const clean = trimmed.replace(/^\/+/, '');
  if (clean.startsWith('uploads/') || clean.startsWith('models/') || clean.startsWith('assets/')) {
    return `/${clean}`;
  }
  return `/uploads/${clean}`;
}

// Helper to detect 3D file format extension (.stl, .ply, .obj) robustly across renames
export function getModelExtension(
  url?: string | null,
  name?: string | null,
  format?: 'stl' | 'ply' | 'obj' | null,
  originalName?: string | null
): 'stl' | 'ply' | 'obj' {
  if (format === 'ply' || format === 'obj' || format === 'stl') {
    return format;
  }

  if (originalName) {
    const orig = originalName.toLowerCase().split('?')[0].split('#')[0];
    if (orig.endsWith('.ply') || orig.includes('.ply')) return 'ply';
    if (orig.endsWith('.obj') || orig.includes('.obj')) return 'obj';
    if (orig.endsWith('.stl') || orig.includes('.stl')) return 'stl';
  }

  if (name) {
    const nameStr = name.toLowerCase().split('?')[0].split('#')[0];
    if (nameStr.endsWith('.ply')) return 'ply';
    if (nameStr.endsWith('.obj')) return 'obj';
    if (nameStr.endsWith('.stl')) return 'stl';
    if (nameStr.includes('.ply')) return 'ply';
    if (nameStr.includes('.obj')) return 'obj';
  }

  if (url) {
    const cleanUrl = url.toLowerCase().split('?')[0].split('#')[0];
    let decodedUrl = cleanUrl;
    try {
      decodedUrl = decodeURIComponent(cleanUrl);
    } catch (_) {}

    if (decodedUrl.endsWith('.ply') || decodedUrl.includes('.ply')) return 'ply';
    if (decodedUrl.endsWith('.obj') || decodedUrl.includes('.obj')) return 'obj';
    if (decodedUrl.endsWith('.stl') || decodedUrl.includes('.stl')) return 'stl';
  }

  return 'stl';
}

export type PinCreator = '기공사' | '치과의사' | '작성자' | '답변자' | '원장님';

export interface CasePin {
  id: string;
  position: [number, number, number];
  normal?: [number, number, number];
  note: string;
  creator: PinCreator;
  createdAt: string;
}

export interface CameraState {
  id?: string;
  name?: string;
  position: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
}


export interface PresetColor {
  name: string;
  value: string;
}

export const PRESET_COLORS: PresetColor[] = [
  { name: '회색', value: '#8c9ba5' },
  { name: '아이보리', value: '#ded5c2' },
  { name: '노랑', value: '#eab308' },
  { name: '빨강', value: '#ee91a5' },
  { name: '초록', value: '#10b981' },
  { name: '연파랑', value: '#38bdf8' }
];

export const DEFAULT_STL_COLOR = '#8c9ba5';

export interface StlItem {
  id?: string;
  name: string;
  originalName?: string;
  format?: 'stl' | 'ply' | 'obj';
  colorMode?: 'color' | 'mono'; // 'color' for natural scan colors, 'mono' for monochrome/stone gray
  color?: string;
  url: string;
  visible?: boolean;
  opacity?: number;
}

export interface DentalCase {
  id: string;
  chartNumber: string;
  patientName: string;
  dentistName: string; // e.g., '김원장님', '이원장님'
  technicianName: string;
  requestType?: ConfirmRequestType | string;
  summary: string;
  description: string;
  status: ConfirmStatus;
  stlFilePath: string | null; // Null if using generated model
  stlFilePaths?: string[]; // Multiple STL file paths
  stlItems?: StlItem[]; // Detailed STL file list with custom names and colors
  images: string[]; // List of file paths or URLs
  pins: CasePin[];
  cameraState: CameraState | null;
  cameraStates?: CameraState[]; // Multiple saved camera angles
  dentistFeedback: string;
  createdAt: string;
  confirmedAt: string | null;
}
