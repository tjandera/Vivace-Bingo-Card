# VIVACE 2026 Loyalty Card

A stamp/bingo-style loyalty card web app for the VIVACE SMU CCA Fair 2026. Participants collect stamps by visiting booths, and the card is rendered in the browser.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Templating:** EJS
- **Deployment:** Vercel

## Running Locally

### Prerequisites

- Node.js installed (`node -v` to check)

### Steps

```bash
# 1. Clone the repo (if not already)
git clone <repo-url>
cd Vivace-loyalty-Card

# 2. Install dependencies
npm install

# 3. Start the dev server (auto-restarts on file changes)
npm run dev

# OR start without auto-restart
npm start
```

Then open **http://localhost:3001** in your browser.

## Project Structure

```
Vivace-loyalty-Card/
├── server.js          # Express app entry point (port 3001)
├── routes/            # Route definitions
├── controllers/       # Route handler logic
├── models/            # Data models
├── views/             # EJS templates
├── public/            # Static assets (CSS, JS, images)
├── utils/             # Helper utilities
├── background_folder/ # Background images
├── card_background/   # Card background assets
├── CCA_logos/         # CCA booth logos
├── logo_folder/       # General logos
└── vercel.json        # Vercel deployment config
```

## Deployment

This app is configured for Vercel. Push to `main` to trigger a deployment.

```bash
# Deploy to preview
vercel

# Deploy to production
vercel --prod
```
