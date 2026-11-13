# ឧត្តម Shop (Oudom Shop) — Full-Stack Mobile-First E-Commerce

ប្រព័ន្ធលក់ទំនិញអនឡាញពេញលេញ **«ឧត្តម Shop»** រចនាឡើងដោយផ្តោតលើបទពិសោធន៍ទូរស័ព្ទជាអាទិភាព (Mobile-First Responsive Design) ជាមួយរចនាប័ទ្ម **Modern Luxury (ខ្មៅ ស និងមាស)** គាំទ្ររូបិយប័ណ្ណ **USD និង KHR** ប្រព័ន្ធរក្សាទុកទិន្នន័យអចិន្ត្រៃយ៍ **Firebase Firestore & Cloud Storage** ការទូទាត់ផ្លូវការ **ABA PayWay API** និងការជូនដំណឹងស្វ័យប្រវត្តិតាម **Telegram Bot**។

---

## រចនាសម្ព័ន្ធគម្រោង (Folder Structure)

```text
├── server.ts                         # Express.js Backend API + Security + Rate Limiting + Vite SPA
├── firebase-applet-config.json       # Firebase Project & Firestore Database ID configuration
├── firebase-blueprint.json           # Firestore Entities & Collections Schema Blueprint
├── firestore.rules                   # Zero-Trust Firestore Security Rules
├── eslint.config.mjs                 # ESLint security rules audit config
├── .env.example                      # គំរូ Environment Variables (Server-side only)
└── src/
    ├── App.tsx                       # Client Router (/ Storefront & /admin Dashboard)
    ├── index.css                     # Tailwind CSS v4 & Khmer typography tokens
    ├── types/shop.ts                 # Shared TypeScript interfaces
    ├── utils/format.ts               # Currency, Khmer dates, WebP client compression
    ├── lib/firebase.ts               # Client Firebase SDK + connection test
    ├── server/
    │   ├── firebaseAdmin.ts          # Firebase Admin SDK (Firestore, Auth, Storage)
    │   ├── seedCatalog.ts            # Initial catalog & bcrypt admin bootstrapper
    │   ├── abaPayWay.ts              # Official ABA PayWay Purchase v1 & Check Transaction v2
    │   └── telegram.ts               # Telegram Bot HTML notification dispatcher
    └── components/
        ├── Storefront.tsx            # Mobile-First 2-col storefront, search, category & filters
        ├── ProductDetailModal.tsx    # Interactive image zoom, variants, stock, Add/Buy
        ├── CartCheckoutDrawer.tsx    # Cart steppers, server-calculated totals, ABA PayWay flow
        ├── OrderTrackerModal.tsx     # Customer Order ID & Phone lookup
        ├── AdminDashboard.tsx        # /admin portal (Stats, Products, Orders, RBAC, Backups)
        ├── AdminProductFormModal.tsx # Add/Edit products + Gallery/Camera WebP upload
        └── SafeImage.tsx             # Lazy-loading resilient image component
```

---

## ការកំណត់ Environment Variables

ចម្លង `.env.example` ទៅ `.env` ហើយបំពេញព័ត៌មានសម្ងាត់នៅខាង Server (មិនបង្ហាញនៅ Frontend ឡើយ)៖

```env
# Admin Security
ADMIN_USERNAME="oudom_admin"
ADMIN_PASSWORD="YourStrongPassword"
ADMIN_ACCESS_CODE="OUDOM-2026-SEC"
SESSION_SECRET="your-64-char-random-secret"
SUPER_ADMIN_EMAIL="krenoudom7@gmail.com"

# ABA PayWay Official Merchant API
ABA_PAYWAY_MERCHANT_ID="YOUR_MERCHANT_ID"
ABA_PAYWAY_API_KEY="YOUR_ABA_API_KEY"
ABA_PAYWAY_API_URL="https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/purchase"
ABA_PAYWAY_CHECK_URL="https://checkout-sandbox.payway.com.kh/api/payment-gateway/v1/payments/check-transaction-2"

# Telegram Bot
TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN"
TELEGRAM_CHAT_ID="YOUR_ADMIN_CHAT_ID"

# Currency Rate
KHR_EXCHANGE_RATE="4100"
```

---

## ការដំឡើង និងដំណើរការ (Installation & Run)

1. **ដំឡើង Dependencies**
   ```bash
   npm install
   ```

2. **ដំណើរការក្នុង Development Mode**
   ```bash
   npm run dev
   ```
   វេបសាយនឹងដំណើរការនៅ `http://localhost:3000` (Storefront `/` និង Admin `/admin`)។

3. **Build & Run Production**
   ```bash
   npm run build
   npm run start
   ```

---

## សុវត្ថិភាព និងប្រព័ន្ធសំខាន់ៗ

- **Permanent Database**: ទិន្នន័យផលិតផល អតិថិជន ការបញ្ជាទិញ និងប្រវត្តិទូទាត់ត្រូវបានរក្សាទុកអចិន្ត្រៃយ៍ក្នុង Firebase Firestore (មិនបាត់បង់ពេល Refresh ឬ Restart Server)។
- **Admin Authentication & RBAC**: ការចូល `/admin` ទាមទារ Username + Password (Hash ដោយ `bcryptjs`) + `ADMIN_ACCESS_CODE` ឬ Google Sign-In ដែលបានផ្ទៀងផ្ទាត់សិទ្ធិនៅលើ Server ជាមួយ Role-Based Access Control (`super_admin`, `manager`, `staff`)។
- **ABA PayWay Official Verification**: រាល់ការទូទាត់ត្រូវគណនាតម្លៃពី Database នៅខាង Server ហើយស្ថានភាព `Paid` ត្រូវបានផ្ទៀងផ្ទាត់តាម Server-to-Server Callback (`/api/payments/aba-callback`) និង API `check-transaction-2`។
- **Telegram Notification**: ផ្ញើសារដោយស្វ័យប្រវត្តិទៅ Admin ពេលមានការបញ្ជាទិញថ្មី ការទូទាត់ជោគជ័យ និងការលុបចោល ឬបរាជ័យ។
- **Database Backup**: មានប្រព័ន្ធ Auto Snapshot រៀងរាល់ ២៤ ម៉ោង និង Manual Backup + Export JSON ក្នុង Admin Dashboard។
