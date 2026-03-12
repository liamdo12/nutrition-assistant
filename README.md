# Nutrition Assistant

An AI-powered mobile app for nutrition tracking and cooking recipes. Capture food via photo or voice, get instant AI-powered nutritional analysis, and discover personalized recipe suggestions — all powered by Google Gemini.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                      GitHub Actions CI/CD                            │
│  ┌─────────────┐   ┌──────────────┐   ┌────────────────────────┐    │
│  │ Lint & Type  │──▶│ Build & Test  │──▶│ Deploy to Cloud Run    │    │
│  │   Check      │   │  (Turborepo)  │   │ + EAS Mobile Build     │    │
│  └─────────────┘   └──────────────┘   └────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
┌──────────────────────┐          ┌──────────────────────────┐
│    Mobile App (Expo)  │          │   Google Cloud Platform   │
│  ┌────────────────┐  │          │                          │
│  │ Photo Capture   │  │  REST   │  ┌────────────────────┐  │
│  │ Voice Recording │──┼────────▶│  │  Cloud Run (API)   │  │
│  │ Recipe Browser  │  │  API    │  │  NestJS + Fastify   │  │
│  └────────────────┘  │         │  └────────┬───────────┘  │
│                      │          │           │              │
│  iOS / Android       │          │  ┌────────▼───────────┐  │
│  React Native 0.83   │          │  │  Cloud SQL         │  │
│  Expo SDK 55         │          │  │  PostgreSQL 16     │  │
│                      │          │  └────────────────────┘  │
└──────────────────────┘          │                          │
        │                         │  ┌────────────────────┐  │
        │   Multimodal            │  │  Cloud Storage     │  │
        │   (photo/audio)         │  │  (GCS Buckets)     │  │
        └────────────────────┐    │  └────────────────────┘  │
                             ▼    │                          │
                 ┌─────────────────────────────────┐         │
                 │      Gemini Live API             │         │
                 │  ┌───────────────────────────┐  │         │
                 │  │ Food Recognition (Vision)  │  │         │
                 │  │ Voice-to-Nutrition (Audio) │  │         │
                 │  │ Recipe Generation (LLM)    │  │         │
                 │  └───────────────────────────┘  │         │
                 └─────────────────────────────────┘         │
                                                └────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Mobile** | Expo SDK 55, React Native 0.83, NativeWind, Zustand |
| **Backend** | NestJS 11, Fastify 5, Prisma 6, PostgreSQL 16 |
| **AI** | Google Gemini Live API (vision, audio, text) |
| **Cloud** | Cloud Run, Cloud SQL, Cloud Storage (GCS) |
| **CI/CD** | GitHub Actions, Turborepo, EAS Build |
| **Shared** | Zod schemas, TypeScript strict mode |

## Project Structure

```
nutrition-assistant/
├── apps/
│   ├── api/            # NestJS backend REST API
│   └── mobile/         # Expo React Native app
├── packages/
│   └── shared/         # Shared Zod schemas & types
├── .github/workflows/  # CI/CD pipelines
├── docker-compose.yml  # Local PostgreSQL
├── turbo.json          # Build orchestration
└── package.json        # Yarn workspace root
```

## Getting Started

```bash
# Install dependencies
yarn install

# Start local database
docker-compose up -d

# Run database migrations
yarn workspace @nutrition/api exec prisma migrate dev

# Start development servers
yarn dev
```

## License

MIT
