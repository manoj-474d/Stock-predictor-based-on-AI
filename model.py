# model.py
import numpy as np
from sklearn.linear_model import LinearRegression

def train_and_predict(stock_data, forecast_out=30):
    """
    Trains a Linear Regression model to predict future stock prices.
    
    Args:
        stock_data: DataFrame containing historical stock data with a 'Close' column.
        forecast_out: Number of days to forecast into the future.
        
    Returns:
        float: The predicted price `forecast_out` days into the future.
    """
    # Create the Label column shifted 'n' units up
    stock_df = stock_data.copy()
    stock_df['Prediction'] = stock_df[['Close']].shift(-forecast_out)
    
    # X array: Drop the prediction column and grab everything except the last 'forecast_out' rows
    X = np.array(stock_df.drop(['Prediction'], axis=1))[:-forecast_out]
    
    # y array: Get the prediction column and grab everything except the last 'forecast_out' rows
    y = np.array(stock_df['Prediction'])[:-forecast_out]
    
    # Train the Linear Regression Model
    model = LinearRegression()
    model.fit(X, y)
    
    # Predict the Future Price
    # Get the last 'forecast_out' rows of the original dataset to predict the future
    X_forecast = np.array(stock_df.drop(['Prediction'], axis=1))[-forecast_out:]
    
    # Predict
    forecast_prediction = model.predict(X_forecast)
    
    # Return the ultimate predicted price
    return float(forecast_prediction[-1])
