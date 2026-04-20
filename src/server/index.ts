import express from 'express';
import path from 'path';
import { downloadLiveStream } from '@app-core/downloadLiveStream';
import { v4 as uuidv4 } from 'crypto';

// Use a simple counter or random string if crypto is not easily available, but let's just use Math.random
const generateId = () => Math.random().toString(36).substring(2, 15);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // build/server.js will be in build/ folder, public is root/public
app.use('/downloads', express.static(path.join(__dirname, '../downloads'))); // serve downloads directory

// Endpoint to force browser download (legacy)
app.get('/api/download-file', (req, res) => {
  const file = req.query.file as string;
  if (!file) return res.status(400).send('No file specified');
  
  // Prevent directory traversal
  const safeFile = path.basename(file.replace(/\\/g, '/'));
  const filePath = path.join(__dirname, '../downloads', safeFile);
  
  res.download(filePath, safeFile, (err) => {
    if (err) {
      if (!res.headersSent) res.status(404).send('File not found');
    }
  });
});

import { exec } from 'child_process';

// Endpoint to open the downloads folder directly in Windows Explorer (like OBS)
app.post('/api/open-folder', (req, res) => {
  const downloadPath = path.resolve(__dirname, '../downloads');
  // On Windows, 'explorer' opens the folder
  exec(`start "" "${downloadPath}"`, (err) => {
    if (err) {
      console.error('Failed to open folder:', err);
      return res.status(500).json({ error: 'Failed to open folder' });
    }
    res.json({ success: true });
  });
});

const logClients: any[] = [];
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

process.stdout.write = (chunk: any, encoding?: any, cb?: any): boolean => {
  const text = chunk.toString();
  logClients.forEach(c => c.write(`data: ${JSON.stringify(text)}\n\n`));
  return originalStdoutWrite(chunk, encoding, cb);
};

process.stderr.write = (chunk: any, encoding?: any, cb?: any): boolean => {
  const text = chunk.toString();
  logClients.forEach(c => c.write(`data: ${JSON.stringify(text)}\n\n`));
  return originalStderrWrite(chunk, encoding, cb);
};

app.get('/api/logs', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  logClients.push(res);
  req.on('close', () => {
    const idx = logClients.indexOf(res);
    if (idx !== -1) logClients.splice(idx, 1);
  });
});

const tasks = new Map();

app.post('/api/download', (req, res) => {
  const { url, format } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL or username is required' });
  }

  const outputFormat = format === 'mkv' ? 'mkv' : 'mp4';
  const taskId = generateId();
  
  // Store task info
  tasks.set(taskId, {
    url,
    format: outputFormat,
    status: 'initializing',
    emitter: null,
    clients: [],
    history: []
  });

  res.json({ id: taskId });

  // Start the download process
  try {
    const emitter = downloadLiveStream(url, 'downloads', outputFormat);
    const task = tasks.get(taskId);
    if (task) {
      task.emitter = emitter;
      
      emitter.on('start', (data) => {
        task.streamData = data;
        broadcast(taskId, 'start', data);
      });
      emitter.on('progress', (chunk) => broadcast(taskId, 'progress', chunk));
      emitter.on('end', (data) => broadcast(taskId, 'end', data));
      emitter.on('error', (err) => broadcast(taskId, 'error', err.message || 'Unknown error'));
    }
  } catch (err: any) {
    broadcast(taskId, 'error', err.message || 'Failed to start download');
  }
});

app.get('/api/progress/:id', (req, res) => {
  const { id } = req.params;
  const task = tasks.get(id);

  if (!task) {
    return res.status(404).send('Task not found');
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // Send initial connected message
  res.write(`data: ${JSON.stringify('Connected to SSE')}\n\n`);

  // Send history
  task.history.forEach((msg: string) => res.write(msg));

  // Add this client to the task
  task.clients.push(res);

  req.on('close', () => {
    task.clients = task.clients.filter((client: any) => client !== res);
  });
});

import https from 'https';

app.get('/api/stream/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = tasks.get(taskId);

  if (!task || !task.streamData || !task.streamData.url) {
    return res.status(404).end('Stream not found');
  }

  const streamUrl = task.streamData.url;
  
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
      'Referer': 'https://www.tiktok.com/'
    }
  };

  https.get(streamUrl, options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, {
      'Content-Type': 'video/x-flv',
      'Access-Control-Allow-Origin': '*',
      'Transfer-Encoding': 'chunked'
    });
    proxyRes.pipe(res);
  }).on('error', (e) => {
    console.error('Stream proxy error:', e);
    res.status(500).end();
  });
});

// Endpoint to gracefully stop FFmpeg
app.post('/api/stop/:id', (req, res) => {
  const { id } = req.params;
  const task = tasks.get(id);
  
  if (task && task.emitter) {
    task.emitter.emit('stop');
    res.json({ success: true, message: 'Stop signal sent' });
  } else {
    res.status(404).json({ error: 'Task not found or not running' });
  }
});

function broadcast(taskId: string, eventName: string, data: any) {
  const task = tasks.get(taskId);
  if (!task) return;

  const message = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  task.history.push(message);

  task.clients.forEach((client: any) => {
    client.write(message);
  });
  
  if (eventName === 'end' || eventName === 'error') {
    // Cleanup clients after a short delay
    setTimeout(() => {
      task.clients.forEach((client: any) => client.end());
      tasks.delete(taskId);
    }, 5000);
  }
}

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`🚀 Web UI is running on http://localhost:${PORT}`);
  console.log(`========================================\n`);
});
