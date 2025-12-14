# Deployment Guide

## Quick Deploy to Vercel

### Option 1: Deploy via Vercel Dashboard

1. **Push to GitHub:**
   ```bash
   # If you haven't already
   git remote add origin https://github.com/YOUR_USERNAME/predict-dapp.git
   git push -u origin main
   ```

2. **Import to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Vite configuration

3. **Add Environment Variables:**
   In Vercel project settings → Environment Variables:
   ```
   VITE_WALLETCONNECT_PROJECT_ID=your_project_id
   VITE_API_URL=https://api.predict.fun
   VITE_API_KEY=your_api_key
   ```

4. **Deploy:**
   - Click "Deploy"
   - Your app will be live in ~2 minutes!

### Option 2: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel

# Follow the prompts and add environment variables when asked
```

### Option 3: One-Click Deploy

Click this button to deploy:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/predict-dapp)

## Environment Variables

Required for deployment:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect Project ID | Get from [cloud.walletconnect.com](https://cloud.walletconnect.com) |
| `VITE_API_URL` | Predict.fun API URL | `https://api.predict.fun` |
| `VITE_API_KEY` | Predict.fun API Key | Get from Discord |

## Post-Deployment

After deployment:

1. **Test the app:**
   - Visit your Vercel URL
   - Connect wallet
   - Try browsing markets
   - Test placing an order

2. **Configure Custom Domain (Optional):**
   - Go to Vercel project settings → Domains
   - Add your custom domain

3. **Enable Preview Deployments:**
   - Every PR will get a preview URL
   - Test changes before merging

## Troubleshooting

**Build fails:**
- Check environment variables are set
- Verify Node.js version is 18+
- Check build logs in Vercel dashboard

**App loads but wallet won't connect:**
- Verify `VITE_WALLETCONNECT_PROJECT_ID` is correct
- Check browser console for errors

**Orders fail:**
- Verify `VITE_API_KEY` is valid
- Check network is BNB Chain (Chain ID: 56)

## CI/CD

GitHub Actions workflow runs on every push:
- Lints code
- Builds the app
- Ensures no TypeScript errors

See `.github/workflows/build.yml` for details.

## Monitoring

Vercel provides:
- **Analytics:** Usage statistics and page views
- **Logs:** Real-time function logs
- **Speed Insights:** Performance metrics

Access these in your Vercel project dashboard.
