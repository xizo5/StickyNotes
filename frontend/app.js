(() => {
  'use strict';

  const STORAGE_KEY = 'sticky-board-v1';
  const NOTE_W = 240;
  const NOTE_H = 240;
  const PIN_Z = 100000;

  const PALETTE = [
    { name: '奶油黄', bg: '#fff4b8', edge: '#efdc8a', tape: 'rgba(236, 206, 120, 0.6)' },
    { name: '蜜桃粉', bg: '#ffd9cc', edge: '#f0bfae', tape: 'rgba(240, 178, 158, 0.55)' },
    { name: '薄荷绿', bg: '#d3efdc', edge: '#aed9be', tape: 'rgba(150, 205, 170, 0.5)' },
    { name: '天空蓝', bg: '#d5e8ff', edge: '#b1cff2', tape: 'rgba(150, 190, 235, 0.5)' },
    { name: '丁香紫', bg: '#e7dcff', edge: '#cdbdf2', tape: 'rgba(190, 170, 235, 0.5)' },
    { name: '樱花粉', bg: '#ffdce9', edge: '#f3bfd2', tape: 'rgba(240, 170, 195, 0.5)' }
  ];

  const board = document.getElementById('board');
  const template = document.getElementById('note-template');
  const emptyHint = document.getElementById('empty-hint');
  const emptyTitle = document.getElementById('empty-title');
  const emptyDesc = document.getElementById('empty-desc');
  const searchInput = document.getElementById('search');
  const newNoteButton = document.getElementById('new-note');
  const quickNoteButton = document.getElementById('quick-note');
  const clearButton = document.getElementById('clear-board');

  const state = {
    notes: [],
    z: 10,
    elements: new Map()
  };

  let saveTimer = 0;

  const uid = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'note-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function makeNote(overrides = {}) {
    return {
      id: uid(),
      text: '',
      x: 0,
      y: 0,
      w: NOTE_W,
      h: NOTE_H,
      color: 0,
      rot: Math.random() * 7 - 3.5,
      z: 0,
      pinned: false,
      updatedAt: Date.now(),
      ...overrides
    };
  }

  function isValidNote(value) {
    return (
      value &&
      typeof value === 'object' &&
      typeof value.id === 'string' &&
      typeof value.text === 'string' &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y)
    );
  }

  function normalizeNote(value, index) {
    const note = makeNote({
      id: value.id,
      text: value.text,
      x: value.x,
      y: value.y,
      w: Number.isFinite(value.w) ? value.w : NOTE_W,
      h: Number.isFinite(value.h) ? value.h : NOTE_H,
      color: Number.isInteger(value.color) ? ((value.color % PALETTE.length) + PALETTE.length) % PALETTE.length : 0,
      rot: Number.isFinite(value.rot) ? value.rot : 0,
      z: Number.isFinite(value.z) ? value.z : index + 1,
      pinned: Boolean(value.pinned),
      updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : Date.now()
    });
    return note;
  }

  function loadNotes() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return [];
    }
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidNote).map(normalizeNote);
    } catch {
      return [];
    }
  }

  function seedNotes() {
    const width = board.clientWidth || window.innerWidth || 1200;
    const height = board.clientHeight || window.innerHeight || 720;
    const startX = Math.max(16, width / 2 - 400);
    const startY = Math.max(28, height / 2 - 170);

    return [
      makeNote({
        text: '欢迎来到便签墙\n\n双击空白处贴一张\n按 N 也能新建',
        x: startX,
        y: startY,
        color: 0,
        rot: -3.6
      }),
      makeNote({
        text: '拖住顶部的小圆点\n把便签挪到任意位置\n\n右下角可以拉大',
        x: startX + 265,
        y: startY + 46,
        color: 2,
        rot: 2.8
      }),
      makeNote({
        text: '右上角藏着三个小按钮\n圆点换颜色，图钉置顶\n叉号删除',
        x: startX + 530,
        y: startY + 4,
        color: 5,
        rot: -1.8
      })
    ];
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flushSave, 180);
  }

  function flushSave() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.notes));
    } catch (error) {
      console.warn('便签保存失败：', error);
    }
  }

  function clamp(note, el) {
    const boardWidth = board.clientWidth;
    const boardHeight = board.clientHeight;
    if (!boardWidth || !boardHeight) return;
    const maxX = Math.max(12, boardWidth - (el.offsetWidth || note.w) - 12);
    const maxY = Math.max(12, boardHeight - (el.offsetHeight || note.h) - 12);
    note.x = Math.min(Math.max(12, note.x), maxX);
    note.y = Math.min(Math.max(12, note.y), maxY);
  }

  function place(note, el, dragging = false) {
    el.style.setProperty('--x', note.x + 'px');
    el.style.setProperty('--y', note.y + 'px');
    el.style.setProperty('--rot', (dragging ? 0 : note.rot) + 'deg');
  }

  function applyColor(note, el) {
    const color = PALETTE[note.color];
    el.style.setProperty('--note-bg', color.bg);
    el.style.setProperty('--note-edge', color.edge);
    el.style.setProperty('--tape', color.tape);
    el.querySelector('.note-btn.color').title = '换个颜色（当前：' + color.name + '）';
  }

  function raise(note, el) {
    note.z = note.pinned ? PIN_Z + ++state.z : ++state.z;
    el.style.zIndex = String(note.z);
  }

  function formatTime(timestamp) {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return '刚刚编辑';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
    const date = new Date(timestamp);
    return date.getMonth() + 1 + ' 月 ' + date.getDate() + ' 日';
  }

  function refreshTime(note, el) {
    el.querySelector('.note-time').textContent = formatTime(note.updatedAt);
  }

  function updateHint(searchEmpty = false) {
    if (searchEmpty) {
      emptyHint.hidden = false;
      emptyTitle.textContent = '没找到匹配的便签';
      emptyDesc.textContent = '换个关键词试试，或者清空搜索框';
      return;
    }
    if (state.notes.length === 0) {
      emptyHint.hidden = false;
      emptyTitle.textContent = '这里还空着';
      emptyDesc.textContent = '双击任意空白处，写下第一张便签';
      return;
    }
    emptyHint.hidden = true;
  }

  function applyFilter() {
    const query = searchInput.value.trim().toLowerCase();
    let visible = 0;

    for (const note of state.notes) {
      const el = state.elements.get(note.id);
      if (!el) continue;
      const hit = !query || note.text.toLowerCase().includes(query);
      el.classList.toggle('is-dimmed', !hit);
      if (hit) visible += 1;
    }

    updateHint(Boolean(query) && visible === 0);
  }

  function bindNote(note, el) {
    const text = el.querySelector('.note-text');
    const head = el.querySelector('.note-head');
    const pinButton = el.querySelector('.note-btn.pin');
    const colorButton = el.querySelector('.note-btn.color');
    const removeButton = el.querySelector('.note-btn.remove');

    text.value = note.text;

    text.addEventListener('input', () => {
      note.text = text.value;
      note.updatedAt = Date.now();
      refreshTime(note, el);
      save();
      if (searchInput.value.trim()) applyFilter();
    });

    el.addEventListener('pointerdown', () => raise(note, el));

    head.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      event.preventDefault();

      raise(note, el);
      el.classList.add('is-dragging');

      const start = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        noteX: note.x,
        noteY: note.y
      };

      el.setPointerCapture(event.pointerId);

      const onMove = (moveEvent) => {
        note.x = start.noteX + moveEvent.clientX - start.pointerX;
        note.y = start.noteY + moveEvent.clientY - start.pointerY;
        const maxX = Math.max(12, board.clientWidth - el.offsetWidth - 12);
        const maxY = Math.max(12, board.clientHeight - el.offsetHeight - 12);
        note.x = Math.min(Math.max(12, note.x), maxX);
        note.y = Math.min(Math.max(12, note.y), maxY);
        place(note, el, true);
      };

      const finish = () => {
        el.classList.remove('is-dragging');
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', finish);
        el.removeEventListener('pointercancel', finish);
        place(note, el);
        save();
      };

      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', finish);
      el.addEventListener('pointercancel', finish);
    });

    pinButton.addEventListener('click', () => {
      note.pinned = !note.pinned;
      el.classList.toggle('pinned', note.pinned);
      raise(note, el);
      save();
    });

    colorButton.addEventListener('click', () => {
      note.color = (note.color + 1) % PALETTE.length;
      applyColor(note, el);
      save();
    });

    removeButton.addEventListener('click', () => {
      el.classList.add('is-crumpled');
      window.setTimeout(() => {
        el.remove();
        state.elements.delete(note.id);
        state.notes = state.notes.filter((item) => item.id !== note.id);
        save();
        applyFilter();
      }, 260);
    });

    const observer = new ResizeObserver(() => {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      if (Math.abs(width - note.w) > 1 || Math.abs(height - note.h) > 1) {
        note.w = width;
        note.h = height;
        save();
      }
    });
    observer.observe(el);
  }

  function mountNote(note) {
    const el = template.content.firstElementChild.cloneNode(true);
    el.dataset.id = note.id;
    el.style.width = note.w + 'px';
    el.style.height = note.h + 'px';
    el.classList.toggle('pinned', note.pinned);
    el.style.zIndex = String(note.z);
    applyColor(note, el);

    board.appendChild(el);
    state.elements.set(note.id, el);

    clamp(note, el);
    place(note, el);
    refreshTime(note, el);
    bindNote(note, el);
  }

  function createNote(overrides = {}) {
    const note = makeNote({ color: state.notes.length % PALETTE.length, ...overrides });
    note.z = ++state.z;
    state.notes.push(note);
    mountNote(note);
    save();
    applyFilter();
    updateHint();

    const el = state.elements.get(note.id);
    el.querySelector('.note-text').focus();
    return note;
  }

  function createAtCenter() {
    const stagger = (state.notes.length % 6) * 18;
    createNote({
      x: board.clientWidth / 2 - NOTE_W / 2 + stagger - 45,
      y: board.clientHeight / 2 - NOTE_H / 2 + stagger - 30
    });
  }

  board.addEventListener('dblclick', (event) => {
    if (event.target.closest('.note')) return;
    const rect = board.getBoundingClientRect();
    createNote({
      x: event.clientX - rect.left - NOTE_W / 2,
      y: event.clientY - rect.top - 34
    });
  });

  newNoteButton.addEventListener('click', createAtCenter);

  quickNoteButton.addEventListener('click', () => {
    if (!window.__TAURI__) {
      window.open('popup.html', 'quick-note', 'width=370,height=340');
      return;
    }
    window.__TAURI__.core.invoke('open_quick_note').catch((error) => {
      console.warn('弹出便签失败：', error);
    });
  });

  clearButton.addEventListener('click', () => {
    if (state.notes.length === 0) return;
    if (!window.confirm('清空所有便签？此操作不可撤销。')) return;

    for (const el of state.elements.values()) {
      el.classList.add('is-crumpled');
    }

    window.setTimeout(() => {
      for (const el of state.elements.values()) el.remove();
      state.elements.clear();
      state.notes = [];
      flushSave();
      applyFilter();
      updateHint();
    }, 260);
  });

  searchInput.addEventListener('input', applyFilter);

  document.addEventListener('keydown', (event) => {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA';

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      createAtCenter();
      return;
    }

    if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'n' || event.key === 'N')) {
      event.preventDefault();
      createAtCenter();
    }
  });

  window.addEventListener('resize', () => {
    for (const note of state.notes) {
      const el = state.elements.get(note.id);
      if (!el) continue;
      clamp(note, el);
      place(note, el);
    }
    save();
  });

  window.addEventListener('beforeunload', flushSave);

  window.setInterval(() => {
    for (const note of state.notes) {
      const el = state.elements.get(note.id);
      if (el) refreshTime(note, el);
    }
  }, 60000);

  function init() {
    const loaded = loadNotes();
    state.notes = loaded === null ? seedNotes() : loaded;

    state.notes.sort((a, b) => (a.z || 0) - (b.z || 0));
    state.z = 10;
    for (const note of state.notes) {
      note.z = note.pinned ? PIN_Z + ++state.z : ++state.z;
    }

    for (const note of state.notes) mountNote(note);

    updateHint();
    if (state.notes.length === 0) flushSave();
  }

  requestAnimationFrame(init);
})();
