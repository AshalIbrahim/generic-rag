# Zameen Frontend

This is a Vite + React frontend for the Zameen FastAPI backend.

Prerequisites:
- Node.js 18+ / npm

Setup (Windows PowerShell):

```powershell
cd "c:\Users\Admin\Desktop\Mlops Proj\frontend"
npm install
# Create a .env.local file or set environment variable
# Copy .env.example to .env.local and edit if needed
# Start dev server
npm run dev
```

By default the app expects the API at the Vite env `VITE_API_URL` (see `.env.example`). The backend endpoints used are `/listings` and `/locations`.
