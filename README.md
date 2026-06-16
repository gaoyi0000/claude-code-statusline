<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D12-brightgreen" alt="Node >=12">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
  <img src="https://img.shields.io/badge/dependencies-0-success" alt="Zero dependencies">
</p>

# claude-code-statusline

A zero-dependency Node.js custom statusline for [Claude Code](https://code.claude.com/). Shows model info, context usage, token progress, and time-of-day in a clean three-line display.

```
Claude 3.5 Sonnet ⚡medium │ 📊 ~12K/200K (6%) │ 🪙 18.7K tok
⏰ ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱▱▱  75.02%  ⏱️ 1h23m
📊 ▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱  6.00%  💰 ¥128.45
```

**Line 1** — Model name, effort level, context window usage, total session tokens  
**Line 2** — Time-of-day progress bar (cyan → green → yellow → orange) and session duration  
**Line 3** — Token usage progress bar (green → yellow → orange → red) and optional DeepSeek account balance  

---

## Features

- **Colored progress bars** — ▰/▱ micro-block style, 20 chars wide, with color thresholds mapped to distinct states
- **Effort level indicator** — ⚡ shows low/medium/high/xhigh/max at a glance
- **Session duration** — auto-formats from milliseconds → seconds → minutes → hours
- **DeepSeek balance** — optional: fetches your DeepSeek API balance with 5-minute caching and silent failure on error
- **Silent fail** — any error outputs nothing, won't disrupt your Claude Code session
- **Zero dependencies** — only Node.js built-in modules (`fs`, `path`, `os`, `child_process`), nothing to install

## Prerequisites

- [Claude Code](https://code.claude.com/) with custom statusline support
- Node.js >= 12

## Installation

### Linux / macOS

```bash
# Option A — Quick install
curl -o ~/.claude/statusline.js \
  https://raw.githubusercontent.com/gaoyi0000/claude-code-statusline/main/statusline.js

# Option B — Clone the repo
git clone https://github.com/gaoyi0000/claude-code-statusline.git
cp claude-code-statusline/statusline.js ~/.claude/
```

### Windows (PowerShell)

```powershell
# Option A — Quick install
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/gaoyi0000/claude-code-statusline/main/statusline.js" `
  -OutFile "$env:USERPROFILE\.claude\statusline.js"

# Option B — Clone the repo
git clone https://github.com/gaoyi0000/claude-code-statusline.git
copy-item claude-code-statusline\statusline.js "$env:USERPROFILE\.claude\"
```

### Configure Claude Code

Add the following to your `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "command": "node ~/.claude/statusline.js"
  }
}
```

Restart Claude Code. The new statusline appears at the bottom of the terminal.

### Optional: DeepSeek balance

To show your DeepSeek API balance on line 3, set the `DEEPSEEK_API_KEY` environment variable:

```bash
export DEEPSEEK_API_KEY="sk-your-key-here"
```

Add it to `~/.bashrc` or `~/.zshrc` for persistence. If not set, the balance section is silently skipped.

---

## Customization

Color thresholds are defined in `statusline.js` and can be adjusted directly:

| Bar | Low | Medium | High | Critical |
|-----|-----|--------|------|----------|
| Time of day | `<25%` cyan | `25-50%` green | `50-75%` yellow | `75-100%` orange |
| Token usage | `<50%` green | `50-75%` yellow | `75-90%` orange | `>90%` red |
| DeepSeek balance | `>¥50` green | `¥10-50` yellow | `<¥10` red | `¥0` red 🔴 |

Bar width is controlled by the `BAR_WIDTH` constant (default: 20 characters).

---

<details>
<summary>How it works</summary>

Claude Code passes a JSON object with session state to the statusline command via stdin. The script reads this data and renders three ANSI-colored lines. The DeepSeek balance is fetched independently from `https://api.deepseek.com/user/balance` and cached locally for 5 minutes.

The script is designed to fail silently — if anything goes wrong at any stage, it outputs an empty string so Claude Code's display is never broken by a statusline error.

</details>

## License

MIT — see [LICENSE](LICENSE).
