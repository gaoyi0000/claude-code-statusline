#!/usr/bin/env node
/**
 * Claude Code statusline — 3-line display with progress bars.
 * Line 1: Model ⚡effort │ 📊 used/total (%) │ 🪙 session_tokens
 * Line 2: ⏰ time_bar percentage  ⏱️ session_duration
 * Line 3: 📊 token_bar percentage  💰 deepseek_balance
 *
 * Progress bars use ▰/▱ micro-block style, 20 chars wide.
 * Time colors: cyan(0-25%) → green(25-50%) → yellow(50-75%) → orange(75-100%)
 * Token colors: green(0-50%) → yellow(50-75%) → orange(75-90%) → red(90-100%)
 * Balance colors: green(>50 CNY) → yellow(10-50) → red(<10)
 *
 * Reads DEEPSEEK_API_KEY env var from ~/.bashrc for balance fetching.
 */
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ── Constants ──
const BAR_WIDTH = 20;
const FILLED = '▰';
const EMPTY = '▱';
const MINS_PER_DAY = 24 * 60;

// ── DeepSeek balance (cached 5 min) ──
function getDeepSeekBalance() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null; // not configured — silently skip

  const CACHE_FILE = join(os.tmpdir(), 'cc_deepseek_balance.json');
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Check cache
  try {
    if (existsSync(CACHE_FILE)) {
      const cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
      const age = Date.now() - cache.ts;
      // Reject timestamps in the future or before 2025
      if (age < -60000 || cache.ts < 1735689600000) { throw 'stale'; }
      if (age < CACHE_TTL) {
        return cache.data;
      }
    }
  } catch (e) { /* cache corrupt — refetch */ }

  // Fetch from DeepSeek
  try {
    const raw = execSync(
      `curl -s --ssl-no-revoke --max-time 5 -H "Authorization: Bearer ${apiKey}" https://api.deepseek.com/user/balance`,
      { timeout: 6000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const data = JSON.parse(raw);
    // Write cache
    try { writeFileSync(CACHE_FILE, JSON.stringify({ ts: Date.now(), data })); } catch (e) {}
    return data;
  } catch (e) {
    // On failure, return stale cache if available
    try {
      if (existsSync(CACHE_FILE)) {
        const stale = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
        stale.data._stale = true;
        return stale.data;
      }
    } catch (e2) {}
    return null;
  }
}
function makeBar(ratio, colorFn) {
  const filled = Math.round(ratio * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return colorFn(FILLED.repeat(filled) + EMPTY.repeat(empty));
}

function colorForRatio(ratio, thresholds) {
  for (const [threshold, color] of thresholds) {
    if (ratio <= threshold) return color;
  }
  return thresholds[thresholds.length - 1][1];
}

function fm(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  try {
    const d = JSON.parse(input);
    const R = '\x1b[0m', DIM = '\x1b[2m';
    const CYAN = '\x1b[36m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m';
    const RED = '\x1b[31m', ORANGE = '\x1b[38;5;208m';

    // ── Model ──
    const model = (d.model?.display_name || '?').replace(/^Claude /, '');

    // ── Effort ── (stdin first, then settings.json fallback)
    let effort = '';
    let lvl = d.effort?.level || '';
    if (!lvl) {
      try {
        lvl = JSON.parse(readFileSync(join(os.homedir(), '.claude', 'settings.json'), 'utf8')).effortLevel || '';
      } catch (e) {}
    }
    if (lvl) {
      const color = { low: DIM, default: GREEN, medium: GREEN, high: YELLOW, xhigh: ORANGE, max: RED }[lvl] || GREEN;
      effort = `${color}⚡${lvl}${R}`;
    }

    // ── Context window ──
    const pct = Math.round(d.context_window?.used_percentage || 0);
    const total = d.context_window?.context_window_size || 0;
    const used = Math.round(total * pct / 100);
    const ctx = `${DIM}📊${R} ~${fm(used)}/${fm(total)} ${DIM}(${pct}%)${R}`;

    // ── Session tokens ──
    const tokIn = d.context_window?.total_input_tokens || 0;
    const tokOut = d.context_window?.total_output_tokens || 0;
    const tokStr = `${DIM}🪙${R} ${fm(tokIn + tokOut)} tok`;

    // ── Line 1 ──
    const sep = ` ${DIM}│${R} `;
    const parts = [`${CYAN}${model}${R}`];
    if (effort) parts[0] += ` ${effort}`;
    parts.push(ctx, tokStr);
    const line1 = parts.join(sep);

    // ── Line 2: ⏰ Time progress ──
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const timeRatio = minutes / MINS_PER_DAY;
    const timePct = (timeRatio * 100).toFixed(2).padStart(5, ' ');
    const timeColor = colorForRatio(timeRatio, [
      [0.25, CYAN],
      [0.50, GREEN],
      [0.75, YELLOW],
      [1.00, ORANGE],
    ]);
    const timeBar = makeBar(timeRatio, c => `${timeColor}${c}${R}`);
    // ── Session duration ──
    const durMs = d.cost?.total_duration_ms || 0;
    let durStr = '';
    if (durMs >= 3600000) {
      const h = Math.floor(durMs / 3600000);
      const m = Math.round((durMs % 3600000) / 60000);
      durStr = `${h}h${m}m`;
    } else if (durMs >= 60000) {
      durStr = Math.round(durMs / 60000) + 'min';
    } else if (durMs >= 1000) {
      durStr = Math.round(durMs / 1000) + 's';
    } else {
      durStr = durMs + 'ms';
    }
    const dur = durStr ? `${DIM}⏱️${R} ${durStr}` : '';
    const line2 = `⏰ ${timeBar}  ${timePct}%` + (dur ? `  ${dur}` : '');

    // ── Line 3: 📊 Token progress ──
    const tokRatio = pct / 100;
    const tokPct = (pct).toFixed(2).padStart(5, ' ');
    const tokColor = colorForRatio(tokRatio, [
      [0.50, GREEN],
      [0.75, YELLOW],
      [0.90, ORANGE],
      [1.00, RED],
    ]);
    const tokBar = makeBar(tokRatio, c => `${tokColor}${c}${R}`);
    // ── DeepSeek balance ──
    let balanceStr = '';
    const bal = getDeepSeekBalance();
    if (bal && bal.balance_infos && bal.balance_infos.length > 0) {
      const info = bal.balance_infos[0];
      const total = parseFloat(info.total_balance) || 0;
      const stale = bal._stale ? ` ${DIM}(cached)${R}` : '';
      // Color: green >50, yellow 10-50, red <10, red+dot at 0
      let balColor, icon;
      if (total > 50) { balColor = GREEN; icon = '💰'; }
      else if (total >= 10) { balColor = YELLOW; icon = '💰'; }
      else if (total > 0) { balColor = RED; icon = '💰'; }
      else { balColor = RED; icon = '🔴'; }
      balanceStr = `  ${balColor}${icon} ¥${total.toFixed(2)}${R}${stale}`;
    } else if (bal === null && process.env.DEEPSEEK_API_KEY) {
      balanceStr = `  ${DIM}💤 API error${R}`;
    }
    const line3 = `📊 ${tokBar}  ${tokPct}%` + balanceStr;

    // ── Output ──
    process.stdout.write(`${line1}\n${line2}\n${line3}`);
  } catch (e) {
    process.stdout.write(''); // silent fail — don't disrupt CC
  }
});
