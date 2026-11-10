# 커스텀 fork 운영 및 릴리스 리베이스

이 fork는 공식 릴리스 위에 로컬 수정 커밋을 유지한다.

| 이름 | 역할 |
|---|---|
| `origin` | `https://github.com/bmoh95/OpenMausBot.git` — 커스텀 코드 보관 |
| `upstream` | `https://github.com/milind-soni/OpenMausBot.git` — 공식 소스와 릴리스 |
| `origin/custom/0.1.150` | 현재 배포된 릴리스의 소스 브랜치 |
| `origin/custom/0.1.151` | v0.1.151 기반 리베이스 후보; push만으로 배포되지 않음 |
| `deploy/custom-fork/upstream-base` | 현재 커스텀 브랜치가 기반으로 삼는 공식 태그 |
| `custom/X.Y.Z` | 해당 공식 릴리스 위에 커스텀 커밋을 유지하는 브랜치 |

Git에는 소스와 이 절차를 보관한다. Bot 설정·대화 DB·OAuth 인증·브라우저
프로필·실제 배포 환경변수·VM 이미지·백업은 별도의 비공개 운영 데이터다.
서버의 운영 설정과 데이터를 Git에 추가하지 않는다. 이 공개 fork의 기존
기본 브랜치 `main`과 Android 빌드 워크플로는 유지한다. VPS 수정사항은
릴리스별 `custom/X.Y.Z` 브랜치에서 관리하며, 기존 `main`으로 자동 병합하지 않는다.
GitHub Actions의 기존 저장소 설정도 유지한다.

## 새 릴리스 준비

원하는 **정식 릴리스 태그**를 지정한다. 다음 예시는 명령 형식이다.

```sh
scripts/prepare-custom-rebase.sh v0.1.151 custom/0.1.151 ../openmausbot-rebase-0.1.151 custom/0.1.150
```

스크립트는 요청한 공식 태그와 source branch만 fetch한 뒤 별도
worktree와 릴리스 브랜치를 만든다. 네 번째 인자를 생략하면 현재 브랜치를
출발점으로 사용한다. 기록된 이전 공식 태그부터 커스텀
커밋만 새 태그 위로 옮긴다. 현재 운영 checkout과 컨테이너는 전환하지 않는다.
충돌이 있으면 새 worktree 안에서 해결하고 `git rebase --continue`를 실행한다.
중단하려면 그 worktree에서 `git rebase --abort`를 사용한다. 수동 해결 후에는
`deploy/custom-fork/upstream-base`도 새 태그로 변경하고 커밋한다.

공식 코드에 이미 반영된 수정은 중복 적용을 피하도록 diff와 동작을 확인한 뒤
제거한다. `git range-diff`로 이전 커스텀 커밋과 새 후보를 비교한다. 각 커밋이
유지됐다는 사실만으로 같은 기능이 유지됐다고 판단하지 않는다.

## 검증과 이미지 준비

다음은 현재 커스텀 영역의 검사 예시다. 새 버전에서 바뀐 영역의 검사도 추가한다.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec vitest run \
  server/local-vm-admin.test.ts server/container-computer.test.ts \
  server/system-prompt.test.ts server/surface.test.ts server/skills.test.ts \
  server/turn-route.test.ts server/host/room-sessions.test.ts \
  server/group-goal-run.test.ts server/limit-failover.test.ts
corepack pnpm build:server
```

`docs/verification/README.md`에 따라 별도 데이터와 포트의 격리 fixture로 기능을
검증한다. 운영 데이터에 시험 메시지·설정 변경을 보내지 않는다. 사용자 인증
파일을 시험 환경으로 무단 복사하지 않는다.

이 서버는 고정한 공식 Docker 이미지에 커스텀 frontend와 server bundle을 합쳐 배포한다.
**소스만 리베이스해서는 전체 앱이 새 버전이 되지 않는다.** 배포 Dockerfile의
공식 이미지 버전과 multiarchitecture manifest digest도 새 릴리스로 고정하고,
frontend/server/API 호환성을 함께 확인한다. 현재 배포의 외부 build context는
`~/openmausbot-candidate-150`, compose는 `~/openmausbot-deploy`에 있다. 디렉터리
이름은 버전 증명이 아니므로 Dockerfile의 실제 FROM과 배포 소스 SHA를 확인한다.
소스 build 경로가 후보 worktree를 가리키는지도 확인한다.

특히 다음 커스텀 동작을 확인한다.

- 연결 앱 실패 뒤 이미 승인된 VM 작업을 재동의 없이 계속 수행
- 실패 진단·복구, 장기 작업 확인, SOUL 우선순위와 reply-habits
- 모델/effort 보존, 계정 사용량 제한 시 지정된 백업 모델 전환
- Codex 그룹 세션 재사용과 턴별 프록시 인증 토큰 갱신
- 관리자 VM의 capability·홈 영속화·8GiB 설정·공유 파일 접근
- VM 설치 앱 보존 및 GitHub·Figma 세션 유지
- 활성 스킬 인덱스 노출 및 MCP 재시작 설정
- Goal 모드의 진행·재검토·완료 검증

## 후보 푸시 및 운영 승격

후보 브랜치는 일반 push로 보관한다. push는 배포가 아니다.

```sh
git push -u origin custom/0.1.151
```

배포 직전 현재 운영 데이터의 백업, 이전 이미지의 롤백 태그, compose 사본,
실제 배포 소스 SHA를 비공개 운영 기록에 남긴다. 격리 검증이 끝난 이미지로
`omb` 서비스만 전환하고 공개 HTTPS 응답·인증·실시간 연결·VM 상태를 확인한다.
VM은 앱과 홈 데이터를 보존하는 현재 운영 절차로 다룬다.

새 릴리스는 새 브랜치에 push하고, 이전 릴리스 브랜치를 덮어쓰지 않는다.
배포 시에는 검증한 브랜치·커밋과 이미지 digest를 명시적으로 고정한다.
기존 운영 브랜치를 강제로 이동하거나 자동 `git pull --rebase` 뒤 즉시
재시작하지 않는다. 배포가 끝나면 실제 배포 브랜치·SHA를 운영 기록에 남긴다.
`custom/0.1.149`와 `custom/0.1.150`은 이름 변경 시 같은 커밋을 가리켰으므로,
브랜치 이름만으로 과거 배포 버전을 판단하지 않는다.

현재 이 구성은 릴리스 준비 절차이며, 예약된 무인 업데이트나 자동 배포는 아니다.
