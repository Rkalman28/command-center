# Command Center

Personal productivity dashboard — notes, tasks, tags, priorities, weekly reports, and more.

## Quick Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo
3. In the Vercel dashboard for your project, go to **Storage** → **Create Database** → **Postgres**
4. Click **Connect** to link it to your project
5. Redeploy (Vercel will auto-set the `POSTGRES_URL` environment variable)

## Local Development

```bash
npm install
npm run dev
```

For local dev with the database, create a `.env.local` file with your Vercel Postgres connection string:

```
POSTGRES_URL=your_connection_string_here
```

## Features

- **Notes** with rich text formatting, tags, and categories
- **Tasks** with due dates, priorities, and auto-extraction from notes
- **Dashboard** with completion stats and streak tracking
- **Weekly Report** with export functionality
- **Archiving** and soft-delete for notes
- **Search** across all notes and tasks
- **Categories** (Wrapmate / Personal)
- **Keyboard shortcuts** (Ctrl+N for note, Ctrl+T for task)
