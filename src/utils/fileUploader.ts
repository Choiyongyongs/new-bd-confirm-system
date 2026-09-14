import { uploadFileToStorage } from '../services/api';

/**
 * 3D 모델(STL, PLY, OBJ) 및 임상 이미지를 Supabase Cloud Storage ('dental-files')에 업로드합니다.
 * 백엔드 Express 서버 없이 브라우저에서 직접 Supabase Storage로 업로드되므로
 * 네트워크 병목 없이 초고속으로 전송됩니다.
 */
export async function uploadFileWithChunking(
  file: File,
  folderName?: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  return await uploadFileToStorage(file, folderName || 'general', onProgress);
}
