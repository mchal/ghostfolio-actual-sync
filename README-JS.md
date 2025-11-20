# Ghostfolio to Actual Budget Sync (JavaScript)

This Node.js script synchronizes portfolio values from Ghostfolio to Actual Budget using the official Actual Budget API.

## Why JavaScript?

Actual Budget **does not provide a REST API**. Instead, it only offers an NPM package `@actual-app/api` for programmatic access. This JavaScript version uses the official API, making it much more reliable than trying to reverse-engineer HTTP endpoints.

## Setup

1. **Install Node.js** (if not already installed):
   ```bash
   # On macOS with Homebrew
   brew install node
   
   # Or download from https://nodejs.org/
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure the application**:
   Your existing `config.json` file should work as-is. The script supports the same configuration format:
   ```json
   {
     "ghostfolio_base_url": "https://your-ghostfolio-server.com",
     "ghostfolio_password": "your-ghostfolio-access-token",
     "actual_base_url": "https://your-actual-budget-server.com",
     "actual_password": "your-actual-budget-password",
     "actual_budget_id": "your-budget-id",
     "account_mapping": {
       "Ghostfolio Account Name": "Actual Budget Account Name",
       "Investment ISA": "Investment ISA",
       "Investment GIA": "Investment Account"
     },
     "trigger_fear_and_greed": false
   }
   ```

## Usage

### Dry Run (Recommended First)

```bash
npm run dry-run
# or
node sync.js --dry-run
```

### Full Sync

```bash
npm start
# or  
node sync.js
```

### Custom Configuration File

```bash
node sync.js --config=my-config.json --dry-run
```

## Configuration Options

- `trigger_fear_and_greed` (boolean, default: false): Whether to trigger fear and greed index updates in Ghostfolio during sync. Set to `true` to enable fresh fear and greed data updates.

## Key Advantages of JavaScript Version

1. **Uses Official API**: No reverse-engineering of endpoints
2. **Reliable**: Uses the same API that Actual Budget's web interface uses
3. **Type Safety**: Better error handling and validation
4. **Proper Authentication**: Handles Actual Budget's authentication correctly
5. **Transaction Management**: Proper transaction creation and updates
6. **Fear and Greed Updates**: Optionally triggers fresh fear and greed index data

## How It Works

1. **Ghostfolio**: Authenticates using your access token and fetches account values
2. **Actual Budget**: Uses the official `@actual-app/api` to:
   - Connect to your Actual Budget server
   - Open your budget file
   - Find accounts by name
   - Create or update reconciliation transactions

## Migration from Python

You can keep your existing `config.json` file - no changes needed. Just run the JavaScript version instead:

```bash
# Instead of:
# python sync_ghost_actual.py --dry-run

# Use:
node sync.js --dry-run
```

## Environment Variables

You can still use environment variables to override config values:
- `GHOSTFOLIO_BASE_URL`
- `GHOSTFOLIO_PASSWORD`
- `ACTUAL_BASE_URL`
- `ACTUAL_PASSWORD`
- `ACTUAL_BUDGET_ID`

## Error Handling

The JavaScript version provides better error messages and handles:
- Ghostfolio authentication failures
- Actual Budget connection issues
- Missing accounts
- Transaction conflicts
- Network timeouts