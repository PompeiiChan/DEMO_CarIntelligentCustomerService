# Auto CS Frontend

React + TypeScript + Vite frontend for the Auto CS intelligent automotive customer-service demo.

## Routes

- `/chat`: customer chat
- `/queue`: ticket queue
- `/agent`: agent workspace
- `/knowledge`: knowledge-base admin

## Local Development

```bash
npm install
VITE_USE_MOCK=false \
VITE_API_BASE_URL=/api \
VITE_BACKEND_PROXY_TARGET=http://localhost:8199 \
npm run dev -- --host 127.0.0.1 --port 5175 --strictPort
```

## Checks

```bash
npm run build
npm run lint
```
