---
name: agent-browser-testing
description: >
  Browser E2E testing patterns using agent-browser CLI for Mana Vault. Use when running
  end-to-end tests, verifying UI behavior, testing login flows, or debugging browser-based
  issues. Covers agent-browser commands, test credentials, login flow, and best practices.
---

# Browser End-to-End Testing (agent-browser)

> **IMPORTANT**: All browser-based end-to-end testing MUST be performed using the `agent-browser` CLI tool. Do not use Playwright, Puppeteer, or other browser automation libraries directly.

**Default Test Credentials:**

- Email: `jesse@thecarters.cloud`
- Password: `Password1!`

**Common Commands:**

```bash
agent-browser open http://localhost:3001        # Open the web app
agent-browser snapshot -i                       # Get interactive elements with refs
agent-browser click @e2                         # Click element by ref from snapshot
agent-browser fill @e3 "text"                   # Clear and fill input field
agent-browser type @e3 "text"                   # Type into input field
agent-browser press Enter                       # Press keyboard key
agent-browser screenshot                        # Take screenshot
agent-browser screenshot --full                 # Full page screenshot
agent-browser get text @e1                      # Get text content of element
agent-browser wait 2000                         # Wait 2 seconds
agent-browser wait "[data-testid='element']"   # Wait for element
```

**Typical Login Flow:**

```bash
agent-browser open http://localhost:3001/login
agent-browser snapshot -i
agent-browser fill "[name='email']" "jesse@thecarters.cloud"
agent-browser fill "[name='password']" "Password1!"
agent-browser click "button[type='submit']"
agent-browser wait 2000
agent-browser snapshot -i  # Verify logged in state
```

**Best Practices:**

1. **Always use `snapshot -i`** after navigation or actions to get current interactive elements with refs
2. **Use refs (@e1, @e2, etc.)** from snapshots for reliable element targeting
3. **Use CSS selectors** when refs are not suitable (e.g., `[data-testid='...']`, `[name='...']`)
4. **Add waits** after actions that trigger navigation or async updates
5. **Take screenshots** when debugging or verifying visual state
6. **Use sessions** (`--session <name>`) to isolate test runs
7. **Use short wait times** - The app is designed to be snappy. Start with short intervals like `150ms` and only increase if needed. Avoid defaulting to long waits like `1000ms` or `2000ms`.

**Session Management:**

```bash
agent-browser --session test1 open http://localhost:3001  # Isolated session
agent-browser --session test1 snapshot -i                 # Same session
agent-browser session list                                # List active sessions
```

**Debugging:**

```bash
agent-browser --headed open http://localhost:3001  # Show browser window
agent-browser console                              # View console logs
agent-browser errors                               # View page errors
agent-browser highlight "[selector]"               # Highlight element
```
