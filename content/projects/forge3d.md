---
title: "forge3d"
description: "파이썬으로 처음부터 만든 3D 물리 게임 엔진. 동역학·충돌·접촉을 외부 엔진 없이 직접 풉니다."
pubDate: 2026-06-03
updatedDate: 2026-06-15
tags: ["Python", "NumPy", "JAX", "Rust", "OpenGL"]
github: "https://github.com/iruki-dev/forge3d"
demo: "https://iruki.dev/forge3d"
featured: true
---

파이썬으로 쓴 3D 물리·게임 엔진입니다. MuJoCo나 PyBullet 같은 외부 물리엔진을 코어에서
쓰지 않는다는 제약이 출발점이었습니다. 강체 적분, 충돌 판정, 접촉 임펄스를 전부 직접
구현했고, 외부 엔진은 같은 장면을 돌려 수치를 대조하는 검증용으로만 씁니다.

남의 솔버를 감싸기만 하면 접촉이 왜 떨리는지, 에너지가 왜 조용히 새는지는 끝까지 모르게
됩니다. 직접 풀면 둘 다 알게 됩니다.

## 들어 있는 것

- **물리** — 강체 동역학(RNEA/CRBA/ABA), SAT·GJK/EPA 충돌, PGS 접촉 솔버, 마찰
- **구속** — 힌지·볼·프리즈매틱·고정·거리·스프링 조인트, heightfield 지형
- **렌더링** — 실시간 OpenGL PBR, 디퍼드 렌더러, 소프트웨어 레이트레이서
- **게임 레이어** — ECS, 스켈레탈 애니메이션, 오디오, 파티클, 씬 관리, 에디터
- **학습** — Gymnasium 환경, JAX 배치 롤아웃, PPO·SHAC

공개 API는 `World` · `Body` · `Joint` · `Shape` · `Viewer` · `Recorder` 여섯 개면
충분하도록 작게 유지했습니다. 물리 코어는 렌더러를 아예 import하지 않고 `SceneSnapshot`이라는
순수 데이터로만 이어져서, 같은 시뮬레이션 코드가 실시간 미리보기도 레이트레이싱 영상도
그대로 만들어냅니다.

## 현재

버전 2.2.1, 테스트 545개, PyPI에 `pyforge3d`로 배포 중입니다. 검증은 보기와 무관한 기준으로
합니다 — PyBullet 대조, 에너지 보존, 단진자 주기 해석해 대조, 그리고 NumPy와 JAX 백엔드가
같은 수를 내는지. 속도는 JAX JIT+vmap과 핫루프의 Rust 구현에서 얻었고, Rust는 의존성이
아니라 최적화라서 없어도 전체 테스트가 통과합니다.
