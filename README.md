# Splits — shared expense tracker

A private Splitwise-style app built with Flask + React, Google OAuth, multi-currency support, and group management.

## Stack
- **Backend**: Flask + SQLAlchemy + Authlib (Google OAuth)
- **Frontend**: React + Vite
- **Database**: SQLite (dev) / PostgreSQL (production via Railway)
- **Hosting**: Railway (backend) + Vercel (frontend)

---

## Local development

### 1. Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Fill in SECRET_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET in .env

flask --app run db init
flask --app run db migrate -m "initial"
flask --app run db upgrade

python run.py
# Runs at http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
# No .env.local needed — Vite proxies /auth and /api to localhost:5000
npm run dev
# Runs at http://localhost:5173
```

---

## Deployment

### Backend → Railway
1. Push repo to GitHub
2. Railway: New Project → Deploy from GitHub → set root to backend/
3. Add env vars: SECRET_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FRONTEND_URL, FLASK_ENV=production
4. DATABASE_URL is auto-set by the Railway Postgres plugin
5. Run migrations via Railway shell: flask --app run db upgrade

### Frontend → Vercel
1. Vercel: New Project → Import GitHub repo → set root to frontend/
2. Add env var: VITE_API_URL = your Railway backend URL
3. Deploy — Vercel detects Vite automatically

### After deploying both — back to Google Cloud Console
Add to your OAuth client:
- Authorized origin: https://your-app.vercel.app
- Redirect URI: https://your-api.railway.app/auth/callback
