(() => {
  'use strict';

  // ---------- State ----------
  const state = {
    chantierName: '',
    photos: [], // {id, dataUrl, repere, timestamp}
    nextId: 1,
  };

  const capture = {
    rawDataUrl: null,
    repere: '',
    timestamp: null,
  };

  const annotate = {
    img: null,
    annotations: [], // {type:'arrow',x1,y1,x2,y2} | {type:'text',x,y,text}
    tool: 'arrow',
    canvas: null,
    ctx: null,
    drawing: false,
    startX: 0,
    startY: 0,
    activeTextInput: null,
  };

  let pendingPdfBlob = null;
  let pendingPdfFilename = '';

  // ---------- Utilities ----------
  const $ = (id) => document.getElementById(id);

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $(id).classList.add('active');
  }

  function toast(msg, ms = 2200) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function formatDateTime(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // ---------- Screen 1: Start ----------
  const inputChantierName = $('input-chantier-name');
  const btnStart = $('btn-start');

  inputChantierName.addEventListener('input', () => {
    btnStart.disabled = inputChantierName.value.trim().length === 0;
  });

  btnStart.addEventListener('click', () => {
    state.chantierName = inputChantierName.value.trim();
    if (!state.chantierName) return;
    $('capture-chantier-label').textContent = state.chantierName;
    goToCaptureScreen();
  });

  // ---------- Screen 2: Capture ----------
  const inputCamera = $('input-camera');
  const btnTakePhoto = $('btn-take-photo');
  const btnRetake = $('btn-retake');
  const btnGotoAnnotate = $('btn-goto-annotate');
  const btnGotoRecap = $('btn-goto-recap');
  const captureEmpty = $('capture-empty');
  const capturePreview = $('capture-preview');
  const capturePreviewImg = $('capture-preview-img');
  const inputRepere = $('input-repere');

  function goToCaptureScreen() {
    capture.rawDataUrl = null;
    inputRepere.value = '';
    captureEmpty.classList.remove('hidden');
    capturePreview.classList.add('hidden');
    updateCaptureCounters();
    showScreen('screen-capture');
  }

  function updateCaptureCounters() {
    $('capture-count').textContent = state.photos.length;
    $('capture-count-2').textContent = state.photos.length;
    btnGotoRecap.disabled = state.photos.length === 0;
  }

  btnTakePhoto.addEventListener('click', () => {
    inputCamera.value = '';
    inputCamera.click();
  });

  inputCamera.addEventListener('change', async () => {
    const file = inputCamera.files && inputCamera.files[0];
    if (!file) return;
    try {
      capture.rawDataUrl = await fileToDataUrl(file);
      capture.timestamp = new Date();
      capturePreviewImg.src = capture.rawDataUrl;
      captureEmpty.classList.add('hidden');
      capturePreview.classList.remove('hidden');
    } catch (e) {
      toast('Erreur lors de la lecture de la photo');
    }
  });

  btnRetake.addEventListener('click', () => {
    capture.rawDataUrl = null;
    captureEmpty.classList.remove('hidden');
    capturePreview.classList.add('hidden');
  });

  btnGotoAnnotate.addEventListener('click', async () => {
    if (!capture.rawDataUrl) return;
    capture.repere = inputRepere.value.trim();
    await openAnnotateScreen(capture.rawDataUrl);
  });

  btnGotoRecap.addEventListener('click', () => {
    renderRecap();
    showScreen('screen-recap');
  });

  $('btn-add-more').addEventListener('click', goToCaptureScreen);

  // ---------- Screen 3: Annotate ----------
  const canvas = $('annotate-canvas');
  const ctx = canvas.getContext('2d');
  annotate.canvas = canvas;
  annotate.ctx = ctx;

  async function openAnnotateScreen(src) {
    annotate.img = await loadImage(src);
    annotate.annotations = [];
    showScreen('screen-annotate');
    setupCanvasSize();
    redrawCanvas();
  }

  function setupCanvasSize() {
    const img = annotate.img;
    // Cap internal resolution to keep PDF/memory reasonable
    const MAX_DIM = 1600;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    if (Math.max(w, h) > MAX_DIM) {
      const scale = MAX_DIM / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    canvas.width = w;
    canvas.height = h;

    // fit canvas CSS size within wrapper while preserving aspect ratio
    const wrap = canvas.parentElement;
    const wrapRect = wrap.getBoundingClientRect();
    const ratio = Math.min(wrapRect.width / w, wrapRect.height / h);
    canvas.style.width = Math.floor(w * ratio) + 'px';
    canvas.style.height = Math.floor(h * ratio) + 'px';
  }

  function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(annotate.img, 0, 0, canvas.width, canvas.height);
    annotate.annotations.forEach(drawAnnotation);
  }

  function drawAnnotation(a) {
    if (a.type === 'arrow') {
      drawArrow(a.x1, a.y1, a.x2, a.y2);
    } else if (a.type === 'text') {
      drawText(a.x, a.y, a.text);
    }
  }

  function lineWidthForCanvas() {
    return Math.max(3, canvas.width * 0.006);
  }

  function drawArrow(x1, y1, x2, y2) {
    const lw = lineWidthForCanvas();
    ctx.save();
    ctx.strokeStyle = '#ff3b30';
    ctx.fillStyle = '#ff3b30';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(16, lw * 5);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 7),
      y2 - headLen * Math.sin(angle - Math.PI / 7)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 7),
      y2 - headLen * Math.sin(angle + Math.PI / 7)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawText(x, y, text) {
    const fontSize = Math.max(20, canvas.width * 0.035);
    ctx.save();
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textBaseline = 'top';
    const padding = fontSize * 0.25;
    const metrics = ctx.measureText(text);
    const boxW = metrics.width + padding * 2;
    const boxH = fontSize * 1.3 + padding;
    ctx.fillStyle = 'rgba(255, 59, 48, 0.85)';
    ctx.fillRect(x, y, boxW, boxH);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + padding, y + padding * 0.6);
    ctx.restore();
  }

  // pointer coordinate mapping (CSS px -> canvas internal px)
  function getCanvasPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
      clientX, clientY,
      rect,
    };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (annotate.activeTextInput) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    if (annotate.tool === 'arrow') {
      annotate.drawing = true;
      annotate.startX = pos.x;
      annotate.startY = pos.y;
      canvas.setPointerCapture(e.pointerId);
    } else if (annotate.tool === 'text') {
      openTextInput(pos);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!annotate.drawing) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    redrawCanvas();
    drawArrow(annotate.startX, annotate.startY, pos.x, pos.y);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!annotate.drawing) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    annotate.drawing = false;
    const dx = pos.x - annotate.startX;
    const dy = pos.y - annotate.startY;
    if (Math.hypot(dx, dy) > 10) {
      annotate.annotations.push({
        type: 'arrow', x1: annotate.startX, y1: annotate.startY, x2: pos.x, y2: pos.y,
      });
    }
    redrawCanvas();
  });

  canvas.addEventListener('pointercancel', () => {
    annotate.drawing = false;
    redrawCanvas();
  });

  function openTextInput(pos) {
    closeActiveTextInput(false);
    const wrap = canvas.parentElement;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'annotate-text-input';
    input.placeholder = 'Texte…';
    const wrapRect = wrap.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    input.style.left = (canvasRect.left - wrapRect.left + (pos.clientX - canvasRect.left)) + 'px';
    input.style.top = (canvasRect.top - wrapRect.top + (pos.clientY - canvasRect.top)) + 'px';
    wrap.appendChild(input);
    annotate.activeTextInput = { el: input, canvasX: pos.x, canvasY: pos.y, cancel: false };
    input.focus();

    const commit = () => closeActiveTextInput(true);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
      if (ev.key === 'Escape') { annotate.activeTextInput.cancel = true; input.blur(); }
    });
  }

  function closeActiveTextInput(commit) {
    const active = annotate.activeTextInput;
    if (!active) return;
    annotate.activeTextInput = null;
    const value = active.el.value.trim();
    active.el.remove();
    if (commit && value && !active.cancel) {
      annotate.annotations.push({ type: 'text', x: active.canvasX, y: active.canvasY, text: value });
      redrawCanvas();
    }
  }

  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      annotate.tool = btn.dataset.tool;
    });
  });

  $('btn-undo').addEventListener('click', () => {
    annotate.annotations.pop();
    redrawCanvas();
  });

  $('btn-clear').addEventListener('click', () => {
    annotate.annotations = [];
    redrawCanvas();
  });

  $('btn-add-to-report').addEventListener('click', () => {
    closeActiveTextInput(true);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    state.photos.push({
      id: state.nextId++,
      dataUrl,
      repere: capture.repere || '',
      timestamp: capture.timestamp || new Date(),
    });
    toast('Photo ajoutée au rapport');
    goToCaptureScreen();
  });

  window.addEventListener('resize', () => {
    if ($('screen-annotate').classList.contains('active') && annotate.img) {
      setupCanvasSize();
      redrawCanvas();
    }
  });

  // ---------- Screen 4: Recap ----------
  const recapList = $('recap-list');

  function renderRecap() {
    recapList.innerHTML = '';
    $('recap-count').textContent = state.photos.length;
    $('recap-empty-msg').classList.toggle('hidden', state.photos.length > 0);
    $('btn-generate-pdf').disabled = state.photos.length === 0;

    state.photos.forEach((photo, idx) => {
      const item = document.createElement('div');
      item.className = 'recap-item';

      const img = document.createElement('img');
      img.src = photo.dataUrl;
      item.appendChild(img);

      const info = document.createElement('div');
      info.className = 'recap-item-info';
      const repereEl = document.createElement('div');
      repereEl.className = 'recap-item-repere';
      repereEl.textContent = photo.repere || `Photo ${idx + 1}`;
      const timeEl = document.createElement('div');
      timeEl.className = 'recap-item-time';
      timeEl.textContent = formatDateTime(photo.timestamp);
      info.appendChild(repereEl);
      info.appendChild(timeEl);
      item.appendChild(info);

      const controls = document.createElement('div');
      controls.className = 'recap-item-controls';

      const upBtn = document.createElement('button');
      upBtn.className = 'icon-btn';
      upBtn.textContent = '↑';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => moveItem(idx, -1));

      const downBtn = document.createElement('button');
      downBtn.className = 'icon-btn';
      downBtn.textContent = '↓';
      downBtn.disabled = idx === state.photos.length - 1;
      downBtn.addEventListener('click', () => moveItem(idx, 1));

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn danger';
      delBtn.textContent = '🗑';
      delBtn.addEventListener('click', () => deleteItem(idx));

      controls.appendChild(upBtn);
      controls.appendChild(downBtn);
      controls.appendChild(delBtn);
      item.appendChild(controls);

      recapList.appendChild(item);
    });
  }

  function moveItem(idx, dir) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= state.photos.length) return;
    const [item] = state.photos.splice(idx, 1);
    state.photos.splice(newIdx, 0, item);
    renderRecap();
  }

  function deleteItem(idx) {
    state.photos.splice(idx, 1);
    renderRecap();
    updateCaptureCounters();
  }

  $('btn-generate-pdf').addEventListener('click', generatePdf);

  // ---------- Screen 5: Export / PDF ----------
  async function generatePdf() {
    showScreen('screen-export');
    $('export-status').textContent = '📄';
    $('export-message').textContent = 'Génération du PDF en cours…';
    $('export-actions').classList.add('hidden');

    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const bandH = 16;

      for (let i = 0; i < state.photos.length; i++) {
        const photo = state.photos[i];
        if (i > 0) doc.addPage('a4', 'landscape');

        // header band
        doc.setFillColor(17, 17, 17);
        doc.rect(0, 0, pageW, bandH, 'F');
        doc.setFillColor(245, 196, 0);
        doc.rect(0, bandH - 1.2, pageW, 1.2, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.text(state.chantierName, 6, bandH / 2 - 1.5, { baseline: 'middle' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(230, 230, 230);
        const rightText = [
          formatDateTime(photo.timestamp),
          photo.repere ? `Repère : ${photo.repere}` : null,
        ].filter(Boolean).join('   •   ');
        doc.text(rightText, pageW - 6, bandH / 2 + 1.5, { align: 'right', baseline: 'middle' });

        // image area
        const areaTop = bandH + 4;
        const areaH = pageH - areaTop - 4;
        const areaW = pageW - 8;
        const dims = await getImageDims(photo.dataUrl);
        const scale = Math.min(areaW / dims.w, areaH / dims.h);
        const drawW = dims.w * scale;
        const drawH = dims.h * scale;
        const x = (pageW - drawW) / 2;
        const y = areaTop + (areaH - drawH) / 2;
        doc.addImage(photo.dataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
      }

      const filename = buildFilename();
      const blob = doc.output('blob');
      pendingPdfBlob = blob;
      pendingPdfFilename = filename;

      $('export-status').textContent = '✅';
      $('export-message').textContent = `PDF prêt (${state.photos.length} page${state.photos.length > 1 ? 's' : ''}).`;
      $('export-actions').classList.remove('hidden');

      const canShareFiles = !!(navigator.canShare && navigator.canShare({
        files: [new File([blob], filename, { type: 'application/pdf' })],
      }));
      $('btn-share').classList.toggle('hidden', !canShareFiles);
    } catch (err) {
      console.error(err);
      $('export-status').textContent = '⚠️';
      $('export-message').textContent = "Erreur lors de la génération du PDF.";
      $('export-actions').classList.remove('hidden');
      $('btn-share').classList.add('hidden');
    }
  }

  function getImageDims(dataUrl) {
    return loadImage(dataUrl).then(img => ({ w: img.naturalWidth, h: img.naturalHeight }));
  }

  function buildFilename() {
    const safe = (state.chantierName || 'chantier')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'chantier';
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `reportage-${safe}-${stamp}.pdf`;
  }

  $('btn-share').addEventListener('click', async () => {
    if (!pendingPdfBlob) return;
    try {
      const file = new File([pendingPdfBlob], pendingPdfFilename, { type: 'application/pdf' });
      await navigator.share({
        files: [file],
        title: 'Reportage Chantier',
        text: state.chantierName,
      });
    } catch (err) {
      if (err && err.name !== 'AbortError') toast('Partage impossible sur cet appareil');
    }
  });

  $('btn-download').addEventListener('click', () => {
    if (!pendingPdfBlob) return;
    const url = URL.createObjectURL(pendingPdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pendingPdfFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  $('btn-back-to-recap').addEventListener('click', () => {
    renderRecap();
    showScreen('screen-recap');
  });

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();
