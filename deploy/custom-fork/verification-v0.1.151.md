# v0.1.151 리베이스 검증

2026-11-10 UTC, `custom/0.1.150`의 `b2a8998422083458617f6cdc4d0a0e095b10d923`에서
`custom/0.1.151`을 만들었다. 별도 worktree는
`/home/ubuntu/openmausbot-rebase-0.1.151`이다.

공식 태그 `v0.1.151`의 커밋은
`b33a1c6437e2b5ea55000d89210727812ea2f21d`이다. 이전 기반 `v0.1.150` 이후의
커스텀 커밋 24개를 모두 옮겼다. 텍스트 충돌은 없었으며 `git range-diff`에서
누락된 커밋은 없었다. upstream의 그룹 턴 추적, saved-secrets 프롬프트,
런타임 secret-redaction 변경에 따른 패치 문맥 차이는 확인했다.

## 호환성 보완

- Codex 재시작 테스트가 변경 전 `OMB_MCP_RESTART`를 사용하던 부분을 실제
  `MCP_RESTART_ENV` 상수로 수정했다. 재시작 카운터가 자식 환경에 노출되지
  않는 기존 검증은 유지했다.
- Goal 완료 검증이 다른 대화에서 바쁜 팀원을 다시 선택하지 않도록 현재
  사용 가능한 멤버·리더 중에서 선택한다. 별도 검증 턴과 실질적 도구 증거
  요구는 유지했다. 바쁜 팀원을 건너뛰는 회귀 테스트를 추가했다.
- 공식 그룹 fixture가 커스텀 완료 검증 턴을 처리하도록 보완했다. 검증
  fixture는 실제 임시 파일을 읽고 Read 이벤트를 전달한다. 위임이 거절된
  fixture는 작업 완료를 주장하지 않고 `needs-input`으로 종료한다.
- 푸시 테스트의 JSON 응답과 암호화 payload 타입을 명시적으로 검증한다.
- 릴리스 준비 스크립트가 삭제된 `custom/production` 대신 명시한 source
  branch를 사용한다. 기본 출발점은 현재 브랜치이며 이전 브랜치를 덮어쓰지
  않는다. 기반 기록은 `v0.1.151`로 변경했다.

## 검증 기록

`corepack pnpm install --frozen-lockfile`로 별도 의존성을 설치했다.
`@trycua/cua-driver`는 공식 lockfile의 `0.45.4`를 사용한다.

- 커스텀 영역과 Codex를 포함한 첫 단위 회귀 검사: 23파일, 963개 중 962개
  통과. 위 재시작 변수명 테스트 1개를 수정 후 다시 실행해 통과했다.
- 최초 통합 검사: 6파일, 47개 중 30개 통과. 서버 초기 기동 제한으로 실행되지
  못한 Goal 파일과 실패한 wait-cap/room-root 사례를 별도로 재검증했다.
- 최종 Goal·wait-cap·푸시·소스 크기 제한 검사: 5파일, 43개 통과.
- 수정한 room-root 시나리오 3개 재검사 통과. 해당 선택 실행에서 다른
  테스트 13개는 필터에 의해 실행되지 않았다. 앞선 전체 실행에는 기존에
  건너뛰는 사례 1개가 포함돼 있다.
- 격리 fixture의 실제 Chrome에서 서비스 워커 등록, 알림 권한,
  페어링 API 200, 푸시 키 API 200, OS 알림 생성과 대화 대상 정보를 확인했다.
- 릴리스 준비 스크립트는 임시 bare Git 저장소로 검증했다. 이름이 바뀐
  source branch, 새 worktree 생성, 커스텀 패치 유지, 기반 갱신, 기존 checkout
  유지가 모두 확인됐다. `bash -n`과 `git diff --check`도 통과했다.

초기 오류를 숨기거나 테스트를 삭제하지 않았다. 운영 데이터에 시험 메시지나
설정 변경을 보내지 않았고 실제 OAuth를 사용하는 유료 모델 호출도 하지 않았다.

## 배포와 미검증 범위

이 브랜치는 소스 후보이며 운영 서버에는 배포하지 않았다. 운영 앱과 Local VM,
인증 및 데이터 볼륨, 외부 Docker build context는 변경하지 않았다.
최종 `corepack pnpm exec tsc -p tsconfig.server.json`, `corepack pnpm exec tsc -b`,
`corepack pnpm build:server`, `corepack pnpm exec vite build`는 모두 통과했다.
변경한 Goal/fixture/푸시 테스트의 지정 lint 검사도 통과했다.
전체 저장소 테스트, 실제 계정의 사용량 제한 유발, 실제 Android/Samsung
푸시 수신, 새 cua-driver로 운영 VM 제어는 이번 검사 범위에 포함하지 않았다.
배포 시 공식 v0.1.151 이미지 digest를 고정한 별도 후보 이미지와 현재 데이터의
백업·롤백 준비가 추가로 필요하다.
