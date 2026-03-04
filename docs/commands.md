# Common Commands (Windows)

Tat ca lenh ben duoi chay tai root repo: `d:\nutrition-assistant`.

## 0) Quick Start (Dev)

```powershell
cmd /c yarn install
Copy-Item .env.example .env -Force
cmd /c yarn env:encrypt
setx MASTER_KEY "<your_master_key>"
cmd /c yarn docker:up
```

Neu postgres khong start, kiem tra `.env` (truoc khi encrypt) co 3 bien:

```env
POSTGRES_USER=nutrition
POSTGRES_PASSWORD=nutrition_dev
POSTGRES_DB=nutrition_assistant
```

## 1) Prerequisites

```powershell
node -v
docker -v
cmd /c yarn -v
```

Neu can setup Yarn qua Corepack:

```powershell
corepack enable
corepack prepare yarn@1.22.22 --activate
```

## 2) Install + Encrypt Env

```powershell
cmd /c yarn install
Copy-Item .env.example .env -Force
cmd /c yarn env:encrypt
```

Set `MASTER_KEY` cho session hien tai:

```powershell
$env:MASTER_KEY="<your_master_key>"
```

## 3) Docker Database

Start/stop/restart Postgres:

```powershell
cmd /c yarn docker:up
docker compose stop postgres
docker compose restart postgres
```

Kiem tra container + logs:

```powershell
docker compose ps
docker logs -f nutrition-db
```

## 4) Prisma

Generate client:

```powershell
cmd /c .\node_modules\.bin\prisma generate --schema apps/api/prisma/schema.prisma
```

Push schema vao DB:

```powershell
cmd /c .\node_modules\.bin\prisma db push --schema apps/api/prisma/schema.prisma
```

Neu gap `P3005` voi `migrate deploy`, dung `db push` cho local dev vi repo chua co migration files.

## 5) Run App

Chay backend local (khong qua Docker, chi dung encrypted env):

```powershell
cmd /c yarn dev:api:encrypted
```

Hoac chay tu root:

```powershell
cmd /c yarn dev
```

## 6) Verify API

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

Swagger:

```text
http://127.0.0.1:3000/api/docs
```

Auth test nhanh:

```powershell
$registerBody = @{
  email = "test1@example.com"
  name = "Test User"
  password = "password123"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3000/api/v1/auth/register" `
  -ContentType "application/json" `
  -Body $registerBody
```

```powershell
$loginBody = @{
  email = "test1@example.com"
  password = "password123"
} | ConvertTo-Json

$loginRes = Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3000/api/v1/auth/login" `
  -ContentType "application/json" `
  -Body $loginBody

$loginRes
```

Forgot password (dev tra ve `resetToken` de test local):

```powershell
$forgotBody = @{
  email = "test1@example.com"
} | ConvertTo-Json

$forgotRes = Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3000/api/v1/auth/forgot-password" `
  -ContentType "application/json" `
  -Body $forgotBody

$forgotRes
```

Reset password:

```powershell
$resetBody = @{
  token = $forgotRes.resetToken
  newPassword = "newPassword123"
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3000/api/v1/auth/reset-password" `
  -ContentType "application/json" `
  -Body $resetBody
```

Logout (revoke JWT hien tai):

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3000/api/v1/auth/logout" `
  -Headers @{ Authorization = "Bearer $($loginRes.token)" }
```

## 6.1) Email Config (SMTP / Resend)

Mac dinh local:

```env
EMAIL_PROVIDER=log
```

SMTP:

```env
EMAIL_PROVIDER=smtp
EMAIL_FROM=no-reply@yourdomain.com
APP_BASE_URL=http://localhost:8081
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_SECURE=false
```

Resend:

```env
EMAIL_PROVIDER=resend
EMAIL_FROM=no-reply@yourdomain.com
APP_BASE_URL=http://localhost:8081
RESEND_API_KEY=re_xxx
```

## 7) Query DB (Postgres in Docker)

Mo psql shell:

```powershell
docker exec -it nutrition-db psql -U nutrition -d nutrition_assistant
```

Lenh nhanh:

```powershell
docker exec -i nutrition-db psql -U nutrition -d nutrition_assistant -c "\dt"
docker exec -i nutrition-db psql -U nutrition -d nutrition_assistant -c "\d \"User\""
docker exec -i nutrition-db psql -U nutrition -d nutrition_assistant -c "SELECT * FROM \"User\" LIMIT 10;"
```

Trong psql:

```sql
\l
\dt
\d "User"
SELECT * FROM "NutritionLog" ORDER BY "createdAt" DESC LIMIT 10;
\q
```

## 8) Monorepo Checks

```powershell
cmd /c yarn lint
cmd /c yarn typecheck
cmd /c yarn build
```

Workspace rieng:

```powershell
cmd /c yarn workspace @nutrition/api test
cmd /c yarn workspace @nutrition/mobile start
cmd /c yarn workspace @nutrition/shared typecheck
```

## 9) Troubleshooting

Port 3000 dang bi chiem:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess
Stop-Process -Id <PID> -Force
```

Reset database data (xoa volume, mat du lieu):

```powershell
docker compose down -v
cmd /c yarn docker:up
```
