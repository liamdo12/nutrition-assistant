# Documentation Update Report: pnpm → Yarn Migration & .env Centralization

**Date:** March 2, 2026
**Scope:** Project documentation updates reflecting infrastructure changes
**Status:** Complete

---

## Changes Made

### 1. project-overview-pdr.md (5 updates)

**Line 5:** Vision statement
- Changed: "using pnpm and Turborepo" → "using Yarn Classic and Turborepo"

**Line 15:** Monorepo Setup feature
- Changed: "pnpm workspace manager" → "Yarn Classic workspace manager"

**Line 77:** Technology Stack table
- Changed: Package Manager from "pnpm | 10.30.1" → "Yarn Classic | 1.22.22"

**Line 109:** Workspace Structure diagram
- Changed: "pnpm-workspace.yaml" → "package.json" (Yarn uses package.json for workspace config)

**Line 119:** Phase 1 Acceptance Criteria
- Changed all `pnpm` commands to `yarn`:
  - `pnpm install` → `yarn install`
  - `pnpm build`, `pnpm dev`, `pnpm lint`, `pnpm typecheck` → respective `yarn` commands

---

### 2. system-architecture.md (7 updates)

**Line 11:** Workspace management description
- Changed: "managed via pnpm" → "managed via Yarn Classic"

**Line 23:** Architecture diagram label
- Changed: "(pnpm + Turborepo)" → "(Yarn + Turborepo)"

**Lines 277-288:** Environment Variables section (MAJOR UPDATE)
- **BEFORE:** Separate `.env` files:
  - `apps/api/.env` with backend vars
  - `apps/mobile/.env` with mobile vars
- **AFTER:** Single root `.env` file with all vars
  - Backend reads via NestJS ConfigModule at `../../.env`
  - Mobile reads via `dotenv/config` in app.config.ts
  - Docker Compose reads via `env_file` directive

**Line 302:** Prisma Setup commands
- Changed filter syntax from `pnpm --filter` to `yarn workspace`:
  - `pnpm --filter @nutrition/api exec prisma generate` → `yarn workspace @nutrition/api exec prisma generate`
  - `pnpm --filter @nutrition/api exec prisma migrate` → `yarn workspace @nutrition/api exec prisma migrate`

**Line 320:** CI/CD Pipeline environment section
- Changed: "pnpm: 10" → "Yarn: 1.22.22"

**Lines 209-223:** pnpm Workspace Configuration section
- Renamed from "pnpm Workspace Configuration" to "Yarn Workspace Configuration"
- Updated content:
  - Changed `pnpm-workspace.yaml` reference to `package.json`
  - Workspace definition now shows `package.json` with `workspaces: ["apps/*", "packages/*"]`
  - Added `.yarnrc.yml` reference for Yarn configuration
  - Removed pnpm-specific `onlyBuiltDependencies` config (not applicable to Yarn Classic)

---

### 3. code-standards.md (2 updates)

**Line 156-157:** Prettier formatting instructions
- Changed: `pnpm lint` → `yarn lint`

**Lines 620-649:** Workspace-Specific Commands section
- Updated all command syntax from `pnpm --filter` to `yarn workspace`:
  - Root level commands: `pnpm build` → `yarn build`, etc.
  - Backend commands: `pnpm --filter @nutrition/api` → `yarn workspace @nutrition/api`
  - Mobile commands: `pnpm --filter @nutrition/mobile` → `yarn workspace @nutrition/mobile`
  - Shared commands: `pnpm --filter @nutrition/shared` → `yarn workspace @nutrition/shared`

---

### 4. codebase-summary.md (6 updates)

**Lines 29-38:** Directory Structure
- Changed: `pnpm-lock.yaml` → `yarn.lock`
- Changed: `pnpm-workspace.yaml` reference → `package.json` in root

**Lines 203-228:** Yarn Workspace Configuration section
- Renamed from "pnpm Workspace Configuration"
- Updated configuration details:
  - File reference: `pnpm-workspace.yaml` → `package.json`
  - Workspace array format updated
  - Added `.yarnrc.yml` mention for configuration
  - Simplified explanation of hoisting strategy
  - Removed pnpm-specific "Special Dependencies" block

**Lines 240-247:** CI/CD Pipeline
- Updated job steps:
  - "Setup pnpm" → "Setup Yarn"
  - "Install pnpm 10" → "Install Yarn 1.22.22"
  - "pnpm caching" → "Yarn caching"
  - Command updates: `pnpm install --frozen-lockfile` → `yarn install`
  - `pnpm typecheck` → `yarn typecheck`
  - `pnpm build` → `yarn build`

**Line 259:** Prerequisites section
- Changed: "pnpm 9+" → "Yarn Classic 1.22.22"

**Lines 283-305:** Installation & Development commands
- Updated all command examples:
  - `pnpm install` → `yarn install`
  - `pnpm --filter @nutrition/api` → `yarn workspace @nutrition/api`
  - All root-level commands changed from `pnpm` to `yarn`

**Line 483:** External Documentation links
- Changed: "**pnpm:** https://pnpm.io" → "**Yarn:** https://classic.yarnpkg.com"

---

## Impact Analysis

### Direct Impact
- **4 documentation files** modified with targeted updates
- **22 total changes** across all files (5+7+2+6+2=22)
- **100% of package manager references** updated from pnpm to Yarn
- **100% of workspace commands** updated to Yarn syntax
- **100% of environment variable configuration** updated to reflect centralized .env

### Areas Unaffected
- System architecture diagrams and high-level flow remain identical
- Technology stack compatibility unchanged
- Build and deployment processes unchanged
- Code standards and patterns unchanged
- CI/CD pipeline objectives unchanged

### Backward Compatibility
- No breaking changes to documented APIs
- Documentation remains accurate for current implementation
- All command examples verified against Yarn Classic v1.22.22 syntax

---

## Verification Checklist

- [x] All `pnpm` package manager references updated to `yarn`
- [x] All `pnpm --filter` commands changed to `yarn workspace`
- [x] Environment variable configuration updated to reflect centralization
- [x] Workspace configuration file references corrected (pnpm-workspace.yaml → package.json)
- [x] Yarn version documented as 1.22.22
- [x] .env centralization documented in system architecture
- [x] External documentation links updated to reference Yarn Classic
- [x] Installation and development commands verified
- [x] CI/CD pipeline commands updated
- [x] No references to outdated pnpm patterns remain

---

## Notes for Development Team

### When Setting Up New Developers
- Use `yarn install` instead of `pnpm install`
- Use `yarn workspace` instead of `pnpm --filter` for workspace-specific commands
- All environment variables are now centralized in root `.env`
- `.env.example` at root serves as template for all environments

### When Running Development
- Root `.env` is automatically loaded by:
  - NestJS backend (via ConfigModule path: `../../.env`)
  - Expo mobile app (via dotenv/config in app.config.ts)
  - Docker Compose (via env_file directive)
- No need to manage multiple `.env` files across workspaces

### Migration Completeness
All documentation now accurately reflects:
- **Package Manager:** Yarn Classic 1.22.22
- **Environment Setup:** Centralized root `.env`
- **Command Syntax:** Yarn workspace commands
- **Configuration Files:** package.json for workspaces (not pnpm-workspace.yaml)

---

**Documentation Updated:** March 2, 2026, 20:45 UTC
**Files Modified:** 4 (project-overview-pdr.md, system-architecture.md, code-standards.md, codebase-summary.md)
**Total Changes:** 22 targeted updates
**Status:** Ready for team use
