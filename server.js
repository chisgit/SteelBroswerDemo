const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // for parsing application/json

// Import the Netlify function handlers
const { handler: agentStepHandler } = require('./netlify/functions/agent-step.mjs');
const { handler: sessionCreateHandler } = require('./netlify/functions/session-create.mjs');
const { handler: sessionResumeHandler } = require('./netlify/functions/session-resume.mjs');
const { handler: fleetRunHandler } = require('./netlify/functions/fleet-run.mjs');
const { handler: healthHandler } = require('./netlify/functions/health.mjs');

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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;
