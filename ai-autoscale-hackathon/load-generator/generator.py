#!/usr/bin/env python3
"""
Synthetic traffic generator for Kubernetes services.
Simulates normal traffic + periodic spikes.
Run locally: python3 generator.py
Run in cluster: use the k8s-manifests/load-generator-job.yaml
"""

import requests
import time
import sys
import random
from datetime import datetime

# Configuration — edit these to tune
SERVICES = ['http://app1', 'http://app2', 'http://app3']
BASE_RATE = 5       # requests per second during baseline
SPIKE_RATE = 100    # requests per second during spike
SPIKE_DURATION = 30 # seconds the spike lasts
SPIKE_INTERVAL = 300 # seconds between spikes (5 minutes)

def log(msg):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f"[{ts}] {msg}", flush=True)

def generate_traffic():
    """Main traffic generation loop."""
    request_count = 0
    error_count = 0
    
    log("🚀 Starting traffic generator...")
    log(f"   Base rate    : {BASE_RATE} req/s")
    log(f"   Spike rate   : {SPIKE_RATE} req/s")
    log(f"   Spike every  : {SPIKE_INTERVAL}s for {SPIKE_DURATION}s")
    log(f"   Targets      : {', '.join(SERVICES)}")

    start_time = time.time()
    
    try:
        while True:
            elapsed = time.time() - start_time
            time_in_cycle = elapsed % SPIKE_INTERVAL
            in_spike = time_in_cycle < SPIKE_DURATION
            
            current_rate = SPIKE_RATE if in_spike else BASE_RATE
            status_icon = "📈 SPIKE" if in_spike else "📊 NORMAL"
            
            for _ in range(current_rate):
                service = random.choice(SERVICES)
                try:
                    response = requests.get(service, timeout=1)
                    request_count += 1
                except Exception:
                    error_count += 1
            
            if request_count % 100 == 0 and request_count > 0:
                log(f"{status_icon} | Total: {request_count} | Errors: {error_count} | Rate: {current_rate} req/s")
            
            time.sleep(1)
    
    except KeyboardInterrupt:
        log(f"\n✓ Stopped. Total: {request_count} requests, {error_count} errors")
        sys.exit(0)

if __name__ == '__main__':
    generate_traffic()
