# New Machine Setup (Windows)

Huong dan setup theo cau hinh moi:
- Runtime chi dung `.env.encrypted` + `MASTER_KEY`
- `.env` chi dung 1 lan de tao `.env.encrypted` roi co the xoa
- Docker Compose local duoc chay qua wrapper script de inject env da giai ma trong memory

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

## 3) Tao file nguon tam de ma hoa

```powershell
Copy-Item .env.example .env -Force
```

Cap nhat gia tri that trong `.env`:
- `MASTER_KEY` (bat buoc)
- `POSTGRES_*`
- `DATABASE_URL`
- `JWT_SECRET`
- `SMTP_*` neu dung SMTP

Luu y quan trong:
- Khong commit `.env`
- Khong commit `MASTER_KEY`

## 4) Encrypt thanh `.env.encrypted`

```powershell
cmd /c yarn env:encrypt
```

Lenh nay tao file `.env.encrypted` tu `.env`.

Sau khi tao xong, co the xoa `.env` neu ban muon runtime chi con encrypted:

```powershell
Remove-Item .env
```

## 5) Set `MASTER_KEY` vao system environment

PowerShell (session hien tai):

```powershell
$env:MASTER_KEY="<your_master_key>"
```

Windows persistent (User scope):

```powershell
setx MASTER_KEY "<your_master_key>"
```

## 6) Start stack Docker

```powershell
cmd /c yarn docker:up
docker compose ps
```

Compose se chay:
- `postgres` service
- `api` service

`api` container se chay:
1. `yarn install`
2. `yarn workspace @nutrition/api prisma:generate`
3. `yarn workspace @nutrition/api prisma:db:push`
4. `yarn workspace @nutrition/api dev`

Tat ca env can thiet duoc decrypt tu `.env.encrypted` trong memory.

## 6.1) Chay local khong qua Docker

Dung flow nay neu ban muon chay backend tren may host (khong dung Docker cho API).

1. Dam bao PostgreSQL dang chay local hoac remote.
2. Neu can doi DB host, tao/sua `.env` roi encrypt lai:

```powershell
Copy-Item .env.example .env -Force
# Chinh DATABASE_URL ve localhost, vi du:
# DATABASE_URL=postgresql://nutrition:nutrition_dev@127.0.0.1:5432/nutrition_assistant
cmd /c yarn env:encrypt
```

3. Set `MASTER_KEY` trong session hien tai:

```powershell
$env:MASTER_KEY="<your_master_key>"
```

4. Generate Prisma + migrate + run API:

```powershell
cmd /c node scripts/run-with-encrypted-env.mjs "yarn workspace @nutrition/api prisma:generate"
cmd /c yarn db:migrate:dev
cmd /c yarn dev:api:encrypted
```

Luu y:
- Khi chay local non-Docker, `DATABASE_URL` phai dung host `127.0.0.1` (hoac host DB that), khong dung `postgres`.
- Moi lan thay doi env, phai encrypt lai `.env.encrypted`.

## 7) Verify backend

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

Swagger:

```text
http://127.0.0.1:3000/api/docs
```

## 8) Useful commands

Encrypt lai env:

```powershell
cmd /c yarn env:encrypt
```

Start/stop docker stack:

```powershell
cmd /c yarn docker:up
cmd /c yarn docker:down
```

Migrate DB (deploy mode):

```powershell
cmd /c yarn db:migrate
```

Migrate DB (dev mode):

```powershell
cmd /c yarn db:migrate:dev
```

Run API local (khong qua Docker, chi dung encrypted env):

```powershell
cmd /c yarn dev:api:encrypted
```

## 9) Production note

Production khong can `.env`:
- Inject `MASTER_KEY` tu secret manager
- Cung cap file `.env.encrypted` (artifact/bundle/secret volume)
- App tu decrypt va nap vao `process.env` truoc khi bootstrap

## 10) Troubleshooting

### `MASTER_KEY is required to decrypt .env.encrypted`

- Kiem tra `MASTER_KEY` da co trong system environment.
- Neu doi key thi phai encrypt lai `.env.encrypted` bang key moi:

```powershell
cmd /c yarn env:encrypt
```

### API khong connect duoc DB

- Kiem tra `DATABASE_URL` trong file plaintext truoc khi encrypt.
- Encrypt lai sau moi lan thay doi:

```powershell
cmd /c yarn env:encrypt
```

- Neu API chay trong Docker Compose, host nen la `postgres` (khong phai `localhost`).

### `P3005` khi Docker chay `prisma migrate deploy`

Nguyen nhan: khong co folder migration (`apps/api/prisma/migrations`) nhung lai chay `migrate deploy`.

Cach xu ly trong setup hien tai:
- Da chuyen startup local Docker sang `prisma db push` (khong can migration files).
- Chay lai stack:

```powershell
cmd /c yarn docker:down
cmd /c yarn docker:up
```

### Reset DB data (mat du lieu)

```powershell
docker compose down -v
cmd /c yarn docker:up
```
