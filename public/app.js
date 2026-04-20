document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('downloadForm');
  const btn = document.getElementById('downloadBtn');
  const btnText = btn.querySelector('.btn-text');
  const loader = btn.querySelector('.loader-icon');
  
  const statusCard = document.getElementById('statusCard');
  const statusTitle = document.getElementById('statusTitle');
  const statusBadge = document.getElementById('statusBadge');
  const progressFill = document.getElementById('progressFill');
  const progressSize = document.getElementById('progressSize');
  const progressTime = document.getElementById('progressTime');
  const consoleLog = document.getElementById('consoleLog');
  const stopBtn = document.getElementById('stopBtn');
  const saveFileBtn = document.getElementById('saveFileBtn');
  const downloadFileBtn = document.getElementById('downloadFileBtn');
  const recordNewBtn = document.getElementById('recordNewBtn');
  const recIndicator = document.getElementById('recIndicator');

  let currentEventSource = null;
  let currentTaskId = null;
  let videoPlayer = null;
  let recTimerInterval = null;
  let recStartTime = null;
  let isRecording = false;

  function startVideoPreview(taskId) {
    const videoContainer = document.getElementById('videoContainer');
    const videoElement = document.getElementById('previewVideo');
    videoContainer.style.display = 'block';

    if (typeof mpegts !== 'undefined' && mpegts.getFeatureList().mseLivePlayback) {
      if (videoPlayer) {
        videoPlayer.destroy();
      }
      videoPlayer = mpegts.createPlayer({
        type: 'flv',
        isLive: true,
        url: `/api/stream/${taskId}`,
        cors: true
      });
      videoPlayer.attachMediaElement(videoElement);
      videoPlayer.load();
      videoPlayer.play().catch(err => {
        console.warn('Auto-play blocked or failed:', err);
      });
    }
  }

  function stopVideoPreview() {
    const videoContainer = document.getElementById('videoContainer');
    videoContainer.style.display = 'none';
    if (videoPlayer) {
      videoPlayer.destroy();
      videoPlayer = null;
    }
  }

  // Global System Log Stream
  const logEventSource = new EventSource('/api/logs');
  logEventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      appendLog(data, false);
    } catch(err) {
      appendLog(e.data, false);
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const url = document.getElementById('url').value.trim();
    const format = document.getElementById('format').value;

    if (!url) return;

    // Reset UI
    btn.disabled = true;
    btnText.textContent = 'Connecting...';
    loader.style.display = 'block';
    
    statusCard.style.display = 'block';
    statusTitle.textContent = 'Initializing...';
    statusBadge.textContent = 'Starting';
    statusBadge.className = 'badge';
    progressFill.style.width = '0%';
    progressSize.textContent = '0 MB';
    progressTime.textContent = '00:00:00';
    consoleLog.textContent = 'System Log Ready.\n';
    saveFileBtn.style.display = 'none';
    downloadFileBtn.style.display = 'none';
    recordNewBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    stopBtn.textContent = 'Stop Download';

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url, format })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start download');
      }

      currentTaskId = data.id;
      connectSSE(currentTaskId);

    } catch (err) {
      handleError(err.message);
    }
  });

  stopBtn.addEventListener('click', async () => {
    if (currentTaskId) {
      stopBtn.disabled = true;
      stopBtn.textContent = 'Stopping...';
      try {
        await fetch(`/api/stop/${currentTaskId}`, { method: 'POST' });
        appendLog('Stop signal sent to server, waiting for video finalization...');
      } catch (err) {
        appendLog('Failed to send stop signal: ' + err.message);
      }
    }
  });

  function connectSSE(id) {
    if (currentEventSource) {
      currentEventSource.close();
    }

    appendLog(`Connecting to process output...`);
    currentEventSource = new EventSource(`/api/progress/${id}`);

    currentEventSource.addEventListener('start', (e) => {
      const data = JSON.parse(e.data);
      statusTitle.textContent = data.title || 'Downloading...';
      statusBadge.textContent = 'Connecting';
      btnText.textContent = 'Recording...';
      appendLog(`Started downloading: ${data.title}`);
      appendLog(`Output file: ${data.outputFile}`);
      startVideoPreview(id);
    });

    currentEventSource.addEventListener('progress', (e) => {
      const chunk = JSON.parse(e.data);
      appendLog(chunk, false);

      // Parse FFmpeg output
      // Example: size=    512kB time=00:00:02.10 bitrate=1991.6kbits/s speed=2.07x
      const sizeMatch = chunk.match(/size=\s*(\d+)kB/);
      const timeMatch = chunk.match(/time=(\d{2}:\d{2}:\d{2})/);

      if (sizeMatch) {
        const mb = (parseInt(sizeMatch[1]) / 1024).toFixed(2);
        progressSize.textContent = `${mb} MB`;
        const currentWidth = parseFloat(progressFill.style.width) || 0;
        progressFill.style.width = Math.min(currentWidth + 0.5, 95) + '%';

        // Show REC indicator on first real progress (FFmpeg is actually recording)
        if (!isRecording) {
          isRecording = true;
          recIndicator.style.display = 'inline-flex';
          statusBadge.textContent = 'Recording';
          statusBadge.className = 'badge';
          statusBadge.style.background = 'rgba(255, 68, 68, 0.2)';
          statusBadge.style.color = '#ff6b6b';
          startRecTimer();
        }
      }

      if (timeMatch) {
        progressTime.textContent = timeMatch[1];
      }
    });

    currentEventSource.addEventListener('end', (e) => {
      const data = JSON.parse(e.data);
      statusTitle.textContent = 'Download Complete!';
      statusBadge.textContent = 'Success';
      statusBadge.className = 'badge success';
      progressFill.style.width = '100%';
      appendLog(`✅ Finished! Video is safely saved. Click 'Download MP4' to save it to your device.`);
      
      const safeFile = data.outputFile.split('/').pop() || data.outputFile.split('\\').pop();
      const downloadUrl = `/api/download-file?file=${encodeURIComponent(safeFile)}`;

      // Show the big green button to open the folder
      saveFileBtn.style.display = 'flex';
      saveFileBtn.onclick = async () => {
        try {
          await fetch('/api/open-folder', { method: 'POST' });
          appendLog(`📂 Opening local recordings folder...`);
        } catch (err) {
          appendLog(`❌ Failed to open folder. Are you running on Cloud?`);
        }
      };

      // Show the download button for cloud users
      downloadFileBtn.style.display = 'flex';
      downloadFileBtn.onclick = () => {
        window.location.href = downloadUrl;
        appendLog(`📥 Downloading file via browser...`);
      };

      finishProcess();
    });

    currentEventSource.addEventListener('error', (e) => {
      handleError(e.data || 'An error occurred during download');
    });

    currentEventSource.onerror = () => {
      // Disconnected unexpectedly
      if (currentEventSource) {
        currentEventSource.close();
      }
    };
  }

  function appendLog(text, newLine = true) {
    if (newLine && consoleLog.textContent !== '') {
      consoleLog.textContent += '\n' + text;
    } else {
      consoleLog.textContent += text;
    }
    consoleLog.scrollTop = consoleLog.scrollHeight;
  }

  function handleError(msg) {
    statusBadge.textContent = 'Failed';
    statusBadge.className = 'badge error';
    appendLog(`\n❌ Error: ${msg}`);
    finishProcess();
  }

  function startRecTimer() {
    recStartTime = Date.now();
    recTimerInterval = setInterval(() => {
      const elapsed = Date.now() - recStartTime;
      const s = Math.floor(elapsed / 1000) % 60;
      const m = Math.floor(elapsed / 60000) % 60;
      const h = Math.floor(elapsed / 3600000);
      progressTime.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }, 1000);
  }

  function stopRecTimer() {
    if (recTimerInterval) {
      clearInterval(recTimerInterval);
      recTimerInterval = null;
    }
    recStartTime = null;
    isRecording = false;
  }

  function finishProcess() {
    if (currentEventSource) {
      currentEventSource.close();
      currentEventSource = null;
    }
    currentTaskId = null;
    stopVideoPreview();
    stopRecTimer();
    
    // Hide REC indicator
    recIndicator.style.display = 'none';
    statusBadge.style.background = '';
    statusBadge.style.color = '';
    
    // Reset Form buttons
    btn.disabled = false;
    btnText.textContent = 'Start Download';
    loader.style.display = 'none';
    
    // Hide Stop Button, show Record New Button
    stopBtn.style.display = 'none';
    recordNewBtn.style.display = 'block';
  }

  // Handle Record New Live button
  recordNewBtn.addEventListener('click', () => {
    // Reset back to initial state
    statusCard.style.display = 'none';
    document.getElementById('url').value = '';
    saveFileBtn.style.display = 'none';
    downloadFileBtn.style.display = 'none';
    recordNewBtn.style.display = 'none';
  });
});
