# 📈 MetaMarket

**MetaMarket** is a dynamic, high-fidelity prediction market platform designed for IIT Roorkee. It allows users to trade on the outcomes of future events using a virtual currency system, featuring real-time price discovery and shared liquidity pools.

## 🚀 Key Features

- **Automated Market Maker (AMM)**: Consistent liquidity using an x*y=k constant product formula.
- **Binary & Multi-Market Support**: Trade on 'Yes/No' outcomes or choose from multiple options in sports and business.
- **Real-time Analytics**: Interactive price history charts using Recharts.
- **Seamless Authentication**: Google OAuth integration restricted to IITR email domains.
- **Leaderboard**: Compete with others and track your net worth and trade history.
- **Cloud Powered**: Image uploads managed via Cloudinary and data persisted in MongoDB Atlas.

## 🛠️ Technology Stack

- **Frontend**: React (18+), Vite, Tailwind CSS, Framer Motion, Radix UI.
- **Backend**: Express.js, Passport.js, Mongoose.
- **Serverless**: Netlify Functions (deployed as AWS Lambda).
- **Database**: MongoDB Atlas.

## 💻 Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Samarth208P/metamarket.git
   cd metamarket
   ```

2. **Install dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables**:
   Create a `.env` file in the root directory (refer to `.env.example`):
   ```env
   # Database
   MONGODB_URI=your_mongodb_uri

   # Auth
   SESSION_SECRET=your_secret
   GOOGLE_CLIENT_ID=your_id
   GOOGLE_CLIENT_SECRET=your_secret
   GOOGLE_CALLBACK_URL=http://localhost:8080/mapi/auth/google/callback

   # Cloudinary (Optional for images)
   CLOUDINARY_CLOUD_NAME=your_name
   CLOUDINARY_API_KEY=your_key
   CLOUDINARY_API_SECRET=your_secret
   ```

4. **Run the development server**:
   ```bash
   npm run dev
   ```
   Access the app at `http://localhost:8080`.

## 🌐 Deployment (Netlify)

This project is optimized for **Netlify**.

- **Build Command**: `npm run build`
- **Publish Directory**: `dist`
- **Functions Directory**: `functions`

Ensure you set all required environment variables in the Netlify Dashboard under **Site configuration > Environment variables**.

## 📄 License

Private - (C) 2026 MetaMarket Team.
