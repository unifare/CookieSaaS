# 🍪 CookieSaaS

A modern, high-end SaaS platform for automated cookie session management across multiple domains.

## ✨ Features
- **Group by Domain**: Organize and view cookies hierarchically by site/domain.
- **Enterprise-grade Security**: Built-in JWT authentication, role-based access control (Admin/User), and hard session termination.
- **Admin Dashboard**: System settings configuration, instant user disable/enable, and forceful password resets.
- **Premium UI/UX**: Designed with a sleek, minimalist Apple-like aesthetic featuring soft shadows, glassmorphism, and smooth micro-animations.
- **Lucide Icons**: Uses the stunning open-source vector icon library for all UI elements.
- **Developer Friendly**: 1-click cURL export for any domain's cookies, making it ready to drop into automated testing or scraping scripts.
- **Zero Config Database**: Powered by SQLite for pure portability. No external database servers needed.

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start the Server**
   ```bash
   node server.js
   ```
   *Or use the provided `manage.bat` (Windows) / `manage.sh` (Linux) scripts.*

3. **Login**
   Access the dashboard at `http://localhost:28472`.
   The first registered user is typically configured as the `admin`.

## 📂 Architecture
- **Backend**: Node.js + Express
- **Frontend**: EJS Server-Side Rendering + Vanilla CSS
- **Database**: SQLite3 (`node:sqlite` natively)

## 🔒 Security Notes
For security reasons, the `cookies.db` (which stores all actual session cookies and hashed user passwords) and your `.env` config files are deliberately excluded from this repository via `.gitignore`.
