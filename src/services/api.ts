import { getSupabaseClient, isSupabaseConfigured } from './supabase';
import { DentalCase, CasePin, CameraState, StlItem, ConfirmStatus } from '../types';

// ==============================================================================
// Fallback In-Memory / LocalStorage Cache
// ==============================================================================
const LS_CASES_KEY = 'dental_local_cases_cache';
const LS_DENTISTS_KEY = 'dental_local_dentists_cache';
const LS_TECHNICIANS_KEY = 'dental_local_technicians_cache';
const LS_NOTICES_KEY = 'dental_local_notices_cache';
const LS_PASSWORD_KEY = 'dental_access_password';

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

const DEFAULT_INITIAL_TECHNICIANS = [
  { id: 'tech_1', name: '최용희', displayOrder: 1 },
  { id: 'tech_2', name: '김찬유', displayOrder: 2 },
  { id: 'tech_3', name: '양소영', displayOrder: 3 },
  { id: 'tech_4', name: '박세진', displayOrder: 4 },
  { id: 'tech_5', name: '정서영', displayOrder: 5 },
  { id: 'tech_6', name: '최이슬', displayOrder: 6 }
];

// Helper to sanitize name
function sanitizeName(str: string): string {
  if (!str) return 'general';
  return str.trim().replace(/[/\\?%*:|"<>]/g, '_');
}

// ==============================================================================
// Data Mappers (Supabase Snake_case <-> Frontend CamelCase)
// ==============================================================================
export function mapSupabaseToDentalCase(row: any): DentalCase {
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
    status: (row.status === '확인 완료' ? '확인 완료' : (row.status === '수정 완료' ? '수정 완료' : '확인 전')) as ConfirmStatus,
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

export function mapDentalCaseToSupabase(dentalCase: DentalCase) {
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

// ==============================================================================
// Storage APIs (Supabase Storage: bucket 'dental-files')
// ==============================================================================
export async function uploadFileToStorage(
  file: File,
  folderName: string = 'general',
  onProgress?: (percent: number) => void
): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[STORAGE] Supabase not configured. Using temporary Blob URL.');
    if (onProgress) onProgress(100);
    return URL.createObjectURL(file);
  }

  const cleanOriginalName = file.name.replace(/[/\\?%*:|"<>]/g, '_');
  const safeFolder = sanitizeName(folderName);
  const ext = file.name.substring(file.name.lastIndexOf('.')) || (file.type.includes('image') ? '.png' : '.stl');
  const uniqueKey = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
  const storagePath = `cases/${safeFolder}/${uniqueKey}`;

  if (onProgress) onProgress(20);

  const { error } = await supabase.storage
    .from('dental-files')
    .upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true
    });

  if (error) {
    console.error('[STORAGE] Upload failed:', error);
    throw new Error(`파일 업로드 실패: ${error.message}`);
  }

  if (onProgress) onProgress(90);

  const { data: publicData } = supabase.storage
    .from('dental-files')
    .getPublicUrl(storagePath);

  if (onProgress) onProgress(100);
  return publicData.publicUrl;
}

export async function deleteStorageFile(publicUrl: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase || !publicUrl) return;

  try {
    const urlParts = publicUrl.split('/dental-files/');
    if (urlParts.length > 1) {
      const storagePath = decodeURIComponent(urlParts[1]);
      await supabase.storage.from('dental-files').remove([storagePath]);
      console.log(`[STORAGE] Deleted file: ${storagePath}`);
    }
  } catch (e: any) {
    console.warn('[STORAGE] Failed deleting file:', e?.message || e);
  }
}

// ==============================================================================
// Cases Database APIs
// ==============================================================================
export async function fetchCases(): Promise<DentalCase[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    // Fallback: localStorage
    const cached = localStorage.getItem(LS_CASES_KEY);
    return cached ? JSON.parse(cached) : [];
  }

  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[API] Error fetching cases from Supabase:', error);
    const cached = localStorage.getItem(LS_CASES_KEY);
    return cached ? JSON.parse(cached) : [];
  }

  const cases = (data || []).map(mapSupabaseToDentalCase);
  // Cache locally for offline/resilience
  try {
    localStorage.setItem(LS_CASES_KEY, JSON.stringify(cases));
  } catch (_) {}
  return cases;
}

export async function fetchCaseById(id: string): Promise<DentalCase | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const cases = await fetchCases();
    return cases.find(c => c.id === id) || null;
  }

  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return mapSupabaseToDentalCase(data);
}

export async function createDentalCase(newCase: DentalCase): Promise<DentalCase> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const cases = await fetchCases();
    cases.unshift(newCase);
    localStorage.setItem(LS_CASES_KEY, JSON.stringify(cases));
    return newCase;
  }

  const payload: Record<string, any> = mapDentalCaseToSupabase(newCase);

  // Retry logic with column fallback if schema has slight variations
  const optionalCols = ['request_type', 'stl_items', 'camera_states', 'stl_file_paths', 'pins', 'camera_state', 'images'];
  let currentPayload = { ...payload };

  let insertError = null;
  for (let attempt = 0; attempt <= optionalCols.length; attempt++) {
    const { error } = await supabase.from('cases').insert([currentPayload]);
    if (!error) {
      insertError = null;
      break;
    }
    insertError = error;
    console.warn(`[API] Insert attempt ${attempt + 1} failed: ${error.message}`);
    if (attempt < optionalCols.length) {
      delete currentPayload[optionalCols[attempt]];
    }
  }

  if (insertError) {
    throw new Error(`케이스 저장 실패: ${insertError.message}`);
  }

  // Update local cache
  try {
    const cases = await fetchCases();
    localStorage.setItem(LS_CASES_KEY, JSON.stringify(cases));
  } catch (_) {}

  return newCase;
}

export async function updateDentalCase(id: string, updatedCase: DentalCase): Promise<DentalCase> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const cases = await fetchCases();
    const idx = cases.findIndex(c => c.id === id);
    if (idx !== -1) {
      cases[idx] = updatedCase;
      localStorage.setItem(LS_CASES_KEY, JSON.stringify(cases));
    }
    return updatedCase;
  }

  const payload: Record<string, any> = mapDentalCaseToSupabase(updatedCase);
  const optionalCols = ['request_type', 'stl_items', 'camera_states', 'stl_file_paths', 'pins', 'camera_state', 'images'];
  let currentPayload = { ...payload };

  let updateError = null;
  for (let attempt = 0; attempt <= optionalCols.length; attempt++) {
    const { error } = await supabase.from('cases').update(currentPayload).eq('id', id);
    if (!error) {
      updateError = null;
      break;
    }
    updateError = error;
    if (attempt < optionalCols.length) {
      delete currentPayload[optionalCols[attempt]];
    }
  }

  if (updateError) {
    throw new Error(`케이스 수정 실패: ${updateError.message}`);
  }

  return updatedCase;
}

export async function deleteDentalCase(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const existing = await fetchCaseById(id);

  if (supabase) {
    const { error } = await supabase.from('cases').delete().eq('id', id);
    if (error) {
      throw new Error(`케이스 삭제 실패: ${error.message}`);
    }

    // Clean up uploaded files in background
    if (existing) {
      const allUrls = [
        ...(existing.stlFilePaths || []),
        ...(existing.stlFilePath ? [existing.stlFilePath] : []),
        ...(existing.stlItems?.map(i => i.url) || []),
        ...(existing.images || [])
      ];
      allUrls.forEach(url => {
        if (url && url.startsWith('http')) {
          deleteStorageFile(url).catch(e => console.warn(e));
        }
      });
    }
  }

  // Update local cache
  const cases = (await fetchCases()).filter(c => c.id !== id);
  localStorage.setItem(LS_CASES_KEY, JSON.stringify(cases));
}

export async function confirmDentalCase(
  id: string,
  dentistFeedback: string,
  status: ConfirmStatus = '확인 완료'
): Promise<DentalCase> {
  const existing = await fetchCaseById(id);
  if (!existing) {
    throw new Error('해당 케이스를 찾을 수 없습니다.');
  }

  const updated: DentalCase = {
    ...existing,
    status,
    dentistFeedback: dentistFeedback || '',
    confirmedAt: new Date().toISOString()
  };

  return await updateDentalCase(id, updated);
}

export async function updateCasePins(id: string, pins: CasePin[]): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('cases').update({ pins }).eq('id', id);
    if (error) {
      throw new Error(`핀 정보 저장 실패: ${error.message}`);
    }
  } else {
    const existing = await fetchCaseById(id);
    if (existing) {
      existing.pins = pins;
      await updateDentalCase(id, existing);
    }
  }
}

export async function updateCaseCamera(
  id: string,
  cameraState: CameraState | null,
  cameraStates: CameraState[]
): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    const { error } = await supabase
      .from('cases')
      .update({ camera_state: cameraState, camera_states: cameraStates })
      .eq('id', id);
    if (error) {
      throw new Error(`카메라 뷰 저장 실패: ${error.message}`);
    }
  } else {
    const existing = await fetchCaseById(id);
    if (existing) {
      existing.cameraState = cameraState;
      existing.cameraStates = cameraStates;
      await updateDentalCase(id, existing);
    }
  }
}

// ==============================================================================
// Dentists APIs
// ==============================================================================
export interface DentistItem {
  id: string;
  name: string;
  isCore: boolean;
  displayOrder: number;
}

export async function fetchDentists(): Promise<DentistItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const cached = localStorage.getItem(LS_DENTISTS_KEY);
    return cached ? JSON.parse(cached) : DEFAULT_INITIAL_DENTISTS;
  }

  try {
    const { data, error } = await supabase
      .from('dentists')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      const cached = localStorage.getItem(LS_DENTISTS_KEY);
      return cached ? JSON.parse(cached) : DEFAULT_INITIAL_DENTISTS;
    }

    const dentists: DentistItem[] = data.map(row => ({
      id: row.id,
      name: row.name,
      isCore: Boolean(row.is_core),
      displayOrder: Number(row.display_order || 0)
    }));

    localStorage.setItem(LS_DENTISTS_KEY, JSON.stringify(dentists));
    return dentists;
  } catch (_) {
    const cached = localStorage.getItem(LS_DENTISTS_KEY);
    return cached ? JSON.parse(cached) : DEFAULT_INITIAL_DENTISTS;
  }
}

export async function addDentist(name: string): Promise<DentistItem> {
  let formattedName = name.trim();
  if (!formattedName.endsWith('원장님')) {
    formattedName += '원장님';
  }

  const current = await fetchDentists();
  const exists = current.find(d => d.name === formattedName);
  if (exists) return exists;

  const newDentist: DentistItem = {
    id: `dentist_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: formattedName,
    isCore: false,
    displayOrder: current.length + 1
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('dentists').insert([{
        id: newDentist.id,
        name: newDentist.name,
        is_core: false,
        display_order: newDentist.displayOrder,
        created_at: new Date().toISOString()
      }]);
    } catch (e) {
      console.warn('[DENTISTS] Supabase insert warning:', e);
    }
  }

  current.push(newDentist);
  localStorage.setItem(LS_DENTISTS_KEY, JSON.stringify(current));
  return newDentist;
}

export async function deleteDentist(name: string): Promise<void> {
  const immutable = ['김민수원장님', '현정민원장님', '문석준원장님'];
  if (immutable.includes(name)) {
    throw new Error('기본 대표 원장님은 삭제할 수 없습니다.');
  }

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('dentists').delete().eq('name', name);
    } catch (e) {
      console.warn('[DENTISTS] Supabase delete warning:', e);
    }
  }

  const current = (await fetchDentists()).filter(d => d.name !== name);
  localStorage.setItem(LS_DENTISTS_KEY, JSON.stringify(current));
}

// ==============================================================================
// Technicians APIs
// ==============================================================================
export interface TechnicianItem {
  id: string;
  name: string;
  displayOrder: number;
}

export async function fetchTechnicians(): Promise<TechnicianItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const cached = localStorage.getItem(LS_TECHNICIANS_KEY);
    return cached ? JSON.parse(cached) : DEFAULT_INITIAL_TECHNICIANS;
  }

  try {
    const { data, error } = await supabase
      .from('technicians')
      .select('*')
      .order('display_order', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      const techs = data.map(d => ({
        id: d.id,
        name: d.name,
        displayOrder: d.display_order
      }));
      localStorage.setItem(LS_TECHNICIANS_KEY, JSON.stringify(techs));
      return techs;
    }
  } catch (_) {}

  const cached = localStorage.getItem(LS_TECHNICIANS_KEY);
  return cached ? JSON.parse(cached) : DEFAULT_INITIAL_TECHNICIANS;
}

export async function addTechnician(name: string): Promise<TechnicianItem> {
  const formattedName = name.trim();
  const current = await fetchTechnicians();
  const exists = current.find(t => t.name === formattedName);
  if (exists) return exists;

  const newTech: TechnicianItem = {
    id: `tech_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: formattedName,
    displayOrder: current.length + 1
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('technicians').insert([{
        id: newTech.id,
        name: newTech.name,
        display_order: newTech.displayOrder,
        created_at: new Date().toISOString()
      }]);
    } catch (_) {}
  }

  current.push(newTech);
  localStorage.setItem(LS_TECHNICIANS_KEY, JSON.stringify(current));
  return newTech;
}

export async function deleteTechnician(name: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('technicians').delete().eq('name', name);
    } catch (_) {}
  }

  const current = (await fetchTechnicians()).filter(t => t.name !== name);
  localStorage.setItem(LS_TECHNICIANS_KEY, JSON.stringify(current));
}

// ==============================================================================
// Notices APIs
// ==============================================================================
export interface NoticeItem {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

export async function fetchNotices(): Promise<NoticeItem[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const cached = localStorage.getItem(LS_NOTICES_KEY);
    return cached ? JSON.parse(cached) : [];
  }

  try {
    const { data, error } = await supabase
      .from('notices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && Array.isArray(data)) {
      const notices = data.map(row => ({
        id: row.id,
        content: row.content || '',
        author: row.author || '원장단',
        createdAt: row.created_at ? new Date(row.created_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      }));
      localStorage.setItem(LS_NOTICES_KEY, JSON.stringify(notices));
      return notices;
    }
  } catch (_) {}

  const cached = localStorage.getItem(LS_NOTICES_KEY);
  return cached ? JSON.parse(cached) : [];
}

export async function addNotice(content: string, author: string = '원장단'): Promise<NoticeItem> {
  const newNotice: NoticeItem = {
    id: `notice_${Date.now()}`,
    content: content.trim(),
    author: author.trim() || '원장단',
    createdAt: new Date().toISOString().split('T')[0]
  };

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('notices').insert([{
        id: newNotice.id,
        content: newNotice.content,
        author: newNotice.author,
        created_at: new Date().toISOString()
      }]);
    } catch (e) {
      console.warn('[NOTICES] Supabase insert error:', e);
    }
  }

  const current = await fetchNotices();
  current.unshift(newNotice);
  localStorage.setItem(LS_NOTICES_KEY, JSON.stringify(current));
  return newNotice;
}

export async function updateNotice(id: string, content: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('notices').update({ content: content.trim() }).eq('id', id);
    } catch (e) {
      console.warn('[NOTICES] Supabase update error:', e);
    }
  }

  const current = await fetchNotices();
  const target = current.find(n => n.id === id);
  if (target) {
    target.content = content.trim();
    localStorage.setItem(LS_NOTICES_KEY, JSON.stringify(current));
  }
}

export async function deleteNotice(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('notices').delete().eq('id', id);
    } catch (e) {
      console.warn('[NOTICES] Supabase delete error:', e);
    }
  }

  const current = (await fetchNotices()).filter(n => n.id !== id);
  localStorage.setItem(LS_NOTICES_KEY, JSON.stringify(current));
}

// ==============================================================================
// Password / Settings APIs
// ==============================================================================
export async function fetchAccessPassword(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return localStorage.getItem(LS_PASSWORD_KEY) || '1234';
  }

  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'access_password')
      .single();

    if (!error && data?.value) {
      localStorage.setItem(LS_PASSWORD_KEY, data.value);
      return data.value;
    }
  } catch (_) {}

  return localStorage.getItem(LS_PASSWORD_KEY) || '1234';
}

export async function updateAccessPassword(newPassword: string): Promise<string> {
  const cleanPass = newPassword.trim();
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      await supabase.from('settings').upsert({
        key: 'access_password',
        value: cleanPass
      });
    } catch (e) {
      console.warn('[SETTINGS] Supabase password update warning:', e);
    }
  }

  localStorage.setItem(LS_PASSWORD_KEY, cleanPass);
  return cleanPass;
}
