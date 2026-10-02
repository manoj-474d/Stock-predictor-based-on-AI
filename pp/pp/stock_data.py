# stock_data.py
import yfinance as yf
import pandas as pd
import io
import csv

# Cache for USD to INR conversion rate to avoid fetching every time
USD_INR_RATE = 83.0 # Fallback default

def get_usd_inr_rate():
    global USD_INR_RATE
    try:
        # Fetch live currency conversion rate
        ticker = yf.Ticker("USDINR=X")
        rate = ticker.fast_info['lastPrice']
        if rate:
            USD_INR_RATE = rate
    except:
        pass
    return USD_INR_RATE

# Predefined list of popular global and Indian stocks for the Market Overview
TOP_STOCKS = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA',
    'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'SBIN.NS','TECHM.NS', 'NOK','IOC.NS','KTKBANK.NS','INFOSYS.NS','TATASTEEL.NS','BHARTIARTL.NS','BAJFINANCE.NS','M&M.NS','ADANIENT.NS','MCD','NKE','PEP','KO','DIS','SBILIFE.NS','HDFC.NS','ICICIBANK.NS','AXISBANK.NS','LT.NS','WIPRO.NS','ASIANPAINT.NS','MARUTI.NS','ULTRACEMCO.NS','DIVISLAB.NS','HCLTECH.NS','MARUTI.NS','ULTRACEMCO.NS','KMSUGAR.NS',
    
]    
    



def fetch_historical_data(ticker, start_date="2026-01-01"):
    """Fetches historical stock data from start_date for predictions."""
    stock = yf.download(ticker, start=start_date, progress=False)
    
    if stock.empty:
        return None
        
    if isinstance(stock.columns, pd.MultiIndex):
        close_col = stock['Close'][ticker] if ticker in stock['Close'] else stock['Close'].iloc[:, 0]
        stock = pd.DataFrame({'Close': close_col})
    else:
        stock = stock[['Close']].copy()

    stock = stock.dropna()
    return stock

def fetch_market_overview():
    """Fetches 5 days of data for the market overview table."""
    results = []
    data = yf.download(TOP_STOCKS, period="5d", progress=False)
    rate = get_usd_inr_rate()
    
    for ticker in TOP_STOCKS:
        try:
            if isinstance(data.columns, pd.MultiIndex):
                 closes = data['Close'][ticker].dropna()
            else:
                 closes = data['Close'].dropna()
                 
            if len(closes) >= 2:
                current = float(closes.iloc[-1])
                prev = float(closes.iloc[-2])
                
                # Convert to INR if it is a US stock
                if not ticker.endswith('.NS') and not ticker.endswith('.BO'):
                    current = current * rate
                    prev = prev * rate
                    
                results.append({
                    'ticker': ticker,
                    'current_price': current,
                    'previous_close': prev
                })
            elif len(closes) == 1:
                current = float(closes.iloc[0])
                if not ticker.endswith('.NS') and not ticker.endswith('.BO'):
                    current = current * rate
                results.append({
                    'ticker': ticker,
                    'current_price': current,
                    'previous_close': current
                })
        except Exception:
            pass
            
    return results

def generate_csv_data():
    """Fetches the latest data and returns it as a CSV string object."""
    data = yf.download(TOP_STOCKS, period="5d", progress=False)
    
    si = io.StringIO()
    cw = csv.writer(si)
    cw.writerow(['Ticker', 'Current Price', 'Previous Close', 'Price Change', 'Percent Change'])
    
    rate = get_usd_inr_rate()
    
    for ticker in TOP_STOCKS:
        try:
            if isinstance(data.columns, pd.MultiIndex):
                 closes = data['Close'][ticker].dropna()
            else:
                 closes = data['Close'].dropna()
                 
            if len(closes) >= 2:
                current = float(closes.iloc[-1])
                prev = float(closes.iloc[-2])
                
                if not ticker.endswith('.NS') and not ticker.endswith('.BO'):
                    current = current * rate
                    prev = prev * rate
                    
                diff = current - prev
                pct = (diff / prev) * 100
                cw.writerow([ticker, f"₹{current:.2f}", f"₹{prev:.2f}", f"₹{diff:.2f}", f"{pct:.2f}%"])
        except Exception:
            pass
            
    return si.getvalue()
