(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const JOURS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const HISTORY_KEY = 'livraison-history';
  const DRAFT_KEY = 'livraison-draft';
  const FIELDS = ['f-demandeur', 'f-date-dde', 'f-ou', 'f-quoi', 'f-quand', 'f-livreur'];

  let pdfBlob = null;
  let pdfName = '';

  // ---------- Helpers ----------
  const pad = (n) => String(n).padStart(2, '0');

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function parseIso(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function fmtDate(iso) {
    const d = parseIso(iso);
    return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
  }

  function fmtDateJour(iso) {
    const d = parseIso(iso);
    return d ? `${JOURS[d.getDay()]} ${fmtDate(iso)}` : '';
  }

  function slug(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
  }

  function toast(msg, ms = 2200) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $(id).classList.add('active');
    window.scrollTo(0, 0);
  }

  // ---------- History (suggestions) & draft ----------
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {}; } catch { return {}; }
  }

  function saveHistory(data) {
    const h = loadHistory();
    [['demandeur', data.demandeur], ['ou', data.ou], ['livreur', data.livreur]].forEach(([k, v]) => {
      if (!v) return;
      const list = (h[k] || []).filter((x) => x.toLowerCase() !== v.toLowerCase());
      list.unshift(v);
      h[k] = list.slice(0, 20);
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
    renderDatalists();
  }

  function renderDatalists() {
    const h = loadHistory();
    ['demandeur', 'ou', 'livreur'].forEach((k) => {
      const dl = $('dl-' + k);
      dl.innerHTML = '';
      (h[k] || []).forEach((v) => {
        const o = document.createElement('option');
        o.value = v;
        dl.appendChild(o);
      });
    });
  }

  function saveDraft() {
    const d = {};
    FIELDS.forEach((id) => { d[id] = $(id).value; });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  }

  function loadDraft() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; } catch { /* ignore */ }
    FIELDS.forEach((id) => { if (d[id]) $(id).value = d[id]; });
    if (!$('f-date-dde').value) $('f-date-dde').value = todayIso();
  }

  function updateQuandHint() {
    $('quand-hint').textContent = $('f-quand').value ? '→ ' + fmtDateJour($('f-quand').value) : '';
  }

  function readForm() {
    return {
      demandeur: $('f-demandeur').value.trim(),
      dateDde: $('f-date-dde').value,
      ou: $('f-ou').value.trim(),
      quoi: $('f-quoi').value.replace(/\s+$/, ''),
      quand: $('f-quand').value,
      livreur: $('f-livreur').value.trim(),
    };
  }

  // ---------- PDF ----------
  function buildPdf(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 15;
    const tableW = pageW - margin * 2;
    const labelW = 50;
    const valueW = tableW - labelW;
    const padX = 4;
    const lineH = 6.5;
    const fontSize = 12;

    // Titre
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(17, 17, 17);
    doc.text('FICHE DE BESOINS', pageW / 2, 30, { align: 'center' });
    doc.setFillColor(245, 196, 0);
    doc.rect(pageW / 2 - 30, 34, 60, 1.5, 'F');

    const rows = [
      ['Demandé par', data.demandeur],
      ['Date demande', fmtDate(data.dateDde)],
      ['Où', data.ou],
      ['Quoi', data.quoi],
      ['Quand', fmtDateJour(data.quand)],
      ['Livré par', data.livreur],
    ];

    let y = 48;
    doc.setFontSize(fontSize);
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.3);

    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal');
      const lines = String(value || '').split('\n')
        .flatMap((l) => doc.splitTextToSize(l || ' ', valueW - padX * 2));
      const rowH = Math.max(12, lines.length * lineH + 6);

      // cellule libellé (fond gris clair)
      doc.setFillColor(238, 238, 238);
      doc.rect(margin, y, labelW, rowH, 'FD');
      doc.rect(margin + labelW, y, valueW, rowH, 'S');

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(17, 17, 17);
      doc.text(label, margin + padX, y + rowH / 2, { baseline: 'middle' });

      doc.setFont('helvetica', 'normal');
      const textTop = y + (rowH - lines.length * lineH) / 2 + lineH / 2;
      lines.forEach((l, i) => {
        doc.text(l, margin + labelW + padX, textTop + i * lineH, { baseline: 'middle' });
      });

      y += rowH;
    });

    // Zone réception
    y += 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Réceptionné par :', margin, y);
    doc.text('Signature :', margin + tableW / 2 + 5, y);
    doc.setDrawColor(150, 150, 150);
    doc.rect(margin, y + 3, tableW / 2 - 5, 28, 'S');
    doc.rect(margin + tableW / 2 + 5, y + 3, tableW / 2 - 5, 28, 'S');

    return doc;
  }

  function generate() {
    const data = readForm();
    if (!data.ou || !data.quoi) {
      toast('Renseigner au moins « Où » et « Quoi »');
      return;
    }
    try {
      const doc = buildPdf(data);
      pdfBlob = doc.output('blob');
      const date = (data.quand || todayIso()).replace(/-/g, '');
      pdfName = `fiche-besoins-${slug(data.ou) || 'chantier'}-${date}.pdf`;
      saveHistory(data);

      $('export-message').textContent = `${pdfName}`;
      const canShare = !!(navigator.canShare && navigator.canShare({
        files: [new File([pdfBlob], pdfName, { type: 'application/pdf' })],
      }));
      $('btn-share').classList.toggle('hidden', !canShare);
      showScreen('screen-export');
    } catch (err) {
      console.error(err);
      toast('Erreur lors de la génération du PDF');
    }
  }

  // ---------- Events ----------
  FIELDS.forEach((id) => $(id).addEventListener('input', () => {
    saveDraft();
    if (id === 'f-quand') updateQuandHint();
  }));

  $('btn-pdf').addEventListener('click', generate);

  $('btn-reset').addEventListener('click', () => {
    if (!confirm('Vider le formulaire ?')) return;
    FIELDS.forEach((id) => { $(id).value = ''; });
    $('f-date-dde').value = todayIso();
    updateQuandHint();
    saveDraft();
  });

  $('btn-share').addEventListener('click', async () => {
    if (!pdfBlob) return;
    try {
      const file = new File([pdfBlob], pdfName, { type: 'application/pdf' });
      await navigator.share({ files: [file], title: 'Fiche de besoins', text: readForm().ou });
    } catch (err) {
      if (err && err.name !== 'AbortError') toast('Partage impossible sur cet appareil');
    }
  });

  $('btn-download').addEventListener('click', () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = pdfName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });

  $('btn-back').addEventListener('click', () => showScreen('screen-form'));

  // ---------- Init ----------
  renderDatalists();
  loadDraft();
  updateQuandHint();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    });
  }
})();
