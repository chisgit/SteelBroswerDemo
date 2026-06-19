import { Steel } from 'steel-sdk';

const apiKey = process.env.STEEL_API_KEY;
if (!apiKey) {
  console.error('ERROR: STEEL_API_KEY not set');
  process.exit(1);
}

const client = new Steel({ steelAPIKey: apiKey });
const createdSessions = [];

try {
  console.log('Testing Steel tier features...\n');

  console.log('1. Basic session creation:');
  const session1 = await client.sessions.create();
  createdSessions.push(session1.id);
  console.log(`   ✓ Session created: ${session1.id}`);

  console.log('\n2. Testing solveCaptcha (paid feature):');
  try {
    const session2 = await client.sessions.create({ solveCaptcha: true });
    createdSessions.push(session2.id);
    console.log(`   ✓ solveCaptcha available: ${session2.id}`);
  } catch (e) {
    console.log(`   ✗ solveCaptcha not available: ${e.message}`);
  }

  console.log('\n3. Testing stealthConfig (bot detection mitigation):');
  try {
    const session3 = await client.sessions.create({
      stealthConfig: { humanizeInteractions: true },
      useProxy: true,
    });
    createdSessions.push(session3.id);
    console.log(`   ✓ stealthConfig available: ${session3.id}`);
  } catch (e) {
    console.log(`   ✗ stealthConfig not available: ${e.message}`);
  }

  console.log('\nDone.');
} catch (error) {
  console.error('Error:', error);
} finally {
  if (createdSessions.length > 0) {
    console.log(`\nReleasing ${createdSessions.length} test session(s)...`);
    for (const id of createdSessions) {
      try {
        await client.sessions.release(id);
        console.log(`   Released: ${id}`);
      } catch (e) {
        console.log(`   Failed to release ${id}: ${e.message}`);
      }
    }
  }
}
