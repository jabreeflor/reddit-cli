# reddit-cli

Browse Reddit from your terminal. No auth required — uses Reddit's public JSON API.

## Install

```bash
git clone https://github.com/jabreeflor/reddit-cli
cd reddit-cli
npm install
npm link   # makes 'reddit' available globally
```

Or run directly:
```bash
node reddit.js hot programming
```

## Commands

```
reddit hot [subreddit] [--limit=N]
reddit top [subreddit] --time day|week|month
reddit search <query> [--sub subreddit]
reddit post <id|url>
reddit sub <subreddit>
```

## Examples

```bash
reddit hot                          # Front page hot
reddit hot programming              # r/programming hot posts
reddit top worldnews --time week    # Top posts this week
reddit search "rust lang" --sub programming
reddit post 1abc123                 # Post + top comments
reddit sub MachineLearning          # Sub info + hot posts
```

## Features

- Color-coded output (scores, authors, ages, flairs)
- Post + threaded comments with depth coloring
- Search across all of Reddit or within a subreddit
- Subreddit info (members, active, description)
- No API key — Reddit public JSON endpoints only
