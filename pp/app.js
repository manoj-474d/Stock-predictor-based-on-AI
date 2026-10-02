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

// ============================================================
// Live Yahoo Finance Stock Search (autocomplete)
// ============================================================
let searchDebounceTimer = null;
let currentSymbol = 'AAPL';
let currentSymbolName = 'Apple Inc.';

function initStockSearch() {
    const input   = document.getElementById('stockSearchInput');
    const sugBox  = document.getElementById('stockSuggestions');
    const spinner = document.getElementById('stockSearchSpinner');
    const hidden  = document.getElementById('stockSelect');
    const badge   = document.getElementById('selectedStockBadge');
    if (!input) return;

    // Set initial display
    input.value = 'Apple Inc. (AAPL)';
    badge.innerHTML = `<span style="color:var(--accent-primary)">📌 AAPL</span> — Apple Inc.`;

    input.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        const q = input.value.trim();
        if (q.length < 1) { sugBox.style.display = 'none'; return; }

        spinner.style.display = 'inline';
        searchDebounceTimer = setTimeout(async () => {
            try {
                const res  = await fetch(`/search-stocks?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                spinner.style.display = 'none';
                renderSuggestions(data.results || []);
            } catch(e) {
                spinner.style.display = 'none';
                sugBox.style.display = 'none';
            }
        }, 350); // 350ms debounce
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#stockSearchInput') && !e.target.closest('#stockSuggestions')) {
            sugBox.style.display = 'none';
        }
    });

    // Keyboard: Enter triggers analysis on current value
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sugBox.style.display = 'none';
            runAnalysis();
        }
    });

    function renderSuggestions(results) {
        sugBox.innerHTML = '';
        if (results.length === 0) {
            sugBox.innerHTML = `<div style="padding:0.75rem 1rem; color:var(--text-muted, #6b7280); font-size:0.85rem;">No results found. Try a ticker symbol (e.g. TSLA, INFY.NS)</div>`;
            sugBox.style.display = 'block';
            return;
        }
        results.forEach(r => {
            const item = document.createElement('div');
            item.style.cssText = 'padding:0.65rem 1rem; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.15s;';
            item.innerHTML = `
                <span style="font-weight:600; color:var(--accent-primary, #6366f1); font-size:0.9rem;">${r.symbol}</span>
                <span style="color:var(--text-secondary, #9ca3af); font-size:0.82rem; margin-left:0.5rem;">${r.name}</span>
                <span style="float:right; font-size:0.72rem; color:var(--text-muted, #6b7280); background:rgba(255,255,255,0.07); padding:0.1rem 0.4rem; border-radius:0.25rem;">${r.exchange}</span>
            `;
            item.addEventListener('mouseenter', () => item.style.background = 'rgba(99,102,241,0.12)');
            item.addEventListener('mouseleave', () => item.style.background = '');
            item.addEventListener('click', () => {
                currentSymbol     = r.symbol;
                currentSymbolName = r.name;
                hidden.value      = r.symbol;
                input.value       = `${r.name} (${r.symbol})`;
                badge.innerHTML   = `<span style="color:var(--accent-primary)">📌 ${r.symbol}</span> — ${r.name}`;
                sugBox.style.display = 'none';
                runAnalysis();
            });
            sugBox.appendChild(item);
        });
        sugBox.style.display = 'block';
    }
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

// ============================================================
// UI Flow & Session Management
// ============================================================
let chartInstance = null;
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
    
    // Initialize live stock search autocomplete
    initStockSearch();
    
    // Load real market watchlist from Yahoo Finance backend
    buildWatchlistTable();
    
    // Run initial analysis after a short delay so DOM is fully settled
    setTimeout(() => runAnalysis(), 800);
    
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
window.changeTicker = function(symbol, name) {
    currentSymbol     = symbol;
    currentSymbolName = name || symbol;
    // Update the search input and badge to reflect the clicked ticker
    const input = document.getElementById('stockSearchInput');
    const badge = document.getElementById('selectedStockBadge');
    const hidden = document.getElementById('stockSelect');
    if (input) input.value = `${currentSymbolName} (${symbol})`;
    if (badge) badge.innerHTML = `<span style="color:var(--accent-primary)">📌 ${symbol}</span> — ${currentSymbolName}`;
    if (hidden) hidden.value = symbol;
    runAnalysis();
};

window.runAnalysis = async function() {
    const pulseLoader    = document.getElementById('pulseLoader');
    const forecastResults = document.getElementById('forecastResults');
    
    pulseLoader.style.display = 'flex';
    forecastResults.style.opacity = '0.3';
    
    const symbol   = document.getElementById('stockSelect').value || currentSymbol;
    currentSymbol  = symbol;
    const daysBack = parseInt(document.getElementById('dateSelect').value) || 180;
    
    // Always fetch at least 365 days so the ML model has enough training data (needs ≥60 trading days).
    // The chart will only display the last `daysBack` days, but we train on the full year.
    const fetchDays = Math.max(daysBack, 365);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - fetchDays);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    try {
        const res  = await fetch('/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: symbol, start_date: startDateStr })
        });
        const data = await res.json();
        
        // Always hide loader first
        pulseLoader.style.display = 'none';
        forecastResults.style.opacity = '1';
        
        if (data.error) {
            showToast(`⚠️ ${data.error}`, 'error');
            return;
        }
        
        // Unpack response — slice to only show `daysBack` days on chart
        let prices = data.historical.prices;
        let dates  = data.historical.dates;
        if (prices.length > daysBack) {
            prices = prices.slice(prices.length - daysBack);
            dates  = dates.slice(dates.length  - daysBack);
        }
        const forecast     = data.forecast || [];
        const currentPrice = data.current_price;
        const predPrice    = data.predicted_price;
        
        const diff = predPrice - currentPrice;
        const pct  = ((diff / currentPrice) * 100).toFixed(2);
        const isUp = diff >= 0;
        
        // Set recommendation badge
        let badgeHTML = '';
        if (pct > 2.0)       badgeHTML = '<span class="badge-pill buy">BUY</span>';
        else if (pct < -2.0) badgeHTML = '<span class="badge-pill sell">SELL</span>';
        else                 badgeHTML = '<span class="badge-pill hold">HOLD</span>';
        
        // Render stat cards
        document.getElementById('cardPriceToday').innerText    = `₹${currentPrice.toFixed(2)}`;
        document.getElementById('cardPriceForecast').innerText = `₹${predPrice.toFixed(2)}`;
        document.getElementById('cardChangePrice').innerText   = `${isUp ? '+' : ''}₹${diff.toFixed(2)}`;
        
        const changeIndicator = document.getElementById('cardChangePercent');
        changeIndicator.className = `trend-indicator ${isUp ? 'up' : 'down'}`;
        changeIndicator.innerHTML = `${isUp ? '▲' : '▼'} ${Math.abs(pct)}%`;
        
        document.getElementById('cardRecommendation').innerHTML = badgeHTML;
        
        // Update simulator if elements exist
        const simSym = document.getElementById('simulatorSym');
        const simPrc = document.getElementById('simulatorPrice');
        const simOwn = document.getElementById('simulatorOwned');
        if (simSym) simSym.innerText = symbol;
        if (simPrc) simPrc.innerText = `₹${currentPrice.toFixed(2)}`;
        if (simOwn) simOwn.innerText = `${portfolio.stocks[symbol] || 0} Shares`;
        
        // Build chart history array from sliced data
        const history = dates.map((d, i) => ({ date: d, close: prices[i] }));
        renderChart(history, forecast);
        
        showToast(`📡 Live data loaded for ${symbol} from Yahoo Finance`, 'info');
        
    } catch(e) {
        pulseLoader.style.display = 'none';
        forecastResults.style.opacity = '1';
        showToast('❌ Network error: Could not connect to backend. Is Flask running?', 'error');
        console.error('runAnalysis error:', e);
    }
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

// ============================================================
// Market Table Watchlist Builder — fetches LIVE data from backend
// ============================================================
async function buildWatchlistTable() {
    const tableBody = document.getElementById('marketOverviewTableBody');
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-secondary);">⏳ Loading live market data from Yahoo Finance...</td></tr>`;
    
    try {
        const res  = await fetch('/market-overview');
        const data = await res.json();
        const stocks = data.stocks || [];
        
        tableBody.innerHTML = '';
        
        if (stocks.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No market data available.</td></tr>`;
            return;
        }
        
        stocks.forEach(s => {
            const current = s.current_price;
            const prev    = s.previous_close;
            const diff    = current - prev;
            const pct     = prev > 0 ? ((diff / prev) * 100).toFixed(2) : '0.00';
            const isUp    = diff >= 0;
            
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.onclick = () => changeTicker(s.ticker, s.name || s.ticker);
            
            row.innerHTML = `
                <td>
                    <span class="table-ticker-badge">${s.ticker}</span>
                    <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 0.5rem;">${s.name || ''}</span>
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
        });
    } catch(e) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#f87171;">❌ Failed to load market data. Is the backend running?</td></tr>`;
        console.error('buildWatchlistTable error:', e);
    }
}

// ============================================================
// CSV Report Exporter — uses live backend data from Yahoo Finance
// ============================================================
window.exportCSVReport = function() {
    showToast('Downloading live CSV report from Yahoo Finance...', 'info');
    // Trigger the server-side /download-stocks endpoint which uses yfinance
    const a = document.createElement('a');
    a.href = '/download-stocks';
    a.download = 'Market_AI_Prediction_Report.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('📥 CSV report downloaded!', 'success');
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
