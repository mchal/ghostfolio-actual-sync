#!/usr/bin/env node

/**
 * Ghostfolio to Actual Budget Sync Script
 * 
 * This script fetches portfolio values from Ghostfolio for specific accounts
 * and updates corresponding accounts in Actual Budget with end-of-month 
 * reconciliation transactions.
 */

const api = require('@actual-app/api');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');

class GhostfolioClient {
    constructor(baseUrl, password, triggerFearAndGreed = false) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.password = password;
        this.triggerFearAndGreed = triggerFearAndGreed;
        this.jwtToken = null;
        this.axiosInstance = axios.create({
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async authenticate() {
        try {
            // Use Ghostfolio's standard authentication with access token
            const response = await this.axiosInstance.post(`${this.baseUrl}/api/v1/auth/anonymous`, {
                accessToken: this.password
            });

            const authResponse = response.data;
            this.jwtToken = authResponse.authToken || authResponse.token || authResponse.access_token || authResponse.accessToken;

            if (this.jwtToken) {
                this.axiosInstance.defaults.headers['Authorization'] = `Bearer ${this.jwtToken}`;
                console.log('Successfully authenticated with Ghostfolio');
            } else {
                throw new Error(`No token found in auth response: ${JSON.stringify(authResponse)}`);
            }
        } catch (error) {
            throw new Error(`Ghostfolio authentication failed: ${error.message}`);
        }
    }

    async getAccounts() {
        try {
            const response = await this.axiosInstance.get(`${this.baseUrl}/api/v1/account`);
            // Handle different response structures
            const data = response.data;
            if (Array.isArray(data)) {
                return data;
            } else if (data && Array.isArray(data.accounts)) {
                return data.accounts;
            } else if (data && data.data && Array.isArray(data.data)) {
                return data.data;
            } else {
                throw new Error(`Unexpected accounts response structure: ${JSON.stringify(data)}`);
            }
        } catch (error) {
            throw new Error(`Failed to fetch accounts: ${error.message}`);
        }
    }

    async triggerFearAndGreedUpdate() {
        try {
            // Use the exact endpoint that the frontend uses
            const endpoint = '/api/v1/symbol/RAPID_API/_GF_FEAR_AND_GREED_INDEX?includeHistoricalData=365';
            
            const response = await this.axiosInstance.get(`${this.baseUrl}${endpoint}`);
            console.log(`Successfully triggered fear and greed update (status: ${response.status})`);
            
            return response.data;
        } catch (error) {
            throw new Error(`Failed to trigger fear and greed update: ${error.message}`);
        }
    }

    async getAccountValues(accountNames, retryOnStale = true) {
        const accountValues = {};
        
        try {
            // First fetch to trigger price update queue
            console.log('Fetching account data (triggering price updates)...');
            let accounts = await this.getAccounts();
            
            // Try to trigger fear and greed data update if enabled
            if (this.triggerFearAndGreed) {
                try {
                    console.log('Triggering fear and greed data update...');
                    await this.triggerFearAndGreedUpdate();
                } catch (error) {
                    console.warn('Could not trigger fear and greed update:', error.message);
                }
            }
            
            // If retryOnStale is enabled, wait and fetch again for fresh prices
            if (retryOnStale) {
                console.log('Waiting 3 seconds for price updates to complete...');
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                console.log('Fetching updated account data...');
                accounts = await this.getAccounts();
            }

            
            for (const account of accounts) {
                const accountName = account.name || account.accountName || account.id || '';
                
                if (accountNames.includes(accountName)) {
                    // Get investment value only (excluding cash balance)
                    let investmentValue = 0;
                    
                    // Get investment value (try these fields in order)
                    const investmentFields = ['value', 'valueInBaseCurrency', 'marketValue', 'currentValue'];
                    for (const field of investmentFields) {
                        if (account[field] !== undefined && account[field] !== null) {
                            const fieldValue = parseFloat(account[field]);
                            if (!isNaN(fieldValue) && fieldValue > 0) {
                                investmentValue = fieldValue;
                                break;
                            }
                        }
                    }
                    
                    if (investmentValue > 0) {
                        accountValues[accountName] = investmentValue;

                    } else {
                        const availableFields = {};
                        const allFields = ['value', 'valueInBaseCurrency', 'marketValue', 'currentValue', 'balanceInBaseCurrency'];
                        allFields.forEach(field => {
                            if (account[field] !== undefined) {
                                availableFields[field] = account[field];
                            }
                        });
                        console.warn(`Account ${accountName} found but has zero/invalid investment value. Available fields: ${JSON.stringify(availableFields)}`);
                    }
                }
            }
            
            if (Object.keys(accountValues).length === 0) {
                console.warn(`No account values found for any of: ${accountNames.join(', ')}`);
                const availableNames = accounts.map(acc => acc.name || acc.id || 'unknown');

            }
            
            return accountValues;
        } catch (error) {
            throw new Error(`Failed to get account values: ${error.message}`);
        }
    }
}

class ActualBudgetClient {
    constructor(serverUrl, password, budgetId) {
        this.serverUrl = serverUrl;
        this.password = password;
        this.budgetId = budgetId;
        this.initialized = false;
    }

    async initialize() {
        try {
            // Create a fresh temporary directory for Actual data each run
            // Use /tmp in Docker, os.tmpdir() on host
            const baseDir = process.env.NODE_ENV === 'production' ? '/tmp' : os.tmpdir();
            const dataDir = path.join(baseDir, `actual-sync-data-${Date.now()}`);
            await fsPromises.mkdir(dataDir, { recursive: true });

            // Initialize the API
            await api.init({
                dataDir: dataDir,
                serverURL: this.serverUrl,
                password: this.password
            });


            // Try to open the budget directly

            // Try to open the budget
            try {
                await api.downloadBudget(this.budgetId);
                this.initialized = true;
            } catch (downloadError) {
                console.error(`Failed to open budget '${this.budgetId}': ${downloadError.message}`);
                
                // Provide helpful error message
                if (downloadError.message.includes('Could not get remote files') || 
                    downloadError.message.includes('timestamp')) {
                    throw new Error(`Budget '${this.budgetId}' not found. Please check that:
1. The budget ID is correct (it should be the exact budget file name or ID, not a display name)
2. The budget exists on your Actual Budget server
3. You have access to this budget
4. The Actual Budget server is running and accessible`);
                } else {
                    throw downloadError;
                }
            }
        } catch (error) {
            throw new Error(`Failed to initialize Actual Budget: ${error.message}`);
        }
    }

    async getAccounts() {
        try {
            return api.getAccounts();
        } catch (error) {
            throw new Error(`Failed to fetch accounts: ${error.message}`);
        }
    }

    async findAccountByName(accountName) {
        const accounts = await this.getAccounts();
        return accounts.find(account => account.name === accountName);
    }

    async getOrCreatePayee(payeeName) {
        try {
            const payees = await api.getPayees();
            let payee = payees.find(p => p.name === payeeName);
            
            if (!payee) {
                // Create new payee
                payee = await api.createPayee({ name: payeeName });
            }
            
            return payee.id;
        } catch (error) {
            console.error(`Failed to get or create payee: ${error.message}`);
            return null;
        }
    }

    async getAccountBalance(accountId, excludeAutoReconciliation = false) {
        try {
            // Get all transactions for this account
            const transactions = await api.getTransactions(accountId);
            
            if (!Array.isArray(transactions)) {
                console.warn('Transactions response is not an array:', typeof transactions);
                return 0;
            }
            
            // Get current date for comparison (YYYY-MM-DD format)
            const today = new Date().toISOString().split('T')[0];
            
            // Calculate the balance by summing transaction amounts
            const balance = transactions.reduce((sum, transaction) => {
                // Skip future transactions
                if (transaction.date && transaction.date > today) {
                    return sum;
                }
                
                // Skip auto-reconciliation transactions if requested
                if (excludeAutoReconciliation && 
                    transaction.notes && 
                    transaction.notes.startsWith('#ghostfolio Reconciliation')) {
                    return sum;
                }
                return sum + (transaction.amount || 0);
            }, 0);
            
            return balance / 100; // Convert from cents to pounds
        } catch (error) {
            console.error(`Failed to get account balance: ${error.message}`);
            return 0;
        }
    }

    async getExistingAutoReconciliation(accountId, targetDate) {
        try {
            const transactions = await api.getTransactions(accountId);
            
            if (!Array.isArray(transactions)) {
                console.warn('Transactions response is not an array:', typeof transactions);
                return null;
            }
            
            return transactions.find(transaction => 
                transaction.date === targetDate && 
                transaction.notes && 
                transaction.notes.startsWith('#ghostfolio Reconciliation')
            );
        } catch (error) {
            console.error(`Failed to get existing transactions: ${error.message}`);
            return null;
        }
    }

    async createTransaction(accountId, amount, date, notes) {
        try {
            const payeeId = await this.getOrCreatePayee("Reconciliation Balance Adjustment");
            
            const transaction = {
                account: accountId,
                amount: Math.round(amount * 100), // Convert to cents
                date: date,
                notes: notes,
                payee: payeeId,
                cleared: false
            };

            await api.importTransactions(accountId, [transaction]);

            return true;
        } catch (error) {
            console.error(`Failed to create transaction: ${error.message}`);
            return false;
        }
    }

    async updateTransaction(transactionId, amount, notes) {
        try {
            const payeeId = await this.getOrCreatePayee("Reconciliation Balance Adjustment");
            
            await api.updateTransaction(transactionId, {
                amount: Math.round(amount * 100), // Convert to cents
                notes: notes,
                payee: payeeId
            });

            return true;
        } catch (error) {
            console.error(`Failed to update transaction: ${error.message}`);
            return false;
        }
    }

    async getAccount(accountName) {
        if (!this.initialized) {
            throw new Error('ActualBudgetClient not initialized. Call initialize() first.');
        }

        const accounts = await api.getAccounts();
        const account = accounts.find(acc => acc.name === accountName);
        
        if (!account) {
            throw new Error(`Account '${accountName}' not found in Actual Budget`);
        }
        
        return account;
    }

    async close() {
        try {
            if (this.initialized) {
                await api.shutdown();
                this.initialized = false;
            }
        } catch (error) {
            // Silently ignore shutdown errors if we're already in an error state
            console.debug('Error during shutdown:', error.message);
        }
    }
}

function loadConfig() {
    try {
        // Support Docker environment with CONFIG_PATH or fallback to local config.json
        const configPath = process.env.CONFIG_PATH || path.join(__dirname, 'config.json');
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        
        // Override with environment variables if present
        return {
            ghostfolio_base_url: process.env.GHOSTFOLIO_BASE_URL || config.ghostfolio_base_url,
            ghostfolio_password: process.env.GHOSTFOLIO_PASSWORD || config.ghostfolio_password || config.ghostfolio_access_token,
            actual_base_url: process.env.ACTUAL_BASE_URL || config.actual_base_url,
            actual_password: process.env.ACTUAL_PASSWORD || config.actual_password,
            actual_budget_id: process.env.ACTUAL_BUDGET_ID || config.actual_budget_id,
            account_mapping: config.account_mapping || config.platform_account_mapping || {},
            trigger_fear_and_greed: config.trigger_fear_and_greed !== undefined ? config.trigger_fear_and_greed : false,
            log_level: process.env.LOG_LEVEL || config.log_level || 'INFO'
        };
    } catch (error) {
        throw new Error(`Failed to load config: ${error.message}`);
    }
}

function getEndOfMonthDate(targetDate = new Date()) {
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endOfMonth = new Date(year, month, lastDay);
    return endOfMonth.toISOString().split('T')[0]; // YYYY-MM-DD format
}

function createTimestampedNote(ghostfolioAccount) {
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace('T', ' '); // YYYY-MM-DD HH:MM format
    return `#ghostfolio Reconciliation - ${ghostfolioAccount} - as of ${timestamp}`;
}

async function processAccount(ghostfolioAccount, actualAccountName, accountValues, actualClient, reconciliationDate, isDryRun = false) {
    if (!accountValues[ghostfolioAccount]) {
        const message = `No data found for Ghostfolio account: ${ghostfolioAccount}`;
        if (isDryRun) {
            console.log(`  ❌ SKIP: ${ghostfolioAccount} -> ${actualAccountName} (No data found)`);
        } else {
            console.warn(message);
        }
        return;
    }

    const targetValue = accountValues[ghostfolioAccount];

    // Find the corresponding account in Actual Budget
    const account = await actualClient.findAccountByName(actualAccountName);
    if (!account) {
        const message = `Account not found in Actual Budget: ${actualAccountName}`;
        if (isDryRun) {
            console.log(`  ❌ SKIP: ${ghostfolioAccount} -> ${actualAccountName} (Account not found in Actual Budget)`);
        } else {
            console.error(message);
        }
        return;
    }

    const accountId = account.id;
    
    // Get current account balance excluding existing auto-reconciliation transactions
    const baseBalance = await actualClient.getAccountBalance(accountId, true);
    const reconciliationAmount = targetValue - baseBalance;

    // Check if auto reconciliation already exists
    const existingTransaction = await actualClient.getExistingAutoReconciliation(
        accountId, reconciliationDate
    );

    // Create timestamped note
    const notes = createTimestampedNote(ghostfolioAccount);

    if (isDryRun) {
        // Dry run output
        if (existingTransaction) {
            const oldAmount = existingTransaction.amount / 100; // Convert from cents
            console.log(`  🔄 UPDATE: ${ghostfolioAccount} -> ${actualAccountName}`);
            console.log(`     Base Balance: £${baseBalance.toFixed(2)}`);
            console.log(`     Target Value: £${targetValue.toFixed(2)}`);
            console.log(`     Old Reconciliation: £${oldAmount.toFixed(2)}`);
            console.log(`     New Reconciliation: £${reconciliationAmount.toFixed(2)}`);
            console.log(`     Note: ${notes}`);
        } else {
            console.log(`  ➕ CREATE: ${ghostfolioAccount} -> ${actualAccountName}`);
            console.log(`     Base Balance: £${baseBalance.toFixed(2)}`);
            console.log(`     Target Value: £${targetValue.toFixed(2)}`);
            console.log(`     Reconciliation Amount: £${reconciliationAmount.toFixed(2)}`);
            console.log(`     Note: ${notes}`);
        }
    } else {
        // Actual execution
        if (existingTransaction) {
            // Update existing transaction
            const success = await actualClient.updateTransaction(
                existingTransaction.id,
                reconciliationAmount,
                notes
            );
            if (success) {
                console.log(`Updated ${ghostfolioAccount} -> ${actualAccountName}: £${reconciliationAmount.toFixed(2)} (Base: £${baseBalance.toFixed(2)} → Target: £${targetValue.toFixed(2)})`);
            }
        } else {
            // Create new transaction
            const success = await actualClient.createTransaction(
                accountId,
                reconciliationAmount,
                reconciliationDate,
                notes
            );
            if (success) {
                console.log(`Created ${ghostfolioAccount} -> ${actualAccountName}: £${reconciliationAmount.toFixed(2)} (Base: £${baseBalance.toFixed(2)} → Target: £${targetValue.toFixed(2)})`);
            }
        }
    }
}

async function dryRunSync(config, targetDate = null) {
    let actualClient = null;
    
    try {
        // Initialize clients
        const ghostfolioClient = new GhostfolioClient(
            config.ghostfolio_base_url,
            config.ghostfolio_password,
            config.trigger_fear_and_greed
        );
        
        actualClient = new ActualBudgetClient(
            config.actual_base_url,
            config.actual_password,
            config.actual_budget_id
        );

        // Authenticate with Ghostfolio
        await ghostfolioClient.authenticate();
        
        // Initialize Actual Budget
        await actualClient.initialize();

        // Get account values from Ghostfolio
        const ghostfolioAccounts = Object.keys(config.account_mapping);
        const accountValues = await ghostfolioClient.getAccountValues(ghostfolioAccounts);

        // Get end of month date
        const reconciliationDate = getEndOfMonthDate(targetDate || new Date());

        console.log(`\n=== DRY RUN RESULTS (${reconciliationDate}) ===`);
        console.log('\nGhostfolio Account Values:');
        for (const [account, value] of Object.entries(accountValues)) {
            console.log(`  ${account}: £${value.toFixed(2)}`);
        }

        console.log('\nPlanned Updates:');

        // Process each Ghostfolio account
        for (const [ghostfolioAccount, actualAccountName] of Object.entries(config.account_mapping)) {
            await processAccount(ghostfolioAccount, actualAccountName, accountValues, actualClient, reconciliationDate, true);
        }

        console.log('\n=== END DRY RUN ===');
        console.log('\nTo execute these changes, run the script without --dry-run flag.');

    } catch (error) {
        console.error(`Dry run failed: ${error.message}`);
        throw error;
    } finally {
        if (actualClient) {
            await actualClient.close();
        }
    }
}

async function syncGhostfolioToActual(config, targetDate = null) {
    console.log('Starting Ghostfolio to Actual Budget sync');
    
    let actualClient = null;
    
    try {
        // Initialize clients
        const ghostfolioClient = new GhostfolioClient(
            config.ghostfolio_base_url,
            config.ghostfolio_password,
            config.trigger_fear_and_greed
        );
        
        actualClient = new ActualBudgetClient(
            config.actual_base_url,
            config.actual_password,
            config.actual_budget_id
        );

        // Authenticate with Ghostfolio
        await ghostfolioClient.authenticate();
        
        // Initialize Actual Budget
        await actualClient.initialize();

        // Get account values from Ghostfolio
        const ghostfolioAccounts = Object.keys(config.account_mapping);
        const accountValues = await ghostfolioClient.getAccountValues(ghostfolioAccounts);

        // Get end of month date
        const reconciliationDate = getEndOfMonthDate(targetDate || new Date());

        // Process each Ghostfolio account
        for (const [ghostfolioAccount, actualAccountName] of Object.entries(config.account_mapping)) {
            await processAccount(ghostfolioAccount, actualAccountName, accountValues, actualClient, reconciliationDate, false);
        }

        console.log('Sync completed successfully');

    } catch (error) {
        console.error(`Sync failed: ${error.message}`);
        throw error;
    } finally {
        if (actualClient) {
            await actualClient.close();
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');

    try {
        // Load configuration
        const config = loadConfig();

        // Validate required fields
        const requiredFields = [
            'ghostfolio_base_url', 'ghostfolio_password',
            'actual_base_url', 'actual_password', 'actual_budget_id'
        ];

        for (const field of requiredFields) {
            if (!config[field]) {
                throw new Error(`Missing required configuration: ${field}`);
            }
        }

        // Run sync or dry run
        if (isDryRun) {
            await dryRunSync(config);
            console.log('\nDry run completed successfully!');
        } else {
            await syncGhostfolioToActual(config);
            console.log('Sync completed successfully!');
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}