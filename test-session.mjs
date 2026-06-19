import Steel from 'steel-sdk';

const STEEL_API_KEY = process.env.STEEL_API_KEY;
console.log('[test] STEEL_API_KEY:', !!STEEL_API_KEY);

if (!STEEL_API_KEY) {
  console.error('STEEL_API_KEY not found');
  process.exit(1);
}

try {
  const steel = new Steel({ steelAPIKey: STEEL_API_KEY });
  console.log('Steel client created');

  const session = await steel.sessions.create({ solveCaptcha: true });
  console.log('Session created:', session.id);
  console.log('debugUrl:', session.debugUrl);

  // Release it
  await steel.sessions.release(session.id);
  console.log('Session released');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
