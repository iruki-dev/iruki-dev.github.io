# iruki.dev

개인 사이트. Astro + Tailwind 기반의 정적 사이트이고, **블록 기반 페이지 빌더**와 그걸 GUI로 다루는 **로컬 admin 도구**가 함께 들어 있어 마크다운/JSON을 직접 만지지 않고도 콘텐츠를 거의 다 편집할 수 있습니다.

## 빠르게 시작

```sh
npm install
npm run dev      # 개발 서버 (http://localhost:4321)
npm run build    # 정적 빌드 → dist/
npm run preview  # 빌드 결과 로컬에서 확인
npm run admin    # 비주얼 콘텐츠 에디터 (http://localhost:4000)
```

devcontainer/Docker에서 4321 포트가 안 보이면 `npm run dev -- --host` 또는 VSCode의 PORTS 패널에서 수동 포워딩.

## 설계 철학

> `content/<collection>/`은 **데이터 리스트**. `content/pages/`는 **사이트 그 자체**.

- **컬렉션 (data lists)** — `blog`, `projects` 같은 데이터 리스트. **하드코딩이 아니라** [config/collections.json](config/collections.json)에 정의되고 admin에서 자유롭게 추가/수정/삭제할 수 있습니다 (예: `recipes`, `books`, `notes`...).
- **페이지** — 홈, 인덱스 페이지(/blog, /projects), About, 기타 모든 정적 페이지가 같은 형태로 [content/pages/*.json](content/pages/)에 살고 같은 블록 빌더로 편집됩니다. 하드코딩된 `.astro` 페이지는 없고 [pages/](pages/) 디렉터리는 라우트 디스패처 역할만 합니다.

## 컬렉션 (Collections)

컬렉션 = 같은 스키마를 공유하는 데이터 리스트. 정의는 단순합니다:

```json
{
  "collections": [
    { "name": "blog",     "label": "Blog",     "labelOne": "Post",    "icon": "✎" },
    { "name": "projects", "label": "Projects", "labelOne": "Project", "icon": "◫" }
  ]
}
```

admin **Manage collections** 섹션에서 새 컬렉션을 만들면:
1. [config/collections.json](config/collections.json)에 항목이 추가되고
2. `content/<name>/` 디렉터리가 만들어지고
3. 사이드바에 그 컬렉션이 즉시 등장합니다.

이름 변경 시 디렉터리도 함께 이동하고, 삭제 시 정의만 제거할지 디스크 파일까지 같이 지울지 모달에서 선택합니다.

### 항목 스키마 (모든 컬렉션 공통)

[content/config.ts](content/config.ts)에서 zod로 정의:

| 필드 | 필수 | 용도 |
|---|---|---|
| `title` | ✓ | 항목 제목 |
| `description` |  | 리스트/메타에 노출 |
| `pubDate` | ✓ | 발행일 |
| `updatedDate` |  | 수정일 |
| `tags[]` |  | 태그 |
| `draft` |  | true면 사이트에서 숨김 |
| `featured` |  | `collection-list` 블록에서 필터링 가능 |
| `github`, `demo` |  | 외부 링크 — 항목 헤더와 카드 우측에 아이콘으로 노출 |

스키마는 모든 컬렉션이 공유합니다. 안 쓰는 필드는 그냥 비워두면 됩니다.

## 라우팅

| 경로 | 소스 |
|---|---|
| `/` | `content/pages/home.json` (특수 슬러그 `home`) |
| `/<slug>` | `content/pages/<slug>.json` |
| `/<collection>` | `content/pages/<collection>.json` (예: `/blog`, `/projects` — 보통 안에 `collection-list` 블록 하나) |
| `/<collection>/<slug>` | `content/<collection>/<slug>.md` |

[pages/index.astro](pages/index.astro)는 home.json을, [pages/[...slug].astro](pages/%5B...slug%5D.astro)는 그 외 페이지 JSON을, [pages/[collection]/[...slug].astro](pages/%5Bcollection%5D/%5B...slug%5D.astro)는 모든 컬렉션 항목을 빌드 타임에 처리하는 단일 디스패처입니다.

## 헤더 네비게이션

별도 nav 설정 파일 없습니다. 페이지 자체에 다음 필드만 있으면 됩니다:

- `showInNav: true` — 헤더 노출
- `navLabel` — 메뉴 라벨 (없으면 `title`)
- `navOrder` — 정렬 순서 (오름차순; 같으면 라벨 알파벳)

[components/Header.astro](components/Header.astro)가 빌드 시 `showInNav` 페이지를 모아 자동으로 메뉴를 만듭니다. 슬러그가 `home`인 페이지는 `/home`이 아니라 `/`로 링크됩니다.

## 페이지 빌더 블록

`/kitchen-sink` 페이지에 모든 블록의 살아 있는 예시가 있습니다 (소스: [content/pages/kitchen-sink.json](content/pages/kitchen-sink.json)). 디스패처는 [components/blocks/PageBlock.astro](components/blocks/PageBlock.astro).

| 분류 | 블록 |
|---|---|
| 기본 | `heading`, `paragraph`, `image`, `button`, `columns`, `cards`, `divider`, `spacer`, `code`, `html` |
| 콘텐츠 | `callout`, `quote`, `video`, `audio`, `embed` (YouTube/Vimeo/CodePen 자동 인식), `gallery`, `accordion`, `tabs` |
| 데이터/시각화 | `stats` (스크롤 시 카운트업), `timeline`, `progress`, `countdown`, `palette` (hex 클릭 복사) |
| **컬렉션 연동** | **`collection-list`** — 파라미터로 어떤 컬렉션을 보여줄지 선택 |
| 고급 | `mermaid`, `math` (KaTeX), `runner` (JS 플레이그라운드), `iframe-sandbox` (HTML/CSS/JS) |
| 장식 | `marquee` |

### `collection-list` 블록 ⭐

이게 데이터 리스트 표시의 단일 진입점입니다. 예전의 `recent-posts`/`featured-projects` 두 블록을 대체합니다.

```json
{
  "type": "collection-list",
  "collection": "blog",        // ← 어느 컬렉션을 보여줄지
  "title": "",                  // 비우면 컬렉션 라벨 사용
  "limit": 3,                   // 0이면 전체
  "featuredOnly": false,        // 항목의 featured 플래그로 필터
  "showAllLink": true           // limit > 0일 때만 "All →" 링크
}
```

홈에서는 `limit:3`으로 미리보기를, `/<collection>` 인덱스 페이지에서는 `limit:0`으로 전체 목록을 같은 블록 한 종류로 처리합니다. admin에서는 inspector의 셀렉트박스가 정의된 컬렉션 목록을 자동으로 채워줍니다.

블록 안에 들어가는 텍스트는 [components/blocks/_md.ts](components/blocks/_md.ts)의 작은 인라인 마크다운 헬퍼로 `**bold**`, `*italic*`, `` `code` ``, `[text](url)` 정도를 지원합니다.

## 사이트 설정

[config/site.json](config/site.json) 한 파일에 모이고, admin **Site** 섹션에서 GUI로 편집됩니다.

- **메타**: `title`, `author`, `description`, `url`, `email`, `github`
- **테마 팔레트**: 8종 — `indigo`, `rose`, `emerald`, `amber`, `sky`, `violet`, `crimson`, `lime`. 사이트 전역으로 적용되며 ([styles/global.css](styles/global.css)의 CSS 변수), 방문자가 임의로 바꾸지 못합니다.
- **기능 토글**:
  - `readingProgress` — 페이지 상단 스크롤 진행 바
  - `backToTop` — 우하단 "맨 위로" 버튼
  - `konami` — ↑↑↓↓←→←→BA 입력 시 페이지 회전 (있어도 그만 없어도 그만)

라이트/다크 모드는 방문자가 헤더 토글로 바꾸고 `localStorage`에 저장됩니다.

## 로컬 admin 도구

[tools/admin.mjs](tools/admin.mjs) — Node 표준 `http` 모듈만 쓰는 단일 파일 서버입니다. 외부 의존성 없음, 인증 없음, 외부 API 호출 없음. 그냥 프로젝트 파일을 직접 읽고 씁니다.

`npm run admin` → http://localhost:4000

| 섹션 | 하는 일 |
|---|---|
| Dashboard | 컬렉션별 카운트, 페이지/미디어 수, 빠른 액션 |
| **Content** (각 컬렉션) | 사이드바에 자동 등장. 항목 CRUD, 마크다운 에디터(툴바 + 라이브 프리뷰) |
| **Manage collections** | 컬렉션 정의 CRUD — 추가/이름변경/삭제. 삭제 시 디스크 파일도 함께 지울지 선택 |
| Pages | 비주얼 블록 빌더 (`content/pages/*.json` 편집) |
| Site | 사이트 메타·테마·기능 토글 |
| Media | `public/uploads/` 이미지 업로드/삭제/URL 복사 |

저장하면 그대로 디스크에 떨어지므로 dev 서버에는 즉시 반영됩니다. 변경 사항을 git으로 커밋하면 그게 곧 콘텐츠 이력입니다.

### REST API (admin 내부용)

| Method | Path | 용도 |
|---|---|---|
| GET | `/api/collections` | 컬렉션 정의 + 통계 목록 |
| POST | `/api/collections` | 컬렉션 생성 (디렉터리도 같이 만듦) |
| PUT | `/api/collections/:name` | 라벨/아이콘/이름 변경 (이름 변경 시 디렉터리 이동) |
| DELETE | `/api/collections/:name?wipe=1` | 정의 삭제 — `wipe=1`이면 파일까지 삭제 |
| GET/POST/PUT/DELETE | `/api/items/:collection[/:slug]` | 컬렉션 항목 CRUD |
| GET/PUT | `/api/site` | 사이트 설정 |
| GET/POST/PUT/DELETE | `/api/pages[/:slug]` | 페이지 JSON CRUD |
| GET/POST/DELETE | `/api/media[/:name]` | 이미지 업로드 |

## 폴더 구조

```
astro.config.mjs    srcDir: '.' — 소스가 루트에 있음
config/
  site.json         메타 + 테마 팔레트 + 기능 토글
  collections.json  컬렉션 정의 (데이터 리스트)
  index.ts          타입 + 컬렉션/팔레트 export
content/
  config.ts         컬렉션 zod 스키마 (동적 컬렉션 + 모든 블록)
  <collection>/     *.md          ← 데이터 (blog, projects, …)
  pages/            *.json        ← 사이트 구조 (home/blog/projects/about/…)
components/
  Header / Footer / ThemeToggle / ReadingProgress / BackToTop
  CollectionItemCard          항목 카드 (모든 컬렉션 공용)
  blocks/                     각 블록 컴포넌트 + PageBlock 디스패처 + _md 헬퍼
layouts/
  BaseLayout.astro            공통 셸 (메타/테마/기능 스크립트)
  CollectionPost.astro        /<collection>/<slug> 항목 상세 (모든 컬렉션 공용)
pages/
  index.astro                 /              → home.json 렌더
  [...slug].astro             /<slug>        → 해당 페이지 렌더
  [collection]/[...slug].astro /<coll>/<slug> → 모든 컬렉션 항목 디스패처
public/
  favicon.* / uploads/
styles/global.css             Tailwind + 팔레트 CSS 변수 + 기타 컴포넌트 스타일
tools/admin.mjs               로컬 비주얼 에디터 (Node 단일 파일)
```

## 워크플로

### 새 컬렉션 만들기 (예: `recipes`)

1. `npm run admin` → 사이드바 **Manage collections** → **+ New collection**
2. Name `recipes`, Label `Recipes`, Singular `Recipe`, Icon `🍳` 입력 → Create
3. 사이드바에 **Recipes** 가 즉시 추가됨 → 클릭해서 항목 추가
4. 어디든 (홈, About, 새 페이지) `collection-list` 블록을 추가하고 inspector에서 **Collection: Recipes** 선택

### 새 페이지 추가하기

1. `npm run admin` → **Pages** → **+ New page**
2. 슬러그 정하고 (예: `now`), 블록 추가하고 저장
3. 헤더에 띄우려면 Page settings에서 **Show in nav** 켜고 **Nav order** 조정

> 슬러그를 `home`으로 만들면 `/home`이 아니라 `/`로 렌더됩니다.

## 배포

`main`에 푸시하면 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)이 빌드해서 GitHub Pages로 배포합니다. 도메인은 [CNAME](CNAME)에 적힌 `iruki.dev`.

## 라이선스

[Apache License 2.0](LICENSE).
