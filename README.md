# new BD confirm system

치과 보철물 3D 디자인 원격 승인 및 협진 시스템 (New BD Dental CAD Confirmation System)

---

## 📌 프로젝트 소개 (Overview)
**new BD confirm system**은 치과 기공실과 치과의사(원장님) 간의 3D 보철물 디자인 검토, 3D 뷰어 기반 실시간 피드백 핀/메모 공유, 상태 변경(컨펌/수정 요청) 및 관리를 원활하게 지원하는 웹 애플리케이션입니다.

- **3D 보철 뷰어**: STL, PLY, OBJ 다중 3D 메쉬 파일 지원 및 3D 공간 핀 코멘트
- **협진 소통 워크플로우**: 원장님별 필터링, 기공사별 담당 관리, 실시간 상태 트래킹
- **스토리지 및 클라우드 연동**: Supabase DB/스토리지 및 로컬/NAS 연동 지원
- **반응형 & 직관적인 UI**: 데스크톱 및 모바일 태블릿 환경 완벽 지원

---

## 🚀 시작하기 (Getting Started)

### 사전 준비 사항 (Prerequisites)
- [Node.js](https://nodejs.org/) (v18 이상 권장)
- npm 또는 bun 패키지 매니저

### 설치 및 로컬 실행 (Installation & Run)
1. **의존성 패키지 설치**:
   ```bash
   npm install
   ```

2. **환경 변수 설정**:
   `.env.example` 파일을 복사하여 `.env` 파일을 생성하고 Supabase 설정 정보를 입력합니다.
   ```bash
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

3. **개발 서버 실행**:
   ```bash
   npm run dev
   ```

4. **프로덕션 빌드**:
   ```bash
   npm run build
   ```

---

## 🛠️ 기술 스택 (Tech Stack)
- **Frontend**: React 19, TypeScript, Vite, TailwindCSS
- **3D Graphics**: Three.js, OrbitControls, STLLoader, PLYLoader, OBJLoader
- **Backend / Database**: Supabase (PostgreSQL & Storage) / Express
- **Deployment**: GitHub Pages / Actions Workflow
