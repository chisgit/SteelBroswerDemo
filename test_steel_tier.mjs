import { Steel } from 'steel-sdk';

const apiKey = process.env.STEEL_API_KEY;
if (!apiKey) {
  console.error('ERROR: STEEL_API_KEY not set');
  process.exit(1);
}

const client = new Steel({ apiKey });

try {
  console.log('Testing Steel tier features...\n');

  // Test basic session creation
  console.log('1. Basic session creation:');
  const session1 = await client.sessions.create();
  console.log(`   ✓ Session created: ${session1.id}`);

  // Test solveCaptcha
  console.log('\n2. Testing solveCaptcha (paid feature):');
  try {
    const session2 = await client.sessions.create({ solveCaptcha: true });
    console.log(`   ✓ solveCaptcha available: ${session2.id}`);
  } catch (e) {
    console.log(`   ✗ solveCaptcha not available: ${e.message}`);
  }

  // Test stealthConfig
  console.log('\n3. Testing stealthConfig (bot detection mitigation):');
  try {
    const session3 = await client.sessions.create({
      stealthConfig: { humanizeInteractions: true },
      useProxy: true,
    });
    console.log(`   ✓ stealthConfig available: ${session3.id}`);
  } catch (e) {
    console.log(`   ✗ stealthConfig not available: ${e.message}`);
  }

  console.log('\nDone.');
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
