from flask import Flask, render_template, request, jsonify, make_response
import json
import datetime
import yfinance as yf

# Import our custom modules
from stock_data import fetch_historical_data, fetch_market_overview, generate_csv_data, get_usd_inr_rate
from model import train_and_predict

import os
app = Flask(__name__, template_folder='templates', static_folder='static')
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
VISITS_FILE = os.path.join(ROOT_DIR, 'visits.json')

def load_visits():
    if os.path.exists(VISITS_FILE):
        try:
            with open(VISITS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return []

def save_visits(visits):
    try:
        with open(VISITS_FILE, 'w') as f:
            json.dump(visits, f, indent=2)
    except OSError:
        # On Render's ephemeral filesystem writes may fail — ignore silently
        pass

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/log-visit', methods=['POST'])
def log_visit():
    """Called by the frontend JS on every page load to record visitor info."""
    try:
        data = request.json or {}
        # Get the real IP (works behind proxies too)
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        if ',' in ip:
            ip = ip.split(',')[0].strip()

        ua = request.headers.get('User-Agent', 'Unknown')

        # Detect browser from UA
        browser = 'Other'
        if 'Firefox' in ua:   browser = 'Firefox'
        elif 'Edg' in ua:     browser = 'Edge'
        elif 'OPR' in ua:     browser = 'Opera'
        elif 'Chrome' in ua:  browser = 'Chrome'
        elif 'Safari' in ua:  browser = 'Safari'

        # Detect OS
        platform = 'Other'
        if 'Windows' in ua:   platform = 'Windows'
        elif 'Android' in ua: platform = 'Android'
        elif 'iPhone' in ua:  platform = 'iPhone'
        elif 'Mac' in ua:     platform = 'Mac'
        elif 'Linux' in ua:   platform = 'Linux'

        now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        visit = {
            'ip': ip,
            'browser': browser,
            'platform': platform,
            'page': data.get('page', '/'),
            'username': data.get('username', 'Guest'),
            'time': now
        }

        visits = load_visits()
        visits.insert(0, visit)
        if len(visits) > 200:
            visits = visits[:200]
        save_visits(visits)

        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get-visits')
def get_visits():
    """Admin endpoint to fetch all recorded visits."""
    return jsonify({'visits': load_visits()})

@app.route('/clear-visits', methods=['POST'])
def clear_visits():
    """Admin endpoint to wipe all visit logs."""
    save_visits([])
    return jsonify({'status': 'cleared'})

@app.route('/market-overview')
def market_overview():
    try:
        stocks = fetch_market_overview()
        return jsonify({'stocks': stocks})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download-stocks')
def download_stocks():
    try:
        csv_string = generate_csv_data()
        output = make_response(csv_string)
        output.headers["Content-Disposition"] = "attachment; filename=market_data_all_companies.csv"
        output.headers["Content-type"] = "text/csv"
        return output
    except Exception as e:
        return f"Error assembling CSV: {str(e)}", 500

@app.route('/search-stocks')
def search_stocks():
    """Search Yahoo Finance for ticker symbols matching a query string."""
    query = request.args.get('q', '').strip()
    if not query or len(query) < 1:
        return jsonify({'results': []})
    try:
        search = yf.Search(query, max_results=8)
        quotes = search.quotes if hasattr(search, 'quotes') else []
        results = []
        for q in quotes:
            symbol = q.get('symbol', '')
            name   = q.get('longname') or q.get('shortname') or symbol
            exch   = q.get('exchange', '')
            qtype  = q.get('quoteType', '')
            if symbol and qtype in ('EQUITY', 'ETF', 'INDEX'):
                results.append({'symbol': symbol, 'name': name, 'exchange': exch})
        return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e), 'results': []}), 200


@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    ticker = data.get('ticker', 'AAPL')
    start_date = data.get('start_date', '2025-01-01')
    
    try:
        # 1. Get Live Historical Data
        stock = fetch_historical_data(ticker, start_date=start_date)
        
        if stock is None or stock.empty:
            return jsonify({'error': 'No data found for this ticker.'}), 404
            
        if len(stock) < 60:
             return jsonify({'error': 'Not enough historical data to predict (need ≥60 days).'}), 400

        # 2. Get Machine Learning Prediction — single final predicted price
        predicted_price = train_and_predict(stock, forecast_out=30)
        
        current_price = float(stock['Close'].iloc[-1])
        
        # 3. Build a simple linear forecast array (30 points) for chart rendering
        import numpy as np
        closes = stock['Close'].values.astype(float)
        n = len(closes)
        forecast_out = 30
        # OLS on indices
        x = np.arange(n - forecast_out, n)
        y = closes[n - forecast_out:]
        slope = float(np.polyfit(x, y, 1)[0])
        forecast_indices = np.arange(n, n + forecast_out)
        forecast_array = [float(closes[-1] + slope * i) for i in range(1, forecast_out + 1)]
        # Anchor the first prediction to current price so chart connects seamlessly
        forecast_array = [float(current_price)] + forecast_array[:-1]

        # 4. Format Data for the UI Chart
        dates = [d.strftime('%Y-%m-%d') for d in stock.index]
        prices = [float(p) for p in closes]
        
        # Currency Conversion: If it's a US stock, convert everything to INR
        rate = 1.0
        if not ticker.endswith('.NS') and not ticker.endswith('.BO'):
            rate = get_usd_inr_rate()
            predicted_price *= rate
            current_price *= rate
            prices = [p * rate for p in prices]
            forecast_array = [p * rate for p in forecast_array]

        # Get company name from yfinance info
        try:
            info = yf.Ticker(ticker).fast_info
            company_name = ticker  # fallback
        except:
            company_name = ticker
            
        return jsonify({
            'historical': {
                'dates': dates,
                'prices': prices
            },
            'forecast': forecast_array,
            'current_price': current_price,
            'predicted_price': predicted_price,
            'ticker': ticker
        })
        
    except Exception as e:
        return jsonify({'error': f"Server error: {str(e)}"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("=========================================================")
    print(f"Starting AI Stock Prediction Dashboard on port {port}")
    print("=========================================================")
    app.run(debug=False, host='0.0.0.0', port=port)