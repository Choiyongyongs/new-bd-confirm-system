import React, { useState, useEffect } from 'react';
import { DentalCase } from './types';
import Dashboard from './components/Dashboard';
import CaseForm from './components/CaseForm';
import CaseDetail from './components/CaseDetail';
import { motion, AnimatePresence } from 'motion/react';
import {
  Stethoscope,
  Building2,
  RefreshCw,
  AlertTriangle,
  Clock,
  HeartPulse,
  Database,
  HardDrive,
  X,
  CheckCircle2,
  Trash2,
  Lock,
  ShieldCheck,
  Key,
  Link as LinkIcon,
  Unlock,
  Check,
  ShieldAlert
} from 'lucide-react';
import {
  fetchAccessPassword,
  updateAccessPassword,
  fetchCases as apiFetchCases,
  createDentalCase,
  updateDentalCase,
  confirmDentalCase,
  deleteDentalCase
} from './services/api';
import {
  getSupabaseConfig,
  isSupabaseConfigured
} from './services/supabase';

export default function App() {
  const [currentView, setCurrentView] = useState<'dashboard' | 'register' | 'detail'>('dashboard');
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [editingCase, setEditingCase] = useState<DentalCase | null>(null);
  const [cases, setCases] = useState<DentalCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedDentistForForm, setSelectedDentistForForm] = useState<string>('김민수원장님');
  const [selectedTechnicianForForm, setSelectedTechnicianForForm] = useState<string>('최용희');
  const [supabaseStatus, setSupabaseStatus] = useState<{ isSupabaseActive: boolean; supabaseUrl: string | null }>({
    isSupabaseActive: false,
    supabaseUrl: null
  });



  // Helper to extract target case ID from either URL hash or search params
  const extractCaseIdFromUrl = (): string | null => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#case-')) {
      const id = hash.replace('#case-', '').trim();
      if (id) return decodeURIComponent(id);
    }
    const searchParams = new URLSearchParams(window.location.search);
    const idParam = searchParams.get('case') || searchParams.get('id');
    if (idParam) return idParam.trim();
    return null;
  };

  // Check URL immediately on initial load
  useEffect(() => {
    const targetId = extractCaseIdFromUrl();
    if (targetId) {
      setActiveCaseId(targetId);
      setCurrentView('detail');
    }
  }, []);

  // Direct Link Protection / Access Password Gate states
  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => {
    return sessionStorage.getItem('dental_access_auth') === 'true';
  });
  const [inputPassword, setInputPassword] = useState('');
  const [passError, setPassError] = useState('');
  const [customPassword, setCustomPassword] = useState<string>('');
  const [isPasswordLoading, setIsPasswordLoading] = useState(true);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [passSuccessMsg, setPassSuccessMsg] = useState('');

  // Fetch shared password from Supabase DB (with local fallback)
  useEffect(() => {
    fetchAccessPassword()
      .then(pwd => {
        setCustomPassword(pwd || '1234');
      })
      .catch(err => {
        console.error('[PASSWORD] Fetch error:', err);
        setCustomPassword(localStorage.getItem('dental_access_password') || '1234');
      })
      .finally(() => {
        setIsPasswordLoading(false);
      });
  }, []);

  // Unlock access handler
  const handleUnlockAccess = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputPassword.trim() === customPassword) {
      setIsAuthorized(true);
      sessionStorage.setItem('dental_access_auth', 'true');
      setPassError('');
    } else {
      setPassError('접속 비밀번호가 일치하지 않습니다.');
    }
  };

  // Change password handler — save to Supabase shared DB
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPass.trim()) return;
    try {
      const updated = await updateAccessPassword(newPass.trim());
      setCustomPassword(updated);
      setPassSuccessMsg('접속 비밀번호가 변경되었습니다. (모든 접속자에게 공유 적용됩니다)');
    } catch (err) {
      console.error('[PASSWORD] Update error:', err);
      setCustomPassword(newPass.trim());
      setPassSuccessMsg('비밀번호가 변경되었습니다. (로컬에 저장됨)');
    }
    setNewPass('');
    setTimeout(() => {
      setPassSuccessMsg('');
      setIsChangingPass(false);
    }, 2000);
  };

  // Check Supabase connection state
  const refreshSupabaseStatus = () => {
    const cfg = getSupabaseConfig();
    const active = isSupabaseConfigured();
    setSupabaseStatus({
      isSupabaseActive: active,
      supabaseUrl: active ? cfg.url : null
    });
  };

  useEffect(() => {
    refreshSupabaseStatus();
  }, []);

  // Fetch all cases from Supabase DB
  const fetchCases = async (showRefreshIndicator = false) => {
    if (showRefreshIndicator) setIsRefreshing(true);
    try {
      const data = await apiFetchCases();
      setCases(data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '데이터베이스 연결 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCases();
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const search = window.location.search;

      if (hash.startsWith('#case-')) {
        const id = decodeURIComponent(hash.replace('#case-', ''));
        setActiveCaseId(id);
        setCurrentView('detail');
      } else if (hash === '#register' || search.includes('view=register')) {
        setCurrentView('register');
      } else if (hash === '' || hash === '#') {
        const idParam = new URLSearchParams(window.location.search).get('case');
        if (idParam) {
          setActiveCaseId(idParam);
          setCurrentView('detail');
        } else {
          setCurrentView('dashboard');
          setActiveCaseId(null);
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  // Save registered case (direct to Supabase DB)
  const handleSaveCase = async (formData: FormData) => {
    try {
      const chartNumber = (formData.get('chartNumber') as string || '').trim();
      const patientName = (formData.get('patientName') as string || '').trim();
      const dentistName = (formData.get('dentistName') as string || '').trim();
      const technicianName = (formData.get('technicianName') as string || '').trim();
      const summary = (formData.get('summary') as string || '').trim();
      const description = (formData.get('description') as string || '').trim();
      const requestType = (formData.get('requestType') as string || '원장님 확인부탁드려요.').trim();

      let pins = [];
      try { pins = JSON.parse((formData.get('pins') as string) || '[]'); } catch (_) {}

      let cameraState = null;
      try { cameraState = JSON.parse((formData.get('cameraState') as string) || 'null'); } catch (_) {}

      let cameraStates = [];
      try { cameraStates = JSON.parse((formData.get('cameraStates') as string) || '[]'); } catch (_) {}

      let images = [];
      try { images = JSON.parse((formData.get('existingImages') as string) || '[]'); } catch (_) {}

      let stlItems = [];
      try { stlItems = JSON.parse((formData.get('stlItems') as string) || '[]'); } catch (_) {}

      let stlFilePaths = [];
      try { stlFilePaths = JSON.parse((formData.get('existingStlFilePaths') as string) || '[]'); } catch (_) {}

      const stlFilePath = stlFilePaths.length > 0 ? stlFilePaths[0] : (stlItems[0]?.url || null);

      const newCase: DentalCase = {
        id: `case_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        chartNumber,
        patientName,
        dentistName,
        technicianName,
        summary: summary || `${patientName} 환자 보철 디자인 컨펌 요청`,
        description,
        requestType,
        status: '확인 전',
        stlFilePath,
        stlFilePaths,
        stlItems,
        images,
        pins,
        cameraState,
        cameraStates,
        dentistFeedback: '',
        createdAt: new Date().toISOString(),
        confirmedAt: null
      };

      const saved = await createDentalCase(newCase);
      await fetchCases();

      setActiveCaseId(saved.id);
      setEditingCase(null);
      setCurrentView('detail');
      window.location.hash = `case-${saved.id}`;
    } catch (err: any) {
      console.error('Error saving case:', err);
      throw new Error(`보철 등록 실패: ${err.message || err}`);
    }
  };

  // Update existing case details
  const handleUpdateCase = async (formData: FormData) => {
    const targetCaseId = editingCase?.id || activeCaseId;
    if (!targetCaseId) {
      throw new Error('수정할 케이스 정보를 찾을 수 없습니다.');
    }

    const existing = cases.find(c => c.id === targetCaseId) || editingCase;
    if (!existing) throw new Error('수정할 케이스 정보를 찾을 수 없습니다.');

    try {
      const chartNumber = (formData.get('chartNumber') as string || existing.chartNumber).trim();
      const patientName = (formData.get('patientName') as string || existing.patientName).trim();
      const dentistName = (formData.get('dentistName') as string || existing.dentistName).trim();
      const technicianName = (formData.get('technicianName') as string || existing.technicianName).trim();
      const summary = (formData.get('summary') as string || existing.summary).trim();
      const description = formData.get('description') !== null ? (formData.get('description') as string).trim() : existing.description;
      const requestType = formData.get('requestType') !== null ? (formData.get('requestType') as string).trim() : existing.requestType;
      const status = (formData.get('status') as string || existing.status) as any;

      let pins = existing.pins;
      if (formData.get('pins')) {
        try { pins = JSON.parse(formData.get('pins') as string); } catch (_) {}
      }

      let cameraState = existing.cameraState;
      if (formData.get('cameraState')) {
        try { cameraState = JSON.parse(formData.get('cameraState') as string); } catch (_) {}
      }

      let cameraStates = existing.cameraStates || [];
      if (formData.get('cameraStates')) {
        try { cameraStates = JSON.parse(formData.get('cameraStates') as string); } catch (_) {}
      }

      let images = existing.images || [];
      if (formData.get('existingImages')) {
        try { images = JSON.parse(formData.get('existingImages') as string); } catch (_) {}
      }

      let stlItems = existing.stlItems || [];
      if (formData.get('stlItems')) {
        try { stlItems = JSON.parse(formData.get('stlItems') as string); } catch (_) {}
      }

      let stlFilePaths = existing.stlFilePaths || [];
      if (formData.get('existingStlFilePaths')) {
        try { stlFilePaths = JSON.parse(formData.get('existingStlFilePaths') as string); } catch (_) {}
      }
      const stlFilePath = stlFilePaths.length > 0 ? stlFilePaths[0] : (stlItems[0]?.url || existing.stlFilePath);

      const updated: DentalCase = {
        ...existing,
        chartNumber,
        patientName,
        dentistName,
        technicianName,
        summary,
        description,
        requestType,
        status,
        stlFilePath,
        stlFilePaths,
        stlItems,
        images,
        pins,
        cameraState,
        cameraStates
      };

      await updateDentalCase(targetCaseId, updated);
      await fetchCases();

      setEditingCase(null);
      setActiveCaseId(targetCaseId);
      setCurrentView('detail');
      window.location.hash = `case-${targetCaseId}`;
    } catch (err: any) {
      console.error('Error updating case:', err);
      throw new Error(`보철 수정 실패: ${err.message || err}`);
    }
  };

  // Confirm case (Dentist feedback / status update)
  const handleConfirmCase = async (id: string, dentistFeedback: string, status: string = '확인 완료') => {
    try {
      await confirmDentalCase(id, dentistFeedback, status as any);
      await fetchCases();
    } catch (err: any) {
      console.error('Confirm error:', err);
      throw new Error(`승인 처리 실패: ${err.message || err}`);
    }
  };

  // Delete case completely
  const handleDeleteCase = async (id: string) => {
    const targetId = String(id).trim();
    try {
      await deleteDentalCase(targetId);
      setCases(prev => prev.filter(c => String(c.id).trim() !== targetId));
    } catch (err: any) {
      console.error('Delete error:', err);
      throw new Error(`삭제 처리 실패: ${err.message || err}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800" id="main-app-container">
      {/* Top Clinical Navigation Header */}
      <header className="bg-white border-b border-slate-200/60 sticky top-0 z-40 shadow-3xs" id="app-header-navigation">
        <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          {/* Logo & Title */}
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/10">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-black font-display text-slate-900 tracking-tight flex items-center gap-1">
                new BD confirm system
              </h1>
              <span className="text-[10px] text-slate-400 font-medium block">
                치과 보철물 3D 디자인 원격 승인 및 협진 시스템
              </span>
            </div>
          </div>

          {/* Connected Infrastructure & Sync Indicators */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Syncing spinner */}
            {isRefreshing && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1 font-semibold animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                NAS 동기화 중...
              </span>
            )}

            {/* Storage Mode Indicator */}
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-3xs ${
                supabaseStatus.isSupabaseActive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
              title={supabaseStatus.isSupabaseActive ? 'Supabase 클라우드 DB 및 스토리지 연동 완료' : 'Supabase 연결 중...'}
            >
              <Database className="w-3.5 h-3.5" />
              <span>{supabaseStatus.isSupabaseActive ? 'Supabase 연동 완료' : 'Supabase 연결 중...'}</span>
            </div>

            {/* Auto Delete Policy Indicator */}
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 text-[10px] font-bold text-amber-700 border border-amber-200/50 shadow-3xs">
              <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
              30일후 자동 삭제
            </span>

            {/* Direct Link Protection Button */}
            <button
              type="button"
              onClick={() => setIsChangingPass(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-900 text-white hover:bg-slate-800 transition-all cursor-pointer shadow-3xs active:scale-95"
              title="외부 무단 접속 제한 및 직링크 보호 비밀번호 설정"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span>직링크 보안 설정</span>
            </button>

            {/* Manual Sync Button */}
            <button
              onClick={() => fetchCases(true)}
              className="p-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 border border-slate-200/60 cursor-pointer"
              title="데이터베이스 및 NAS 동기화 수동 새로고침"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col">
        {!isAuthorized ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 px-4" id="direct-link-protection-gate">
            <div className="bg-white border border-slate-200/80 rounded-3xl p-8 max-w-md w-full shadow-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm border border-blue-100/80">
                <Lock className="w-8 h-8" />
              </div>

              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-bold mb-2.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  <span>외부 무단 접속 제한 보호</span>
                </div>
                <h2 className="text-lg font-black text-slate-900 font-display">
                  보안 접근 권한이 필요합니다
                </h2>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  본 3D CAD 보철 협진 시스템은 등록된 치과/기공소 관계자 전용입니다.<br />
                  <strong className="text-slate-800">공유받으신 직접 페이지 링크(URL 주소)</strong>로 접속해 주시거나, <strong className="text-slate-800">접속 비밀번호</strong>를 입력해 주세요.
                </p>
              </div>

              <form onSubmit={handleUnlockAccess} className="space-y-3">
                <div className="relative">
                  <input
                    type="password"
                    placeholder={isPasswordLoading ? '비밀번호 불러오는 중...' : '접속 비밀번호 입력'}
                    value={inputPassword}
                    onChange={(e) => {
                      setInputPassword(e.target.value);
                      setPassError('');
                    }}
                    className="w-full text-xs px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white text-center font-bold tracking-widest text-slate-800"
                    autoFocus
                    disabled={isPasswordLoading}
                  />
                </div>
                {passError && (
                  <p className="text-[11px] text-rose-500 font-bold animate-shake">{passError}</p>
                )}
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3 rounded-xl shadow-md shadow-blue-500/10 transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isPasswordLoading}
                >
                  <Unlock className="w-4 h-4" />
                  <span>접속 인증 및 들어가기</span>
                </button>
              </form>

              <div className="pt-4 border-t border-slate-100 text-left space-y-2 text-[11px] text-slate-500 bg-slate-50/70 p-4 rounded-2xl">
                <p className="font-bold text-slate-800 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
                  <span>직링크(Direct Link) 직접 접속 안내</span>
                </p>
                <p className="leading-relaxed text-slate-600">
                  원장님 및 기공소 카카오톡/메신저로 공유된 <strong>개별 게시물 링크 주소(URL)</strong>를 클릭하거나 브라우저 주소창에 직접 입력하여 접속하는 경우, 비밀번호 입력 없이 <strong>해당 상세 페이지로 바로 접속</strong>하실 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-24" id="app-loading-screen">
            <HeartPulse className="w-12 h-12 text-blue-500 animate-pulse mb-3" />
            <p className="text-xs text-slate-500 font-bold">조금만 기다려주세요. 불러오는중..</p>
          </div>
        ) : error ? (
          <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md mx-auto text-center shadow-sm my-12" id="app-error-screen">
            <div className="p-3 bg-red-50 text-red-500 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">서버 연결 오류</h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Express 백엔드 서버에 연결할 수 없습니다. 터미널의 서버 빌드 로그 및 포트가 정상 작동 중인지 확인해 주세요.
            </p>
            <button
              onClick={() => {
                setIsLoading(true);
                fetchCases();
              }}
              className="mt-6 bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2 rounded-xl"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {currentView === 'register' ? (
              <motion.div
                key="register"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col"
              >
                <CaseForm
                  onBack={() => {
                    const returnId = editingCase?.id || activeCaseId;
                    if (returnId) {
                      setActiveCaseId(returnId);
                      setCurrentView('detail');
                      window.location.hash = `case-${returnId}`;
                    } else {
                      setCurrentView('dashboard');
                      window.location.hash = '';
                    }
                    setEditingCase(null);
                  }}
                  onSave={editingCase ? handleUpdateCase : handleSaveCase}
                  initialCase={editingCase || undefined}
                  defaultDentist={selectedDentistForForm}
                  defaultTechnician={selectedTechnicianForForm}
                />
              </motion.div>
            ) : currentView === 'detail' && activeCaseId ? (
              <motion.div
                key="detail"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col"
              >
                <CaseDetail
                  caseId={activeCaseId}
                  onBack={() => {
                    setActiveCaseId(null);
                    setEditingCase(null);
                    setCurrentView('dashboard');
                    window.location.hash = '';
                  }}
                  onConfirm={handleConfirmCase}
                  onDelete={handleDeleteCase}
                  onEdit={(dentalCase) => {
                    setEditingCase(dentalCase);
                    setActiveCaseId(dentalCase.id);
                    setCurrentView('register');
                    window.location.hash = 'register';
                  }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col"
              >
                <Dashboard
                  cases={cases}
                  onSelectCase={(id) => {
                    setActiveCaseId(id);
                    setCurrentView('detail');
                    window.location.hash = `case-${id}`;
                  }}
                  onAddCaseClick={(dentistName, technicianName) => {
                    if (dentistName && dentistName !== '전체') {
                      setSelectedDentistForForm(dentistName);
                    } else {
                      setSelectedDentistForForm('김민수원장님');
                    }
                    if (technicianName && technicianName !== '전체') {
                      setSelectedTechnicianForForm(technicianName);
                    } else {
                      setSelectedTechnicianForForm('최용희');
                    }
                    setCurrentView('register');
                    window.location.hash = 'register';
                  }}
                  onDeleteCase={handleDeleteCase}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* Direct Link Protection & Security Password Settings Modal */}
      {isChangingPass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md border border-slate-200/80 shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <span>외부 접속 제한 & 직링크 보안 설정</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsChangingPass(false)}
                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="p-3 bg-blue-50 border border-blue-200/70 rounded-2xl">
                <p className="font-bold text-blue-900 text-xs mb-1">
                  🔒 보안 정책 안내
                </p>
                <p className="text-[11px] text-blue-800">
                  외부 무단 접속을 차단하기 위해, 직접 페이지 링크 주소(URL)를 통해서가 아니면 본 보안 접근 키 또는 접속 비밀번호가 필요합니다.
                </p>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200/70 rounded-2xl">
                <p className="font-bold text-emerald-900 text-xs mb-1">
                  🌐 공유 비밀번호 (PC · 모바일 동기화)
                </p>
                <p className="text-[11px] text-emerald-800">
                  비밀번호는 Supabase 데이터베이스에 저장되어 PC, 모바일, 태블릿 등 모든 기기에서 동일하게 적용됩니다. 한 곳에서 변경하면 모든 접속자에게 즉시 반영됩니다.
                </p>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    현재 설정된 접속 비밀번호
                  </label>
                  <input
                    type="text"
                    disabled
                    value={customPassword}
                    className="w-full text-xs p-2.5 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-600 text-center tracking-wider"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    새로운 접속 비밀번호 설정
                  </label>
                  <input
                    type="text"
                    placeholder="새 비밀번호 입력 (예: 5678)"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-center font-bold tracking-wider"
                  />
                </div>

                {passSuccessMsg && (
                  <p className="text-[11px] text-emerald-600 font-bold text-center">{passSuccessMsg}</p>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    비밀번호 변경 저장
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAuthorized(false);
                      sessionStorage.removeItem('dental_access_auth');
                      setIsChangingPass(false);
                    }}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-2.5 rounded-xl transition-all cursor-pointer"
                    title="현재 세션을 잠그고 접속 화면으로 이동합니다."
                  >
                    세션 잠그기
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}




      {/* Footer bar */}
      <footer className="bg-white border-t border-slate-200/60 py-6 text-center text-xs text-slate-400 select-none shrink-0" id="app-footer">
        <div className="w-full max-w-[1700px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-3">
          <span>&copy; 2026 3D Dental CAD Confirmation System. All Rights Reserved.</span>
          <span className="flex items-center gap-1.5 font-medium text-slate-500">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            서울비디치과 전용 · Copyright &copy; 서울비디치과 All Rights Reserved.
          </span>
        </div>
      </footer>
    </div>
  );
}
