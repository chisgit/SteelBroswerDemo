#!/usr/bin/env python3
import os
from steel import Steel

api_key = os.getenv("STEEL_API_KEY")
if not api_key:
    print("ERROR: STEEL_API_KEY not set")
    exit(1)

client = Steel(api_key=api_key)

# Test basic session creation
try:
    print("Testing basic session creation...")
    session = client.sessions.create()
    print(f"✓ Session created: {session.id}")

    # Check what's in session object
    print(f"\nSession attributes: {dir(session)}")

    # Try to access solveCaptcha option
    print("\nTesting solveCaptcha option...")
    session2 = client.sessions.create(solveCaptcha=True)
    print(f"✓ solveCaptcha available: {session2.id}")

    # Test stealth config
    print("\nTesting stealthConfig...")
    session3 = client.sessions.create(stealthConfig={"useProxy": True})
    print(f"✓ stealthConfig available: {session3.id}")

    print("\n✓ All tested features available on this tier")

except Exception as e:
    print(f"✗ Error: {e}")
    print(f"  Type: {type(e).__name__}")
