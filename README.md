# FieldGuard AI

농업 위험 예측 및 현장 의사결정 보조 Web App 프로토타입입니다.

## 요구 환경

- `Node.js` 24.x
- `npm` 10.x
- `pnpm` 10.x (우선 사용)

## 설치

1. 우선 `pnpm`으로 설치 시도:

```bash
pnpm install
```

2. Windows 환경에서 `pnpm`이 비정상 종료되는 경우 대체:

```bash
npm install
```

## 실행 및 검증

```bash
npm run dev
npx tsc --noEmit
npm test
npm run build
npm run lint
```

## 문서

- 전체 문서 인덱스: [docs/index.md](./docs/index.md)
- 제출 전 QA/보안/배포 점검: [docs/phase9-qa-submission-stabilization.md](./docs/phase9-qa-submission-stabilization.md)

## 락파일 정책

- 원칙: `pnpm` 우선
- 현실 운영: 로컬 Windows에서 `pnpm install` 크래시 발생 시 `npm`으로 복구
- 향후 과제: `pnpm` 크래시 원인 해결 후 단일 락파일(`pnpm-lock.yaml`)로 통일
