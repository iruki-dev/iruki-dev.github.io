# iruki.dev

개인 사이트.  
Astro + Tailwind로 만들었고, 사이트 콘텐츠 거의 전부를 admin GUI에서 편집할 수 있는 페이지 빌더가 들어가 있습니다.

## 실행

```sh
npm install
npm run dev      # 개발 서버 (localhost:4321)
npm run build    # 정적 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
npm run admin    # 비주얼 콘텐츠 에디터 (localhost:4000)
```

> Docker / devcontainer에서 4321이 안 열리면 `npm run dev -- --host` 또는 VSCode PORTS 패널에서 수동 포워딩.

## 사이트 구조

핵심 원칙: **`content/`는 데이터, `content/pages/`는 사이트 자체.**

- `content/blog/*.md`, `content/projects/*.md` — 블로그 글, 프로젝트 등 **리스트 데이터**
- `content/pages/*.json` — 사이트의 모든 **페이지** (홈, /blog 인덱스, /projects 인덱스, About, 임의 페이지 전부)

라우트는 다음과 같이 자동 생성:

| 경로 | 소스 |
|---|---|
| `/` | `content/pages/home.json` (특수 슬러그 `home`) |
| `/blog` | `content/pages/blog.json` (안에 `recent-posts` 블록이 글 목록 렌더) |
| `/projects` | `content/pages/projects.json` (안에 `featured-projects` 블록이 프로젝트 목록 렌더) |
| `/about` | `content/pages/about.json` |
| `/<slug>` | `content/pages/<slug>.json` |
| `/blog/<slug>` | `content/blog/<slug>.md` (개별 글) |
| `/projects/<slug>` | `content/projects/<slug>.md` (개별 프로젝트) |

홈/Blog 인덱스/Projects 인덱스/About 모두 admin에서 똑같이 편집됩니다. 하드코딩된 `.astro` 페이지 없음.

## 네비게이션

**헤더 메뉴는 페이지가 직접 정의합니다.** `nav.json` 같은 별도 설정 파일 없음.

각 페이지(`content/pages/*.json`)에 다음 필드:
- `showInNav: true` — 헤더에 노출
- `navLabel` — 메뉴 라벨 (없으면 페이지 title)
- `navOrder` — 정렬 순서 (오름차순; 같으면 라벨 알파벳)

페이지를 만들고 토글하면 끝. admin Pages → Edit → Page settings 에서 전부 한 번에 편집됩니다.

## 페이지 빌더 블록

`/kitchen-sink` 에 모든 블록 예시가 있습니다.

| 분류 | 블록 |
|---|---|
| 기본 | heading, paragraph, image, button, columns, cards, divider, spacer, code, html |
| 콘텐츠 | callout, quote, video, audio, embed (YouTube/Vimeo/CodePen 자동 인식), gallery (라이트박스), accordion, tabs |
| 데이터/시각화 | stats (스크롤 시 카운터 애니메이션), timeline, progress, countdown, palette (hex 클릭 복사) |
| **콜렉션 연동** | **recent-posts** (`limit:0` = 전체), **featured-projects** (`limit:0` = 전체, `featuredOnly` 토글) |
| 고급 | mermaid, math (KaTeX), runner (JS 플레이그라운드), iframe-sandbox (HTML/CSS/JS) |
| 장식 | marquee |

`recent-posts` / `featured-projects` 가 사이트 구조의 핵심 — 홈에서는 `limit:3` 으로 미리보기, `/blog` 페이지에서는 `limit:0` 으로 전체 목록을 같은 블록으로 처리합니다.

## 사이트 설정

`config/site.json` 의 모든 항목은 admin **Site settings** 에서 편집됩니다:

- **메타**: title, author, description, URL, email, GitHub
- **테마 (관리자 전용)**: 강조색 팔레트 8종 (indigo / rose / emerald / amber / sky / violet / crimson / lime). 사이트 전역에 적용 — 방문자가 임의로 못 바꿉니다.
- **기능 토글**:
  - `readingProgress` — 페이지 상단 스크롤 진행 바
  - `backToTop` — 우하단 맨 위로 버튼
  - `konami` — ↑↑↓↓←→←→BA 입력 시 페이지가 빙글빙글

라이트/다크는 방문자가 헤더 토글로 자유롭게 바꿉니다 (`localStorage`).

## 폴더 구조

```
config/             site.json (메타 + 테마 + 기능 토글)
content/
  blog/             블로그 글 (.md)            ← 데이터
  projects/         프로젝트 (.md)              ← 데이터
  pages/            모든 사이트 페이지 (.json) ← 사이트 구조 (home, blog, projects, about, …)
components/
  blocks/           각 블록 컴포넌트 + PageBlock 디스패처
layouts/            BaseLayout, BlogPost, ProjectPost
pages/              Astro 라우트 (얇은 래퍼만)
  index.astro       /  → home.json 렌더
  [...slug].astro   /<slug>  → 해당 페이지 렌더
  blog/[...slug]    /blog/<slug> → 개별 글
  projects/[...slug] /projects/<slug> → 개별 프로젝트
styles/global.css   Tailwind + 팔레트 CSS 변수
tools/admin.mjs     비주얼 에디터 (Node 단일 파일)
```

## 새 페이지 추가 (대표 흐름)

1. `npm run admin` → **Pages** → **+ New page**
2. 슬러그 정하고 (예: `now`), 블록 추가하고 저장
3. 헤더에 띄우려면 Page settings에서 **Show in nav** 토글 + **Nav order** 조정
4. 끝. dev 서버에서 즉시 반영, 배포는 main 푸시

> 슬러그 `home` 으로 만든 페이지는 `/home`이 아니라 `/`로 렌더됩니다.

## 배포

`main` 푸시 → `.github/workflows/` 의 GitHub Pages 액션이 빌드 & 배포.
