// app.js

// Seed-based random number generator for reproducible stock charts
function createSeededRandom(seedString) {
    let hash = 0;
    for (let i = 0; i < seedString.length; i++) {
        hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
    }
    return function() {
        let x = Math.sin(hash++) * 10000;
        return x - Math.floor(x);
    };
}

// Generate Standard Normal variables (Box-Muller transform)
function boxMuller(randomFn) {
    let u = 0, v = 0;
    while(u === 0) u = randomFn(); 
    while(v === 0) v = randomFn();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ----------------------------------------------------
// Database of popular stocks and their parameters
// ----------------------------------------------------
const STOCK_DEFAULTS = {
    'AAPL': { name: 'Apple Inc.', basePrice: 175.0, drift: 0.0004, volatility: 0.015, currency: 'USD' },
    'MSFT': { name: 'Microsoft Corp.', basePrice: 410.0, drift: 0.0005, volatility: 0.014, currency: 'USD' },
    'GOOGL': { name: 'Alphabet Inc.', basePrice: 165.0, drift: 0.00035, volatility: 0.016, currency: 'USD' },
    'AMZN': { name: 'Amazon.com Inc.', basePrice: 180.0, drift: 0.00045, volatility: 0.018, currency: 'USD' },
    'TSLA': { name: 'Tesla Inc.', basePrice: 190.0, drift: 0.0002, volatility: 0.028, currency: 'USD' },
    'META': { name: 'Meta Platforms', basePrice: 480.0, drift: 0.0006, volatility: 0.022, currency: 'USD' },
    'NVDA': { name: 'NVIDIA Corp.', basePrice: 120.0, drift: 0.0018, volatility: 0.032, currency: 'USD' },
    'RELIANCE': { name: 'Reliance Industries', basePrice: 2450.0, drift: 0.0004, volatility: 0.012, currency: 'INR' },
    'TCS': { name: 'TCS Ltd.', basePrice: 3850.0, drift: 0.0003, volatility: 0.011, currency: 'INR' },
    'INFY': { name: 'Infosys Ltd.', basePrice: 1420.0, drift: 0.00025, volatility: 0.013, currency: 'INR' },
    'HDFCBANK': { name: 'HDFC Bank Ltd.', basePrice: 1510.0, drift: 0.0002, volatility: 0.012, currency: 'INR' },
    'SBIN': { name: 'State Bank of India', basePrice: 780.0, drift: 0.00035, volatility: 0.015, currency: 'INR' },
    'TATASTEEL': { name: 'Tata Steel Ltd.', basePrice: 145.0, drift: 0.0003, volatility: 0.018, currency: 'INR' },
    'BHARTIARTL': { name: 'Bharti Airtel', basePrice: 1350.0, drift: 0.0005, volatility: 0.014, currency: 'INR' },
    'NOK': { name: 'Nokia Corp.', basePrice: 3.50, drift: -0.00005, volatility: 0.020, currency: 'USD' }
};

const USD_INR_RATE = 83.5; // Fixed conversion rate for client-side conversions

// Generate historical stock data using Geometric Brownian Motion
function generateStockData(ticker, days = 180) {
    const config = STOCK_DEFAULTS[ticker] || { name: ticker, basePrice: 100.0, drift: 0.0002, volatility: 0.015, currency: 'USD' };
    const rand = createSeededRandom(ticker);
    
    let prices = [];
    let currentPrice = config.basePrice;
    
    // Set starting date to 'days' ago
    let currentDate = new Date();
    currentDate.setDate(currentDate.getDate() - days);
    
    for (let i = 0; i < days; i++) {
        let dateStr = currentDate.toISOString().split('T')[0];
        
        // GBM formulation: S_t = S_t-1 * exp((drift - vol^2 / 2) + vol * Z)
        let z = boxMuller(rand);
        let returnPct = (config.drift - (config.volatility ** 2) / 2) + config.volatility * z;
        currentPrice = currentPrice * Math.exp(returnPct);
        
        // Ensure price never drops below zero
        if (currentPrice < 0.1) currentPrice = 0.1;
        
        // If it's a USD stock, convert to INR for dashboard consistency
        let finalPrice = currentPrice;
        if (config.currency === 'USD') {
            finalPrice = currentPrice * USD_INR_RATE;
        }
        
        prices.push({
            date: dateStr,
            close: parseFloat(finalPrice.toFixed(2))
        });
        
        // Increment date (skipping weekends is nice, but for simplicity we do sequential dates)
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return prices;
}

// ----------------------------------------------------
// Client-Side Machine Learning: Linear Regression OLS
// ----------------------------------------------------
function trainAndPredict(prices, forecastOut = 30) {
    // Replicate model.py behavior:
    // X = prices[i], y = prices[i + forecastOut]
    const n = prices.length;
    if (n <= forecastOut * 2) {
        return { error: 'Not enough historical data to forecast.' };
    }
    
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    let count = 0;
    
    // Train on historical prices
    for (let i = 0; i < n - forecastOut; i++) {
        let xVal = prices[i];
        let yVal = prices[i + forecastOut];
        
        sumX += xVal;
        sumY += yVal;
        sumXY += xVal * yVal;
        sumXX += xVal * xVal;
        count++;
    }
    
    // Calculate slope (m) and intercept (c)
    const m = (count * sumXY - sumX * sumY) / (count * sumXX - sumX * sumX);
    const c = (sumY - m * sumX) / count;
    
    // Generate predicted future prices for the next 30 days
    // We project using the last forecastOut prices
    let predictions = [];
    for (let i = n - forecastOut; i < n; i++) {
        let currentVal = prices[i];
        let predictedVal = m * currentVal + c;
        predictions.push(parseFloat(predictedVal.toFixed(2)));
    }
    
    return {
        slope: m,
        intercept: c,
        predictions: predictions,
        ultimatePrediction: predictions[predictions.length - 1]
    };
}

// ----------------------------------------------------
// Toast Notification Engine
// ----------------------------------------------------
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast`;
    
    let icon = '✨';
    if (type === 'success') icon = '🟢';
    if (type === 'error') icon = '🔴';
    if (type === 'info') icon = '🔵';
    
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    
    // Remove toast after 3.5 seconds
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s reverse forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3500);
}

// ----------------------------------------------------
// Cloud Database Sync Engine (KVdb.io serverless REST)
// ----------------------------------------------------
const KVDB_BASE = 'https://kvdb.io/A9vStockSimDb2026/';

async function cloudGet(key, defaultValue) {
    try {
        const res = await fetch(KVDB_BASE + key);
        if (res.status === 200) {
            const txt = await res.text();
            return JSON.parse(txt);
        }
    } catch (e) {
        console.warn("Cloud read failed, using localStorage fallback", e);
    }
    // Fallback to local
    const local = localStorage.getItem('cloud_' + key);
    return local ? JSON.parse(local) : defaultValue;
}

async function cloudSet(key, value) {
    try {
        const valStr = JSON.stringify(value);
        localStorage.setItem('cloud_' + key, valStr); // Cache locally
        await fetch(KVDB_BASE + key, {
            method: 'POST',
            body: valStr
        });
    } catch (e) {
        console.warn("Cloud write failed, saved to local fallback", e);
    }
}

async function getSyncedUsers() {
    const defaultUsers = {
        'admin': { password: 'adminpassword', portfolio: { balance: 1000000, stocks: {} } },
        'demouser': { password: 'password123', portfolio: { balance: 100000, stocks: {} } }
    };
    return await cloudGet('users', defaultUsers);
}

async function saveSyncedUsers(users) {
    await cloudSet('users', users);
}

// Log browser logins centrally
async function logUserLoginOnline(username) {
    if (username === 'admin') return;
    try {
        const logs = await cloudGet('logs', []);
        
        // Find browser client details
        const ua = navigator.userAgent;
        let browser = "Chrome";
        if (ua.indexOf("Firefox") > -1) browser = "Firefox";
        else if (ua.indexOf("Safari") > -1) browser = "Safari";
        else if (ua.indexOf("Edge") > -1) browser = "Edge";
        else if (ua.indexOf("OPR") > -1) browser = "Opera";
        
        // Generate simulated country / region for other logins
        const locations = [
            "India (Mumbai)", "India (Bangalore)", "United States (California)", 
            "United States (New York)", "United Kingdom (London)", "Germany (Frankfurt)",
            "Singapore", "Australia (Sydney)", "Canada (Toronto)"
        ];
        const randLoc = locations[Math.floor(Math.random() * locations.length)];
        const simulatedIp = `157.44.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`;
        
        const newLog = {
            username: username,
            time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            browser: browser,
            location: `${randLoc} [IP: ${simulatedIp}]`
        };
        
        logs.unshift(newLog);
        if (logs.length > 50) logs.pop(); // Cap log size
        await cloudSet('logs', logs);
    } catch (e) {
        console.error("Failed to log activity to online dashboard", e);
    }
}

// ----------------------------------------------------
// UI Flow & Session Management
// ----------------------------------------------------
let chartInstance = null;
let currentSymbol = 'AAPL';
let portfolio = {
    balance: 100000,
    stocks: {}
};

// Initialize app when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // Log this page visit to Flask backend
    const cachedUser = localStorage.getItem('currentUser');
    const username = cachedUser ? JSON.parse(cachedUser).username : 'Guest';
    logVisitToServer(username);

    if (cachedUser) {
        showDashboard(JSON.parse(cachedUser));
    } else {
        showLoginPage();
    }
    
    // Wire up events
    setupAuthListeners();
    setupAdminListeners();
});

// Log visit to Flask server (real IP, browser, OS recorded server-side)
function logVisitToServer(username) {
    fetch('/log-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: window.location.pathname, username: username })
    }).catch(() => {}); // Silent fail — never break the UI
}

function showLoginPage() {
    document.getElementById('authPage').style.display = 'flex';
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'none';
}

function showDashboard(user) {
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('dashboardPage').style.display = 'flex';
    document.getElementById('adminPage').style.display = 'none';
    document.getElementById('userInitial').innerText = user.username.charAt(0).toUpperCase();
    document.getElementById('userDisplayName').innerText = user.username;
    
    // Toggle Admin Panel button inside navbar
    const adminBtn = document.getElementById('btnGoAdmin');
    if (user.username === 'admin') {
        adminBtn.style.display = 'inline-flex';
    } else {
        adminBtn.style.display = 'none';
    }
    
    // Load simulation portfolio
    loadPortfolioData(user.username);
    
    // Load watchlist table
    buildWatchlistTable();
    
    // Run initial analysis
    runAnalysis();
    
    showToast(`Welcome back, ${user.username}!`, 'success');
}

function setupAuthListeners() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    document.getElementById('toRegister').addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    });
    
    document.getElementById('toLogin').addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
    });
    
    // Handle registration
    document.getElementById('btnDoRegister').addEventListener('click', async () => {
        const user = document.getElementById('regUser').value.trim();
        const pass = document.getElementById('regPass').value.trim();
        const errDiv = document.getElementById('regError');
        
        errDiv.innerText = '';
        
        if (user.length < 3) {
            errDiv.innerText = 'Username must be at least 3 characters.';
            return;
        }
        if (pass.length < 5) {
            errDiv.innerText = 'Password must be at least 5 characters.';
            return;
        }
        
        // Disable button while syncing
        const btn = document.getElementById('btnDoRegister');
        btn.disabled = true;
        btn.innerText = 'Syncing cloud databases...';
        
        // Sync users
        let users = await getSyncedUsers();
        if (users[user]) {
            errDiv.innerText = 'Username already registered.';
            btn.disabled = false;
            btn.innerText = 'Create Account';
            return;
        }
        
        // Save user
        users[user] = { password: pass, portfolio: { balance: 100000, stocks: {} } };
        await saveSyncedUsers(users);
        
        btn.disabled = false;
        btn.innerText = 'Create Account';
        
        showToast('Registration successful! Please login.', 'success');
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
    });
    
    // Handle login
    document.getElementById('btnDoLogin').addEventListener('click', async () => {
        const user = document.getElementById('loginUser').value.trim();
        const pass = document.getElementById('loginPass').value.trim();
        const errDiv = document.getElementById('loginError');
        
        errDiv.innerText = '';
        
        const btn = document.getElementById('btnDoLogin');
        btn.disabled = true;
        btn.innerText = 'Authenticating...';
        
        let users = await getSyncedUsers();
        if (!users[user] || users[user].password !== pass) {
            errDiv.innerText = 'Invalid username or password.';
            btn.disabled = false;
            btn.innerText = 'Access Dashboard';
            return;
        }
        
        // Log in session
        const sessionUser = { username: user };
        localStorage.setItem('currentUser', JSON.stringify(sessionUser));
        
        // Log this login visit with username
        logVisitToServer(user);
        
        btn.disabled = false;
        btn.innerText = 'Access Dashboard';
        
        showDashboard(sessionUser);
    });
    
    // Handle logout
    document.getElementById('btnLogout').addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        showLoginPage();
        showToast('Logged out successfully.', 'info');
    });
}

// ----------------------------------------------------
// Admin panel logic & operations
// ----------------------------------------------------
window.showAdminPage = function() {
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'flex';
    syncAdminData();
};

window.exitAdminPage = function() {
    document.getElementById('adminPage').style.display = 'none';
    document.getElementById('dashboardPage').style.display = 'flex';
    runAnalysis(); // Re-draw chart when going back
};

window.syncAdminData = async function() {
    showToast('Loading visitor data from server...', 'info');

    // --- Registered users stat (from localStorage) ---
    const users = await getSyncedUsers();
    let totalUsers = 0;
    for (let u in users) { if (u !== 'admin') totalUsers++; }
    document.getElementById('adminTotalUsers').innerText = totalUsers;

    // --- Real visits from Flask backend ---
    let visits = [];
    try {
        const res = await fetch('/get-visits');
        const json = await res.json();
        visits = json.visits || [];
    } catch(e) {
        showToast('Could not fetch visitor data from server.', 'error');
    }

    document.getElementById('adminTotalLogins').innerText = visits.length;

    // Unique IPs count
    const uniqueIPs = new Set(visits.map(v => v.ip)).size;
    document.getElementById('adminTotalCapital').innerText = uniqueIPs;

    // --- Visitor log table ---
    const logsTableBody = document.getElementById('adminLogsTableBody');
    logsTableBody.innerHTML = '';

    if (visits.length === 0) {
        logsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">No visitors recorded yet</td></tr>`;
    } else {
        visits.forEach(v => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong style="color: var(--accent-secondary);">${v.username || 'Guest'}</strong></td>
                <td style="font-family:monospace; color: var(--accent-primary); font-size:0.85rem;">${v.ip}</td>
                <td style="font-size: 0.8rem; color: var(--text-secondary);">${v.time}</td>
                <td><span class="admin-badge browser">${v.browser} / ${v.platform}</span></td>
                <td><span class="admin-badge location">${v.page}</span></td>
            `;
            logsTableBody.appendChild(row);
        });
    }

    showToast('Visitor data loaded!', 'success');
};

function setupAdminListeners() {
    // Admin logout button
    document.getElementById('btnAdminLogout').addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        showLoginPage();
        showToast('Logged out successfully.', 'info');
    });
    
    // Admin clear logs button — clears real server-side visits
    document.getElementById('btnClearLogsBtn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to permanently delete all visitor logs?')) {
            try {
                await fetch('/clear-visits', { method: 'POST' });
                syncAdminData();
                showToast('Visitor logs cleared!', 'success');
            } catch(e) {
                showToast('Failed to clear logs.', 'error');
            }
        }
    });
}


// ----------------------------------------------------
// Portfolio & Simulation Management
// ----------------------------------------------------
function loadPortfolioData(username) {
    let users = JSON.parse(localStorage.getItem('users') || '{}');
    if (users[username]) {
        if (!users[username].portfolio) {
            users[username].portfolio = { balance: 100000, stocks: {} };
        }
        portfolio = users[username].portfolio;
    }
    updatePortfolioUI();
}

function savePortfolioData() {
    const cachedUser = localStorage.getItem('currentUser');
    if (!cachedUser) return;
    const username = JSON.parse(cachedUser).username;
    
    let users = JSON.parse(localStorage.getItem('users') || '{}');
    if (users[username]) {
        users[username].portfolio = portfolio;
        localStorage.setItem('users', JSON.stringify(users));
    }
    updatePortfolioUI();
}

function updatePortfolioUI() {
    // These elements were removed from the UI — guard against missing DOM nodes
    const balEl = document.getElementById('portfolioBalance');
    const nwEl  = document.getElementById('portfolioNetWorth');
    if (balEl) balEl.innerText = `₹${portfolio.balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (nwEl)  nwEl.innerText  = `₹${portfolio.balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function setupSimulatorListeners() {
    // Guard: simulator elements removed from UI — skip if not present
    if (!document.getElementById('btnBuyStock')) return;

    document.getElementById('btnBuyStock').addEventListener('click', () => {
        const qty = parseInt(document.getElementById('simQty').value);
        if (isNaN(qty) || qty <= 0) { showToast('Please enter a valid quantity.', 'error'); return; }
        let data = generateStockData(currentSymbol, 2);
        let currentPrice = data[data.length - 1].close;
        let totalCost = currentPrice * qty;
        if (portfolio.balance < totalCost) { showToast('Insufficient funds in wallet.', 'error'); return; }
        portfolio.balance -= totalCost;
        portfolio.stocks[currentSymbol] = (portfolio.stocks[currentSymbol] || 0) + qty;
        savePortfolioData();
        showToast(`Bought ${qty} shares of ${currentSymbol}!`, 'success');
    });

    document.getElementById('btnSellStock').addEventListener('click', () => {
        const qty = parseInt(document.getElementById('simQty').value);
        if (isNaN(qty) || qty <= 0) { showToast('Please enter a valid quantity.', 'error'); return; }
        let ownedShares = portfolio.stocks[currentSymbol] || 0;
        if (ownedShares < qty) { showToast('Not enough shares.', 'error'); return; }
        let data = generateStockData(currentSymbol, 2);
        let totalRefund = data[data.length - 1].close * qty;
        portfolio.balance += totalRefund;
        portfolio.stocks[currentSymbol] = ownedShares - qty;
        if (portfolio.stocks[currentSymbol] === 0) delete portfolio.stocks[currentSymbol];
        savePortfolioData();
        showToast(`Sold ${qty} shares of ${currentSymbol}!`, 'success');
    });
}

// ----------------------------------------------------
// Prediction Dashboard Engine
// ----------------------------------------------------
window.changeTicker = function(symbol) {
    currentSymbol = symbol;
    document.getElementById('stockSelect').value = symbol;
    runAnalysis();
};

window.runAnalysis = function() {
    const pulseLoader = document.getElementById('pulseLoader');
    const forecastResults = document.getElementById('forecastResults');
    
    pulseLoader.style.display = 'flex';
    forecastResults.style.opacity = '0.3';
    
    // Simulate minor engine lag for standard AI dashboard feel (700ms)
    setTimeout(() => {
        pulseLoader.style.display = 'none';
        forecastResults.style.opacity = '1';
        
        const symbol = document.getElementById('stockSelect').value;
        currentSymbol = symbol;
        const daysBack = parseInt(document.getElementById('dateSelect').value);
        
        // Generate prices
        const history = generateStockData(symbol, daysBack);
        const closes = history.map(h => h.close);
        
        // Run browser ML algorithm (Linear Regression)
        const mlResult = trainAndPredict(closes, 30);
        
        if (mlResult.error) {
            alert(mlResult.error);
            return;
        }
        
        // Compute dashboard metrics
        const currentPrice = closes[closes.length - 1];
        const predPrice = mlResult.ultimatePrediction;
        const diff = predPrice - currentPrice;
        const pct = ((diff / currentPrice) * 100).toFixed(2);
        const isUp = diff >= 0;
        
        // Set suggestion badge
        let badgeHTML = '';
        if (pct > 2.0) {
            badgeHTML = '<span class="badge-pill buy">BUY</span>';
        } else if (pct < -2.0) {
            badgeHTML = '<span class="badge-pill sell">SELL</span>';
        } else {
            badgeHTML = '<span class="badge-pill hold">HOLD</span>';
        }
        
        // Render stats on cards
        document.getElementById('cardPriceToday').innerText = `₹${currentPrice.toFixed(2)}`;
        document.getElementById('cardPriceForecast').innerText = `₹${predPrice.toFixed(2)}`;
        document.getElementById('cardChangePrice').innerText = `${isUp ? '+' : ''}₹${diff.toFixed(2)}`;
        
        const changeIndicator = document.getElementById('cardChangePercent');
        changeIndicator.className = `trend-indicator ${isUp ? 'up' : 'down'}`;
        changeIndicator.innerHTML = `${isUp ? '▲' : '▼'} ${Math.abs(pct)}%`;
        
        document.getElementById('cardRecommendation').innerHTML = badgeHTML;
        
        // Update simulation details if elements exist (they may have been removed)
        const simSym = document.getElementById('simulatorSym');
        const simPrc = document.getElementById('simulatorPrice');
        const simOwn = document.getElementById('simulatorOwned');
        if (simSym) simSym.innerText = symbol;
        if (simPrc) simPrc.innerText = `₹${currentPrice.toFixed(2)}`;
        if (simOwn) simOwn.innerText = `${portfolio.stocks[symbol] || 0} Shares`;
        
        // Draw Chart
        renderChart(history, mlResult.predictions);
    }, 600);
};

// Render logic utilizing Chart.js
function renderChart(history, predictions) {
    const ctx = document.getElementById('predictionChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    // Labels for history
    const labels = history.map(h => h.date);
    
    // Future labels (30 days ahead)
    let lastDate = new Date(labels[labels.length - 1]);
    for (let i = 1; i <= 30; i++) {
        let futureDate = new Date(lastDate);
        futureDate.setDate(lastDate.getDate() + i);
        labels.push(futureDate.toISOString().split('T')[0]);
    }
    
    const historicalPrices = history.map(h => h.close);
    
    // Forecast data array (null values for historical part, links to end of history)
    const forecastPrices = Array(historicalPrices.length - 1).fill(null);
    forecastPrices.push(historicalPrices[historicalPrices.length - 1]);
    forecastPrices.push(...predictions);
    
    // Pad historical prices with nulls for the future forecast labels
    const paddedHistory = [...historicalPrices, ...Array(30).fill(null)];
    
    // Gradient shading
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Historical Price',
                    data: paddedHistory,
                    borderColor: '#6366f1',
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.15
                },
                {
                    label: '30-Day AI Forecast',
                    data: forecastPrices,
                    borderColor: '#a855f7',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#9ca3af',
                        font: { family: "'Inter', sans-serif", size: 12 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    titleColor: '#f3f4f6',
                    bodyColor: '#9ca3af',
                    titleFont: { weight: 'bold', family: "'Inter', sans-serif" },
                    bodyFont: { family: "'Inter', sans-serif" },
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += '₹' + context.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#6b7280', maxTicksLimit: 10 }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#6b7280',
                        callback: function(value) { return '₹' + value; }
                    }
                }
            }
        }
    });
}

// ----------------------------------------------------
// Market Table Watchlist Builder
// ----------------------------------------------------
function buildWatchlistTable() {
    const tableBody = document.getElementById('marketOverviewTableBody');
    tableBody.innerHTML = '';
    
    for (let sym in STOCK_DEFAULTS) {
        const details = STOCK_DEFAULTS[sym];
        const data = generateStockData(sym, 5); // Fetch last 5 days
        
        const current = data[data.length - 1].close;
        const prev = data[data.length - 2].close;
        const diff = current - prev;
        const pct = ((diff / prev) * 100).toFixed(2);
        const isUp = diff >= 0;
        
        const row = document.createElement('tr');
        row.onclick = () => changeTicker(sym);
        
        row.innerHTML = `
            <td>
                <span class="table-ticker-badge">${sym}</span>
                <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 0.5rem;">${details.name}</span>
            </td>
            <td style="font-weight: 600;">₹${current.toFixed(2)}</td>
            <td style="color: var(--text-secondary);">₹${prev.toFixed(2)}</td>
            <td class="${isUp ? 'trend-indicator up' : 'trend-indicator down'}">
                ${isUp ? '+' : ''}₹${diff.toFixed(2)}
            </td>
            <td class="${isUp ? 'trend-indicator up' : 'trend-indicator down'}">
                ${isUp ? '▲' : '▼'} ${Math.abs(pct)}%
            </td>
        `;
        
        tableBody.appendChild(row);
    }
}

// ----------------------------------------------------
// CSV Report Exporter
// ----------------------------------------------------
window.exportCSVReport = function() {
    let csvRows = [];
    csvRows.push(['Ticker', 'Company Name', 'Current Price (INR)', 'Yesterday Price (INR)', 'Day Change (INR)', 'Percentage Change']);
    
    for (let sym in STOCK_DEFAULTS) {
        const details = STOCK_DEFAULTS[sym];
        const data = generateStockData(sym, 5);
        
        const current = data[data.length - 1].close;
        const prev = data[data.length - 2].close;
        const diff = current - prev;
        const pct = ((diff / prev) * 100).toFixed(2);
        
        csvRows.push([
            sym,
            details.name,
            current.toFixed(2),
            prev.toFixed(2),
            diff.toFixed(2),
            `${pct}%`
        ]);
    }
    
    // Construct CSV String
    const csvContent = "data:text/csv;charset=utf-8," 
        + csvRows.map(e => e.map(val => `"${val.toString().replace(/"/g, '""')}"`).join(",")).join("\n");
        
    // Trigger download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Market_AI_Prediction_Report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Report CSV successfully downloaded!', 'success');
};

// ----------------------------------------------------
// Custom stock modal creation (Interactive WOW feature)
// ----------------------------------------------------
window.openCustomStockModal = function() {
    document.getElementById('customStockModal').style.display = 'flex';
};

window.closeCustomStockModal = function() {
    document.getElementById('customStockModal').style.display = 'none';
};

window.createCustomStock = function() {
    const symbol = document.getElementById('customSym').value.trim().toUpperCase();
    const name = document.getElementById('customName').value.trim();
    const basePrice = parseFloat(document.getElementById('customPrice').value);
    const trend = parseFloat(document.getElementById('customTrend').value);
    
    if (!symbol || !name || isNaN(basePrice) || isNaN(trend)) {
        showToast('Please fill out all fields with valid data.', 'error');
        return;
    }
    
    // Add custom stock to our global configuration list
    STOCK_DEFAULTS[symbol] = {
        name: name,
        basePrice: basePrice,
        drift: trend / 10000, // Scale drift to standard daily range
        volatility: 0.015,
        currency: 'INR'
    };
    
    // Add to HTML dropdown
    const select = document.getElementById('stockSelect');
    const opt = document.createElement('option');
    opt.value = symbol;
    opt.innerText = `[INR] ${name} (${symbol})`;
    select.appendChild(opt);
    
    // Rebuild tables
    buildWatchlistTable();
    closeCustomStockModal();
    changeTicker(symbol);
    showToast(`Custom stock ${symbol} successfully simulated!`, 'success');
};
