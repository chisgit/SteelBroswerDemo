#!/usr/bin/env python3
import os
import subprocess
import json

# Check env vars
steel_key = os.getenv('STEEL_API_KEY')
gemini_key = os.getenv('GEMINI_API_KEY')

print(f"STEEL_API_KEY present: {bool(steel_key)}")
print(f"GEMINI_API_KEY present: {bool(gemini_key)}")

if not steel_key or not gemini_key:
    print("\n❌ Keys not set. Setting now...")
    os.environ['STEEL_API_KEY'] = 'STEEL_API_KEY_REMOVED'
    os.environ['GEMINI_API_KEY'] = 'GEMINI_API_KEY_REMOVED'
    steel_key = os.environ['STEEL_API_KEY']
    gemini_key = os.environ['GEMINI_API_KEY']
    print(f"✓ Keys set")

# Test with Node.js
print("\n--- Testing Steel session creation with Node ---")
test_script = """
import Steel from 'steel-sdk';

const STEEL_API_KEY = process.env.STEEL_API_KEY;
console.log('[test] STEEL_API_KEY:', !!STEEL_API_KEY);

if (!STEEL_API_KEY) {
  console.error('❌ STEEL_API_KEY not found');
  process.exit(1);
}

try {
  const steel = new Steel({ steelAPIKey: STEEL_API_KEY });
  console.log('✓ Steel client created');

  const session = await steel.sessions.create({ solveCaptcha: true });
  console.log('✓ Session created:', session.id);
  console.log('  debugUrl:', session.debugUrl);

  // Release it
  await steel.sessions.release(session.id);
  console.log('✓ Session released');
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}
"""

# Write test file
with open('c:\\Users\\User\\SteelBroswerDemo\\test-session.mjs', 'w') as f:
    f.write(test_script)

# Run it with env vars
env = os.environ.copy()
env['STEEL_API_KEY'] = steel_key
env['GEMINI_API_KEY'] = gemini_key

result = subprocess.run(
    ['node', 'test-session.mjs'],
    cwd='c:\\Users\\User\\SteelBroswerDemo',
    env=env,
    capture_output=True,
    text=True
)

print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)

if result.returncode != 0:
    print(f"\n❌ Test failed with exit code {result.returncode}")
else:
    print("\n✓ Session test passed!")
