#!/usr/bin/env python3
"""
LSTM-based load predictor (Phase 4).
Predicts request rate 10 seconds in the future.
Falls back to linear regression if TensorFlow not available.

Usage: python3 load-predictor.py
"""

import numpy as np
import json
import pickle
import os
from datetime import datetime, timedelta
import requests
from sklearn.preprocessing import StandardScaler

TENSORFLOW_AVAILABLE = False
try:
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Dropout
    from tensorflow.keras.optimizers import Adam
    TENSORFLOW_AVAILABLE = True
    print("✓ TensorFlow available — will use LSTM")
except ImportError:
    from sklearn.linear_model import LinearRegression
    print("⚠️  TensorFlow not installed — will use linear regression fallback")

# ─── Configuration ────────────────────────────────────────────────────────────
PROMETHEUS_URL      = os.getenv('PROMETHEUS_URL', 'http://prometheus.monitoring:9090')
MODEL_PATH          = os.getenv('MODEL_PATH', '/tmp/load_predictor_model.pkl')
SCALER_PATH         = os.getenv('SCALER_PATH', '/tmp/load_predictor_scaler.pkl')
PREDICTION_HORIZON  = 10   # Predict 10 seconds ahead
LOOK_BACK_WINDOW    = 60   # Use last 60 seconds of data
# ──────────────────────────────────────────────────────────────────────────────


def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] {msg}", flush=True)


def query_prometheus_range(query: str, duration_seconds: int = 300) -> list:
    """Query Prometheus for time-series data."""
    try:
        end_time   = datetime.now()
        start_time = end_time - timedelta(seconds=duration_seconds)
        
        response = requests.get(
            f"{PROMETHEUS_URL}/api/v1/query_range",
            params={
                'query' : query,
                'start' : start_time.timestamp(),
                'end'   : end_time.timestamp(),
                'step'  : '1s'
            },
            timeout=10
        )
        response.raise_for_status()
        
        result = response.json()
        if result['data']['result']:
            return [float(val[1]) for val in result['data']['result'][0]['values']]
        return []
    except Exception as e:
        log(f"❌ Prometheus query failed: {e}")
        return []


def collect_training_data(duration_minutes: int = 5) -> np.ndarray:
    """Collect real metrics for training. Falls back to synthetic if not enough data."""
    log(f"📊 Collecting training data ({duration_minutes} min from Prometheus)...")
    
    query = 'rate(http_requests_total[1s])'
    data  = query_prometheus_range(query, duration_seconds=duration_minutes * 60)
    
    if len(data) < 100:
        log(f"⚠️  Only {len(data)} real data points — generating synthetic data...")
        # Synthetic series with realistic spikes
        data = []
        rng  = np.random.default_rng(42)
        for i in range(300):
            base = 50
            if i % 150 < 30:  # Spike every 2.5 min
                base = 200 + rng.normal(0, 20)
            data.append(base + rng.normal(0, 10))
    
    log(f"✓ Training data: {len(data)} points")
    return np.array(data)


def prepare_sequences(data: np.ndarray, look_back: int = 60) -> tuple:
    """Convert 1D time series into (X, y) sequences for LSTM."""
    X, y = [], []
    for i in range(len(data) - look_back - PREDICTION_HORIZON):
        X.append(data[i : i + look_back])
        y.append(data[i + look_back + PREDICTION_HORIZON])
    return np.array(X), np.array(y)


def train_lstm_model(X: np.ndarray, y: np.ndarray):
    """Train LSTM model."""
    log("🤖 Training LSTM model (this takes ~30s)...")
    X_3d = X.reshape(X.shape[0], X.shape[1], 1)
    
    model = Sequential([
        LSTM(32, activation='relu', input_shape=(X.shape[1], 1), return_sequences=True),
        Dropout(0.2),
        LSTM(16, activation='relu'),
        Dropout(0.2),
        Dense(8, activation='relu'),
        Dense(1)
    ])
    model.compile(optimizer=Adam(learning_rate=0.001), loss='mse')
    model.fit(X_3d, y, epochs=50, batch_size=16, verbose=0)
    log("✓ LSTM trained successfully")
    return model


def train_linear_fallback(X: np.ndarray, y: np.ndarray):
    """Fallback: linear regression (trains in <1s)."""
    log("📈 Training linear regression fallback...")
    X_flat = X.reshape(X.shape[0], -1)
    model  = LinearRegression()
    model.fit(X_flat, y)
    log("✓ Linear regression model trained")
    return model


def train_model():
    """Main training entrypoint. Saves model + scaler to disk."""
    try:
        data = collect_training_data(duration_minutes=5)
        
        scaler      = StandardScaler()
        data_scaled = scaler.fit_transform(data.reshape(-1, 1)).flatten()
        
        X, y = prepare_sequences(data_scaled, look_back=LOOK_BACK_WINDOW)
        
        if len(X) < 10:
            log("⚠️  Not enough data to train. Exiting.")
            return
        
        if TENSORFLOW_AVAILABLE:
            try:
                model = train_lstm_model(X, y)
            except Exception as e:
                log(f"⚠️  LSTM failed ({e}), falling back to linear regression")
                model = train_linear_fallback(X, y)
        else:
            model = train_linear_fallback(X, y)
        
        with open(MODEL_PATH, 'wb') as f:
            pickle.dump(model, f)
        with open(SCALER_PATH, 'wb') as f:
            pickle.dump(scaler, f)
        
        log(f"✓ Model saved → {MODEL_PATH}")
        log(f"✓ Scaler saved → {SCALER_PATH}")
    
    except Exception as e:
        log(f"❌ Training failed: {e}")
        raise


def predict_load(look_back_data: np.ndarray) -> float:
    """Load saved model and predict load 10 seconds ahead."""
    try:
        with open(MODEL_PATH, 'rb') as f:
            model = pickle.load(f)
        with open(SCALER_PATH, 'rb') as f:
            scaler = pickle.load(f)

        data_scaled = scaler.transform(look_back_data.reshape(-1, 1)).flatten()
        
        look_back = LOOK_BACK_WINDOW
        if len(data_scaled) >= look_back:
            X_input = data_scaled[-look_back:]
        else:
            X_input = np.pad(data_scaled, (look_back - len(data_scaled), 0), 'constant')
        
        if TENSORFLOW_AVAILABLE and hasattr(model, 'predict'):
            X_input_3d       = X_input.reshape(1, -1, 1)
            prediction_scaled = model.predict(X_input_3d, verbose=0)[0][0]
        else:
            X_input_flat      = X_input.reshape(1, -1)
            prediction_scaled = model.predict(X_input_flat)[0]
        
        prediction = scaler.inverse_transform([[prediction_scaled]])[0][0]
        return max(0.0, float(prediction))
    
    except Exception as e:
        log(f"❌ Prediction failed: {e}")
        return 0.0


if __name__ == '__main__':
    train_model()
