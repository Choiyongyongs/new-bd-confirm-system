import React, { useState, useEffect } from 'react';
import { DentalCase, ConfirmStatus } from '../types';
import {
  fetchDentists as apiFetchDentists,
  addDentist as apiAddDentist,
  deleteDentist as apiDeleteDentist,
  fetchTechnicians as apiFetchTechnicians,
  addTechnician as apiAddTechnician,
  deleteTechnician as apiDeleteTechnician,
  fetchNotices as apiFetchNotices,
  addNotice as apiAddNotice,
  updateNotice as apiUpdateNotice,
  deleteNotice as apiDeleteNotice
} from '../services/api';
import { 
  User, 
  Search, 
  Plus, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  HardDrive,
  Clock,
  ChevronRight,
  ShieldAlert,
  X,
  Megaphone,
  Bell,
  Edit3,
  Pin,
  Trash2
} from 'lucide-react';

interface DashboardProps {
  cases: DentalCase[];
  onSelectCase: (id: string) => void;
  onAddCaseClick: (dentistName?: string, technicianName?: string) => void;
  onDeleteCase?: (id: string) => Promise<void> | void;
}

interface NoticeItem {
  id: string;
  content: string;
  author: string;
  createdAt: string;
}

export const IMMUTABLE_CORE_DENTISTS = [
  '김민수원장님', 
  '현정민원장님', 
  '문석준원장님'
];

export const DEFAULT_REMOVABLE_DENTISTS = [
  '최종훈원장님', 
  '박수빈원장님',
  '박상현원장님', 
  '김민규원장님', 
  '임지원원장님', 
  '이승엽원장님'
];

export const DEFAULT_INITIAL_TECHNICIANS = [
  '최용희', 
  '김찬유', 
  '양소영', 
  '박세진', 
  '정서영', 
  '최이슬'
];

export default function Dashboard({ cases, onSelectCase, onAddCaseClick, onDeleteCase }: DashboardProps) {
  const [selectedDentist, setSelectedDentist] = useState<string>('전체');
  const [selectedTechnician, setSelectedTechnician] = useState<string>('전체');
  const [statusFilter, setStatusFilter] = useState<string>('전체');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Hospital Dentist Filter List — Supabase shared DB
  const [dentistsList, setDentistsList] = useState<{ id: string; name: string; isCore?: boolean }[]>([]);

  // Hospital Technician Filter List — Supabase shared DB
  const [techniciansList, setTechniciansList] = useState<{ id: string; name: string }[]>([]);

  const fetchDentists = async () => {
    try {
      const data = await apiFetchDentists();
      if (Array.isArray(data) && data.length > 0) {
        setDentistsList(data);
      }
    } catch (err) {
      console.error('[DENTISTS] Fetch error:', err);
    }
  };

  const fetchTechnicians = async () => {
    try {
      const data = await apiFetchTechnicians();
      if (Array.isArray(data) && data.length > 0) {
        setTechniciansList(data);
      }
    } catch (err) {
      console.error('[TECHNICIANS] Fetch error:', err);
    }
  };

  const [isAddDentistOpen, setIsAddDentistOpen] = useState(false);
  const [newDentistName, setNewDentistName] = useState('');

  const [isAddTechnicianOpen, setIsAddTechnicianOpen] = useState(false);
  const [newTechnicianName, setNewTechnicianName] = useState('');

  // Delete Confirmation Popup Modal State for Dentist / Technician Filter
  const [deleteFilterTarget, setDeleteFilterTarget] = useState<{
    type: 'dentist' | 'technician';
    name: string;
  } | null>(null);

  // Hospital Announcement Notices — Supabase shared DB (최대 10개)
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [isNoticesLoading, setIsNoticesLoading] = useState(true);

  // Fetch notices from server (Supabase → local fallback)
  const fetchNotices = async () => {
    try {
      const data = await apiFetchNotices();
      setNotices(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[NOTICES] Fetch error:', err);
    } finally {
      setIsNoticesLoading(false);
    }
  };

  useEffect(() => {
    fetchNotices();
    fetchDentists();
    fetchTechnicians();
  }, []);

  const [isNoticeModalOpen, setIsNoticeModalOpen] = useState(false);
  const [editingNoticeId, setEditingNoticeId] = useState<string | null>(null);
  const [newNoticeContent, setNewNoticeContent] = useState('');
  const [newNoticeAuthor, setNewNoticeAuthor] = useState('대표원장님');

  const openNoticeModal = () => {
    setEditingNoticeId(null);
    setNewNoticeContent('');
    setNewNoticeAuthor('대표원장님');
    setIsNoticeModalOpen(true);
  };

  const handleStartEditNotice = (notice: NoticeItem) => {
    setEditingNoticeId(notice.id);
    setNewNoticeContent(notice.content);
    setNewNoticeAuthor(notice.author);
    setIsNoticeModalOpen(true);
  };

  const handleAddNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoticeContent.trim()) return;

    try {
      if (editingNoticeId) {
        await apiUpdateNotice(editingNoticeId, newNoticeContent.trim());
      } else {
        await apiAddNotice(newNoticeContent.trim(), newNoticeAuthor.trim() || '원장단');
      }

      await fetchNotices();
    } catch (err) {
      console.error('[NOTICES] Save error:', err);
    }

    setEditingNoticeId(null);
    setNewNoticeContent('');
    setIsNoticeModalOpen(false);
  };

  const handleDeleteNotice = async (id: string) => {
    if (editingNoticeId === id) {
      setEditingNoticeId(null);
      setNewNoticeContent('');
    }
    try {
      await apiDeleteNotice(id);
      await fetchNotices();
    } catch (err) {
      console.error('[NOTICES] Delete error:', err);
    }
  };

  const uniqueDentists = Array.from(new Set(cases.map(c => c.dentistName)));
  const dbDentistNames = dentistsList.map(d => d.name);
  const allDentistTabs = Array.from(new Set([
    '전체',
    ...(dbDentistNames.length > 0 ? dbDentistNames : [...IMMUTABLE_CORE_DENTISTS, ...DEFAULT_REMOVABLE_DENTISTS]),
    ...uniqueDentists.filter(name => name && name !== '전체')
  ]));

  const uniqueTechnicians = Array.from(new Set(cases.map(c => c.technicianName).filter(Boolean)));
  const dbTechnicianNames = techniciansList.map(t => t.name);
  const allTechnicianTabs = Array.from(new Set([
    '전체',
    ...(dbTechnicianNames.length > 0 ? dbTechnicianNames : DEFAULT_INITIAL_TECHNICIANS),
    ...uniqueTechnicians.filter(name => name && name !== '전체')
  ]));

  // Handle adding a dentist (Supabase DB)
  const handleAddDentistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let formattedName = newDentistName.trim();
    if (!formattedName) return;
    
    // Auto-append '원장님' if they just typed the name
    if (!formattedName.endsWith('원장님')) {
      formattedName += '원장님';
    }

    try {
      await apiAddDentist(formattedName);
      await fetchDentists();
      setSelectedDentist(formattedName);
      setSelectedTechnician('전체');
    } catch (err) {
      console.error('[DENTISTS] Add error:', err);
      setSelectedDentist(formattedName);
      setSelectedTechnician('전체');
    }
    
    setNewDentistName('');
    setIsAddDentistOpen(false);
  };

  // Handle removing a removable dentist (Supabase DB)
  const handleRemoveDentist = async (dentistToRemove: string) => {
    if (IMMUTABLE_CORE_DENTISTS.includes(dentistToRemove) || dentistToRemove === '전체') {
      return;
    }
    try {
      await apiDeleteDentist(dentistToRemove);
      await fetchDentists();
      if (selectedDentist === dentistToRemove) {
        setSelectedDentist('전체');
      }
    } catch (err) {
      console.error('[DENTISTS] Delete error:', err);
    }
  };

  // Handle adding a technician (Supabase DB)
  const handleAddTechnicianSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedName = newTechnicianName.trim();
    if (!formattedName) return;

    try {
      await apiAddTechnician(formattedName);
      await fetchTechnicians();
      setSelectedTechnician(formattedName);
      setSelectedDentist('전체');
    } catch (err) {
      console.error('[TECHNICIANS] Add error:', err);
      setSelectedTechnician(formattedName);
      setSelectedDentist('전체');
    }

    setNewTechnicianName('');
    setIsAddTechnicianOpen(false);
  };

  // Handle removing a technician (Supabase DB)
  const handleRemoveTechnician = async (techToRemove: string) => {
    if (techToRemove === '전체') return;
    try {
      await apiDeleteTechnician(techToRemove);
      await fetchTechnicians();
      if (selectedTechnician === techToRemove) {
        setSelectedTechnician('전체');
      }
    } catch (err) {
      console.error('[TECHNICIANS] Delete error:', err);
    }
  };

  // Confirm delete filter (dentist or technician)
  const handleConfirmDeleteFilter = async () => {
    if (!deleteFilterTarget) return;
    const { type, name } = deleteFilterTarget;
    if (type === 'dentist') {
      await handleRemoveDentist(name);
    } else {
      await handleRemoveTechnician(name);
    }
    setDeleteFilterTarget(null);
  };

  // Filter cases based on search, status, dentist, and technician
  const filteredCases = cases.filter((c) => {
    const matchesDentist = selectedDentist === '전체' || c.dentistName === selectedDentist;
    const matchesTechnician = selectedTechnician === '전체' || c.technicianName === selectedTechnician;
    const matchesStatus = statusFilter === '전체' || c.status === statusFilter;
    
    const term = searchQuery.toLowerCase();
    const matchesSearch = 
      c.patientName.toLowerCase().includes(term) || 
      c.chartNumber.toLowerCase().includes(term) ||
      c.technicianName.toLowerCase().includes(term) ||
      c.dentistName.toLowerCase().includes(term) ||
      c.summary.toLowerCase().includes(term);

    return matchesDentist && matchesTechnician && matchesStatus && matchesSearch;
  });

  // Calculate statistics
  const totalCount = cases.length;

  const isTechReq = (c: DentalCase) => Boolean(c.requestType && (c.requestType.includes('기공사') || c.requestType.includes('담당자')));

  // 원장님 확인부탁드려요 게시물들
  const dentistReqCases = cases.filter(c => !isTechReq(c));
  const dentistPendingCount = dentistReqCases.filter(c => c.status === '확인 전').length;
  const dentistDoneCount = dentistReqCases.filter(c => c.status === '확인 완료' || c.status === '수정 완료').length;

  // 담당자(기공사) 확인부탁드려요 게시물들
  const techReqCases = cases.filter(c => isTechReq(c));
  const techPendingCount = techReqCases.filter(c => c.status === '확인 전').length;
  const techDoneCount = techReqCases.filter(c => c.status === '확인 완료' || c.status === '수정 완료').length;

  return (
    <div className="flex-1 flex flex-col gap-6" id="dashboard-view">
      {/* 원장님 전체 직원 공지사항 상단 배너 (최대 10개 최신순 표시) */}
      <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-blue-800/40 relative overflow-hidden">
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 relative z-10 mb-3 pb-3 border-b border-blue-800/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-500/20 text-blue-300 rounded-xl border border-blue-400/30 shrink-0 shadow-inner">
              <Megaphone className="w-4 h-4 text-blue-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black tracking-wider text-blue-200">
                  📢 전체 공지사항
                </span>
                <span className="text-[10px] bg-blue-500/30 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30 font-mono">
                  총 {notices.length}건 (최신 10개 유지)
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={openNoticeModal}
            className="shrink-0 inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-blue-400/30 transition-all active:scale-95 cursor-pointer shadow-md"
            title="새 공지사항 등록"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>새 공지 작성</span>
          </button>
        </div>

        {/* Notice List Container */}
        {notices.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">등록된 공지사항이 없습니다. [새 공지 작성] 버튼을 눌러 등록하세요.</p>
        ) : (
          <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
            {notices.map((item, idx) => (
              <div 
                key={item.id}
                className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                  idx === 0 
                    ? 'bg-blue-900/40 border-blue-500/40 text-blue-50 shadow-sm' 
                    : 'bg-white/5 border-white/10 text-slate-200'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <span className={`text-[10px] font-bold shrink-0 px-2 py-0.5 rounded-md mt-0.5 ${
                    idx === 0 ? 'bg-blue-500 text-white font-mono' : 'bg-slate-700/60 text-slate-300 font-mono'
                  }`}>
                    {idx === 0 ? '최신' : `${idx + 1}`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium leading-relaxed whitespace-pre-wrap break-words">
                      {item.content}
                    </p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                      <span>✍️ {item.author}</span>
                      <span>•</span>
                      <span>{item.createdAt}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartEditNotice(item)}
                    className="opacity-60 hover:opacity-100 text-blue-200 hover:text-white hover:bg-blue-500/30 p-1 rounded-lg transition-all cursor-pointer"
                    title="이 공지 수정"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteNotice(item.id)}
                    className="opacity-60 hover:opacity-100 text-rose-300 hover:text-white hover:bg-rose-500/30 p-1 rounded-lg transition-all cursor-pointer"
                    title="이 공지 삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Header and Add Case Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-slate-900">보철물 컨펌 대시보드</h2>
          <p className="text-xs text-slate-500 mt-1">원내 기공실과 의료진 간의 실시간 3D 디지털 디자인 승인 워크플로우</p>
        </div>
        
        <button
          onClick={() => onAddCaseClick(
            selectedDentist !== '전체' ? selectedDentist : '김민수원장님',
            selectedTechnician !== '전체' ? selectedTechnician : undefined
          )}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 active:scale-95 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          작성
        </button>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
        {/* Total Stat */}
        <div className="bg-white border border-slate-200/60 p-4 rounded-2xl flex items-center gap-3.5 shadow-xs">
          <div className="p-2.5 bg-slate-100 rounded-xl text-slate-600 shrink-0">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">전체 등록 건수</span>
            <span className="text-2xl sm:text-3xl font-black font-display text-slate-800 tracking-tight">
              {totalCount} <span className="text-xs text-slate-400 font-normal">건</span>
            </span>
          </div>
        </div>

        {/* 원장님 확인부탁드려요 Stat */}
        <div className="bg-white border border-slate-200/60 p-4 rounded-2xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3 min-w-0 w-full">
            <div className="p-2 bg-blue-50 border border-blue-200/60 rounded-xl text-blue-600 shrink-0 flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11">
              <span className="text-base sm:text-lg">🧑‍⚕️</span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black text-blue-700 block uppercase tracking-wider truncate">
                원장님 확인부탁
              </span>
              <div className="flex items-center gap-3 sm:gap-4 mt-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] font-extrabold text-red-500">원장님확인전</span>
                  <span className="text-xl sm:text-2xl font-black font-display text-red-600 leading-none">
                    {dentistPendingCount}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">건</span>
                </div>
                <span className="text-slate-200 text-xs">|</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] font-extrabold text-emerald-600">확인후</span>
                  <span className="text-xl sm:text-2xl font-black font-display text-emerald-600 leading-none">
                    {dentistDoneCount}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">건</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 담당기공사(담당자) 확인부탁드려요 Stat */}
        <div className="bg-white border border-slate-200/60 p-4 rounded-2xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3 min-w-0 w-full">
            <div className="p-2 bg-indigo-50 border border-indigo-200/60 rounded-xl text-indigo-600 shrink-0 flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11">
              <span className="text-base sm:text-lg">🥼</span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-[10px] font-black text-indigo-700 block uppercase tracking-wider truncate">
                담당자 확인부탁
              </span>
              <div className="flex items-center gap-3 sm:gap-4 mt-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] font-extrabold text-amber-600">기공사확인전</span>
                  <span className="text-xl sm:text-2xl font-black font-display text-amber-600 leading-none">
                    {techPendingCount}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">건</span>
                </div>
                <span className="text-slate-200 text-xs">|</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] font-extrabold text-emerald-600">확인후</span>
                  <span className="text-xl sm:text-2xl font-black font-display text-emerald-600 leading-none">
                    {techDoneCount}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">건</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dentist Tabs, Technician Tabs, Search and Status Filters */}
      <div className="bg-white border border-slate-200/60 rounded-2xl p-4 flex flex-col gap-4 shadow-xs">
        {/* 1. Dentist Selector Tabs */}
        <div className="border-b border-slate-100 pb-3">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">담당 원장님 필터</span>
            <button
              type="button"
              onClick={() => setIsAddDentistOpen(true)}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/80 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer shadow-3xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>원장님 추가</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allDentistTabs.map((dentist) => {
              const isSelected = selectedDentist === dentist;
              const isImmutable = IMMUTABLE_CORE_DENTISTS.includes(dentist) || dentist === '전체';
              const canRemove = !isImmutable;
              const hasNew = dentist === '전체'
                ? cases.some(c => c.status === '확인 전')
                : cases.some(c => c.dentistName === dentist && c.status === '확인 전');
              
              return (
                <div key={dentist} className="relative group flex items-center">
                  <button
                    onClick={() => {
                      setSelectedDentist(dentist);
                      setSelectedTechnician('전체');
                    }}
                    className={`px-3.5 sm:px-4.5 py-1.5 rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center min-h-[46px] sm:min-h-[50px] ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-xs font-bold ring-2 ring-slate-900/20'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100/90 border border-slate-200/60 hover:border-slate-300'
                    } ${canRemove ? 'pr-8 sm:pr-8.5' : ''}`}
                  >
                    {hasNew ? (
                      <span className="text-[9px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200/60 animate-pulse mb-0.5 leading-none shadow-3xs">
                        NEW
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-transparent leading-none mb-0.5 select-none">
                        SPACER
                      </span>
                    )}

                    {dentist === '전체' ? (
                      <span className="flex items-center gap-1.5 leading-none">
                        <span className="text-sm">🏥</span>
                        <span className="text-[15px] sm:text-[16px] font-black tracking-tight">전체</span>
                      </span>
                    ) : (
                      <span className="flex items-baseline gap-0.5 leading-none">
                        <span className="text-xs sm:text-sm mr-1 opacity-90">🧑‍⚕️</span>
                        <span className="text-[15px] sm:text-[16px] font-black tracking-tight">
                          {dentist.endsWith('원장님') ? dentist.slice(0, -3) : dentist}
                        </span>
                        {dentist.endsWith('원장님') && (
                          <span className={`text-[11px] sm:text-[12px] font-bold ml-0.5 ${
                            isSelected ? 'text-slate-300' : 'text-slate-400'
                          }`}>
                            원장님
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                  {canRemove && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteFilterTarget({ type: 'dentist', name: dentist });
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200/90 hover:bg-red-500 text-slate-500 hover:text-white flex items-center justify-center text-xs font-black transition-all cursor-pointer opacity-0 group-hover:opacity-100 shadow-3xs"
                      title="원장님 삭제"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. Technician Selector Tabs */}
        <div className="border-b border-slate-100 pb-3">
          <div className="flex justify-between items-center mb-2.5">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">담당 기공사 필터</span>
            <button
              type="button"
              onClick={() => setIsAddTechnicianOpen(true)}
              className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100/80 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 cursor-pointer shadow-3xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>기공사 추가</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allTechnicianTabs.map((tech) => {
              const isSelected = selectedTechnician === tech;
              const canRemove = tech !== '전체';
              const hasNew = tech === '전체'
                ? cases.some(c => c.status === '확인 전')
                : cases.some(c => c.technicianName === tech && c.status === '확인 전');
              
              return (
                <div key={tech} className="relative group flex items-center">
                  <button
                    onClick={() => {
                      setSelectedTechnician(tech);
                      setSelectedDentist('전체');
                    }}
                    className={`px-3.5 sm:px-4.5 py-1.5 rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center min-h-[46px] sm:min-h-[50px] ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs font-bold ring-2 ring-blue-600/20'
                        : 'bg-slate-50 text-slate-700 hover:bg-slate-100/90 border border-slate-200/60 hover:border-slate-300'
                    } ${canRemove ? 'pr-8 sm:pr-8.5' : ''}`}
                  >
                    {hasNew ? (
                      <span className="text-[9px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200/60 animate-pulse mb-0.5 leading-none shadow-3xs">
                        NEW
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold text-transparent leading-none mb-0.5 select-none">
                        SPACER
                      </span>
                    )}

                    {tech === '전체' ? (
                      <span className="flex items-center gap-1.5 leading-none">
                        <span className="text-sm">🥼</span>
                        <span className="text-[15px] sm:text-[16px] font-black tracking-tight">전체</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 leading-none">
                        <span className="text-xs sm:text-sm mr-0.5 opacity-90">👤</span>
                        <span className="text-[15px] sm:text-[16px] font-black tracking-tight">
                          {tech}
                        </span>
                      </span>
                    )}
                  </button>
                  {canRemove && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteFilterTarget({ type: 'technician', name: tech });
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200/90 hover:bg-red-500 text-slate-500 hover:text-white flex items-center justify-center text-xs font-black transition-all cursor-pointer opacity-0 group-hover:opacity-100 shadow-3xs"
                      title="기공사 삭제"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Search & Status Filters (Moved Below Both Filters) */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1">
          {/* Search Inputs */}
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="환자 이름, 차트번호, 원장님 또는 담당 기공사로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all"
            />
          </div>

          {/* Status Selection */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
            {['전체', '확인 전', '확인 완료', '수정 완료'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  statusFilter === status
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Case List Header / Subtitle */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            디자인 컨펌 목록 ({filteredCases.length}건 검색됨)
          </h3>
          <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
            {selectedDentist !== '전체' && (
              <span>
                원장님: <strong className="text-slate-800">{selectedDentist}</strong>
              </span>
            )}
            {selectedTechnician !== '전체' && (
              <span>
                기공사: <strong className="text-blue-600">{selectedTechnician}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Grid List */}
      {filteredCases.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="cases-grid-list">
          {filteredCases.map((c) => {
            const isConfirmed = c.status === '확인 완료';
            return (
              <div
                key={c.id}
                onClick={() => onSelectCase(c.id)}
                className="bg-white border border-slate-200/60 rounded-2xl p-4 hover:border-blue-500/50 glow-on-hover transition-all flex flex-col justify-between h-44 shadow-2xs group cursor-pointer relative"
                id={`case-card-${c.id}`}
              >
                {/* Top status & date */}
                <div>
                  <div className="flex justify-between items-start gap-2 mb-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* 요청 구분 뱃지 (상태란 왼쪽) */}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                        c.requestType?.includes('기공사')
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200/80'
                          : 'bg-sky-50 text-sky-800 border-sky-200/80'
                      }`}>
                        <span className="text-[10px]">{c.requestType?.includes('기공사') ? '🥼' : '🧑‍⚕️'}</span>
                        <span>{c.requestType?.includes('기공사') ? '담당기공사님 확인부탁드려요.' : (c.requestType || '원장님 확인부탁드려요.')}</span>
                      </span>

                      {/* 상태 뱃지 (오른쪽: 확인전 / 확인완료 / 수정완료) */}
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                        c.status === '확인 완료'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : c.status === '수정 완료'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          c.status === '확인 완료' ? 'bg-emerald-500' : (c.status === '수정 완료' ? 'bg-purple-500' : 'bg-red-500')
                        }`}></span>
                        {c.status}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(c.createdAt).toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>

                      {/* 케이스 완전 삭제 버튼 */}
                      {onDeleteCase && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const isConfirmed = window.confirm(`삭제하시겠습니까?\n\n[${c.status}] ${c.patientName} 환자의 보철 디자인 게시글 및 저장된 파일이 영구 삭제됩니다.`);
                            if (isConfirmed) {
                              try {
                                await onDeleteCase(c.id);
                                alert('게시글이 성공적으로 삭제되었습니다.');
                              } catch (err: any) {
                                alert(err.message || '게시글 삭제 중 오류가 발생했습니다.');
                              }
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-1 cursor-pointer"
                          title="게시글 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500/80 hover:text-rose-600" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Chart and Patient Info */}
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-[11px] font-bold font-rounded-bold border border-blue-100">
                      차트번호 {c.chartNumber}
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 font-rounded-bold">{c.patientName} 환자</h4>
                  </div>

                  {/* Summary of request */}
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-2 pr-2 font-rounded">
                    {c.summary}
                  </p>
                </div>

                {/* Footer clinicians information & action */}
                <div className="border-t border-slate-100 pt-2.5 mt-auto flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] text-slate-500 font-rounded">
                      의료진: <strong className="text-blue-700 font-bold font-rounded-bold">{c.dentistName}</strong>
                    </span>
                    <span className="text-[11px] text-slate-500 font-rounded">
                      기공사: <strong className="text-slate-800 font-bold font-rounded-bold">{c.technicianName}</strong>
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 group-hover:translate-x-1 transition-transform">
                    {isConfirmed ? '상세 내역' : '컨펌 진행'}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center text-center shadow-2xs">
          <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-slate-300" />
          </div>
          <h4 className="text-sm font-bold text-slate-800">해당 조건에 맞는 환자 케이스가 없습니다.</h4>
          <p className="text-xs text-slate-400 max-w-sm mt-1.5 leading-relaxed">
            원장님 필터를 조정하거나 우측 상단의 [신규 환자 디자인 등록]을 눌러 보철 요청 건을 생성해 주세요.
          </p>
          <button
            onClick={() => onAddCaseClick(selectedDentist !== '전체' ? selectedDentist : '김민수원장님')}
            className="mt-5 inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            신규 케이스 등록하러 가기
          </button>
        </div>
      )}

      {/* 공지사항 입력/수정/등록 모달 */}
      {isNoticeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg border border-slate-200/80 shadow-2xl animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-blue-600" />
                <span>{editingNoticeId ? '공지사항 수정' : '새 공지사항 등록 (최대 10개 최신순 유지)'}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditingNoticeId(null);
                  setIsNoticeModalOpen(false);
                }}
                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNotice} className="space-y-4 overflow-y-auto pr-1 flex-1">
              {editingNoticeId && (
                <div className="flex items-center justify-between p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-blue-600" />
                    선택한 공지를 수정하는 중입니다
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingNoticeId(null);
                      setNewNoticeContent('');
                      setNewNoticeAuthor('대표원장님');
                    }}
                    className="text-[10px] bg-white border border-blue-300 text-blue-700 px-2 py-0.5 rounded-lg hover:bg-blue-100 cursor-pointer"
                  >
                    신규 작성으로 전환
                  </button>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  작성자 (원장님 / 작성자)
                </label>
                <input
                  type="text"
                  placeholder="예: 대표원장님, 김원장님, 원장단"
                  value={newNoticeAuthor}
                  onChange={(e) => setNewNoticeAuthor(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  공지사항 내용 (한줄 또는 여러줄 가능)
                </label>
                <textarea
                  rows={3}
                  placeholder="전 직원 및 기공실에 전달할 공지사항을 입력해 주세요."
                  value={newNoticeContent}
                  onChange={(e) => setNewNoticeContent(e.target.value)}
                  className="w-full text-xs p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all font-medium leading-relaxed resize-none"
                  required
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200/60 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                💡 공지 등록/수정 시 대시보드 상단에 즉시 반영됩니다. (최대 10개까지 정렬 유지)
              </div>

              {/* Existing notices preview/management */}
              {notices.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-500">현재 등록된 공지목록 ({notices.length}/10개)</span>
                    <span className="text-[10px] text-slate-400">✏️ 버튼으로 수정, 🗑️ 버튼으로 삭제 가능</span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {notices.map((n) => (
                      <div 
                        key={n.id} 
                        className={`p-2.5 border rounded-xl flex items-start justify-between gap-2 text-xs transition-all ${
                          editingNoticeId === n.id
                            ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-500/20'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-blue-700 text-[10px] mr-1.5">[{n.author}]</span>
                          <span className="text-slate-700 font-medium">{n.content}</span>
                          <span className="block text-[10px] text-slate-400 mt-0.5">{n.createdAt}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEditNotice(n)}
                            className={`p-1 rounded hover:bg-slate-200 cursor-pointer ${
                              editingNoticeId === n.id ? 'text-blue-600 bg-blue-100 font-bold' : 'text-slate-400 hover:text-blue-600'
                            }`}
                            title="수정"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNotice(n.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-200 cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-2 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setEditingNoticeId(null);
                    setIsNoticeModalOpen(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/10 active:scale-95 transition-all cursor-pointer"
                >
                  {editingNoticeId ? '공지 수정 완료' : '새 공지 등록하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 신규 원장님 추가 모달 */}
      {isAddDentistOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm border border-slate-200/80 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                <span className="text-lg">🧑‍⚕️</span> 신규 원장님 등록
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddDentistOpen(false);
                  setNewDentistName('');
                }}
                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddDentistSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  원장님 성함
                </label>
                <input
                  type="text"
                  placeholder="예: 홍길동"
                  value={newDentistName}
                  onChange={(e) => setNewDentistName(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all font-semibold"
                  autoFocus
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed font-medium">
                  * 성함만 입력하셔도 자동으로 <strong>'원장님'</strong> 호칭이 추가되어 등록됩니다.
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddDentistOpen(false);
                    setNewDentistName('');
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/10 active:scale-95 transition-all cursor-pointer"
                >
                  등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 신규 기공사 추가 모달 */}
      {isAddTechnicianOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm border border-slate-200/80 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                <span className="text-lg">🥼</span> 신규 기공사 등록
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddTechnicianOpen(false);
                  setNewTechnicianName('');
                }}
                className="w-7 h-7 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-full flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddTechnicianSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
                  기공사 성함
                </label>
                <input
                  type="text"
                  placeholder="예: 최용희"
                  value={newTechnicianName}
                  onChange={(e) => setNewTechnicianName(e.target.value)}
                  className="w-full text-xs px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all font-semibold"
                  autoFocus
                  required
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddTechnicianOpen(false);
                    setNewTechnicianName('');
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-500/10 active:scale-95 transition-all cursor-pointer"
                >
                  등록 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 필터 삭제 확인 모달 */}
      {deleteFilterTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm border border-slate-200/80 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-800">
                  {deleteFilterTarget.type === 'dentist' ? '원장님 필터 삭제' : '기공사 필터 삭제'}
                </h3>
                <p className="text-[11px] text-slate-500">필터 목록에서 제거 확인</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200/70 mb-4">
              정말 <strong className="text-slate-900 font-bold">'{deleteFilterTarget.name}'</strong> 필터를 삭제하시겠습니까?
              <br />
              <span className="text-[11px] text-slate-400 mt-1.5 block">
                * 기존에 등록된 환자 케이스 데이터는 삭제되지 않고 안전하게 유지됩니다.
              </span>
            </p>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setDeleteFilterTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteFilter}
                className="px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-md shadow-red-500/10 active:scale-95 transition-all cursor-pointer"
              >
                삭제하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
