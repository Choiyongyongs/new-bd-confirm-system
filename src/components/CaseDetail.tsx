import React, { useState, useEffect, useRef } from 'react';
import { DentalCase, CasePin, CameraState, formatStlUrl } from '../types';
import { fetchCaseById, updateCaseCamera, updateCasePins } from '../services/api';
import ThreeViewer from './ThreeViewer';
import ImageZoomModal from './ImageZoomModal';
import { 
  ArrowLeft, 
  CheckCircle, 
  AlertCircle, 
  User, 
  Hash, 
  Trash2, 
  X, 
  MapPin, 
  FileText, 
  MessageSquare,
  ShieldAlert,
  Clock,
  ExternalLink,
  Edit,
  Camera,
  Share2,
  Check,
  Copy,
  PenLine,
  Lock
} from 'lucide-react';

interface CaseDetailProps {
  caseId: string;
  onBack: () => void;
  onConfirm: (id: string, feedback: string, status?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (dentalCase: DentalCase) => void;
}

export default function CaseDetail({ caseId, onBack, onConfirm, onDelete, onEdit }: CaseDetailProps) {
  const [dentalCase, setDentalCase] = useState<DentalCase | null>(null);
  const [activeCameraState, setActiveCameraState] = useState<CameraState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isChartCopied, setIsChartCopied] = useState(false);
  const maxViewCounterRef = useRef<number>(0);

  // Copy Chart Number only (without Korean prefix)
  const handleCopyChartNumber = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!dentalCase?.chartNumber) return;
    const rawChartNumber = dentalCase.chartNumber;

    navigator.clipboard.writeText(rawChartNumber)
      .then(() => {
        setIsChartCopied(true);
        setTimeout(() => setIsChartCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy chart number: ', err);
        const textArea = document.createElement('textarea');
        textArea.value = rawChartNumber;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          setIsChartCopied(true);
          setTimeout(() => setIsChartCopied(false), 2000);
        } catch (err) {
          alert(`차트번호: ${rawChartNumber}`);
        }
        document.body.removeChild(textArea);
      });
  };

  // Modal State for 2D Image View
  const [activeModalImage, setActiveModalImage] = useState<string | null>(null);
  const [activeModalIndex, setActiveModalIndex] = useState<number>(0);

  // Dentist Feedback Textarea
  const [dentistFeedback, setDentistFeedback] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Active right side panel tab (Pins vs Photos)
  const [activeSideTab, setActiveSideTab] = useState<'pins' | 'photos'>('pins');

  // Copy Link to Clipboard
  const handleCopyLink = () => {
    if (!dentalCase) return;
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}#case-${dentalCase.id}`;

    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
        // Fallback
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
          alert(`링크 주소: ${shareUrl}`);
        }
        document.body.removeChild(textArea);
      });
  };

  // Dentist deleting a pin in real-time
  const handleDeletePin = async (pinId: string) => {
    if (!dentalCase) return;
    const updatedPins = dentalCase.pins.filter(p => p.id !== pinId);
    await handleDentistPinCallback(updatedPins);
  };

  // Dentist updating a pin note in real-time
  const handleUpdatePinNote = async (pinId: string, newNote: string) => {
    if (!dentalCase) return;
    const updatedPins = dentalCase.pins.map(p => p.id === pinId ? { ...p, note: newNote } : p);
    await handleDentistPinCallback(updatedPins);
  };

  // Delete custom view
  const handleDeleteView = async (index: number, viewId?: string) => {
    if (!dentalCase) return;
    const currentViews = dentalCase.cameraStates || (dentalCase.cameraState ? [dentalCase.cameraState] : []);
    const updatedViews = viewId
      ? currentViews.filter(v => v.id !== viewId)
      : currentViews.filter((_, i) => i !== index);
    const newMainView = updatedViews.length > 0 ? updatedViews[0] : null;

    setDentalCase(prev => prev ? {
      ...prev,
      cameraStates: updatedViews,
      cameraState: newMainView
    } : null);

    try {
      await updateCaseCamera(dentalCase.id, newMainView, updatedViews);
    } catch (err) {
      console.error('Failed to delete custom view:', err);
    }
  };

  // Fly camera to a specific pin position
  const handleFlyToPin = (pin: CasePin) => {
    if (!pin || !pin.position || !Array.isArray(pin.position) || pin.position.length < 3) return;
    const [px, py, pz] = pin.position;
    const pinCamera: CameraState = {
      position: [px, py + 4, pz + 6],
      target: [px, py, pz]
    };
    setActiveCameraState(pinCamera);
  };

  useEffect(() => {
    if (dentalCase) {
      setActiveCameraState(prev => {
        if (!prev && dentalCase.cameraState && Array.isArray(dentalCase.cameraState.position) && Array.isArray(dentalCase.cameraState.target)) {
          return dentalCase.cameraState;
        }
        return prev;
      });
    }
  }, [dentalCase?.id]);

  // Load Single Case Details from API
  const loadCaseDetails = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchCaseById(caseId);
      if (!data) {
        throw new Error('해당 보철 케이스를 찾을 수 없습니다.');
      }
      setDentalCase(data);
      setDentistFeedback(data.dentistFeedback || '');

      let max = 0;
      if (data.cameraStates && Array.isArray(data.cameraStates)) {
        data.cameraStates.forEach((v: any, i: number) => {
          const name = v.name || `뷰 #${i + 1}`;
          const match = name.match(/\d+/);
          if (match) {
            const n = parseInt(match[0], 10);
            if (!isNaN(n) && n > max) max = n;
          }
        });
      }
      maxViewCounterRef.current = max;
    } catch (err: any) {
      console.error('Case detail load error:', err);
      setError(err.message || '네트워크 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCaseDetails();
  }, [caseId]);

  // Dentist real-time pin callback (updates pins immediately on the server)
  const handleDentistPinCallback = async (updatedPins: CasePin[]) => {
    if (!dentalCase) return;

    // Optimistically update local pins state for immediate UI feedback without reload
    setDentalCase(prev => prev ? { ...prev, pins: updatedPins } : prev);

    try {
      await updateCasePins(dentalCase.id, updatedPins);
    } catch (e) {
      console.error('Error saving pin in real-time:', e);
      alert('3D 핀 위치 정보를 저장하는 데 실패했습니다.');
    }
  };

  // Save custom camera angle view callback
  const handleSaveAngle = async (cameraState: CameraState) => {
    if (!dentalCase) return;
    try {
      const rawStates = dentalCase.cameraStates || (dentalCase.cameraState ? [dentalCase.cameraState] : []);
      const existingStates = rawStates.map((v, idx) => ({
        ...v,
        id: v.id || `view-${idx + 1}`,
        name: v.name || `뷰 #${idx + 1}`
      }));

      let maxNum = maxViewCounterRef.current;
      existingStates.forEach((v, idx) => {
        const name = v.name || `뷰 #${idx + 1}`;
        const match = name.match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num > maxNum) maxNum = num;
        }
      });
      if (maxNum === 0 && existingStates.length > 0) {
        maxNum = existingStates.length;
      }

      const nextNum = maxNum + 1;
      maxViewCounterRef.current = nextNum;

      const viewName = cameraState.name || `뷰 #${nextNum}`;
      const newView: CameraState = {
        ...cameraState,
        id: cameraState.id || `view-${Date.now()}-${nextNum}`,
        name: viewName
      };

      const newStates = [...existingStates, newView];
      
      setDentalCase(prev => prev ? {
        ...prev,
        cameraState: newView,
        cameraStates: newStates
      } : null);
      setActiveCameraState(newView);

      await updateCaseCamera(dentalCase.id, newView, newStates);
    } catch (e) {
      console.error('Error saving custom view angle:', e);
      alert('커스텀 뷰 저장을 완료하지 못했습니다.');
    }
  };

  // Submit confirmation / status update
  const handleConfirmSubmit = async (targetStatus?: '확인 완료' | '수정 완료') => {
    if (!dentalCase) return;
    const finalStatus = targetStatus || (isFeedbackPreviouslySubmitted ? '수정 완료' : '확인 완료');
    setIsConfirming(true);
    try {
      await onConfirm(dentalCase.id, dentistFeedback.trim(), finalStatus);
      await loadCaseDetails(); // reload to show updated status
      alert(`보철물 디자인이 [${finalStatus}] 처리되었습니다!`);
    } catch (e: any) {
      alert(e.message || '처리 도중 오류가 발생했습니다.');
    } finally {
      setIsConfirming(false);
    }
  };

  // Delete case completely
  const handleDeleteSubmit = async () => {
    if (!dentalCase) return;
    const isOk = window.confirm(
      `삭제하시겠습니까?\n\n[${dentalCase.status}] ${dentalCase.patientName} 환자의 보철 디자인 게시글 및 저장된 모든 파일이 영구 삭제됩니다.`
    );
    if (!isOk) return;

    setIsDeleting(true);
    try {
      await onDelete(dentalCase.id);
      alert('게시글이 성공적으로 삭제되었습니다.');
      onBack(); // Return to list
    } catch (e: any) {
      alert(e.message || '삭제 처리 도중 오류가 발생했습니다.');
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 px-4 text-center select-none" id="detail-loading">
        <div className="relative mb-6">
          <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-600 rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl animate-pulse">🦷</span>
          </div>
        </div>

        <h3 className="text-base font-extrabold text-slate-800 mb-2">
          3D 보철 디자인 및 환자 정보를 불러오는 중입니다
        </h3>
        <p className="text-xs text-slate-500 max-w-sm leading-relaxed mb-6">
          서버에서 3D 모델(STL/PLY/OBJ) 형상 좌표와 임상 사진 및 피드백 데이터를 안전하게 수신하고 있습니다. 잠시만 기다려 주세요...
        </p>

        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50/80 border border-blue-200/60 rounded-xl text-blue-800 text-[11px] font-bold shadow-3xs">
          <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
          <span>데이터베이스 연결 및 3D 그래픽 엔진 준비 중...</span>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="mt-8 text-xs text-slate-400 hover:text-slate-600 underline font-medium cursor-pointer"
        >
          로딩이 너무 길어지면 목록으로 돌아가기
        </button>
      </div>
    );
  }

  if (error || !dentalCase) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20" id="detail-error">
        <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl mb-4 border border-amber-200/80 shadow-xs">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h4 className="text-base font-extrabold text-slate-800">게시글을 찾을 수 없습니다</h4>
        <p className="text-xs text-slate-500 mt-1.5 max-w-md text-center leading-relaxed">
          {error === '해당 케이스를 찾을 수 없습니다.'
            ? '요청하신 보철 디자인 게시글이 파기/삭제되었거나 공유 링크 주소가 올바르지 않습니다.'
            : (error || '데이터를 가져올 수 없습니다.')}
        </p>
        <button
          onClick={() => {
            window.location.hash = '';
            if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
              window.history.replaceState({}, document.title, window.location.pathname);
            }
            onBack();
          }}
          className="mt-6 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-3 rounded-xl cursor-pointer shadow-md shadow-blue-500/10 transition-all active:scale-95 flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>보철 목록으로 돌아가기</span>
        </button>
      </div>
    );
  }

  const isConfirmed = dentalCase.status === '확인 완료';
  const isFeedbackPreviouslySubmitted = Boolean(
    (dentalCase.dentistFeedback && dentalCase.dentistFeedback.trim().length > 0) ||
    dentalCase.status === '확인 완료' ||
    dentalCase.status === '수정 완료'
  );

  return (
    <div className="flex-1 flex flex-col gap-6" id={`case-detail-${dentalCase.id}`}>
      {/* Header Panel (Single Compact Row) */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 pb-3 border-b border-slate-200/80">
        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap font-rounded">
          <button
            onClick={onBack}
            className="p-2 bg-white border border-slate-200/80 hover:bg-slate-100 rounded-xl text-slate-700 cursor-pointer transition-all shadow-3xs"
            title="목록으로"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* 차트번호 */}
          <button
            type="button"
            onClick={handleCopyChartNumber}
            className="inline-flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-2.5 py-1 rounded-xl font-rounded-bold font-bold shadow-xs transition-all cursor-pointer group"
            title="클릭 시 차트번호 복사"
          >
            {isChartCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>복사완료! ({dentalCase.chartNumber})</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 opacity-80 group-hover:opacity-100 transition-opacity" />
                <span>차트번호 {dentalCase.chartNumber}</span>
              </>
            )}
          </button>

          {/* 환자명 제목 */}
          <h2 className="text-lg sm:text-xl font-black font-rounded-bold text-slate-900 tracking-tight">
            {dentalCase.patientName} 환자 보철 디자인
          </h2>

          {/* 요청 구분 및 확인 상태 뱃지 그룹 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold border ${
              dentalCase.requestType?.includes('기공사')
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-sky-50 text-sky-800 border-sky-200'
            }`}>
              <span>{dentalCase.requestType?.includes('기공사') ? '🥼' : '🧑‍⚕️'}</span>
              <span>{dentalCase.requestType?.includes('기공사') ? '담당기공사님 확인부탁드려요.' : (dentalCase.requestType || '원장님 확인부탁드려요.')}</span>
            </span>

            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black font-rounded-bold border ${
              dentalCase.status === '확인 완료'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                : dentalCase.status === '수정 완료'
                ? 'bg-purple-50 text-purple-700 border-purple-200'
                : 'bg-red-50 text-red-600 border-red-200 animate-pulse'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                dentalCase.status === '확인 완료' ? 'bg-emerald-500' : (dentalCase.status === '수정 완료' ? 'bg-purple-500' : 'bg-red-500')
              }`}></span>
              {dentalCase.status}
            </span>
          </div>

          {/* 원장 & 기공사 정보 그룹 (모바일에서도 항상 나란히 배치) */}
          <div className="flex items-center gap-1.5">
            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100/90 text-slate-800 border border-slate-200/70 text-xs">
              <span className="text-slate-400 font-normal">원장</span>
              <span className="text-blue-700 font-bold font-rounded-bold">
                {dentalCase.dentistName}
              </span>
            </div>

            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100/90 text-slate-800 border border-slate-200/70 text-xs">
              <span className="text-slate-400 font-normal">기공사</span>
              <span className="text-slate-900 font-bold font-rounded-bold">
                {dentalCase.technicianName}
              </span>
            </div>
          </div>

          {/* 등록일시 및 완료일시 */}
          <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1 ml-1">
            <span>등록일: <strong className="text-slate-700 font-semibold">{new Date(dentalCase.createdAt).toLocaleString('ko-KR')}</strong></span>
            {dentalCase.confirmedAt && (
              <span className="text-emerald-600 ml-1.5">| 완료일: <strong className="font-semibold">{new Date(dentalCase.confirmedAt).toLocaleString('ko-KR')}</strong></span>
            )}
          </div>
        </div>

        {/* Action Buttons in Header */}
        <div className="flex gap-2 w-full md:w-auto items-center mt-1">
          <button
            type="button"
            onClick={handleCopyLink}
            className={`flex-1 md:flex-none text-xs font-bold px-5 py-2.5 rounded-xl shadow-md cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
              isCopied
                ? 'bg-emerald-600 text-white shadow-emerald-500/10'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/10'
            }`}
            title="원장님 또는 기공소 메신저로 바로 공유할 수 있는 URL 링크를 복사합니다."
          >
            {isCopied ? (
              <>
                <Check className="w-4 h-4 animate-pulse" />
                <span>복사 완료!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4" />
                <span>링크 복사</span>
              </>
            )}
          </button>

          <button
            onClick={() => onEdit(dentalCase)}
            className="flex-1 md:flex-none text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-4 py-2.5 rounded-xl shadow-md shadow-amber-500/10 cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5"
            title="게시글 수정"
          >
            <Edit className="w-4 h-4 shrink-0" />
            <span>수정하기</span>
          </button>
          
          {/* 삭제 버튼 */}
          <button
            onClick={handleDeleteSubmit}
            disabled={isDeleting}
            className="flex-1 md:flex-none text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/60 px-4 py-2.5 rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-2xs"
            title="케이스 및 STL, 이미지 데이터를 삭제합니다."
          >
            <Trash2 className="w-4 h-4 text-rose-500" />
            <span>{isDeleting ? '삭제 중...' : '삭제하기'}</span>
          </button>
        </div>
      </div>

      {/* Main split work area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: 3D interactive viewer (Takes 10 cols, matching creation mode) */}
        <div className="lg:col-span-10 flex flex-col gap-2">
          <div className="flex justify-between items-center px-1 flex-wrap gap-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-blue-500" />
              3D 디지털 설계 모델 검토 {(dentalCase.pins || []).length > 0 && `(활성 핀: ${(dentalCase.pins || []).length}개)`}
            </span>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200/80 shadow-2xs">
              💡 보철물 표면을 더블클릭하여 답변자 피드백 핀(노란색)을 추가할 수 있습니다.
            </span>
          </div>

          <div className="h-[460px] lg:h-[620px] w-full relative">
            <ThreeViewer
              stlUrl={formatStlUrl(dentalCase.stlFilePath)}
              stlUrls={
                dentalCase.stlFilePaths && Array.isArray(dentalCase.stlFilePaths) && dentalCase.stlFilePaths.length > 0
                  ? dentalCase.stlFilePaths.map(formatStlUrl)
                  : (dentalCase.stlFilePath ? [formatStlUrl(dentalCase.stlFilePath)] : [])
              }
              stlItems={
                dentalCase.stlItems && Array.isArray(dentalCase.stlItems) && dentalCase.stlItems.length > 0
                  ? dentalCase.stlItems.map(item => ({
                      ...item,
                      url: formatStlUrl(item.url) || item.url,
                      visible: item.visible !== false,
                      opacity: (item.opacity !== undefined && item.opacity !== null && !isNaN(item.opacity) && item.opacity > 0) ? item.opacity : 1.0
                    }))
                  : undefined
              }
              stlFileName={dentalCase.stlFilePath ? dentalCase.stlFilePath.split('/').pop()?.replace(/^\d+-/, '') : undefined}
              pins={Array.isArray(dentalCase.pins) ? dentalCase.pins : []}
              savedCameraState={activeCameraState}
              customViews={(Array.isArray(dentalCase.cameraStates) ? dentalCase.cameraStates : (dentalCase.cameraState ? [dentalCase.cameraState] : []))
                .filter(v => v && Array.isArray(v.position) && Array.isArray(v.target))
                .map((v, idx) => ({
                  ...v,
                  id: v.id || `view-${idx + 1}`,
                  name: v.name || `뷰 #${idx + 1}`
                }))}
              onSelectView={(view) => setActiveCameraState(view)}
              readOnly={true}
              allowDentistPin={true}
              dentistPinCallback={handleDentistPinCallback}
              onDeletePin={handleDeletePin}
              onUpdatePinNote={handleUpdatePinNote}
              showStlUpload={false}
            />
          </div>
        </div>

        {/* Right Side: Photos (Takes 2 cols, matching creation mode) */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-2xs flex flex-col gap-3 flex-1 min-h-[400px] lg:min-h-[620px]">
            <div className="flex flex-col">
              <h3 className="text-xs font-extrabold text-slate-800">사진 및 참고 자료</h3>
            </div>

            {Array.isArray(dentalCase.images) && dentalCase.images.length > 0 ? (
              <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[420px] lg:max-h-[540px] pr-1 flex-1">
                {dentalCase.images.map((imgUrl, idx) => (
                  <div
                    key={imgUrl}
                    onClick={() => {
                      setActiveModalIndex(idx);
                      setActiveModalImage(imgUrl);
                    }}
                    className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group bg-slate-50 cursor-zoom-in hover:border-blue-500 transition-all shadow-3xs"
                  >
                    <img
                      src={imgUrl}
                      alt={`Photo documentation ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-slate-900/10 group-hover:bg-slate-900/30 transition-colors flex items-center justify-center">
                      <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl flex-1 flex flex-col justify-center items-center">
                <MessageSquare className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-xs text-slate-500 font-bold">첨부된 사진이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Area: Differentiated Lab Request (Read-Only) vs Doctor Feedback (Interactive Input) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Area: Laboratory Instructions & Requests (Read-Only Document Style) */}
        <div className="bg-slate-100/70 border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-3.5">
          <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
            <div className="flex items-center gap-1.5 text-slate-700">
              <FileText className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-black font-rounded-bold text-slate-800">
                전달사항
              </span>
            </div>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Lock className="w-3 h-3 text-slate-400" />
              읽기 전용
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              전체 요약
            </span>
            <div className="bg-white rounded-xl p-3 border border-slate-200/80 text-xs font-bold text-slate-800 shadow-3xs">
              {dentalCase.summary}
            </div>
          </div>

          <div className="flex-1 flex flex-col">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              내용
            </span>
            <div className="bg-white rounded-xl p-3.5 border border-slate-200/80 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap flex-1 min-h-[140px] shadow-3xs">
              {dentalCase.description || '작성된 상세 메모 내용이 없습니다.'}
            </div>
          </div>
        </div>

        {/* Right Area: Doctor Feedback Input (Active Interactive Form Style) */}
        <div className="bg-white border-2 border-blue-500/50 rounded-2xl p-5 shadow-md shadow-blue-500/5 flex flex-col gap-3.5 ring-4 ring-blue-500/5">
          <div className="flex justify-between items-center pb-2 border-b border-blue-100">
            <div className="flex items-center gap-1.5 text-blue-700">
              <PenLine className="w-4 h-4 text-blue-600 animate-bounce" />
              <span className="text-xs font-black font-rounded-bold text-blue-900">
                의견작성란
              </span>
            </div>
            {dentalCase.status === '확인 완료' ? (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                ✓ 확인 완료됨 (수정 가능)
              </span>
            ) : dentalCase.status === '수정 완료' ? (
              <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 flex items-center gap-1">
                ✓ 수정 완료됨 (수정 가능)
              </span>
            ) : (
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 flex items-center gap-1 animate-pulse">
                ✍️ 의견 작성 필요
              </span>
            )}
          </div>

          <div className="flex-1 flex flex-col gap-3">
            <textarea
              placeholder="디자인 승인 , 확인 의견이나 추가 수정 요청 사항 입력해주세요."
              value={dentistFeedback}
              onChange={(e) => setDentistFeedback(e.target.value)}
              className="w-full text-xs p-4 border-2 border-blue-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/15 bg-blue-50/20 focus:bg-white rounded-xl focus:outline-none flex-1 min-h-[140px] resize-y font-medium text-slate-900 placeholder:text-slate-400 transition-all shadow-inner"
            />
            <div className="flex justify-end gap-2 shrink-0">
              {isFeedbackPreviouslySubmitted ? (
                <button
                  type="button"
                  onClick={() => handleConfirmSubmit('수정 완료')}
                  disabled={isConfirming}
                  className="w-full font-bold text-xs py-3.5 px-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 shadow-purple-500/20 hover:shadow-purple-500/30"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isConfirming ? '수정 처리 중...' : '수정완료'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleConfirmSubmit('확인 완료')}
                  disabled={isConfirming}
                  className="w-full font-bold text-xs py-3.5 px-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 shadow-blue-500/20 hover:shadow-blue-500/30"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isConfirming ? '확인 처리 중...' : '확인완료'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Zoom Image Overlay Modal */}
      {activeModalImage && (
        <ImageZoomModal
          imageUrl={activeModalImage}
          images={dentalCase.images}
          initialIndex={activeModalIndex}
          title={`${dentalCase.patientName} 환자 사진`}
          onClose={() => setActiveModalImage(null)}
        />
      )}
    </div>
  );
}
