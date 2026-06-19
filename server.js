import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { handler as agentStepHandler } from './netlify/functions/agent-step.mjs';
import { handler as sessionCreateHandler } from './netlify/functions/session-create.mjs';
import { handler as sessionResumeHandler } from './netlify/functions/session-resume.mjs';
import { handler as fleetRunHandler } from './netlify/functions/fleet-run.mjs';
import { handler as healthHandler } from './netlify/functions/health.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // for parsing application/json

// API routes - mirroring Netlify functions
app.post('/api/session-create', async (req, res) => {
  try {
    const result = await sessionCreateHandler({ body: JSON.stringify(req.body) });
    res.status(result.statusCode || 200).set(result.headers || {}).send(result.body);
  } catch (error) {
    console.error('Session create error:', error);
    res.status(500).send({ error: 'Internal server error' });
  }
});

app.post('/api/session-resume', async (req, res) => {
  try {
    const result = await sessionResumeHandler({ body: JSON.stringify(req.body) });
    res.status(result.statusCode || 200).set(result.headers || {}).send(result.body);
  } catch (error) {
    console.error('Session resume error:', error);
    res.status(500).send({ error: 'Internal server error' });
  }
});

app.post('/api/agent-step', async (req, res) => {
  try {
    const result = await agentStepHandler({ body: JSON.stringify(req.body) });
    res.status(result.statusCode || 200).set(result.headers || {}).send(result.body);
  } catch (error) {
    console.error('Agent step error:', error);
    res.status(500).send({ error: 'Internal server error' });
  }
});

app.post('/api/fleet-run', async (req, res) => {
  try {
    const result = await fleetRunHandler({ body: JSON.stringify(req.body) });
    res.status(result.statusCode || 200).set(result.headers || {}).send(result.body);
  } catch (error) {
    console.error('Fleet run error:', error);
    res.status(500).send({ error: 'Internal server error' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    const result = await healthHandler({});
    res.status(result.statusCode || 200).set(result.headers || {}).send(result.body);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).send({ error: 'Internal server error' });
  }
});

// Serve frontend for all other routes (for client-side routing)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});

export default app;
