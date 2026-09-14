import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import cron from 'node-cron';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Load environmental variables
dotenv.config();

// ----------------------------------------------------
// Supabase Client Setup & Helpers (Primary Cloud Storage & Database)
// ----------------------------------------------------
let supabaseClient: SupabaseClient | null = null;

function isSupabaseConfigured(): boolean {
  if (process.env.USE_LOCAL_ONLY === 'true') return false;
  if (process.env.USE_SUPABASE === 'false') return false;

  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();

  return Boolean(
    url &&
    url.startsWith('http') &&
    !url.includes('MY_SUPABASE') &&
    key &&
    key.length > 10 &&
    !key.includes('MY_SUPABASE')
  );
}

function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL!.trim();
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)!.trim();
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false }
    });
  }
  return supabaseClient;
}

// ----------------------------------------------------
// Local PC NAS Storage & Database Setup (Fallback / Cache)
// ----------------------------------------------------
const NAS_DIR = path.join(process.cwd(), 'nas_storage');
const UPLOADS_DIR = path.join(NAS_DIR, 'uploads');
const DB_FILE = path.join(NAS_DIR, 'database.json');
const SETTINGS_FILE = path.join(NAS_DIR, 'settings.json');
const NOTICES_FILE = path.join(NAS_DIR, 'notices.json');
const DENTISTS_FILE = path.join(NAS_DIR, 'dentists.json');
const TECHNICIANS_FILE = path.join(NAS_DIR, 'technicians.json');

// Ensure directories exist
if (!fs.existsSync(NAS_DIR)) {
  fs.mkdirSync(NAS_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Database Interfaces
interface CasePin {
  id: string;
  position: [number, number, number];
  normal?: [number, number, number];
  note: string;
  creator: '기공사' | '치과의사' | '작성자' | '답변자' | '원장님';
  createdAt: string;
}

interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
}

const DEFAULT_STL_COLOR = '#8c9ba5';

interface StlItem {
  id?: string;
  name: string;
  originalName?: string;
  format?: 'stl' | 'ply' | 'obj';
  colorMode?: 'color' | 'mono';
  color?: string;
  url: string;
  visible?: boolean;
  opacity?: number;
}

interface DentalCase {
  id: string;
  chartNumber: string;
  patientName: string;
  dentistName: string;
  technicianName: string;
  requestType?: string;
  summary: string;
  description: string;
  status: '확인 전' | '확인 완료' | '수정 완료';
  stlFilePath: string | null;
  stlFilePaths?: string[];
  stlItems?: StlItem[];
  images: string[];
  pins: CasePin[];
  cameraState: CameraState | null;
  cameraStates?: CameraState[];
  dentistFeedback: string;
  createdAt: string;
  confirmedAt: string | null;
}

interface Database {
  cases: DentalCase[];
}

// Helpers for Local JSON Database (Safe Read/Write)
function readLocalDB(): Database {
  if (!fs.existsSync(DB_FILE)) {
    return { cases: [] };
  }
  try {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return { cases: Array.isArray(parsed?.cases) ? parsed.cases : [] };
  } catch (err) {
    console.error('[LOCAL-DB] Failed to read local database cache:', err);
    return { cases: [] };
  }
}

function writeLocalDB(data: Database) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[LOCAL-DB] Failed to write local database cache:', err);
  }
}

function readLocalSettings(): Record<string, string> {
  if (!fs.existsSync(SETTINGS_FILE)) return { access_password: '1234' };
  try {
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return { access_password: '1234' };
  }
}

function writeLocalSettings(settings: Record<string, string>) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {
    console.error('[LOCAL-SETTINGS] Failed to write settings cache:', e);
  }
}

function readLocalNotices(): { id: string; content: string; author: string; createdAt: string }[] {
  if (!fs.existsSync(NOTICES_FILE)) return [];
  try {
    const data = fs.readFileSync(NOTICES_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function writeLocalNotices(notices: { id: string; content: string; author: string; createdAt: string }[]) {
  try {
    fs.writeFileSync(NOTICES_FILE, JSON.stringify(notices, null, 2), 'utf-8');
  } catch (e) {
    console.error('[LOCAL-NOTICES] Failed to write notices cache:', e);
  }
}

const DEFAULT_INITIAL_DENTISTS = [
  { id: 'dentist_core_1', name: '김민수원장님', isCore: true, displayOrder: 1 },
  { id: 'dentist_core_2', name: '현정민원장님', isCore: true, displayOrder: 2 },
  { id: 'dentist_core_3', name: '문석준원장님', isCore: true, displayOrder: 3 },
  { id: 'dentist_rem_1', name: '최종훈원장님', isCore: false, displayOrder: 4 },
  { id: 'dentist_rem_2', name: '박수빈원장님', isCore: false, displayOrder: 5 },
  { id: 'dentist_rem_3', name: '박상현원장님', isCore: false, displayOrder: 6 },
  { id: 'dentist_rem_4', name: '김민규원장님', isCore: false, displayOrder: 7 },
  { id: 'dentist_rem_5', name: '임지원원장님', isCore: false, displayOrder: 8 },
  { id: 'dentist_rem_6', name: '이승엽원장님', isCore: false, displayOrder: 9 }
];

function readLocalDentists(): { id: string; name: string; isCore: boolean; displayOrder: number }[] {
  if (!fs.existsSync(DENTISTS_FILE)) {
    writeLocalDentists(DEFAULT_INITIAL_DENTISTS);
    return DEFAULT_INITIAL_DENTISTS;
  }
  try {
    const data = fs.readFileSync(DENTISTS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    writeLocalDentists(DEFAULT_INITIAL_DENTISTS);
    return DEFAULT_INITIAL_DENTISTS;
  } catch (e) {
    return DEFAULT_INITIAL_DENTISTS;
  }
}

function writeLocalDentists(dentists: { id: string; name: string; isCore: boolean; displayOrder: number }[]) {
  try {
    fs.writeFileSync(DENTISTS_FILE, JSON.stringify(dentists, null, 2), 'utf-8');
  } catch (e) {
    console.error('[LOCAL-DENTISTS] Failed to write dentists cache:', e);
  }
}

const DEFAULT_INITIAL_TECHNICIANS = [
  { id: 'tech_1', name: '최용희', displayOrder: 1 },
  { id: 'tech_2', name: '김찬유', displayOrder: 2 },
  { id: 'tech_3', name: '양소영', displayOrder: 3 },
  { id: 'tech_4', name: '박세진', displayOrder: 4 },
  { id: 'tech_5', name: '정서영', displayOrder: 5 },
  { id: 'tech_6', name: '최이슬', displayOrder: 6 }
];

function readLocalTechnicians(): { id: string; name: string; displayOrder: number }[] {
  if (!fs.existsSync(TECHNICIANS_FILE)) {
    writeLocalTechnicians(DEFAULT_INITIAL_TECHNICIANS);
    return DEFAULT_INITIAL_TECHNICIANS;
  }
  try {
    const data = fs.readFileSync(TECHNICIANS_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    writeLocalTechnicians(DEFAULT_INITIAL_TECHNICIANS);
    return DEFAULT_INITIAL_TECHNICIANS;
  } catch (e) {
    return DEFAULT_INITIAL_TECHNICIANS;
  }
}

function writeLocalTechnicians(technicians: { id: string; name: string; displayOrder: number }[]) {
  try {
    fs.writeFileSync(TECHNICIANS_FILE, JSON.stringify(technicians, null, 2), 'utf-8');
  } catch (e) {
    console.error('[LOCAL-TECHNICIANS] Failed to write technicians cache:', e);
  }
}

// ----------------------------------------------------
// Supabase Mapping & Query Functions
// ----------------------------------------------------
function mapSupabaseToDentalCase(row: any): DentalCase {
  let rawDesc = row.description || '';
  let requestType = (row.request_type || row.confirm_request_type || '').trim();

  // Extract encoded requestType tag if stored in description fallback
  const reqMatch = rawDesc.match(/<!--REQ_TYPE:(.*?)-->/);
  if (reqMatch) {
    if (!requestType) {
      requestType = reqMatch[1].trim();
    }
    rawDesc = rawDesc.replace(/<!--REQ_TYPE:.*?-->\r?\n?/, '').trim();
  }

  if (!requestType) {
    requestType = '원장님 확인부탁드려요.';
  }

  return {
    id: String(row.id),
    chartNumber: row.chart_number || '',
    patientName: row.patient_name || '',
    dentistName: row.dentist_name || '',
    technicianName: row.technician_name || '',
    summary: row.summary || '',
    description: rawDesc,
    requestType: requestType,
    status: (row.status === '확인 완료' ? '확인 완료' : (row.status === '수정 완료' ? '수정 완료' : '확인 전')),
    stlFilePath: row.stl_file_path || null,
    stlFilePaths: Array.isArray(row.stl_file_paths)
      ? row.stl_file_paths
      : (typeof row.stl_file_paths === 'string'
        ? JSON.parse(row.stl_file_paths)
        : (row.stl_file_path ? [row.stl_file_path] : [])),
    stlItems: row.stl_items
      ? (typeof row.stl_items === 'string' ? JSON.parse(row.stl_items) : row.stl_items)
      : undefined,
    images: Array.isArray(row.images)
      ? row.images
      : (typeof row.images === 'string' ? JSON.parse(row.images) : []),
    pins: Array.isArray(row.pins)
      ? row.pins
      : (typeof row.pins === 'string' ? JSON.parse(row.pins) : []),
    cameraState: row.camera_state
      ? (typeof row.camera_state === 'string' ? JSON.parse(row.camera_state) : row.camera_state)
      : null,
    cameraStates: row.camera_states
      ? (typeof row.camera_states === 'string' ? JSON.parse(row.camera_states) : row.camera_states)
      : [],
    dentistFeedback: row.dentist_feedback || '',
    createdAt: row.created_at || new Date().toISOString(),
    confirmedAt: row.confirmed_at || null
  };
}

function mapDentalCaseToSupabase(dentalCase: DentalCase) {
  const reqType = dentalCase.requestType || '원장님 확인부탁드려요.';
  const cleanDesc = (dentalCase.description || '').replace(/<!--REQ_TYPE:.*?-->\r?\n?/, '').trim();
  const descWithReqType = `<!--REQ_TYPE:${reqType}-->\n${cleanDesc}`;

  return {
    id: String(dentalCase.id),
    chart_number: dentalCase.chartNumber,
    patient_name: dentalCase.patientName,
    dentist_name: dentalCase.dentistName,
    technician_name: dentalCase.technicianName,
    summary: dentalCase.summary,
    description: descWithReqType,
    request_type: reqType,
    status: dentalCase.status,
    stl_file_path: dentalCase.stlFilePath,
    stl_file_paths: dentalCase.stlFilePaths || (dentalCase.stlFilePath ? [dentalCase.stlFilePath] : []),
    stl_items: dentalCase.stlItems || [],
    images: dentalCase.images || [],
    pins: dentalCase.pins || [],
    camera_state: dentalCase.cameraState,
    camera_states: dentalCase.cameraStates || [],
    dentist_feedback: dentalCase.dentistFeedback || '',
    created_at: dentalCase.createdAt,
    confirmed_at: dentalCase.confirmedAt
  };
}

async function getSupabaseCases(): Promise<DentalCase[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[SUPABASE] Error fetching cases:', error.message || error);
    throw error;
  }
  return (data || []).map(mapSupabaseToDentalCase);
}

function findMissingColumnInError(error: any, payload: Record<string, any>): string | null {
  if (!error) return null;
  const msg = `${error.message || ''} ${error.details || ''} ${error.hint || ''}`.toLowerCase();
  for (const key of Object.keys(payload)) {
    const kLower = key.toLowerCase();
    if (
      msg.includes(kLower) ||
      msg.includes(`'${kLower}'`) ||
      msg.includes(`"${kLower}"`) ||
      msg.includes(`column ${kLower}`) ||
      msg.includes(`field ${kLower}`)
    ) {
      return key;
    }
  }
  return null;
}

async function appendSupabaseCase(dentalCase: DentalCase): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const currentPayload: Record<string, any> = mapDentalCaseToSupabase(dentalCase);

  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabase.from('cases').insert([currentPayload]);
    if (!error) {
      console.log(`[SUPABASE] Successfully inserted case ID: ${dentalCase.id}`);
      return;
    }

    console.error(`[SUPABASE INSERT ERROR] Attempt ${attempt + 1}:`, error.message || error);

    const missingCol = findMissingColumnInError(error, currentPayload);
    if (missingCol && currentPayload[missingCol] !== undefined) {
      console.warn(`[SUPABASE] Column '${missingCol}' missing/invalid in table. Retrying insert without '${missingCol}'...`);
      delete currentPayload[missingCol];
      continue;
    }

    const optionalCols = ['request_type', 'stl_items', 'camera_states', 'stl_file_paths', 'pins', 'camera_state', 'images'];
    let removed = false;
    for (const col of optionalCols) {
      if (currentPayload[col] !== undefined) {
        console.warn(`[SUPABASE] Retrying insert without optional column '${col}'...`);
        delete currentPayload[col];
        removed = true;
        break;
      }
    }
    if (removed) continue;

    throw error;
  }
}

async function updateSupabaseCase(dentalCase: DentalCase): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const currentPayload: Record<string, any> = mapDentalCaseToSupabase(dentalCase);

  for (let attempt = 0; attempt < 8; attempt++) {
    const { error } = await supabase.from('cases').update(currentPayload).eq('id', dentalCase.id);
    if (!error) {
      console.log(`[SUPABASE] Successfully updated case ID: ${dentalCase.id}`);
      return;
    }

    console.error(`[SUPABASE UPDATE ERROR] Attempt ${attempt + 1}:`, error.message || error);

    const missingCol = findMissingColumnInError(error, currentPayload);
    if (missingCol && currentPayload[missingCol] !== undefined) {
      console.warn(`[SUPABASE] Column '${missingCol}' missing/invalid in table. Retrying update without '${missingCol}'...`);
      delete currentPayload[missingCol];
      continue;
    }

    const optionalCols = ['request_type', 'stl_items', 'camera_states', 'stl_file_paths', 'pins', 'camera_state', 'images'];
    let removed = false;
    for (const col of optionalCols) {
      if (currentPayload[col] !== undefined) {
        console.warn(`[SUPABASE] Retrying update without optional column '${col}'...`);
        delete currentPayload[col];
        removed = true;
        break;
      }
    }
    if (removed) continue;

    throw error;
  }
}

async function deleteSupabaseCaseRow(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.from('cases').delete().eq('id', id);
  if (error) {
    console.error('[SUPABASE] Error deleting case row:', error.message || error);
    throw error;
  }
  console.log(`[SUPABASE] Successfully deleted case row: ${id}`);
}

// ----------------------------------------------------
// Safe Hydration on Server Boot (Supabase -> Local Cache)
// ----------------------------------------------------
async function hydrateFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) {
    console.log('📂 [LOCAL-PC MODE] Supabase is not configured. Using local file storage only.');
    return;
  }

  const supabase = getSupabaseClient();
  if (!supabase) return;

  console.log('🔄 [HYDRATION] Starting complete database synchronization from Supabase...');

  try {
    // 1. Hydrate Cases
    const supaCases = await getSupabaseCases();
    writeLocalDB({ cases: supaCases });
    console.log(`✅ [HYDRATION] Successfully restored ${supaCases.length} patient cases from Supabase DB to local cache.`);

    // 2. Hydrate Notices
    try {
      const { data: noticesData } = await supabase
        .from('notices')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (noticesData && noticesData.length > 0) {
        const notices = noticesData.map((row: any) => ({
          id: row.id,
          content: row.content || '',
          author: row.author || '원장단',
          createdAt: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        }));
        writeLocalNotices(notices);
        console.log(`✅ [HYDRATION] Successfully restored ${notices.length} notices from Supabase.`);
      }
    } catch (e: any) {
      console.warn('[HYDRATION] Notices hydration warning:', e?.message || e);
    }

    // 3. Hydrate Dentists
    try {
      const { data: dentistsData } = await supabase
        .from('dentists')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (dentistsData && dentistsData.length > 0) {
        const dentists = dentistsData.map((row: any) => ({
          id: row.id,
          name: row.name,
          isCore: Boolean(row.is_core),
          displayOrder: Number(row.display_order || 0)
        }));
        writeLocalDentists(dentists);
        console.log(`✅ [HYDRATION] Successfully restored ${dentists.length} dentists from Supabase.`);
      }
    } catch (e: any) {
      console.warn('[HYDRATION] Dentists hydration warning:', e?.message || e);
    }

    // 4. Hydrate Settings
    try {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('*');
      if (settingsData && settingsData.length > 0) {
        const settingsMap: Record<string, string> = {};
        settingsData.forEach((row: any) => {
          if (row.key) settingsMap[row.key] = row.value || '';
        });
        if (Object.keys(settingsMap).length > 0) {
          writeLocalSettings(settingsMap);
          console.log(`✅ [HYDRATION] Successfully restored system settings from Supabase.`);
        }
      }
    } catch (e: any) {
      console.warn('[HYDRATION] Settings hydration warning:', e?.message || e);
    }

    console.log('✨ [HYDRATION COMPLETED] All data is safely loaded and verified!');
  } catch (err: any) {
    console.error('❌ [HYDRATION ERROR] Failed to fetch initial data from Supabase:', err?.message || err);
    console.warn('[HYDRATION] Preserving existing local cache as fallback.');
  }
}

// ----------------------------------------------------
// Filename & Storage Helper Utilities
// ----------------------------------------------------
function getFormattedTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function sanitizeName(str: string): string {
  if (!str) return 'unknown';
  return str.trim().replace(/[/\\?%*:|"<>]/g, '_');
}

function fixMulterFilename(filename: string): string {
  if (!filename) return 'unnamed.stl';
  try {
    const converted = Buffer.from(filename, 'latin1').toString('utf8');
    if (converted && !converted.includes('\uFFFD')) {
      return converted;
    }
  } catch (e) { }
  return filename;
}

function getCleanFilename(rawFilename: string): string {
  const fixed = fixMulterFilename(rawFilename);
  const ext = path.extname(fixed) || '.stl';
  const nameWithoutExt = path.basename(fixed, ext);
  const safeName = nameWithoutExt.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'model';
  const safeExt = ext.replace(/[/\\?%*:|"<>]/g, '') || '.stl';
  return `${safeName}${safeExt}`;
}

function createCaseFolderName(chartNumber: string, patientName?: string, dateObj: Date = new Date()): string {
  const cNum = sanitizeName(chartNumber);
  const ts = getFormattedTimestamp(dateObj);
  return `${cNum}_${ts}`;
}

function saveLocalUploadedFile(file: Express.Multer.File, folderName: string): string {
  const caseUploadsDir = path.join(UPLOADS_DIR, folderName);
  if (!fs.existsSync(caseUploadsDir)) {
    fs.mkdirSync(caseUploadsDir, { recursive: true });
  }

  const cleanName = getCleanFilename(file.originalname);
  const ext = path.extname(cleanName) || '.stl';
  const base = path.basename(cleanName, ext);
  let finalFileName = `${base}${ext}`;
  let targetPath = path.join(caseUploadsDir, finalFileName);

  let counter = 1;
  while (fs.existsSync(targetPath) && targetPath !== file.path) {
    finalFileName = `${base}_${counter}${ext}`;
    targetPath = path.join(caseUploadsDir, finalFileName);
    counter++;
  }

  if (file.path !== targetPath) {
    try {
      fs.copyFileSync(file.path, targetPath);
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (e) {
      console.error('Error saving local uploaded file:', e);
    }
  }

  return `/uploads/${folderName}/${finalFileName}`;
}

let isBucketEnsured = false;
async function ensureDentalBucket(supabase: SupabaseClient) {
  if (isBucketEnsured) return;
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = (buckets || []).some((b: any) => b.name === 'dental-files' || b.id === 'dental-files');
    if (!exists) {
      await supabase.storage.createBucket('dental-files', {
        public: true,
        fileSizeLimit: 104857600
      });
      console.log('[SUPABASE-STORAGE] Successfully initialized public bucket: dental-files');
    }
    isBucketEnsured = true;
  } catch (e: any) {
    console.warn('[SUPABASE-STORAGE] Bucket check notice:', e?.message || e);
  }
}

async function uploadToSupabaseStorage(folderName: string, fileName: string, filePath: string, mimeType: string): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client is not initialized');

  await ensureDentalBucket(supabase);

  const fileBuffer = fs.readFileSync(filePath);

  const cleanOriginalName = fixMulterFilename(fileName);
  const rawExt = path.extname(cleanOriginalName) || '';
  const cleanExt = rawExt.toLowerCase().replace(/[^a-z0-9.]/g, '') || (mimeType.includes('image') ? '.png' : '.stl');
  const safeExt = cleanExt.startsWith('.') ? cleanExt : `.${cleanExt}`;

  const safeFolder = folderName.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'general';
  const uniqueKey = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${safeExt}`;
  const storagePath = `cases/${safeFolder}/${uniqueKey}`;

  const { error } = await supabase.storage
    .from('dental-files')
    .upload(storagePath, fileBuffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: true
    });

  if (error) {
    console.error('[SUPABASE-STORAGE] Storage upload error:', error);
    throw error;
  }

  const { data: publicData } = supabase.storage
    .from('dental-files')
    .getPublicUrl(storagePath);

  return publicData.publicUrl;
}

async function deleteSupabaseStorageFile(publicUrl: string) {
  const supabase = getSupabaseClient();
  if (!supabase || !publicUrl) return;

  try {
    const urlParts = publicUrl.split('/dental-files/');
    if (urlParts.length > 1) {
      const storagePath = decodeURIComponent(urlParts[1]);
      await supabase.storage.from('dental-files').remove([storagePath]);
      console.log(`[SUPABASE-STORAGE] Removed file: ${storagePath}`);
    }
  } catch (e: any) {
    console.error('[SUPABASE-STORAGE] Error removing file:', e.message);
  }
}

// ----------------------------------------------------
// Setup multer for uploading STL & Images
// ----------------------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const cleanName = getCleanFilename(file.originalname);
    const ext = path.extname(cleanName) || '.stl';
    const base = path.basename(cleanName, ext).replace(/[/\\?%*:|"<>]/g, '_');
    cb(null, `${base}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for 3D models
    fieldSize: 100 * 1024 * 1024, // 100MB limit for text form fields
    fields: 100,
    files: 100
  }
});

const uploadFields = upload.fields([
  { name: 'stlFile', maxCount: 50 },
  { name: 'stlFiles', maxCount: 50 },
  { name: 'imageFiles', maxCount: 50 }
]);

const handleUpload = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  uploadFields(req, res, (err) => {
    if (err) {
      console.error('[MULTER UPLOAD ERROR]:', err);
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          error: '파일 업로드 실패 (Multer 오류)',
          details: `${err.message} (코드: ${err.code})`
        });
      }
      return res.status(500).json({
        error: '파일 업로드 처리 중 서버 오류가 발생했습니다.',
        details: err.message || String(err)
      });
    }
    next();
  });
};

// ----------------------------------------------------
// Automatic 30-day cleanup (Local Storage Cache Only)
// ----------------------------------------------------
async function performAutoCleanup() {
  console.log('[AUTO-CLEANUP] Starting daily scheduled 30-day lifecycle cleanup check...');
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const db = readLocalDB();
    if (!db.cases || db.cases.length === 0) {
      console.log('[AUTO-CLEANUP] Local DB cache is empty. Skipping cleanup.');
      return;
    }

    let deletedCount = 0;
    const remainingCases: DentalCase[] = [];

    db.cases.forEach((dentalCase) => {
      const createdAtDate = new Date(dentalCase.createdAt);
      if (createdAtDate < thirtyDaysAgo) {
        console.log(`[AUTO-CLEANUP] Local Case ${dentalCase.id} (Patient: ${dentalCase.patientName}) is older than 30 days. Deleting local cache assets...`);

        // Delete local STL file if stored locally
        if (dentalCase.stlFilePath && dentalCase.stlFilePath.startsWith('/uploads/')) {
          const fullStlPath = path.join(NAS_DIR, dentalCase.stlFilePath);
          if (fs.existsSync(fullStlPath)) {
            try {
              fs.unlinkSync(fullStlPath);
              console.log(`Deleted local file: ${fullStlPath}`);
            } catch (e: any) {
              console.error(e);
            }
          }
        }

        // Delete local images if stored locally
        dentalCase.images.forEach((imgUrl) => {
          if (imgUrl.startsWith('/uploads/')) {
            const relativePath = imgUrl.replace('/uploads/', '');
            const fullImgPath = path.join(UPLOADS_DIR, relativePath);
            if (fs.existsSync(fullImgPath)) {
              try {
                fs.unlinkSync(fullImgPath);
                console.log(`Deleted local image: ${fullImgPath}`);
              } catch (e: any) {
                console.error(e);
              }
            }
          }
        });

        deletedCount++;
      } else {
        remainingCases.push(dentalCase);
      }
    });

    if (deletedCount > 0) {
      db.cases = remainingCases;
      writeLocalDB(db);
      console.log(`[AUTO-CLEANUP] Local cache cleanup completed. ${deletedCount} local cases cleaned.`);
    } else {
      console.log('[AUTO-CLEANUP] Local cache cleanup completed. No cases matched.');
    }
  } catch (err: any) {
    console.error('[AUTO-CLEANUP] Error during local automatic cleanup:', err);
  }
}

// ----------------------------------------------------
// Express app server setup
// ----------------------------------------------------
async function startServer() {
  // 1. First & Foremost: Hydrate all data from Supabase DB to local memory & cache
  await hydrateFromSupabase();

  // 2. Schedule cron job to run every day at 3:00 AM (0 3 * * *)
  cron.schedule('0 3 * * *', () => {
    performAutoCleanup();
  });

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  // Serve static files from local uploads path
  app.use('/uploads', express.static(UPLOADS_DIR));

  // ----------------------------------------------------
  // Helper: Find Case by ID (Supabase Primary, Local Fallback)
  // ----------------------------------------------------
  async function findCaseById(reqId: string): Promise<DentalCase | undefined> {
    const targetId = String(reqId || '').trim();
    if (!targetId) return undefined;

    let decodedId = targetId;
    try {
      decodedId = decodeURIComponent(targetId).trim();
    } catch (_) { }

    const clean = (str: string) => str.toLowerCase().trim();
    const normalize = (str: string) => str.replace(/^(case[-_]*)+/gi, '').toLowerCase().trim();

    const targetClean = clean(decodedId);
    const targetNorm = normalize(decodedId);

    const isMatch = (idVal: any) => {
      if (idVal == null) return false;
      const sId = String(idVal).trim();
      const sClean = clean(sId);
      const sNorm = normalize(sId);

      if (sClean === targetClean) return true;
      if (sClean === clean(targetId)) return true;
      if (sNorm && targetNorm && sNorm === targetNorm) return true;
      return false;
    };

    // 1. Supabase Query First
    if (isSupabaseConfigured()) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const idsToTry = [targetId, decodedId].filter(Boolean);
          const uniqueIds = [...new Set(idsToTry)];

          const { data: directRows, error } = await supabase
            .from('cases')
            .select('*')
            .in('id', uniqueIds)
            .limit(1);

          if (!error && directRows && directRows.length > 0) {
            return mapSupabaseToDentalCase(directRows[0]);
          }

          // Fallback scan across all Supabase cases for normalized ID
          const casesList = await getSupabaseCases();
          const found = casesList.find((c) => isMatch(c.id));
          if (found) return found;
        } catch (supaErr) {
          console.error('[SUPABASE ERROR] Failed fetching case by ID from Supabase:', supaErr);
        }
      }
    }

    // 2. Local Cache Fallback
    const db = readLocalDB();
    return db.cases.find((c) => isMatch(c.id));
  }

  // ----------------------------------------------------
  // Helper: Save or Update Case (Supabase Primary & Local Backup)
  // ----------------------------------------------------
  async function saveOrUpdateCase(updatedCase: DentalCase): Promise<void> {
    const targetId = String(updatedCase.id).trim();

    // 1. Update Supabase first
    if (isSupabaseConfigured()) {
      try {
        await updateSupabaseCase(updatedCase);
      } catch (supaErr: any) {
        console.error('[SUPABASE ERROR] Failed to update case in Supabase:', supaErr?.message || supaErr);
      }
    }

    // 2. Synchronize local cache
    const localDb = readLocalDB();
    const idx = localDb.cases.findIndex((c) => String(c.id).trim() === targetId);
    if (idx !== -1) {
      localDb.cases[idx] = updatedCase;
    } else {
      localDb.cases.unshift(updatedCase);
    }
    writeLocalDB(localDb);
  }

  // ----------------------------------------------------
  // API Endpoints
  // ----------------------------------------------------

  // GET /api/config - Get integration status
  app.get('/api/config', (req, res) => {
    res.json({
      isSupabaseActive: isSupabaseConfigured(),
      supabaseUrl: process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.substring(0, 15)}...` : null
    });
  });

  // ----------------------------------------------------
  // Password API
  // ----------------------------------------------------
  app.get('/api/password', async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data, error } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'access_password')
            .single();

          if (!error && data) {
            return res.json({ password: data.value });
          }
          if (error && (error.code === 'PGRST116' || error.message?.includes('no rows'))) {
            await supabase.from('settings').upsert({ key: 'access_password', value: '1234' });
            return res.json({ password: '1234' });
          }
          console.error('[SETTINGS] Supabase fetch error:', error);
        }
      }
      const settings = readLocalSettings();
      res.json({ password: settings.access_password || '1234' });
    } catch (err: any) {
      console.error('[SETTINGS] Error fetching password:', err);
      const settings = readLocalSettings();
      res.json({ password: settings.access_password || '1234' });
    }
  });

  app.put('/api/password', async (req, res) => {
    try {
      const { password } = req.body;
      if (!password || !password.trim()) {
        return res.status(400).json({ error: '비밀번호를 입력해 주세요.' });
      }

      const newPassword = password.trim();

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { error } = await supabase
            .from('settings')
            .upsert({ key: 'access_password', value: newPassword });
          if (error) {
            console.error('[SETTINGS] Supabase upsert error:', error);
          }
        }
      }

      const settings = readLocalSettings();
      settings.access_password = newPassword;
      writeLocalSettings(settings);

      res.json({ success: true, password: newPassword });
    } catch (err: any) {
      console.error('[SETTINGS] Error updating password:', err);
      res.status(500).json({ error: '비밀번호 변경 중 오류가 발생했습니다.' });
    }
  });

  // ----------------------------------------------------
  // Notices API
  // ----------------------------------------------------
  app.get('/api/notices', async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data, error } = await supabase
            .from('notices')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(10);
          if (error) throw error;
          const notices = (data || []).map((row: any) => ({
            id: row.id,
            content: row.content || '',
            author: row.author || '원장단',
            createdAt: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
          }));
          writeLocalNotices(notices);
          return res.json(notices);
        }
      }
      const local = readLocalNotices().slice(0, 10);
      res.json(local);
    } catch (err: any) {
      console.error('[NOTICES] Error fetching notices:', err);
      const local = readLocalNotices().slice(0, 10);
      res.json(local);
    }
  });

  app.post('/api/notices', async (req, res) => {
    try {
      const { content, author } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ error: '공지사항 내용을 입력해 주세요.' });
      }

      const newNotice = {
        id: `notice_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        content: content.trim(),
        author: (author || '원장단').trim(),
        createdAt: new Date().toISOString().split('T')[0]
      };

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { error } = await supabase.from('notices').insert([{
            id: newNotice.id,
            content: newNotice.content,
            author: newNotice.author,
            created_at: new Date().toISOString()
          }]);
          if (error) {
            console.error('[NOTICES] Supabase insert error:', error);
          }

          const { data: allNotices } = await supabase
            .from('notices')
            .select('id')
            .order('created_at', { ascending: false });
          if (allNotices && allNotices.length > 10) {
            const idsToDelete = allNotices.slice(10).map((n: any) => n.id);
            await supabase.from('notices').delete().in('id', idsToDelete);
          }
        }
      }

      const local = readLocalNotices();
      local.unshift(newNotice);
      writeLocalNotices(local.slice(0, 10));

      res.status(201).json(newNotice);
    } catch (err: any) {
      console.error('[NOTICES] Error creating notice:', err);
      res.status(500).json({ error: '공지사항 등록 중 오류가 발생했습니다.' });
    }
  });

  app.put('/api/notices/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { content, author } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ error: '공지사항 내용을 입력해 주세요.' });
      }

      const updatedData = {
        content: content.trim(),
        author: (author || '원장단').trim(),
        created_at: new Date().toISOString()
      };

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { error } = await supabase.from('notices').update(updatedData).eq('id', id);
          if (error) {
            console.error('[NOTICES] Supabase update error:', error);
          }
        }
      }

      const local = readLocalNotices();
      const idx = local.findIndex(n => n.id === id);
      if (idx !== -1) {
        local[idx] = { ...local[idx], content: updatedData.content, author: updatedData.author, createdAt: new Date().toISOString().split('T')[0] };
        writeLocalNotices(local);
      }

      res.json({ id, ...updatedData, createdAt: new Date().toISOString().split('T')[0] });
    } catch (err: any) {
      console.error('[NOTICES] Error updating notice:', err);
      res.status(500).json({ error: '공지사항 수정 중 오류가 발생했습니다.' });
    }
  });

  app.delete('/api/notices/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { error } = await supabase.from('notices').delete().eq('id', id);
          if (error) {
            console.error('[NOTICES] Supabase delete error:', error);
          }
        }
      }

      const local = readLocalNotices();
      writeLocalNotices(local.filter(n => n.id !== id));

      res.json({ success: true });
    } catch (err: any) {
      console.error('[NOTICES] Error deleting notice:', err);
      res.status(500).json({ error: '공지사항 삭제 중 오류가 발생했습니다.' });
    }
  });

  // ----------------------------------------------------
  // Dentists API
  // ----------------------------------------------------
  app.get('/api/dentists', async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { data, error } = await supabase
            .from('dentists')
            .select('*')
            .order('display_order', { ascending: true })
            .order('created_at', { ascending: true });

          if (!error && data && data.length > 0) {
            const mapped = data.map((row: any) => ({
              id: row.id,
              name: row.name,
              isCore: Boolean(row.is_core),
              displayOrder: Number(row.display_order || 0)
            }));
            writeLocalDentists(mapped);
            return res.json(mapped);
          }

          if (!error && (!data || data.length === 0)) {
            const seedRows = DEFAULT_INITIAL_DENTISTS.map(d => ({
              id: d.id,
              name: d.name,
              is_core: d.isCore,
              display_order: d.displayOrder
            }));
            await supabase.from('dentists').insert(seedRows);
            writeLocalDentists(DEFAULT_INITIAL_DENTISTS);
            return res.json(DEFAULT_INITIAL_DENTISTS);
          }
          console.error('[DENTISTS] Supabase fetch error:', error);
        }
      }

      const local = readLocalDentists();
      res.json(local);
    } catch (err: any) {
      console.error('[DENTISTS] Error fetching dentists:', err);
      const local = readLocalDentists();
      res.json(local);
    }
  });

  app.post('/api/dentists', async (req, res) => {
    try {
      let { name } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: '원장님 성함을 입력해 주세요.' });
      }

      let formattedName = name.trim();
      if (!formattedName.endsWith('원장님')) {
        formattedName += '원장님';
      }

      const local = readLocalDentists();
      const exists = local.some(d => d.name === formattedName);
      if (exists) {
        return res.json(local.find(d => d.name === formattedName));
      }

      const newDentist = {
        id: `dentist_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: formattedName,
        isCore: false,
        displayOrder: local.length + 1
      };

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { error } = await supabase.from('dentists').insert([{
            id: newDentist.id,
            name: newDentist.name,
            is_core: false,
            display_order: newDentist.displayOrder,
            created_at: new Date().toISOString()
          }]);
          if (error) {
            console.error('[DENTISTS] Supabase insert error:', error);
          }
        }
      }

      local.push(newDentist);
      writeLocalDentists(local);

      res.status(201).json(newDentist);
    } catch (err: any) {
      console.error('[DENTISTS] Error adding dentist:', err);
      res.status(500).json({ error: '원장님 등록 중 오류가 발생했습니다.' });
    }
  });

  app.delete('/api/dentists/:name', async (req, res) => {
    try {
      const rawName = req.params.name;
      const targetName = decodeURIComponent(rawName).trim();

      const immutable = ['김민수원장님', '현정민원장님', '문석준원장님'];
      if (immutable.includes(targetName)) {
        return res.status(400).json({ error: '기본 대표 원장님은 삭제할 수 없습니다.' });
      }

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          const { error } = await supabase
            .from('dentists')
            .delete()
            .eq('name', targetName);
          if (error) {
            console.error('[DENTISTS] Supabase delete error:', error);
          }
        }
      }

      const local = readLocalDentists();
      const filtered = local.filter(d => d.name !== targetName);
      writeLocalDentists(filtered);

      res.json({ success: true, removed: targetName });
    } catch (err: any) {
      console.error('[DENTISTS] Error deleting dentist:', err);
      res.status(500).json({ error: '원장님 삭제 중 오류가 발생했습니다.' });
    }
  });

  // ----------------------------------------------------
  // Hospital Technicians Endpoints (Supabase + Local Cache)
  // ----------------------------------------------------
  app.get('/api/technicians', async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          try {
            const { data, error } = await supabase
              .from('technicians')
              .select('*')
              .order('display_order', { ascending: true });
            if (!error && Array.isArray(data) && data.length > 0) {
              return res.json(data.map(d => ({
                id: d.id,
                name: d.name,
                displayOrder: d.display_order
              })));
            }
          } catch (supaErr) {
            // table might not exist yet, fallback to local
          }
        }
      }

      const local = readLocalTechnicians();
      res.json(local);
    } catch (err: any) {
      console.error('[TECHNICIANS] Error fetching technicians:', err);
      const local = readLocalTechnicians();
      res.json(local);
    }
  });

  app.post('/api/technicians', async (req, res) => {
    try {
      let { name } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: '기공사 성함을 입력해 주세요.' });
      }

      let formattedName = name.trim();
      const local = readLocalTechnicians();
      const exists = local.some(t => t.name === formattedName);
      if (exists) {
        return res.json(local.find(t => t.name === formattedName));
      }

      const newTech = {
        id: `tech_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: formattedName,
        displayOrder: local.length + 1
      };

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          try {
            await supabase.from('technicians').insert([{
              id: newTech.id,
              name: newTech.name,
              display_order: newTech.displayOrder,
              created_at: new Date().toISOString()
            }]);
          } catch (e) {
            // If table doesn't exist, ignore
          }
        }
      }

      local.push(newTech);
      writeLocalTechnicians(local);

      res.status(201).json(newTech);
    } catch (err: any) {
      console.error('[TECHNICIANS] Error adding technician:', err);
      res.status(500).json({ error: '기공사 등록 중 오류가 발생했습니다.' });
    }
  });

  app.delete('/api/technicians/:name', async (req, res) => {
    try {
      const rawName = req.params.name;
      const targetName = decodeURIComponent(rawName).trim();

      if (isSupabaseConfigured()) {
        const supabase = getSupabaseClient();
        if (supabase) {
          try {
            await supabase
              .from('technicians')
              .delete()
              .eq('name', targetName);
          } catch (e) {}
        }
      }

      const local = readLocalTechnicians();
      const filtered = local.filter(t => t.name !== targetName);
      writeLocalTechnicians(filtered);

      res.json({ success: true, removed: targetName });
    } catch (err: any) {
      console.error('[TECHNICIANS] Error deleting technician:', err);
      res.status(500).json({ error: '기공사 삭제 중 오류가 발생했습니다.' });
    }
  });

  // ----------------------------------------------------
  // File Upload Endpoints
  // ----------------------------------------------------
  const CHUNKS_TEMP_DIR = path.join(NAS_DIR, 'chunks_temp');
  if (!fs.existsSync(CHUNKS_TEMP_DIR)) {
    try { fs.mkdirSync(CHUNKS_TEMP_DIR, { recursive: true }); } catch (e) { }
  }

  app.post('/api/upload-file', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: '업로드할 파일이 없습니다.' });
      }

      const folderName = req.body.folderName || 'general';
      let publicUrl = '';

      if (isSupabaseConfigured()) {
        try {
          publicUrl = await uploadToSupabaseStorage(folderName, file.originalname, file.path, file.mimetype);
        } catch (supaErr) {
          console.error('[SUPABASE UPLOAD ERROR]:', supaErr);
          publicUrl = saveLocalUploadedFile(file, folderName);
        }
      } else {
        publicUrl = saveLocalUploadedFile(file, folderName);
      }

      res.json({ success: true, url: publicUrl, filename: file.originalname });
    } catch (err: any) {
      console.error('Error in /api/upload-file:', err);
      res.status(500).json({ error: '파일 업로드 중 오류가 발생했습니다.', details: err.message });
    }
  });

  app.post('/api/upload-chunk', upload.single('chunk'), async (req, res) => {
    try {
      const chunkFile = req.file;
      const { uploadId, chunkIndex: rawChunkIndex, totalChunks: rawTotalChunks, fileName, folderName: rawFolderName } = req.body;

      if (!chunkFile || !uploadId || rawChunkIndex === undefined || rawTotalChunks === undefined || !fileName) {
        return res.status(400).json({ error: '필수 청크 업로드 정보가 누락되었습니다.' });
      }

      const chunkIndex = parseInt(rawChunkIndex, 10);
      const totalChunks = parseInt(rawTotalChunks, 10);
      const folderName = rawFolderName || 'general';

      const uploadTempDir = path.join(CHUNKS_TEMP_DIR, uploadId);
      if (!fs.existsSync(uploadTempDir)) {
        fs.mkdirSync(uploadTempDir, { recursive: true });
      }

      const chunkPath = path.join(uploadTempDir, `chunk_${chunkIndex}`);
      fs.copyFileSync(chunkFile.path, chunkPath);
      try { fs.unlinkSync(chunkFile.path); } catch (e) { }

      const existingChunks = fs.readdirSync(uploadTempDir).filter(name => name.startsWith('chunk_'));

      if (existingChunks.length < totalChunks) {
        return res.json({ success: true, chunkIndex, totalChunks, completed: false });
      }

      // All chunks received, assemble file
      const cleanName = getCleanFilename(fileName);
      const ext = path.extname(cleanName) || '.stl';
      const base = path.basename(cleanName, ext).replace(/[/\\?%*:|"<>]/g, '_');
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const finalFileName = `${base}-${uniqueSuffix}${ext}`;

      const targetFolderDir = path.join(UPLOADS_DIR, folderName);
      if (!fs.existsSync(targetFolderDir)) {
        fs.mkdirSync(targetFolderDir, { recursive: true });
      }

      const finalFilePath = path.join(targetFolderDir, finalFileName);

      await new Promise<void>((resolve, reject) => {
        const writeStream = fs.createWriteStream(finalFilePath);
        writeStream.on('error', reject);
        writeStream.on('finish', resolve);

        for (let i = 0; i < totalChunks; i++) {
          const partPath = path.join(uploadTempDir, `chunk_${i}`);
          if (fs.existsSync(partPath)) {
            const buffer = fs.readFileSync(partPath);
            writeStream.write(buffer);
          } else {
            writeStream.destroy();
            return reject(new Error(`청크 ${i}번 조각을 찾을 수 없습니다.`));
          }
        }
        writeStream.end();
      });

      try {
        fs.rmSync(uploadTempDir, { recursive: true, force: true });
      } catch (e) { }

      let publicUrl = `/uploads/${folderName}/${finalFileName}`;

      if (isSupabaseConfigured()) {
        try {
          publicUrl = await uploadToSupabaseStorage(folderName, fileName, finalFilePath, 'application/octet-stream');
        } catch (supaErr) {
          console.error('[SUPABASE CHUNK MERGE UPLOAD ERROR]:', supaErr);
        }
      }

      res.json({ success: true, url: publicUrl, filename: fileName, completed: true });
    } catch (err: any) {
      console.error('Error in /api/upload-chunk:', err);
      res.status(500).json({ error: '청크 업로드 처리 중 오류가 발생했습니다.', details: err.message });
    }
  });

  // ----------------------------------------------------
  // Cases API (Supabase DB Single Source of Truth)
  // ----------------------------------------------------

  // 1. GET /api/cases - List all cases
  // ALWAYS queries Supabase directly when configured so re-deployment never loses posts
  app.get('/api/cases', async (req, res) => {
    try {
      if (isSupabaseConfigured()) {
        try {
          const supaCases = await getSupabaseCases();
          // Safely refresh local cache in background
          try {
            writeLocalDB({ cases: supaCases });
          } catch (_) { }
          return res.json(supaCases);
        } catch (supaErr: any) {
          console.error('[SUPABASE ERROR] Failed fetching cases directly from Supabase, falling back to local cache:', supaErr?.message || supaErr);
          const localDb = readLocalDB();
          return res.json(localDb.cases || []);
        }
      }

      // Pure Local Mode Fallback
      const db = readLocalDB();
      res.json(db.cases || []);
    } catch (err: any) {
      console.error('Error getting cases:', err);
      res.status(500).json({ error: '환자 리스트 조회 중 오류가 발생했습니다.', details: err.message });
    }
  });

  // 2. GET /api/cases/:id - Get single case
  app.get('/api/cases/:id', async (req, res) => {
    try {
      const dentalCase = await findCaseById(req.params.id);

      if (!dentalCase) {
        return res.status(404).json({ error: '해당 케이스를 찾을 수 없습니다.' });
      }
      res.json(dentalCase);
    } catch (err: any) {
      console.error('Error getting case detail:', err);
      res.status(500).json({ error: '상세보기 정보 조회 중 오류가 발생했습니다.' });
    }
  });

  // 3. POST /api/cases - Register new case
  // Guarantees persistence into Supabase DB before responding
  app.post('/api/cases', handleUpload, async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const {
        chartNumber,
        patientName,
        dentistName,
        technicianName,
        summary,
        description,
        requestType,
        pins,
        cameraState,
        cameraStates
      } = req.body;

      if (!chartNumber || !patientName || !dentistName || !technicianName) {
        return res.status(400).json({ error: '필수 필드가 누락되었습니다. (차트번호, 환자이름, 원장님선택, 담당기공사)' });
      }

      let stlFilePath: string | null = null;
      const images: string[] = [];

      let parsedPins: CasePin[] = [];
      if (pins) {
        try { parsedPins = JSON.parse(pins); } catch (e) { console.error(e); }
      }

      let parsedCameraState: CameraState | null = null;
      if (cameraState) {
        try { parsedCameraState = JSON.parse(cameraState); } catch (e) { console.error(e); }
      }

      let parsedCameraStates: CameraState[] = [];
      if (cameraStates) {
        try { parsedCameraStates = JSON.parse(cameraStates); } catch (e) { console.error(e); }
      }

      const caseFolderName = createCaseFolderName(chartNumber, patientName);

      // Handle STL File upload
      const stlFilePaths: string[] = [];
      const uploadedStlList: Express.Multer.File[] = [];
      if (files?.stlFiles && files.stlFiles.length > 0) {
        uploadedStlList.push(...files.stlFiles);
      } else if (files?.stlFile && files.stlFile.length > 0) {
        uploadedStlList.push(...files.stlFile);
      }

      for (const file of uploadedStlList) {
        if (isSupabaseConfigured()) {
          try {
            console.log(`[SUPABASE-STORAGE] Uploading STL model "${file.originalname}" to folder "${caseFolderName}"...`);
            const publicUrl = await uploadToSupabaseStorage(caseFolderName, file.originalname, file.path, file.mimetype);
            stlFilePaths.push(publicUrl);
          } catch (supaErr: any) {
            console.error('[SUPABASE-STORAGE ERROR] Uploading STL failed:', supaErr);
            const localUrl = saveLocalUploadedFile(file, caseFolderName);
            stlFilePaths.push(localUrl);
          }
        } else {
          const localUrl = saveLocalUploadedFile(file, caseFolderName);
          stlFilePaths.push(localUrl);
        }
      }

      stlFilePath = stlFilePaths.length > 0 ? stlFilePaths[0] : null;

      let parsedStlItems: StlItem[] = [];
      if (req.body.stlItems) {
        try {
          parsedStlItems = JSON.parse(req.body.stlItems);
        } catch (e) {
          console.error('Failed to parse stlItems:', e);
        }
      }

      let stlUploadIdx = 0;
      const finalStlItems: StlItem[] = parsedStlItems.map((item) => {
        let serverUrl = item.url;
        if (!item.url || item.url.startsWith('blob:') || item.url.startsWith('data:')) {
          serverUrl = stlFilePaths[stlUploadIdx] || item.url || '';
          stlUploadIdx++;
        }
        const ext = (item.format === 'ply' || item.format === 'obj' || item.format === 'stl') ? item.format : (serverUrl.toLowerCase().endsWith('.ply') ? 'ply' : (serverUrl.toLowerCase().endsWith('.obj') ? 'obj' : 'stl'));
        const isPlyOrObj = ext === 'ply' || ext === 'obj';
        return {
          ...item,
          url: serverUrl,
          format: ext,
          colorMode: isPlyOrObj ? (item.colorMode || 'color') : 'mono',
          color: item.color || (isPlyOrObj ? '#ffffff' : DEFAULT_STL_COLOR),
          visible: item.visible !== false,
          opacity: (typeof item.opacity === 'number' && !isNaN(item.opacity) && item.opacity > 0) ? item.opacity : 1.0
        };
      });

      while (stlUploadIdx < stlFilePaths.length) {
        const url = stlFilePaths[stlUploadIdx];
        const uploadedFile = uploadedStlList[stlUploadIdx];
        const rawOriginalName = uploadedFile ? fixMulterFilename(uploadedFile.originalname) : path.basename(url).replace(/^\d+-/, '');
        const ext = url.toLowerCase().endsWith('.ply') ? 'ply' : (url.toLowerCase().endsWith('.obj') ? 'obj' : 'stl');
        const isPlyOrObj = ext === 'ply' || ext === 'obj';
        finalStlItems.push({
          id: `stl_${Date.now()}_${stlUploadIdx}`,
          name: rawOriginalName,
          originalName: rawOriginalName,
          format: ext,
          colorMode: isPlyOrObj ? 'color' : 'mono',
          color: isPlyOrObj ? '#ffffff' : DEFAULT_STL_COLOR,
          url: url,
          visible: true,
          opacity: 1.0
        });
        stlUploadIdx++;
      }

      const allValidStlUrls = finalStlItems
        .map(item => item.url)
        .filter((u): u is string => Boolean(u && !u.startsWith('blob:') && !u.startsWith('data:')));
      const resolvedStlFilePaths = allValidStlUrls.length > 0 ? allValidStlUrls : stlFilePaths;
      const resolvedStlFilePath = resolvedStlFilePaths.length > 0 ? resolvedStlFilePaths[0] : null;

      // Handle Image Files upload
      if (files && files.imageFiles) {
        for (const file of files.imageFiles) {
          if (isSupabaseConfigured()) {
            try {
              console.log(`[SUPABASE-STORAGE] Uploading image file "${file.originalname}" to folder "${caseFolderName}"...`);
              const publicUrl = await uploadToSupabaseStorage(caseFolderName, file.originalname, file.path, file.mimetype);
              images.push(publicUrl);
            } catch (supaErr: any) {
              console.error('[SUPABASE-STORAGE ERROR] Uploading image failed:', supaErr);
              const localUrl = saveLocalUploadedFile(file, caseFolderName);
              images.push(localUrl);
            }
          } else {
            const localUrl = saveLocalUploadedFile(file, caseFolderName);
            images.push(localUrl);
          }
        }
      }

      const newCase: DentalCase = {
        id: `case_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        chartNumber,
        patientName,
        dentistName,
        technicianName,
        summary: summary || `${patientName} 환자 보철 디자인 컨펌 요청`,
        description: description || '',
        requestType: requestType || '원장님 확인부탁드려요.',
        status: '확인 전',
        stlFilePath: resolvedStlFilePath,
        stlFilePaths: resolvedStlFilePaths,
        stlItems: finalStlItems,
        images,
        pins: parsedPins,
        cameraState: parsedCameraState,
        cameraStates: parsedCameraStates,
        dentistFeedback: '',
        createdAt: new Date().toISOString(),
        confirmedAt: null
      };

      // 1. Primary Save: Supabase DB
      if (isSupabaseConfigured()) {
        try {
          await appendSupabaseCase(newCase);
        } catch (supaErr: any) {
          console.error('[SUPABASE ERROR] Failed saving case to Supabase DB:', supaErr?.message || supaErr);
        }
      }

      // 2. Safe Local Cache Backup
      const localDb = readLocalDB();
      localDb.cases.unshift(newCase);
      writeLocalDB(localDb);

      console.log(`✅ [CASE CREATED] Patient: ${patientName} (Chart: ${chartNumber}, ID: ${newCase.id})`);
      res.status(201).json(newCase);
    } catch (err: any) {
      console.error('Error registering case:', err);
      res.status(500).json({ error: '서버 등록 중 오류가 발생했습니다.', details: err.message });
    }
  });

  // 3.5. PUT & POST /api/cases/:id - Update existing case
  const handleCaseUpdate = async (req: express.Request, res: express.Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
      const {
        chartNumber,
        patientName,
        dentistName,
        technicianName,
        summary,
        description,
        requestType,
        status,
        pins,
        cameraState,
        cameraStates,
        existingImages
      } = req.body;

      const supaActive = isSupabaseConfigured();
      const existingCase = await findCaseById(req.params.id);

      if (!existingCase) {
        return res.status(404).json({ error: '해당 케이스를 찾을 수 없습니다.' });
      }

      let oldFolderName = '';
      const allExistingUrls = [
        ...(existingCase.stlItems?.map(i => i.url) || []),
        ...(existingCase.stlFilePaths || []),
        ...(existingCase.stlFilePath ? [existingCase.stlFilePath] : []),
        ...(existingCase.images || [])
      ];
      for (const u of allExistingUrls) {
        if (u && u.includes('/uploads/')) {
          const parts = u.split('/uploads/')[1]?.split('/');
          if (parts && parts.length > 1 && parts[0]) {
            oldFolderName = parts[0];
            break;
          }
        }
      }
      if (!oldFolderName) {
        oldFolderName = `${sanitizeName(existingCase.chartNumber)}_${sanitizeName(existingCase.patientName)}`;
      }

      const finalChartNumber = (chartNumber || existingCase.chartNumber || '').trim();
      const finalPatientName = (patientName || existingCase.patientName || '').trim();
      const newFolderName = `${sanitizeName(finalChartNumber)}_${sanitizeName(finalPatientName)}`;

      if (oldFolderName && newFolderName && oldFolderName !== newFolderName) {
        const oldDirPath = path.join(UPLOADS_DIR, oldFolderName);
        const newDirPath = path.join(UPLOADS_DIR, newFolderName);

        if (fs.existsSync(oldDirPath)) {
          try {
            if (!fs.existsSync(newDirPath)) {
              fs.renameSync(oldDirPath, newDirPath);
              console.log(`[STORAGE] Renamed folder: "${oldFolderName}" -> "${newFolderName}"`);
            } else {
              const filesInOld = fs.readdirSync(oldDirPath);
              for (const f of filesInOld) {
                const srcPath = path.join(oldDirPath, f);
                const destPath = path.join(newDirPath, f);
                if (!fs.existsSync(destPath)) {
                  fs.copyFileSync(srcPath, destPath);
                }
              }
              try { fs.rmSync(oldDirPath, { recursive: true, force: true }); } catch (_) { }
            }
          } catch (folderErr: any) {
            console.error('[STORAGE] Error renaming case folder:', folderErr);
          }
        }
      }

      const migrateUrl = (urlStr: string | null | undefined): string => {
        if (!urlStr || typeof urlStr !== 'string') return urlStr || '';
        if (oldFolderName && newFolderName && oldFolderName !== newFolderName) {
          if (urlStr.includes(`/uploads/${oldFolderName}/`)) {
            return urlStr.replace(`/uploads/${oldFolderName}/`, `/uploads/${newFolderName}/`);
          }
          if (urlStr.startsWith(`uploads/${oldFolderName}/`)) {
            return urlStr.replace(`uploads/${oldFolderName}/`, `uploads/${newFolderName}/`);
          }
        }
        return urlStr;
      };

      const newlyUploadedStlUrls: string[] = [];
      const uploadedStlList: Express.Multer.File[] = [];
      if (files?.stlFiles && files.stlFiles.length > 0) {
        uploadedStlList.push(...files.stlFiles);
      } else if (files?.stlFile && files.stlFile.length > 0) {
        uploadedStlList.push(...files.stlFile);
      }

      for (const file of uploadedStlList) {
        if (supaActive) {
          try {
            const publicUrl = await uploadToSupabaseStorage(newFolderName, file.originalname, file.path, file.mimetype);
            newlyUploadedStlUrls.push(publicUrl);
          } catch (supaErr: any) {
            const localUrl = saveLocalUploadedFile(file, newFolderName);
            newlyUploadedStlUrls.push(localUrl);
          }
        } else {
          const localUrl = saveLocalUploadedFile(file, newFolderName);
          newlyUploadedStlUrls.push(localUrl);
        }
      }

      let parsedStlItems: StlItem[] = [];
      if (req.body.stlItems) {
        try {
          parsedStlItems = JSON.parse(req.body.stlItems);
        } catch (e) {
          console.error('Failed to parse stlItems in update:', e);
        }
      }
      if ((!parsedStlItems || parsedStlItems.length === 0) && existingCase.stlItems && existingCase.stlItems.length > 0 && (!files?.stlFiles && !files?.stlFile)) {
        parsedStlItems = existingCase.stlItems;
      }

      let stlUploadIdx = 0;
      const finalStlItems: StlItem[] = parsedStlItems.map((item) => {
        let itemUrl = item.url;
        if (!itemUrl || itemUrl.startsWith('blob:') || itemUrl.startsWith('data:')) {
          itemUrl = newlyUploadedStlUrls[stlUploadIdx] || item.url || '';
          stlUploadIdx++;
        }
        const migratedUrl = migrateUrl(itemUrl);
        const ext = (item.format === 'ply' || item.format === 'obj' || item.format === 'stl') ? item.format : (migratedUrl.toLowerCase().endsWith('.ply') ? 'ply' : (migratedUrl.toLowerCase().endsWith('.obj') ? 'obj' : 'stl'));
        const isPlyOrObj = ext === 'ply' || ext === 'obj';
        return {
          ...item,
          url: migratedUrl,
          format: ext,
          colorMode: isPlyOrObj ? (item.colorMode || 'color') : 'mono',
          color: item.color || (isPlyOrObj ? '#ffffff' : DEFAULT_STL_COLOR),
          visible: item.visible !== false,
          opacity: (typeof item.opacity === 'number' && !isNaN(item.opacity) && item.opacity > 0) ? item.opacity : 1.0
        };
      });

      while (stlUploadIdx < newlyUploadedStlUrls.length) {
        const url = newlyUploadedStlUrls[stlUploadIdx];
        const uploadedFile = uploadedStlList[stlUploadIdx];
        const rawOriginalName = uploadedFile ? fixMulterFilename(uploadedFile.originalname) : path.basename(url).replace(/^\d+-/, '');
        const migratedUrl = migrateUrl(url);
        const ext = migratedUrl.toLowerCase().endsWith('.ply') ? 'ply' : (migratedUrl.toLowerCase().endsWith('.obj') ? 'obj' : 'stl');
        const isPlyOrObj = ext === 'ply' || ext === 'obj';
        finalStlItems.push({
          id: `stl_${Date.now()}_${stlUploadIdx}`,
          name: rawOriginalName,
          originalName: rawOriginalName,
          format: ext,
          colorMode: isPlyOrObj ? 'color' : 'mono',
          color: isPlyOrObj ? '#ffffff' : DEFAULT_STL_COLOR,
          url: migratedUrl,
          visible: true,
          opacity: 1.0
        });
        stlUploadIdx++;
      }

      let parsedExistingStlFilePaths: string[] = [];
      if (req.body.existingStlFilePaths) {
        try {
          parsedExistingStlFilePaths = JSON.parse(req.body.existingStlFilePaths);
        } catch (e) {
          parsedExistingStlFilePaths = existingCase.stlFilePaths || (existingCase.stlFilePath ? [existingCase.stlFilePath] : []);
        }
      } else {
        parsedExistingStlFilePaths = existingCase.stlFilePaths || (existingCase.stlFilePath ? [existingCase.stlFilePath] : []);
      }

      const allValidStlUrls = finalStlItems
        .map(item => item.url)
        .filter((u): u is string => Boolean(u && !u.startsWith('blob:') && !u.startsWith('data:')));

      const stlFilePaths: string[] = allValidStlUrls.length > 0
        ? allValidStlUrls
        : [...parsedExistingStlFilePaths.map(migrateUrl), ...newlyUploadedStlUrls.map(migrateUrl)];

      const stlFilePath = stlFilePaths.length > 0 ? stlFilePaths[0] : null;

      let parsedExistingImages: string[] = [];
      if (existingImages) {
        try {
          parsedExistingImages = JSON.parse(existingImages);
        } catch (e) {
          parsedExistingImages = existingCase.images || [];
        }
      } else {
        parsedExistingImages = existingCase.images || [];
      }

      const deletedImages = (existingCase.images || []).filter(img => !parsedExistingImages.includes(img));
      deletedImages.forEach(async (imgUrl) => {
        if (supaActive) {
          await deleteSupabaseStorageFile(imgUrl);
        } else {
          if (imgUrl.startsWith('/uploads/')) {
            const relativePath = imgUrl.replace('/uploads/', '');
            const fullImgPath = path.join(UPLOADS_DIR, relativePath);
            if (fs.existsSync(fullImgPath)) {
              try { fs.unlinkSync(fullImgPath); } catch (e) { }
            }
          }
        }
      });

      const images = [...parsedExistingImages.map(migrateUrl)];
      if (files && files.imageFiles) {
        for (const file of files.imageFiles) {
          if (supaActive) {
            try {
              const publicUrl = await uploadToSupabaseStorage(newFolderName, file.originalname, file.path, file.mimetype);
              images.push(publicUrl);
            } catch (supaErr: any) {
              const localUrl = saveLocalUploadedFile(file, newFolderName);
              images.push(localUrl);
            }
          } else {
            const localUrl = saveLocalUploadedFile(file, newFolderName);
            images.push(localUrl);
          }
        }
      }

      let parsedPins = existingCase.pins;
      if (pins) {
        try { parsedPins = JSON.parse(pins); } catch (e) { }
      }

      let parsedCameraState = existingCase.cameraState;
      if (cameraState) {
        try { parsedCameraState = JSON.parse(cameraState); } catch (e) { }
      }

      let parsedCameraStates = existingCase.cameraStates || [];
      if (cameraStates) {
        try { parsedCameraStates = JSON.parse(cameraStates); } catch (e) { }
      }

      const updatedCase: DentalCase = {
        ...existingCase,
        chartNumber: finalChartNumber,
        patientName: finalPatientName,
        dentistName: dentistName || existingCase.dentistName,
        technicianName: technicianName || existingCase.technicianName,
        summary: summary || `${finalPatientName} 환자 보철 디자인 컨펌 요청`,
        description: description !== undefined ? description : existingCase.description,
        requestType: requestType !== undefined ? requestType : existingCase.requestType,
        status: (status === '확인 완료' || status === '수정 완료' || status === '확인 전') ? status : existingCase.status,
        stlFilePath,
        stlFilePaths,
        stlItems: finalStlItems,
        images,
        pins: parsedPins,
        cameraState: parsedCameraState,
        cameraStates: parsedCameraStates
      };

      await saveOrUpdateCase(updatedCase);

      console.log(`✅ [CASE UPDATED] Patient: ${finalPatientName} (ID: ${updatedCase.id})`);
      res.json(updatedCase);
    } catch (err: any) {
      console.error('Error updating case details:', err);
      res.status(500).json({ error: '서버 수정 중 오류가 발생했습니다.', details: err.message });
    }
  };

  app.post('/api/cases/:id', handleUpload, handleCaseUpdate);
  app.put('/api/cases/:id', handleUpload, handleCaseUpdate);

  // 4. POST /api/cases/:id/confirm - Confirm case (Dentist approval feedback)
  app.post('/api/cases/:id/confirm', async (req, res) => {
    try {
      const { dentistFeedback, status } = req.body;
      const dentalCase = await findCaseById(req.params.id);

      if (!dentalCase) {
        return res.status(404).json({ error: '해당 케이스를 찾을 수 없습니다.' });
      }

      dentalCase.status = (status === '확인 완료' || status === '수정 완료' || status === '확인 전') ? status : '확인 완료';
      dentalCase.dentistFeedback = dentistFeedback || '';
      dentalCase.confirmedAt = new Date().toISOString();

      await saveOrUpdateCase(dentalCase);

      console.log(`✅ [CASE CONFIRMED] Case ${req.params.id} approved by dentist.`);
      res.json(dentalCase);
    } catch (err: any) {
      console.error('Error confirming case:', err);
      res.status(500).json({ error: '컨펌 처리 중 오류가 발생했습니다.', details: err.message });
    }
  });

  // 5. POST /api/cases/:id/pins - Update pins coordinates
  app.post('/api/cases/:id/pins', async (req, res) => {
    try {
      const { pins } = req.body;
      if (!pins || !Array.isArray(pins)) {
        return res.status(400).json({ error: '올바른 핀 배열 정보가 필요합니다.' });
      }

      const dentalCase = await findCaseById(req.params.id);

      if (!dentalCase) {
        return res.status(404).json({ error: '해당 케이스를 찾을 수 없습니다.' });
      }

      dentalCase.pins = pins;
      await saveOrUpdateCase(dentalCase);

      console.log(`✅ [PINS UPDATED] Case ${req.params.id} pins updated. Count: ${pins.length}`);
      res.json(dentalCase);
    } catch (err: any) {
      console.error('Error updating pins:', err);
      res.status(500).json({ error: '핀 데이터 저장 중 오류가 발생했습니다.', details: err.message });
    }
  });

  // 5.5. POST/PUT /api/cases/:id/camera - Update saved camera views
  const updateCameraViewsHandler = async (req: express.Request, res: express.Response) => {
    try {
      const { cameraState, cameraStates } = req.body;
      const dentalCase = await findCaseById(req.params.id);

      if (!dentalCase) {
        return res.status(404).json({ error: '해당 케이스를 찾을 수 없습니다.' });
      }

      if (cameraState) dentalCase.cameraState = cameraState;
      if (cameraStates && Array.isArray(cameraStates)) dentalCase.cameraStates = cameraStates;

      await saveOrUpdateCase(dentalCase);

      console.log(`✅ [CAMERA UPDATED] Case ${req.params.id} camera views updated.`);
      res.json(dentalCase);
    } catch (err: any) {
      console.error('Error updating camera views:', err);
      res.status(500).json({ error: '커스텀 뷰 데이터 저장 중 오류가 발생했습니다.', details: err.message });
    }
  };

  app.post('/api/cases/:id/camera', updateCameraViewsHandler);
  app.put('/api/cases/:id/camera', updateCameraViewsHandler);

  // 6. DELETE /api/cases/:id - Delete case record from Supabase DB and clean assets
  app.delete('/api/cases/:id', async (req, res) => {
    try {
      const supaActive = isSupabaseConfigured();
      const dentalCase = await findCaseById(req.params.id);

      if (!dentalCase) {
        return res.json({ success: true, message: '이미 삭제되었거나 존재하지 않는 게시글입니다.' });
      }
      const targetId = String(dentalCase.id).trim();

      console.log(`🗑️ [DELETE] Permanent deletion triggered for: ${dentalCase.patientName} (ID: ${targetId})`);

      // ── PHASE 1: Remove from Supabase DB First & Local Cache ──
      if (supaActive) {
        try {
          await deleteSupabaseCaseRow(dentalCase.id);
        } catch (supaDelErr) {
          console.error('[DELETE] Error deleting row from Supabase:', supaDelErr);
        }
      }

      const db = readLocalDB();
      const localIndex = db.cases.findIndex((c) => String(c.id).trim() === targetId);
      if (localIndex !== -1) {
        db.cases.splice(localIndex, 1);
        writeLocalDB(db);
      }

      // Respond immediately to client
      res.json({
        success: true,
        message: `[${dentalCase.status}] 상태의 케이스 목록 및 관련 파일이 데이터베이스에서 완전히 삭제되었습니다.`
      });

      // ── PHASE 2: Clean up files in BACKGROUND ──
      setImmediate(async () => {
        try {
          if (supaActive) {
            const supabaseDeletePromises: Promise<void>[] = [];

            const allStlUrls = new Set<string>();
            if (dentalCase.stlFilePath) allStlUrls.add(dentalCase.stlFilePath);
            if (Array.isArray(dentalCase.stlFilePaths)) {
              dentalCase.stlFilePaths.forEach(u => { if (u) allStlUrls.add(u); });
            }
            if (Array.isArray(dentalCase.stlItems)) {
              dentalCase.stlItems.forEach(item => { if (item.url) allStlUrls.add(item.url); });
            }

            allStlUrls.forEach(url => {
              if (url.startsWith('http')) {
                supabaseDeletePromises.push(deleteSupabaseStorageFile(url));
              }
            });

            if (Array.isArray(dentalCase.images)) {
              dentalCase.images.forEach(imgUrl => {
                if (imgUrl && imgUrl.startsWith('http')) {
                  supabaseDeletePromises.push(deleteSupabaseStorageFile(imgUrl));
                }
              });
            }

            if (supabaseDeletePromises.length > 0) {
              await Promise.allSettled(supabaseDeletePromises);
              console.log(`[DELETE-BG] Supabase storage cleanup done: ${supabaseDeletePromises.length} files`);
            }
          }

          const cleanLocalFile = (fileUrl: string) => {
            if (!fileUrl || fileUrl.startsWith('http')) return;
            let relativePath = fileUrl;
            if (relativePath.startsWith('/uploads/')) {
              relativePath = relativePath.replace('/uploads/', '');
            } else if (relativePath.startsWith('uploads/')) {
              relativePath = relativePath.replace('uploads/', '');
            }
            const fullPath = path.join(UPLOADS_DIR, relativePath);
            if (fs.existsSync(fullPath)) {
              try {
                fs.unlinkSync(fullPath);
                const dirPath = path.dirname(fullPath);
                if (fs.existsSync(dirPath) && dirPath !== UPLOADS_DIR && fs.readdirSync(dirPath).length === 0) {
                  fs.rmdirSync(dirPath);
                }
              } catch (e) { console.error(e); }
            }
          };

          if (dentalCase.stlFilePath) cleanLocalFile(dentalCase.stlFilePath);
          if (Array.isArray(dentalCase.stlFilePaths)) {
            dentalCase.stlFilePaths.forEach(cleanLocalFile);
          }
          if (Array.isArray(dentalCase.images)) {
            dentalCase.images.forEach(cleanLocalFile);
          }

          const allUrls = [
            ...(dentalCase.stlFilePaths || []),
            ...(dentalCase.images || []),
            ...(dentalCase.stlFilePath ? [dentalCase.stlFilePath] : [])
          ];
          const localUrl = allUrls.find(u => u && !u.startsWith('http') && u.includes('/uploads/'));
          if (localUrl) {
            const parts = localUrl.split('/uploads/')[1]?.split('/');
            if (parts && parts.length > 1 && parts[0]) {
              const caseFolderPath = path.join(UPLOADS_DIR, parts[0]);
              if (fs.existsSync(caseFolderPath)) {
                try {
                  const remaining = fs.readdirSync(caseFolderPath);
                  if (remaining.length === 0) {
                    fs.rmdirSync(caseFolderPath);
                    console.log(`[DELETE-BG] Removed empty case folder: ${parts[0]}`);
                  }
                } catch (_) { }
              }
            }
          }

          console.log(`[DELETE-BG] Background file cleanup completed for case: ${targetId}`);
        } catch (bgErr: any) {
          console.error('[DELETE-BG] Background cleanup error:', bgErr.message || bgErr);
        }
      });
    } catch (err: any) {
      console.error('Error deleting case:', err);
      res.status(500).json({ error: '케이스 삭제 중 오류가 발생했습니다.', details: err.message });
    }
  });

  // Catch-all 404 handler for API routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({ error: '요청하신 API 경로를 찾을 수 없습니다.' });
  });

  // Serve Frontend assets using Vite (dev) or static dist folder (prod)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 [SERVER] Dental Design App listening on port ${PORT}`);
    if (isSupabaseConfigured()) {
      console.log('☁️ [SUPABASE CLOUD MODE] Running with Supabase PostgreSQL Database & Cloud Storage.');
    } else {
      console.log('📂 [LOCAL-PC MODE] Running on local PC database storage (nas_storage).');
    }
  });
}

startServer();
