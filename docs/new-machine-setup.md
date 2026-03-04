# New Machine Setup (Windows)

Huong dan setup theo cau hinh moi:
- App dung `.env.local` (plaintext local only)
- Tao `.env.encrypted` bang script AES-256-CBC
- Runtime decrypt `.env.encrypted` bang `MASTER_KEY` truoc khi Nest bootstrap
- Docker Compose chay ca `api + postgres`

## 1) Prerequisites

```powershell
node -v
docker -v
```

Node khuyen nghi: `>= 20`.

Bat Corepack + Yarn 1.22.22:

```powershell
corepack enable
corepack prepare yarn@1.22.22 --activate
cmd /c yarn -v
```

## 2) Clone + install dependencies

```powershell
cmd /c yarn install
```

## 3) Tao `.env.local` tu template

```powershell
Copy-Item .env.example .env.local -Force
```

Cap nhat gia tri that trong `.env.local`:
- `MASTER_KEY` (bat buoc, secret that)
- `POSTGRES_*`
- `DATABASE_URL`
- `JWT_SECRET`
- `SMTP_*` neu dung SMTP

Luu y quan trong:
- Khong commit `.env.local`
- Khong commit `MASTER_KEY`

## 4) Encrypt env local

```powershell
cmd /c yarn env:encrypt
```

Lenh nay tao file `.env.encrypted` tu `.env.local`.

## 5) Start stack bang Docker Compose

```powershell
docker compose up -d
docker compose ps
```

Compose se chay:
- `postgres` service
- `api` service

`api` container se:
1. `yarn install`
2. `yarn env:encrypt`
3. `yarn workspace @nutrition/api prisma:generate`
4. `yarn workspace @nutrition/api prisma:migrate:deploy`
5. `yarn workspace @nutrition/api dev`

## 6) Verify backend

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

Swagger:

```text
http://127.0.0.1:3000/api/docs
```

## 7) Useful commands

Encrypt lai env:

```powershell
cmd /c yarn env:encrypt
```

Migrate DB (deploy mode):

```powershell
cmd /c yarn db:migrate
```

Migrate DB (dev mode):

```powershell
cmd /c yarn db:migrate:dev
```

Run API local (khong qua Docker):

```powershell
cmd /c yarn dev:api
```

## 8) Production note

Production khong dung `.env.local`:
- Inject env vars tu platform (Cloud Run, ECS, v.v.)
- Inject `MASTER_KEY` tu secret manager
- App van decrypt `.env.encrypted` neu file nay duoc cung cap trong runtime

## 9) Troubleshooting

### `MASTER_KEY is required to decrypt .env.encrypted`

- Kiem tra `MASTER_KEY` co trong `.env.local` hoac runtime env.
- Encrypt lai:

```powershell
cmd /c yarn env:encrypt
```

### API khong connect duoc DB

- Kiem tra `DATABASE_URL` trong `.env.local`.
- Neu API chay trong Docker Compose, host nen la `postgres` (khong phai `localhost`).

### Reset DB data (mat du lieu)

```powershell
docker compose down -v
docker compose up -d
```
