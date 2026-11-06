# Selera King POS (DaporKu)

A full-stack multi-user restaurant Point-of-Sale (POS) and management system built with React, TypeScript, Express, Vite, Firebase (Authentication & Cloud Firestore), and the Google Gemini API (`@google/genai`).

## Features

- **Multi-User Accounts & Data Isolation**: Register user accounts with **Name**, **Phone Number**, **Password**, and **Restaurant Address**. Each user has their own isolated floor plan, menu, kitchen orders, order history, revenue reports, and expense logs.
- **Interactive Floor Plan & Order Management**: Manage 12 tables, add food/drink/dessert items, attach special kitchen remarks, and send orders to the kitchen.
- **Live Kitchen Dashboard**: Real-time order tracking with elapsed timers, 15-minute overdue alerts, and item-by-item readiness toggles.
- **Digital Menu Manager with AI Descriptions**: Add, edit, and categorize dishes/drinks with one-click culinary descriptions powered by Gemini (`gemini-3.8-flash`).
- **Receipt Generation & Printing**: Printable receipts customized with the logged-in user's restaurant name, address, phone number, and witty thank-you notes.
- **Revenue & Expense Analytics**: Track daily/monthly revenue, operational expenses by category, and net profit.
- **Cloud Sync (Firebase)**: Optional Google Sign-In & Cloud Firestore real-time synchronization backed by strict per-user Firestore Security Rules.

## Getting Started Locally

### 1. Clone & Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and add your Gemini API key:

```bash
cp .env.example .env
```

Edit `.env`:

```env
GEMINI_API_KEY=your_actual_gemini_api_key
PORT=3000
```

### 3. Run in Development Mode

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

### 4. Build & Run for Production

```bash
npm run build
NODE_ENV=production npm start
```

## Deploying Firestore Security Rules

If using your own Firebase project, update `firebase-applet-config.json` with your Firebase web app configuration and deploy the security rules:

```bash
npx eslint firestore.rules
firebase deploy --only firestore:rules
```
