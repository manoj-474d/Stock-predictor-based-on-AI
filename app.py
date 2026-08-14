from flask import Flask, send_from_directory, request, jsonify, make_response
import threading
import webbrowser
import json
import datetime

# Import our custom modules
from stock_data import fetch_historical_data, fetch_market_overview, generate_csv_data, get_usd_inr_rate
from model import train_and_predict

import os
app = Flask(__name__)
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
    with open(VISITS_FILE, 'w') as f:
        json.dump(visits, f, indent=2)

@app.route('/')
def index():
    return send_from_directory(ROOT_DIR, 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(ROOT_DIR, filename)

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

@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    ticker = data.get('ticker', 'AAPL')
    start_date = data.get('start_date', '2026-01-01')
    
    try:
        # 1. Get Live Historical Data
        stock = fetch_historical_data(ticker, start_date=start_date)
        
        if stock is None or stock.empty:
            return jsonify({'error': 'No data found for this ticker.'}), 404
            
        if len(stock) < 60:
             return jsonify({'error': 'Not enough historical data to predict.'}), 400

        # 2. Get Machine Learning Prediction
        predicted_price = train_and_predict(stock, forecast_out=30)
        
        current_price = float(stock['Close'].iloc[-1])
        
        # 3. Format Data for the UI Chart
        recent_data = stock
        dates = [d.strftime('%Y-%m-%d') for d in recent_data.index]
        prices = [float(p) for p in recent_data['Close'].values]
        
        # Currency Conversion: If it's a US stock, convert everything to INR
        if not ticker.endswith('.NS') and not ticker.endswith('.BO'):
            rate = get_usd_inr_rate()
            predicted_price *= rate
            current_price *= rate
            prices = [p * rate for p in prices]
            
        return jsonify({
            'historical': {
                'dates': dates,
                'prices': prices
            },
            'current_price': current_price,
            'predicted_price': predicted_price
        })
        
    except Exception as e:
        return jsonify({'error': f"Server error: {str(e)}"}), 500

if __name__ == '__main__':
    print("=========================================================")
    print("Starting AI Stock Prediction Dashboard")
    print("Access your dashboard at http://127.0.0.1:5000")
    print("=========================================================")
    
    def open_browser():
        webbrowser.open_new("http://127.0.0.1:5000")
        
    # Start the browser automatically
    threading.Timer(1.5, open_browser).start()
    
    app.run(debug=True, port=5000)
