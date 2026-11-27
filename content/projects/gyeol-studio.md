---
title: "결 스튜디오"
description: "gyeol 라이브러리로 만든 보컬 코칭 앱. 원곡 한 소절을 따라 부르면 음정·박자·강약 차이를 알려 주고, 내 목소리로 만든 시범음을 들려준다."
pubDate: 2026-10-02
tags: ["Python", "FastAPI", "PyInstaller"]
github: "https://github.com/iruki-dev/gyeol-studio"
featured: true
---

**[gyeol](/projects/gyeol)로 만든 보컬 코칭 앱.** PC에서 서버가 돌고, 화면은 PC와 휴대폰 브라우저로 연다.
설치부터 사용까지 터미널 없이 쓸 수 있게 Windows·macOS 실행 파일로 묶었다.
녹음과 피드백 응답, 라벨은 PC의 데이터 폴더 하나에 쌓여 모델 학습 데이터가 된다.

| | |
|---|---|
| **기간** | 2026.10 · 7 커밋 · 5단계 |
| **역할** | 개인 프로젝트 |
| **기술** | Python · FastAPI · 브라우저 화면 · PyInstaller · GitHub Actions |
| **규모** | 파이썬 5,600줄 · API 흐름 테스트 14개 · Playwright 종단 테스트 |
| **배포** | Windows·macOS 실행 파일(GitHub Actions 빌드) |

![코칭 화면: 원곡과 내 노래의 음정 곡선, 박자 지적, 시범음 듣기](/uploads/projects/gyeol-studio-feedback.png)

## 진행

| 단계 | 내용 |
|---|---|
| 1 | 실행 파일, 곡 보관함, 소절 만들기, 녹음, 코칭(음정·박자·강약) |
| 2 | 피드백 응답, 라벨, 녹음 조건, 내보내기 |
| 3 | 시작 검사, 연습 기록, 사용자 프로필 |
| 4 | 기술 녹음 모드, 학습 관리 |
| 5 | 휴대폰 접속(QR·HTTPS), 안내 투어, 오류 문구 |

앱을 만들면서 라이브러리에 필요해진 기능과 발견한 문제는 저장소의 `docs/library-requests.md`에 따로 모았다.
