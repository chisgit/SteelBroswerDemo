#!/usr/bin/env python3
"""Quick test: load Steel API key from .env and hit an endpoint."""

import os
import requests

env_path = os.path.join(os.path.dirname(__file__), ".env")
with open(env_path) as f:
    for line in f:
        line = line.strip()
        if line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        if key == "STEEL_API_KEY":
            os.environ[key] = val
            break

api_key = os.environ.get("STEEL_API_KEY")
if not api_key:
    print("ERROR: STEEL_API_KEY not found in .env")
    exit(1)

print(f"Key prefix: {api_key[:8]}...")

headers = {"steel-api-key": api_key}

# Test /v1/details (lightweight plan check)
url = "https://api.steel.dev/v1/details"
print(f"GET {url} ...")
try:
    resp = requests.get(url, headers=headers, timeout=30)
    print(f"  Status: {resp.status_code}")
    print(f"  Response: {resp.json()}")
    if resp.status_code == 200:
        print("OK — API key is valid.")
    else:
        exit(1)
except Exception as e:
    print(f"  Error: {e}")
    exit(1)

# Test session creation
url2 = "https://api.steel.dev/v1/sessions"
print(f"\nPOST {url2} ...")
try:
    resp = requests.post(url2, headers=headers, json={}, timeout=60)
    print(f"  Status: {resp.status_code}")
    print(f"  Response: {resp.json()}")
    if resp.status_code in (200, 201):
        print("OK — Session created.")
    else:
        print("Session creation failed (may be transient).")
except Exception as e:
    print(f"  Error: {e}")