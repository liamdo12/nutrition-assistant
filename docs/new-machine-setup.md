# New Machine Setup (Windows)

Huong dan setup tren may moi theo cau hinh hien tai cua project:
- Postgres chay bang Docker
- Backend doc env plaintext tu `.env`

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

## 2) Install

```powershell
cmd /c yarn install
```

## 3) Tao file env

```powershell
Copy-Item .env.example .env -Force
```

Mac dinh local nen dung:

```env
POSTGRES_USER=nutrition
POSTGRES_PASSWORD=nutrition_dev
POSTGRES_DB=nutrition_assistant
DATABASE_URL=postgresql://nutrition:nutrition_dev@localhost:5432/nutrition_assistant
```

## 4) Start database

```powershell
docker compose up -d postgres
docker compose ps
```

## 5) Prisma

```powershell
cmd /c .\node_modules\.bin\prisma generate --schema apps/api/prisma/schema.prisma
cmd /c .\node_modules\.bin\prisma db push --schema apps/api/prisma/schema.prisma
```

## 6) Run backend

```powershell
cmd /c yarn workspace @nutrition/api dev
```

## 7) Verify

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

Swagger:

```text
http://127.0.0.1:3000/api/docs
```

## 8) Troubleshooting nhanh

### Prisma loi auth DB

Kiem tra Postgres:

```powershell
docker compose ps
docker logs -f nutrition-db
```

Neu can reset data DB (mat du lieu):

```powershell
docker compose down -v
docker compose up -d postgres
```

### PowerShell chan yarn.ps1

Dung wrapper `cmd /c`:

```powershell
cmd /c yarn workspace @nutrition/api dev
```
