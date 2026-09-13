# WhatsApp Call Center Pro

A full-stack, high-performance call center dialer and campaign tracking application designed for outbound customer call operations with WhatsApp integration, screenshot proof logging, Excel campaign imports, real-time live synchronization, and role-based access control.

---

## 🔒 Security & GitHub Deployment Guide

### What happens when you push to GitHub?
1. **Passwords are NEVER uploaded to GitHub:**
   - The `.env` file (containing secrets and passwords) is included in `.gitignore`.
   - The local database (`data/*.json`), which holds customer contacts, phone numbers, and registered user accounts, is automatically ignored by `.gitignore`.
   - Your private customer leads and credentials remain strictly on your local machine or server.

2. **Configuring the Admin Password:**
   - In production or local setups, copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - In `.env`, you can specify your custom admin password:
     ```env
     ADMIN_PASSWORD=MySecurePassword2026!
     ```
   - If `ADMIN_PASSWORD` is not set in `.env`, the system uses the default fallback (`admin123`) until changed.
   - **Changing password inside the app:** Once logged into the Admin account, click on your profile in the top-right navigation bar and select **"Change Password"** to set any new password without editing code.

---

## 🚀 Pushing to GitHub (Step-by-Step)

If you haven't initialized Git yet, run these commands in your project root:

```bash
# 1. Initialize git repository (if not already done)
git init

# 2. Check that .env and data/*.json are properly ignored
git status

# 3. Add all project files
git add .

# 4. Commit your changes
git commit -m "Initial commit: WhatsApp Call Center Pro"

# 5. Link to your GitHub repository
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 6. Push to GitHub
git branch -M main
git push -u origin main
```

---

## 🛠️ Local Development & Running

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### Installation
```bash
# Install dependencies
npm install

# Start development server (serves on http://localhost:3000)
npm run dev
```

### Production Build
```bash
# Build Vite client and bundle Express server
npm run build

# Start production server
npm start
```

---

## 👥 User Roles & Access Control
- **Admin**: Has full access to upload Excel lead batches, manage campaigns, clear logs, change password, and supervise call operations.
- **Call Agent (User)**: Can self-register, dial numbers one-by-one, log call outcomes (Answered, Interested, Callback, etc.), and attach screenshot proofs. Restricted from importing Excel files.
- **Guest (Default on load)**: Safe view mode. No credentials or auto-login on initial load.
