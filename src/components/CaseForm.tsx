import React, { useState, useRef, useEffect } from 'react';
import { CameraState, CasePin, DentalCase, StlItem, formatStlUrl, getModelExtension, PRESET_COLORS, DEFAULT_STL_COLOR, ConfirmRequestType } from '../types';
import ThreeViewer from './ThreeViewer';
import ImageZoomModal from './ImageZoomModal';
import { IMMUTABLE_CORE_DENTISTS, DEFAULT_REMOVABLE_DENTISTS } from './Dashboard';
import { uploadFileWithChunking } from '../utils/fileUploader';
import { fetchDentists, fetchTechnicians } from '../services/api';
import {
  ArrowLeft,
  UploadCloud,
  Image as ImageIcon,
  FileText,
  User,
  Hash,
  Trash2,
  HelpCircle,
  Stethoscope,
  Camera,
  ZoomIn
} from 'lucide-react';

interface CaseFormProps {
  onBack: () => void;
  onSave: (formData: FormData) => Promise<void>;
  initialCase?: DentalCase;
  defaultDentist?: string;
  defaultTechnician?: string;
}

export default function CaseForm({ onBack, onSave, initialCase, defaultDentist, defaultTechnician }: CaseFormProps) {
  // Loading & Submitting states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load available dentists inside CaseForm from shared DB API
  const [dbDentists, setDbDentists] = useState<string[]>([]);

  useEffect(() => {
    fetchDentists()
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setDbDentists(data.map((d: any) => typeof d === 'string' ? d : d.name));
        }
      })
      .catch(err => console.error('[CASE FORM] Dentist fetch error:', err));
  }, []);

  const dentistOptions = React.useMemo(() => {
    const list = dbDentists.length > 0
      ? dbDentists
      : [...IMMUTABLE_CORE_DENTISTS, ...DEFAULT_REMOVABLE_DENTISTS];

    const all = Array.from(new Set([
      ...list,
      ...(initialCase?.dentistName ? [initialCase.dentistName] : [])
    ]));
    return all;
  }, [dbDentists, initialCase?.dentistName]);

  // Load available technicians inside CaseForm from shared DB API
  const [dbTechnicians, setDbTechnicians] = useState<string[]>([]);

  useEffect(() => {
    fetchTechnicians()
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setDbTechnicians(data.map((t: any) => typeof t === 'string' ? t : t.name));
        }
      })
      .catch(err => console.error('[CASE FORM] Technician fetch error:', err));
  }, []);

  const technicianOptions = React.useMemo(() => {
    const list = dbTechnicians.length > 0
      ? dbTechnicians
      : ['최용희', '김찬유', '양소영', '박세진', '정서영', '최이슬'];

    const all = Array.from(new Set([
      ...list,
      ...(initialCase?.technicianName ? [initialCase.technicianName] : [])
    ]));
    return all;
  }, [dbTechnicians, initialCase?.technicianName]);

  // Form Fields
  const [requestType, setRequestType] = useState<ConfirmRequestType>(() => {
    if (initialCase?.requestType) {
      return initialCase.requestType as ConfirmRequestType;
    }
    return '원장님 확인부탁드려요.';
  });
  const [chartNumber, setChartNumber] = useState(initialCase ? initialCase.chartNumber : '');
  const [patientName, setPatientName] = useState(initialCase ? initialCase.patientName : '');
  const [dentistName, setDentistName] = useState(() => {
    if (initialCase) return initialCase.dentistName;
    if (defaultDentist && defaultDentist !== '전체') return defaultDentist;
    return '김민수원장님';
  });
  const [technicianName, setTechnicianName] = useState(() => {
    if (initialCase?.technicianName) return initialCase.technicianName;
    if (defaultTechnician && defaultTechnician !== '전체') return defaultTechnician;
    return '최용희';
  });
  const [summary, setSummary] = useState(initialCase ? initialCase.summary : '');
  const [description, setDescription] = useState(initialCase ? initialCase.description : '');

  // 3D Model State
  const [stlFiles, setStlFiles] = useState<File[]>([]);
  const [stlUrls, setStlUrls] = useState<string[]>([]);
  const [stlItems, setStlItems] = useState<StlItem[]>(() => {
    if (initialCase?.stlItems && initialCase.stlItems.length > 0) {
      return initialCase.stlItems.map(item => {
        const ext = getModelExtension(item.url, item.name, item.format, item.originalName);
        const isPlyOrObj = ext === 'ply' || ext === 'obj';
        return {
          ...item,
          originalName: item.originalName || item.name,
          format: ext,
          colorMode: isPlyOrObj ? (item.colorMode || 'color') : 'mono',
          color: isPlyOrObj ? (item.colorMode === 'mono' ? (item.color || DEFAULT_STL_COLOR) : '#ffffff') : (item.color || DEFAULT_STL_COLOR),
          visible: item.visible !== false,
          opacity: (item.opacity !== undefined && item.opacity !== null && !isNaN(item.opacity) && item.opacity > 0) ? item.opacity : 1.0
        };
      });
    }
    if (initialCase) {
      const paths = initialCase.stlFilePaths && initialCase.stlFilePaths.length > 0
        ? initialCase.stlFilePaths
        : (initialCase.stlFilePath ? [initialCase.stlFilePath] : []);
      return paths.map((pathStr, idx) => {
        let name = `3D 보철 모델 #${idx + 1}`;
        try {
          const parts = pathStr.split('/');
          const last = parts[parts.length - 1];
          if (last) {
            const decoded = decodeURIComponent(last).replace(/^\d+-/, '');
            if (decoded) name = decoded;
          }
        } catch (e) { }
        const ext = getModelExtension(pathStr, name);
        const isPlyOrObj = ext === 'ply' || ext === 'obj';
        return {
          id: `stl-existing-${idx}-${pathStr}`,
          name: name,
          originalName: name,
          format: ext,
          colorMode: isPlyOrObj ? 'color' : 'mono',
          color: isPlyOrObj ? '#ffffff' : PRESET_COLORS[idx % PRESET_COLORS.length].value,
          url: pathStr,
          visible: true,
          opacity: 1.0
        };
      });
    }
    return [];
  });
  const [existingStlPaths, setExistingStlPaths] = useState<string[]>(() => {
    if (initialCase) {
      if (initialCase.stlFilePaths && initialCase.stlFilePaths.length > 0) {
        return initialCase.stlFilePaths;
      }
      if (initialCase.stlFilePath) {
        return [initialCase.stlFilePath];
      }
    }
    return [];
  });
  const [useProceduralModel, setUseProceduralModel] = useState(
    initialCase ? (!initialCase.stlFilePath && (!initialCase.stlFilePaths || initialCase.stlFilePaths.length === 0)) : false
  );
  const [pins, setPins] = useState<CasePin[]>(initialCase ? initialCase.pins || [] : []);
  const [cameraState, setCameraState] = useState<CameraState | null>(
    initialCase ? initialCase.cameraState || null : null
  );
  const [cameraStates, setCameraStates] = useState<CameraState[]>(() => {
    if (initialCase?.cameraStates && initialCase.cameraStates.length > 0) {
      return initialCase.cameraStates.map((cs, idx) => ({
        ...cs,
        id: cs.id || `view-${idx + 1}`,
        name: cs.name || `뷰 #${idx + 1}`
      }));
    }
    if (initialCase?.cameraState) {
      return [{
        ...initialCase.cameraState,
        id: initialCase.cameraState.id || 'view-1',
        name: initialCase.cameraState.name || '뷰 #1'
      }];
    }
    return [];
  });

  // Persistent counter for highest generated view number across deletes
  const maxViewCounterRef = useRef<number>((() => {
    let max = 0;
    if (initialCase?.cameraStates) {
      initialCase.cameraStates.forEach((v, i) => {
        const name = v.name || `뷰 #${i + 1}`;
        const match = name.match(/\d+/);
        if (match) {
          const n = parseInt(match[0], 10);
          if (!isNaN(n) && n > max) max = n;
        }
      });
    }
    return max;
  })());

  // Compute all STL URLs for ThreeViewer
  const allStlUrls = React.useMemo(() => {
    const existingFormatted = existingStlPaths.map(formatStlUrl).filter((u): u is string => Boolean(u));
    return [...existingFormatted, ...stlUrls];
  }, [existingStlPaths, stlUrls]);

  // 2D Photo Uploads
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>(
    initialCase ? initialCase.images || [] : []
  );

  // Image Zoom Lightbox Modal state
  const [zoomModal, setZoomModal] = useState<{
    images: string[];
    index: number;
  } | null>(null);

  // File Input Refs
  const stlInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  // Helper to add uploaded STL files
  const handleLocalFileUpload = (newFiles: File[]) => {
    if (newFiles.length === 0) return;
    const newUrls = newFiles.map(file => URL.createObjectURL(file));

    setStlFiles(prev => [...prev, ...newFiles]);
    setStlUrls(prev => [...prev, ...newUrls]);

    setStlItems(prev => {
      const currentLength = prev.length;
      const newItems: StlItem[] = newFiles.map((file, idx) => {
        const ext = getModelExtension(newUrls[idx], file.name);
        const isPlyOrObj = ext === 'ply' || ext === 'obj';
        return {
          id: `stl-file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${idx}`,
          name: file.name,
          originalName: file.name,
          format: ext,
          colorMode: isPlyOrObj ? 'color' : 'mono',
          color: isPlyOrObj ? '#ffffff' : PRESET_COLORS[(currentLength + idx) % PRESET_COLORS.length].value,
          url: newUrls[idx],
          visible: true,
          opacity: 1.0
        };
      });
      return [...prev, ...newItems];
    });

    setUseProceduralModel(false);
  };

  // Handle STL file selection (Multi STL)
  const handleStlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files) as File[];
      handleLocalFileUpload(selectedFiles);
      e.target.value = '';
    }
  };

  const handleStlDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const dropped3D = (Array.from(e.dataTransfer.files) as File[]).filter(file => {
        const name = file.name.toLowerCase();
        return name.endsWith('.stl') || name.endsWith('.ply') || name.endsWith('.obj') ||
          file.type.includes('stl') || file.type.includes('ply') || file.type.includes('obj') || file.type.includes('sla');
      });
      if (dropped3D.length > 0) {
        handleLocalFileUpload(dropped3D);
      } else {
        alert('3D 모델 파일(.stl, .ply, .obj)만 업로드할 수 있습니다.');
      }
    }
  };

  const handleResetModel = () => {
    stlUrls.forEach(url => URL.revokeObjectURL(url));
    setStlFiles([]);
    setStlUrls([]);
    setExistingStlPaths([]);
    setStlItems([]);
    setUseProceduralModel(false);
    setPins([]);
    setCameraState(null);
    setCameraStates([]);
  };

  // Handle 3D pins inside ThreeViewer
  const handleAddPin = (newPin: { position: [number, number, number]; note: string }) => {
    const pin: CasePin = {
      id: `pin_${Date.now()}`,
      position: newPin.position,
      note: newPin.note,
      creator: '작성자',
      createdAt: new Date().toISOString()
    };
    setPins([...pins, pin]);
  };

  const handleRemovePin = (id: string) => {
    setPins(pins.filter(p => p.id !== id));
  };

  const handleUpdatePinNote = (pinId: string, newNote: string) => {
    setPins(prev => prev.map(p => p.id === pinId ? { ...p, note: newNote } : p));
  };

  const handleStlItemsChange = React.useCallback((updated: StlItem[]) => {
    setStlItems(updated);
    if (updated.length === 0) {
      setStlUrls([]);
      setExistingStlPaths([]);
    }
  }, []);

  // Handle Camera Angle save
  const handleSaveAngle = (state: CameraState) => {
    if (cameraStates.length >= 10) {
      alert('커스텀 뷰는 최대 10개까지 저장할 수 있습니다. 기존 뷰를 삭제하고 다시 저장해 주세요.');
      return;
    }

    // Determine the highest view number among existing views and counter ref
    let maxNum = maxViewCounterRef.current;
    cameraStates.forEach((v, idx) => {
      const name = v.name || `뷰 #${idx + 1}`;
      const match = name.match(/\d+/);
      if (match) {
        const num = parseInt(match[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    if (maxNum === 0 && cameraStates.length > 0) {
      maxNum = cameraStates.length;
    }

    const nextNum = maxNum + 1;
    maxViewCounterRef.current = nextNum;

    const viewName = state.name || `뷰 #${nextNum}`;
    const newView: CameraState = {
      ...state,
      id: state.id || `view-${Date.now()}-${nextNum}`,
      name: viewName
    };

    const updated = [...cameraStates, newView];
    setCameraStates(updated);
    // For backward compatibility, also keep the main cameraState as the first one
    if (!cameraState) {
      setCameraState(newView);
    }
  };

  const handleDeleteView = (index: number, viewId?: string) => {
    const updated = viewId
      ? cameraStates.filter(v => v.id !== viewId)
      : cameraStates.filter((_, i) => i !== index);
    setCameraStates(updated);
    if (updated.length > 0) {
      setCameraState(updated[0]);
    } else {
      setCameraState(null);
    }
  };

  // Handle 2D images selections
  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files) as File[];
      const newFiles = [...imageFiles, ...filesArray];
      setImageFiles(newFiles);

      const newPreviews = filesArray.map(file => URL.createObjectURL(file));
      setImagePreviews([...imagePreviews, ...newPreviews]);
    }
  };

  const handleImagesDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      const filesArray = (Array.from(e.dataTransfer.files) as File[]).filter(file =>
        file.type.startsWith('image/')
      );
      if (filesArray.length === 0) return;

      const newFiles = [...imageFiles, ...filesArray];
      setImageFiles(newFiles);

      const newPreviews = filesArray.map(file => URL.createObjectURL(file));
      setImagePreviews([...imagePreviews, ...newPreviews]);
    }
  };

  const handleRemoveImage = (index: number) => {
    const updatedFiles = [...imageFiles];
    updatedFiles.splice(index, 1);
    setImageFiles(updatedFiles);

    const updatedPreviews = [...imagePreviews];
    URL.revokeObjectURL(updatedPreviews[index]); // Free memory
    updatedPreviews.splice(index, 1);
    setImagePreviews(updatedPreviews);
  };

  // Submit whole form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!chartNumber.trim()) return setErrorMessage('차트번호를 입력해 주세요.');
    if (!patientName.trim()) return setErrorMessage('환자 이름을 입력해 주세요.');
    if (!technicianName.trim()) return setErrorMessage('담당 기공사 이름을 입력해 주세요.');

    const hasStl = stlFiles.length > 0 || existingStlPaths.length > 0 || useProceduralModel || stlItems.length > 0;
    if (!hasStl) {
      return setErrorMessage('3D 모델 파일(STL, PLY, OBJ)을 업로드해 주세요.');
    }

    setIsSubmitting(true);
    setUploadStatus('업로드 준비 중...');
    setUploadPercent(0);

    try {
      // 1. Determine case folder name for server uploads
      const cleanChart = chartNumber.trim().replace(/[/\\?%*:|"<>]/g, '_');
      const cleanPatient = patientName.trim().replace(/[/\\?%*:|"<>]/g, '_');
      const folderName = `${cleanChart}_${cleanPatient}`;

      // 2. Identify STL files that need to be uploaded
      const activeBlobItems = stlItems.filter(
        item => item.url && (item.url.startsWith('blob:') || item.url.startsWith('data:'))
      );

      let filesToUpload: File[] = [];
      if (activeBlobItems.length > 0) {
        activeBlobItems.forEach((item, index) => {
          const matchedFile = stlFiles.find(f => f.name === item.name) || stlFiles[index];
          if (matchedFile && !filesToUpload.includes(matchedFile)) {
            filesToUpload.push(matchedFile);
          }
        });
        if (filesToUpload.length < activeBlobItems.length && stlFiles.length >= activeBlobItems.length) {
          filesToUpload = stlFiles.slice(0, activeBlobItems.length);
        }
      } else {
        filesToUpload = stlFiles;
      }

      // 3 & 4. Parallel Concurrent Upload for all 3D models and image files
      const totalFilesCount = filesToUpload.length + imageFiles.length;
      const fileProgressMap = new Array(totalFilesCount).fill(0);

      const updateProgress = (index: number, pct: number) => {
        fileProgressMap[index] = pct;
        const sum = fileProgressMap.reduce((acc, curr) => acc + curr, 0);
        const overall = totalFilesCount > 0 ? Math.round(sum / totalFilesCount) : 100;
        setUploadPercent(overall);
      };

      if (totalFilesCount > 0) {
        setUploadStatus(`총 ${totalFilesCount}개 파일 업로드 중...`);
        setUploadPercent(0);
      }

      // Execute all 3D model uploads in parallel
      const stlUploadPromises = filesToUpload.map(async (file, idx) => {
        const serverUrl = await uploadFileWithChunking(file, folderName, (pct) => {
          updateProgress(idx, pct);
        });
        return { name: file.name, serverUrl };
      });

      // Execute all image uploads in parallel
      const imageUploadPromises = imageFiles.map(async (file, idx) => {
        const serverUrl = await uploadFileWithChunking(file, folderName, (pct) => {
          updateProgress(filesToUpload.length + idx, pct);
        });
        return serverUrl;
      });

      // Wait for all uploads to complete simultaneously
      const [uploadedStlResults, newlyUploadedImages] = await Promise.all([
        Promise.all(stlUploadPromises),
        Promise.all(imageUploadPromises)
      ]);

      const uploadedStlMap = new Map<string, string>();
      uploadedStlResults.forEach(res => {
        uploadedStlMap.set(res.name, res.serverUrl);
      });

      setUploadStatus('케이스 정보 데이터베이스 저장 중...');
      setUploadPercent(100);

      // 5. Update stlItems with uploaded server URLs
      const finalStlItems = stlItems.map((item, idx) => {
        let finalUrl = item.url;
        if (!finalUrl || finalUrl.startsWith('blob:') || finalUrl.startsWith('data:')) {
          const matchedFile = filesToUpload.find(f => f.name === item.name) || filesToUpload[idx];
          const serverUrl = matchedFile ? uploadedStlMap.get(matchedFile.name) : undefined;
          if (serverUrl) {
            finalUrl = serverUrl;
          }
        }
        const ext = getModelExtension(finalUrl, item.name, item.format, item.originalName);
        const isPlyOrObj = ext === 'ply' || ext === 'obj';
        return {
          ...item,
          url: finalUrl,
          format: ext,
          colorMode: isPlyOrObj ? (item.colorMode || 'color') : 'mono',
          color: item.color || (isPlyOrObj ? '#ffffff' : DEFAULT_STL_COLOR),
          visible: item.visible !== false,
          opacity: (typeof item.opacity === 'number' && !isNaN(item.opacity) && item.opacity > 0) ? item.opacity : 1.0
        };
      });

      const activeStlPaths = finalStlItems
        .map(item => item.url)
        .filter((url): url is string => Boolean(url && !url.startsWith('blob:') && !url.startsWith('data:')));

      // 6. Build lightweight FormData for case registration/update
      const fd = new FormData();
      fd.append('requestType', requestType);
      if (initialCase?.status) {
        fd.append('status', initialCase.status);
      }
      fd.append('chartNumber', chartNumber.trim());
      fd.append('patientName', patientName.trim());
      fd.append('dentistName', dentistName);
      fd.append('technicianName', technicianName.trim());
      fd.append('summary', summary.trim() || `${patientName} 환자 보철 디자인 컨펌 요청`);
      fd.append('description', description.trim());
      fd.append('pins', JSON.stringify(pins));
      if (cameraState) {
        fd.append('cameraState', JSON.stringify(cameraState));
      }
      if (cameraStates && cameraStates.length > 0) {
        fd.append('cameraStates', JSON.stringify(cameraStates));
      }

      const allImages = [...existingImages, ...newlyUploadedImages];
      fd.append('existingImages', JSON.stringify(allImages));
      fd.append('existingStlFilePaths', JSON.stringify(activeStlPaths));
      fd.append('stlItems', JSON.stringify(finalStlItems));

      await onSave(fd);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || '케이스 저장 도중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setIsSubmitting(false);
      setUploadStatus(null);
      setUploadPercent(0);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex-1 flex flex-col gap-6" id="case-registration-form">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 bg-slate-50 hover:bg-slate-100 rounded-xl text-slate-600 cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold font-display text-slate-950">
              {initialCase ? '3D 디자인 수정' : '3D 디자인 등록'}
            </h2>
            <p className="text-xs text-slate-400">
              보철물 디자인 소통을 위한 입력폼
            </p>
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 sm:flex-none text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-5 py-2.5 rounded-xl cursor-pointer transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 sm:flex-none text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2"
          >
            {isSubmitting ? '저장 중...' : (initialCase ? '수정완료' : '등록완료')}
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-medium flex items-center gap-2">
          <Trash2 className="w-4 h-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* [상단 영역]: 요청 구분 및 환자 정보 텍스트 폼 */}
      <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
        {/* 요청 구분 드롭박스 */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pb-3 border-b border-slate-100">
          <label className="text-xs font-bold text-slate-700 font-rounded flex items-center gap-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            확인 요청 구분 <span className="text-red-500">*</span>
          </label>
          <select
            value={requestType.includes('기공사') ? '담당기공사님 확인부탁드려요.' : '원장님 확인부탁드려요.'}
            onChange={(e) => setRequestType(e.target.value as ConfirmRequestType)}
            className="w-full sm:w-80 text-xs px-3.5 py-2.5 font-bold border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-blue-50/60 text-blue-900 cursor-pointer shadow-3xs"
          >
            <option value="원장님 확인부탁드려요.">원장님 확인부탁드려요.</option>
            <option value="담당기공사님 확인부탁드려요.">담당기공사님 확인부탁드려요.</option>
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Chart Number */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-500 font-rounded flex items-center gap-1 uppercase tracking-wider">
            <Hash className="w-3.5 h-3.5 text-slate-400" />
            차트번호 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="예: 20261049"
            value={chartNumber}
            onChange={(e) => setChartNumber(e.target.value)}
            className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white font-rounded-bold"
          />
        </div>

        {/* Patient Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-500 font-rounded flex items-center gap-1 uppercase tracking-wider">
            <User className="w-3.5 h-3.5 text-slate-400" />
            환자 이름 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="예: 홍길동"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white font-rounded-bold"
          />
        </div>

        {/* Dentist Select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-500 font-rounded flex items-center gap-1 uppercase tracking-wider">
            <Stethoscope className="w-3.5 h-3.5 text-slate-400" />
            담당 원장님 <span className="text-red-500">*</span>
          </label>
          <select
            value={dentistName}
            onChange={(e) => setDentistName(e.target.value)}
            className="text-xs px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white font-rounded-bold text-blue-700"
          >
            {dentistOptions.map((name: string) => (
              <option key={name} value={name}>
                {name.endsWith('원장님') ? `${name.slice(0, -3)} 원장님` : name}
              </option>
            ))}
          </select>
        </div>

        {/* Technician Select */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-500 font-rounded flex items-center gap-1 uppercase tracking-wider">
            <User className="w-3.5 h-3.5 text-slate-400" />
            담당 기공사 <span className="text-red-500">*</span>
          </label>
          <select
            value={technicianName}
            onChange={(e) => setTechnicianName(e.target.value)}
            className="text-xs px-3 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white font-rounded-bold text-slate-800"
          >
            {technicianOptions.map((name: string) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>


      {/* [중앙 영역] - 좌우 분할 (모바일에서는 상하 분할) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 좌측 (메인): STL 파일 드래그 앤 드롭 업로드 영역 및 3D 뷰어 */}
        <div className="lg:col-span-10 flex flex-col gap-3">
          <div className="flex justify-between items-center px-1">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              3D 보철 디자인 설정 및 업로드
            </label>
            <div className="flex gap-2">
              {(allStlUrls.length > 0 || useProceduralModel) && (
                <button
                  type="button"
                  onClick={handleResetModel}
                  className="text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg cursor-pointer transition-all"
                >
                  모델 초기화
                </button>
              )}
            </div>
          </div>

          {/* Core Viewer Box */}
          <div className="h-[460px] lg:h-[620px] w-full relative">
            {allStlUrls.length > 0 || useProceduralModel ? (
              <div className="w-full h-full relative">
                <ThreeViewer
                  stlUrls={allStlUrls}
                  stlItems={stlItems.length > 0 ? stlItems : undefined}
                  onStlItemsChange={handleStlItemsChange}
                  onLocalFileUpload={handleLocalFileUpload}
                  pins={pins}
                  onAddPin={handleAddPin}
                  onSaveAngle={handleSaveAngle}
                  savedCameraState={cameraState}
                  customViews={cameraStates}
                  onSelectView={(view) => setCameraState(view)}
                  onDeleteView={handleDeleteView}
                  onDeletePin={handleRemovePin}
                  onUpdatePinNote={handleUpdatePinNote}
                />
              </div>
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleStlDrop}
                onClick={() => stlInputRef.current?.click()}
                className="w-full h-full border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl bg-white hover:bg-slate-50/50 transition-all flex flex-col items-center justify-center text-center p-8 cursor-pointer select-none group"
              >
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-4 group-hover:scale-105 transition-transform duration-200">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">
                  3D 보철 디자인 파일 (STL, PLY, OBJ) 업로드
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
                  마우스로 드래그 앤 드롭하거나 영역을 클릭하여 원내 보철 3D 모델(STL, PLY, OBJ) 파일을 선택해 주세요. (다중 3D 파일 업로드 가능)
                </p>

                <div className="mt-5 flex gap-2">
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    권장 포맷: .stl, .ply, .obj (컬러 스캔 지원, 다중 파일 가능, 파일당 최대 100MB)
                  </span>
                </div>
              </div>
            )}

            {/* Hidden inputs always rendered outside condition so stlInputRef is never null */}
            <input
              ref={stlInputRef}
              type="file"
              accept=".stl,.ply,.obj"
              multiple
              onChange={handleStlChange}
              className="hidden"
            />
          </div>
        </div>

        {/* 우측 (서브): 이미지 다중 업로드 영역 */}
        <div className="lg:col-span-2 flex flex-col gap-3">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            사진 다중 업로드
          </label>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleImagesDrop}
            onClick={() => imagesInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 hover:border-blue-500/50 rounded-2xl bg-white p-6 hover:bg-slate-50/50 transition-all flex flex-col items-center justify-center text-center cursor-pointer min-h-[160px]"
          >
            <div className="p-3 bg-slate-50 rounded-xl text-slate-400 mb-2">
              <ImageIcon className="w-6 h-6 text-slate-500" />
            </div>
            <h5 className="text-xs font-bold text-slate-700">사진 추가</h5>
            <p className="text-[10px] text-slate-400 mt-1 max-w-[200px] leading-normal">
              클릭하거나 드래그 앤 드롭으로 사진 파일 첨부
            </p>
            <input
              ref={imagesInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleImagesChange}
              className="hidden"
            />
          </div>

          {/* Existing Images List */}
          {existingImages.length > 0 && (
            <div className="bg-white border border-slate-200/60 p-4 rounded-2xl shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 block mb-2 uppercase tracking-wider">
                저장된 기존 사진 ({existingImages.length}장)
              </span>
              <div className="grid grid-cols-1 gap-3 max-h-72 overflow-y-auto pr-1">
                {existingImages.map((imgUrl, index) => (
                  <div key={imgUrl} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group bg-slate-50">
                    <img
                      src={imgUrl}
                      alt="Existing Clinical Preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {/* Hover Overlay with Zoom and Delete buttons */}
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setZoomModal({ images: existingImages, index })}
                        className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md transition-transform scale-90 group-hover:scale-100 cursor-pointer"
                        title="원본 크게 보기 및 마우스 휠 확대"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExistingImages(existingImages.filter((_, i) => i !== index));
                        }}
                        className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-md transition-transform scale-90 group-hover:scale-100 cursor-pointer"
                        title="기존 사진 제거"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Image Previews Grid */}
          {imagePreviews.length > 0 && (
            <div className="bg-white border border-slate-200/60 p-4 rounded-2xl shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 block mb-2 uppercase tracking-wider">
                업로드 대기 목록 ({imagePreviews.length}장)
              </span>
              <div className="grid grid-cols-1 gap-3 max-h-72 overflow-y-auto pr-1">
                {imagePreviews.map((preview, index) => (
                  <div key={preview} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 group bg-slate-50">
                    <img
                      src={preview}
                      alt="Local Upload Preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {/* Hover Overlay with Zoom and Delete buttons */}
                    <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setZoomModal({ images: imagePreviews, index })}
                        className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-md transition-transform scale-90 group-hover:scale-100 cursor-pointer"
                        title="원본 크게 보기 및 마우스 휠 확대"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-md transition-transform scale-90 group-hover:scale-100 cursor-pointer"
                        title="이미지 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* [하단 영역]: 전체적인 컨펌 요청 내용 */}
      <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
        {/* Quick Summary Input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            전체 요약 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            placeholder="예: 전치부 #11, #21 지르코니아 크라운 디자인 검토 요청드립니다."
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white"
          />
        </div>

        {/* Long Description Textarea */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1 uppercase tracking-wider">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            내용
          </label>
          <textarea
            placeholder={`예: 11번 - 디스탈부위 마진 확인부탁드립니다\n21번 - 근원심폭이 넓어 좁아보이게 디자인했습니다.`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-xs p-3.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white min-h-[120px] resize-y"
          />
        </div>

        {/* Bottom Form Actions */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-6 py-3 rounded-xl cursor-pointer transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl shadow-md cursor-pointer transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2"
          >
            {isSubmitting ? '저장 중...' : (initialCase ? '수정완료' : '등록완료')}
          </button>
        </div>
      </div>

      {/* 2D Zoom Lightbox Modal */}
      {zoomModal && (
        <ImageZoomModal
          images={zoomModal.images}
          initialIndex={zoomModal.index}
          title="사진 크게 보기"
          onClose={() => setZoomModal(null)}
        />
      )}

      {/* Uploading Progress Modal */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3 animate-pulse">
              <UploadCloud className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">
              {uploadStatus || '데이터 업로드 중...'}
            </h3>
            <p className="text-[11px] text-slate-500 mb-4">
              대용량 3D 보철 데이터 및 사진을 안전하게 분할 전송 중입니다.
            </p>
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mb-2">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${uploadPercent}%` }}
              />
            </div>
            <span className="text-xs font-bold text-blue-600">{uploadPercent}%</span>
          </div>
        </div>
      )}
    </form>
  );
}
