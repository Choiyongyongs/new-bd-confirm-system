-- ==============================================================================
-- 3D Dental Design Confirm System - Supabase Database Schema & Storage Setup
-- ==============================================================================
-- Supabase Dashboard > SQL Editor에 아래 스크립트를 붙여넣고 [Run]을 누르시면
-- 필요한 모든 테이블, 인덱스, RLS 정책, 스토리지 버킷이 자동으로 구성됩니다.
-- ==============================================================================

-- 1. Dental Cases 테이블 생성
CREATE TABLE IF NOT EXISTS public.cases (
    id TEXT PRIMARY KEY,
    chart_number TEXT NOT NULL DEFAULT '',
    patient_name TEXT NOT NULL DEFAULT '',
    dentist_name TEXT NOT NULL DEFAULT '',
    technician_name TEXT NOT NULL DEFAULT '',
    summary TEXT DEFAULT '',
    description TEXT DEFAULT '',
    request_type TEXT DEFAULT '원장님 확인부탁드려요.',
    status TEXT NOT NULL DEFAULT '확인 전',
    stl_file_path TEXT,
    stl_file_paths JSONB DEFAULT '[]'::jsonb,
    stl_items JSONB DEFAULT '[]'::jsonb,
    images JSONB DEFAULT '[]'::jsonb,
    pins JSONB DEFAULT '[]'::jsonb,
    camera_state JSONB,
    camera_states JSONB DEFAULT '[]'::jsonb,
    dentist_feedback TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ
);

-- 기존에 이미 테이블이 생성된 경우 컬럼 추가
ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS request_type TEXT DEFAULT '원장님 확인부탁드려요.';

-- 2. 검색 및 정렬 성능을 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON public.cases (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cases_chart_number ON public.cases (chart_number);
CREATE INDEX IF NOT EXISTS idx_cases_patient_name ON public.cases (patient_name);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases (status);

-- 3. Row Level Security (RLS) 활성화 및 공용 접근 정책 설정
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on cases" ON public.cases;
DROP POLICY IF EXISTS "Allow public insert access on cases" ON public.cases;
DROP POLICY IF EXISTS "Allow public update access on cases" ON public.cases;
DROP POLICY IF EXISTS "Allow public delete access on cases" ON public.cases;
DROP POLICY IF EXISTS "Allow public all access on cases" ON public.cases;

CREATE POLICY "Allow public all access on cases" ON public.cases
    FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.cases TO anon, authenticated, service_role;

-- 4. 전체 공지사항 (Notices) 테이블 생성 — 모든 접속자가 공유
CREATE TABLE IF NOT EXISTS public.notices (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '원장단',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 공지사항 정렬용 인덱스
CREATE INDEX IF NOT EXISTS idx_notices_created_at ON public.notices (created_at DESC);

-- 공지사항 RLS 활성화 및 공용 접근 정책 설정 (조회, 등록, 수정, 삭제 전체 허용)
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on notices" ON public.notices;
DROP POLICY IF EXISTS "Allow public insert access on notices" ON public.notices;
DROP POLICY IF EXISTS "Allow public update access on notices" ON public.notices;
DROP POLICY IF EXISTS "Allow public delete access on notices" ON public.notices;
DROP POLICY IF EXISTS "Allow public all access on notices" ON public.notices;

CREATE POLICY "Allow public all access on notices" ON public.notices
    FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.notices TO anon, authenticated, service_role;

-- 5. 공용 설정(Settings) 테이블 — 접속 비밀번호 등 전체 공유 설정
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access on settings" ON public.settings;
DROP POLICY IF EXISTS "Allow public insert access on settings" ON public.settings;
DROP POLICY IF EXISTS "Allow public update access on settings" ON public.settings;
DROP POLICY IF EXISTS "Allow public delete access on settings" ON public.settings;
DROP POLICY IF EXISTS "Allow public all access on settings" ON public.settings;

CREATE POLICY "Allow public all access on settings" ON public.settings
    FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.settings TO anon, authenticated, service_role;

-- 기본 접속 비밀번호 초기값 삽입 (이미 있으면 무시)
INSERT INTO public.settings (key, value) VALUES ('access_password', '1234')
ON CONFLICT (key) DO NOTHING;

-- 6. 담당 원장님 (Dentists) 테이블 생성 — 모든 접속자 실시간 공유
CREATE TABLE IF NOT EXISTS public.dentists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    is_core BOOLEAN DEFAULT FALSE,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dentists_display_order ON public.dentists (display_order ASC, created_at ASC);

ALTER TABLE public.dentists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public all access on dentists" ON public.dentists;
CREATE POLICY "Allow public all access on dentists" ON public.dentists
    FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.dentists TO anon, authenticated, service_role;

-- 초기 기본 원장님 목록 삽입 (이미 존재하면 무시)
INSERT INTO public.dentists (id, name, is_core, display_order) VALUES
    ('dentist_core_1', '김민수원장님', true, 1),
    ('dentist_core_2', '현정민원장님', true, 2),
    ('dentist_core_3', '문석준원장님', true, 3),
    ('dentist_rem_1', '최종훈원장님', false, 4),
    ('dentist_rem_2', '박수빈원장님', false, 5),
    ('dentist_rem_3', '박상현원장님', false, 6),
    ('dentist_rem_4', '김민규원장님', false, 7),
    ('dentist_rem_5', '임지원원장님', false, 8),
    ('dentist_rem_6', '이승엽원장님', false, 9)
ON CONFLICT (name) DO NOTHING;

-- 7. 3D 모델(STL, PLY, OBJ) 및 임상 이미지 저장을 위한 Storage Bucket 생성
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'dental-files',
    'dental-files',
    true,
    104857600, -- 100MB
    NULL
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 104857600;

-- 8. Storage Bucket RLS 정책 설정 (공개 업로드, 다운로드, 삭제 허용)
DROP POLICY IF EXISTS "Allow public read access on dental-files" ON storage.objects;
CREATE POLICY "Allow public read access on dental-files" ON storage.objects
    FOR SELECT USING (bucket_id = 'dental-files');

DROP POLICY IF EXISTS "Allow public upload on dental-files" ON storage.objects;
CREATE POLICY "Allow public upload on dental-files" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'dental-files');

DROP POLICY IF EXISTS "Allow public update on dental-files" ON storage.objects;
CREATE POLICY "Allow public update on dental-files" ON storage.objects
    FOR UPDATE USING (bucket_id = 'dental-files');

DROP POLICY IF EXISTS "Allow public delete on dental-files" ON storage.objects;
CREATE POLICY "Allow public delete on dental-files" ON storage.objects
    FOR DELETE USING (bucket_id = 'dental-files');

