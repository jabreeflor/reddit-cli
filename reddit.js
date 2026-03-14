#!/usr/bin/env node
/**
 * reddit-cli — browse Reddit from your terminal
 * No auth required — uses Reddit's public JSON API
 *
 * Commands:
 *   reddit hot [subreddit]                     Hot posts (default: front page)
 *   reddit top [subreddit] --time day|week|month  Top posts
 *   reddit search <query> [--sub subreddit]    Search
 *   reddit post <id>                           Post + comments
 *   reddit sub <subreddit>                     Subreddit info
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const https = require("https");
const { default: chalk } = await import("chalk");

// ── Helpers ───────────────────────────────────────────────────────────────────
const BASE = "https://old.reddit.com";
const UA   = "Mozilla/5.0 Reddit CLI";

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": UA, "Accept": "application/json", "Accept-Language": "en-US,en;q=0.9" },
      timeout: 10000,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Parse error (status ${res.statusCode})`)); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
  });
}

function timeAgo(utc) {
  const diff = Date.now() / 1000 - utc;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff/60)}m`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h`;
  if (diff < 604800) return `${Math.floor(diff/86400)}d`;
  return `${Math.floor(diff/604800)}w`;
}

function fmtNum(n) {
  if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n/1000).toFixed(1)}k`;
  return String(n);
}

function wrap(text, width = 90, indent = "  ") {
  if (!text) return "";
  const words = text.replace(/\n+/g, " ").split(" ");
  const lines = [];
  let line = indent;
  for (const w of words) {
    if (line.length + w.length + 1 > width) {
      lines.push(line.trimEnd());
      line = indent + w + " ";
    } else {
      line += w + " ";
    }
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join("\n");
}

function hr(char = "─", len = 80) {
  return chalk.gray(char.repeat(len));
}

// ── Post list renderer ────────────────────────────────────────────────────────
function renderPosts(posts, title) {
  console.log(`\n${chalk.bold.white(title)}\n${hr()}`);
  posts.forEach((p, i) => {
    const d = p.data;
    const num = chalk.gray(`${String(i+1).padStart(2)}.`);
    const score = chalk.yellow(fmtNum(d.score).padEnd(6));
    const age = chalk.gray(timeAgo(d.created_utc));
    const flair = d.link_flair_text ? chalk.magenta(` [${d.link_flair_text}]`) : "";
    const nsfw = d.over_18 ? chalk.red(" NSFW") : "";
    const sub = chalk.cyan(`r/${d.subreddit}`);
    const comments = chalk.gray(`💬 ${fmtNum(d.num_comments)}`);

    console.log(`${num} ${score} ${chalk.bold(d.title)}${flair}${nsfw}`);
    console.log(`     ${sub} · ${chalk.gray(`u/${d.author}`)} · ${age} · ${comments}`);
    if (d.selftext && d.selftext.length > 0) {
      console.log(chalk.gray(wrap(d.selftext.substring(0, 120) + (d.selftext.length > 120 ? "…" : ""))));
    } else if (d.url && !d.url.includes("reddit.com")) {
      console.log(chalk.blue(`     ${d.url.substring(0, 80)}${d.url.length > 80 ? "…" : ""}`));
    }
    console.log(`     ${chalk.dim(`reddit post ${d.id}  |  ${BASE}${d.permalink}`)}`);
    console.log();
  });
}

// ── Comment renderer ──────────────────────────────────────────────────────────
function renderComments(comments, depth = 0, maxDepth = 4) {
  if (depth >= maxDepth) return;
  const indent = "  ".repeat(depth);
  const colors = [chalk.cyan, chalk.green, chalk.yellow, chalk.magenta];
  const col = colors[depth % colors.length];

  for (const c of comments) {
    if (!c.data || c.kind === "more") {
      if (c.kind === "more" && c.data.count > 0)
        console.log(chalk.gray(`${indent}  … ${c.data.count} more replies`));
      continue;
    }
    const d = c.data;
    const score = d.score === undefined ? "" : chalk.yellow(`▲${fmtNum(d.score)}`);
    const age = chalk.gray(timeAgo(d.created_utc));
    const author = col(`u/${d.author}`);
    console.log(`${indent}${author} ${score} ${age}`);
    if (d.body) {
      const lines = d.body.replace(/\n+/g, "\n").split("\n");
      for (const ln of lines.slice(0, 6)) {
        console.log(`${indent}${chalk.white(ln.substring(0, 100))}${ln.length > 100 ? "…" : ""}`);
      }
      if (lines.length > 6) console.log(`${indent}${chalk.gray("  [truncated]")}`);
    }
    console.log();
    if (d.replies && d.replies.data && d.replies.data.children) {
      renderComments(d.replies.data.children, depth + 1, maxDepth);
    }
  }
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdHot(sub = "", args = []) {
  const limit = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] || "25");
  const url = sub
    ? `${BASE}/r/${sub}/hot.json?limit=${limit}`
    : `${BASE}/hot.json?limit=${limit}`;
  const data = await get(url);
  const posts = (data.data?.children || []).map(c => c);
  if (!posts.length) return console.log(chalk.red("No posts found."));
  renderPosts(posts, sub ? `r/${sub} — Hot` : "Reddit Front Page — Hot");
}

async function cmdTop(sub = "", args = []) {
  const time = args.find(a => a.startsWith("--time"))?.split(/[= ]/)[1] || "day";
  const limit = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] || "25");
  const url = sub
    ? `${BASE}/r/${sub}/top.json?t=${time}&limit=${limit}`
    : `${BASE}/top.json?t=${time}&limit=${limit}`;
  const data = await get(url);
  const posts = data.data?.children || [];
  if (!posts.length) return console.log(chalk.red("No posts found."));
  renderPosts(posts, sub ? `r/${sub} — Top (${time})` : `Reddit — Top (${time})`);
}

async function cmdSearch(query, args = []) {
  if (!query) return console.log(chalk.red("Usage: reddit search <query> [--sub subreddit]"));
  const subArg = args.findIndex(a => a === "--sub");
  const sub = subArg !== -1 ? args[subArg + 1] : null;
  const limit = parseInt(args.find(a => a.startsWith("--limit="))?.split("=")[1] || "25");
  const url = sub
    ? `${BASE}/r/${sub}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&limit=${limit}`
    : `${BASE}/search.json?q=${encodeURIComponent(query)}&limit=${limit}`;
  const data = await get(url);
  const posts = data.data?.children || [];
  if (!posts.length) return console.log(chalk.red(`No results for "${query}"`));
  renderPosts(posts, sub ? `Search: "${query}" in r/${sub}` : `Search: "${query}"`);
}

async function cmdPost(id) {
  if (!id) return console.log(chalk.red("Usage: reddit post <id>"));
  // Strip full URL to just the ID if needed
  const postId = id.replace(/^https?:\/\/.*\/comments\//, "").split("/")[0];
  const data = await get(`${BASE}/comments/${postId}.json?limit=50`);
  if (!Array.isArray(data) || data.length < 2) return console.log(chalk.red("Post not found."));

  const post = data[0].data.children[0].data;
  console.log(`\n${hr("═")}`);
  console.log(chalk.bold.white(post.title));
  console.log(`${chalk.cyan(`r/${post.subreddit}`)} · ${chalk.gray(`u/${post.author}`)} · ${chalk.yellow(`▲${fmtNum(post.score)}`)} · ${chalk.gray(`💬 ${fmtNum(post.num_comments)}`)} · ${chalk.gray(timeAgo(post.created_utc))}`);
  if (post.link_flair_text) console.log(chalk.magenta(`[${post.link_flair_text}]`));
  console.log(hr("═"));

  if (post.selftext) {
    console.log();
    const paras = post.selftext.split(/\n\n+/);
    for (const p of paras.slice(0, 8)) {
      console.log(wrap(p, 90, ""));
      console.log();
    }
    if (paras.length > 8) console.log(chalk.gray(`  … ${paras.length - 8} more paragraphs. Open in browser: ${BASE}${post.permalink}`));
  } else if (post.url) {
    console.log(`\n${chalk.blue(post.url)}\n`);
  }

  console.log(`\n${hr()}\n${chalk.bold("Comments")}\n${hr()}\n`);
  const comments = data[1].data.children;
  renderComments(comments, 0, 4);
}

async function cmdSub(subreddit) {
  if (!subreddit) return console.log(chalk.red("Usage: reddit sub <subreddit>"));
  const data = await get(`${BASE}/r/${subreddit}/about.json`);
  if (data.error) return console.log(chalk.red(`Subreddit not found: r/${subreddit}`));
  const d = data.data;
  console.log(`\n${hr("═")}`);
  console.log(chalk.bold.white(`r/${d.display_name}`) + (d.over18 ? chalk.red(" NSFW") : ""));
  console.log(chalk.gray(d.title));
  console.log(hr("═"));
  console.log(`${chalk.yellow("Members:")} ${fmtNum(d.subscribers)}`);
  console.log(`${chalk.yellow("Active:")}  ${fmtNum(d.active_user_count || 0)}`);
  console.log(`${chalk.yellow("Created:")} ${new Date(d.created_utc * 1000).toLocaleDateString()}`);
  console.log(`${chalk.yellow("Type:")}    ${d.subreddit_type}`);
  if (d.public_description) {
    console.log(`\n${chalk.bold("About:")}`);
    console.log(wrap(d.public_description.replace(/\n+/g, " ").substring(0, 500), 90, "  "));
  }
  console.log(`\n${chalk.dim(`${BASE}/r/${subreddit}`)}\n`);
  // Show hot posts too
  await cmdHot(subreddit, ["--limit=10"]);
}

function usage() {
  console.log(`
${chalk.bold.cyan("reddit-cli")} — Browse Reddit from your terminal

${chalk.bold("Usage:")}
  reddit hot [subreddit] [--limit=N]            Hot posts (default: front page)
  reddit top [subreddit] --time day|week|month  Top posts
  reddit search <query> [--sub subreddit]       Search posts
  reddit post <id|url>                          View post + comments
  reddit sub <subreddit>                        Subreddit info + hot posts

${chalk.bold("Examples:")}
  reddit hot programming
  reddit top worldnews --time week
  reddit search "rust lang" --sub programming
  reddit post 1abc123
  reddit sub MachineLearning
`);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
const [,, cmd, ...rest] = process.argv;

try {
  switch (cmd) {
    case "hot":    await cmdHot(rest[0], rest.slice(1)); break;
    case "top":    await cmdTop(rest[0], rest.slice(1)); break;
    case "search": await cmdSearch(rest[0], rest.slice(1)); break;
    case "post":   await cmdPost(rest[0]); break;
    case "sub":    await cmdSub(rest[0]); break;
    default:       usage();
  }
} catch (e) {
  console.error(chalk.red(`Error: ${e.message}`));
  process.exit(1);
}
