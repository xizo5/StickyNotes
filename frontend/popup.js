(() => {
  'use strict';

  const textarea = document.getElementById('content');
  const status = document.getElementById('status');
  const closeButton = document.getElementById('close');
  const saveButton = document.getElementById('save');
  const clearButton = document.getElementById('clear');
  const shortcutButton = document.getElementById('shortcut');

  const DEFAULT_STATUS = 'Esc 隐藏 · 内容会保留';
  const DISCARD_HINT = '再点一次「丢弃」才会清空';
  const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Win'];
  const KEY_LABELS = {
    space: 'Space',
    enter: 'Enter',
    tab: 'Tab',
    escape: 'Esc',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    pageup: 'PgUp',
    pagedown: 'PgDn',
    backspace: 'Backspace',
    delete: 'Del',
    insert: 'Ins',
    printscreen: 'PrtSc',
    minus: '-',
    equal: '=',
    bracketleft: '[',
    bracketright: ']',
    backslash: '\\',
    semicolon: ';',
    quote: "'",
    comma: ',',
    period: '.',
    slash: '/',
    backquote: '`'
  };

  let capturing = false;
  let currentShortcut = 'Ctrl+Alt+Space';
  let discardArmed = false;
  let discardTimer = 0;

  function setStatus(text, options = {}) {
    status.textContent = text;
    status.classList.toggle('saving', Boolean(options.saving));
    status.title = options.title || '';
  }

  function prettyToken(token) {
    const lower = token.toLowerCase();
    if (lower === 'control' || lower === 'ctrl' || lower === 'commandorcontrol') return 'Ctrl';
    if (lower === 'alt' || lower === 'option') return 'Alt';
    if (lower === 'shift') return 'Shift';
    if (lower === 'super' || lower === 'command' || lower === 'cmd' || lower === 'meta') return 'Win';
    if (/^key[a-z]$/.test(lower)) return token.slice(3).toUpperCase();
    if (/^digit\d$/.test(lower)) return token.slice(5);
    if (/^f\d+$/.test(lower)) return token.toUpperCase();
    if (/^numpad\d$/.test(lower)) return 'Num' + token.slice(6);
    if (lower === 'numpadadd') return 'Num+';
    if (lower === 'numpadsubtract') return 'Num-';
    if (lower === 'numpadmultiply') return 'Num*';
    if (lower === 'numpaddivide') return 'Num/';
    if (lower === 'numpaddecimal') return 'Num.';
    if (lower === 'numpadenter') return 'NumEnter';
    if (lower === 'numpadequal') return 'Num=';
    return KEY_LABELS[lower] || token;
  }

  function shortcutLabel(accelerator) {
    const parts = accelerator.split('+').map(prettyToken);
    const modifiers = parts
      .filter((part) => MODIFIER_ORDER.includes(part))
      .sort((a, b) => MODIFIER_ORDER.indexOf(a) - MODIFIER_ORDER.indexOf(b));
    const keys = parts.filter((part) => !MODIFIER_ORDER.includes(part));
    return modifiers.concat(keys).join('+');
  }

  function renderShortcut() {
    const label = shortcutLabel(currentShortcut);
    shortcutButton.textContent = label;
    shortcutButton.title = label + ' · 显示 / 隐藏便签，点击可更换';
  }

  function disarmDiscard() {
    if (discardTimer) {
      window.clearTimeout(discardTimer);
      discardTimer = 0;
    }
    discardArmed = false;
    clearButton.textContent = '丢弃';
    clearButton.classList.remove('danger');
  }

  function armDiscard() {
    discardArmed = true;
    clearButton.textContent = '确认丢弃';
    clearButton.classList.add('danger');
    setStatus(DISCARD_HINT);
    discardTimer = window.setTimeout(() => {
      disarmDiscard();
      setStatus(DEFAULT_STATUS);
    }, 4000);
  }

  function endShortcutCapture(message) {
    capturing = false;
    shortcutButton.classList.remove('capturing');
    renderShortcut();
    setStatus(message || DEFAULT_STATUS);
    textarea.focus();
  }

  function beginShortcutCapture() {
    if (capturing) return;
    disarmDiscard();
    capturing = true;
    shortcutButton.classList.add('capturing');
    shortcutButton.textContent = '请按新组合键…';
    shortcutButton.title = '按 Esc 取消';
    setStatus('同时按住 Ctrl / Alt / Shift 再加一个键');
    shortcutButton.focus();
  }

  function keyToken(code) {
    if (/^Key[A-Z]$/.test(code)) return code;
    if (/^Digit\d$/.test(code)) return code;
    if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code;
    if (/^Numpad\d$/.test(code)) return code;
    if (/^Arrow(Up|Down|Left|Right)$/.test(code)) return code;
    const supported = [
      'Space', 'Enter', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End',
      'PageUp', 'PageDown', 'Minus', 'Equal', 'BracketLeft', 'BracketRight',
      'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backquote',
      'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide',
      'NumpadDecimal', 'NumpadEnter', 'NumpadEqual', 'CapsLock', 'NumLock',
      'ScrollLock', 'PrintScreen', 'Pause'
    ];
    return supported.includes(code) ? code : null;
  }

  function keyTokenFromEvent(event) {
    if (event.code) {
      const fromCode = keyToken(event.code);
      if (fromCode) return fromCode;
    }

    const key = event.key;
    if (!key) return null;
    if (/^[A-Za-z]$/.test(key)) return 'Key' + key.toUpperCase();
    if (/^[0-9]$/.test(key)) return 'Digit' + key;
    if (/^F([1-9]|1\d|2[0-4])$/.test(key)) return key;

    const named = {
      ' ': 'Space',
      Spacebar: 'Space',
      Enter: 'Enter',
      Tab: 'Tab',
      Backspace: 'Backspace',
      Delete: 'Delete',
      Insert: 'Insert',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
      ArrowUp: 'ArrowUp',
      ArrowDown: 'ArrowDown',
      ArrowLeft: 'ArrowLeft',
      ArrowRight: 'ArrowRight',
      '-': 'Minus',
      '=': 'Equal',
      '[': 'BracketLeft',
      ']': 'BracketRight',
      '\\': 'Backslash',
      ';': 'Semicolon',
      "'": 'Quote',
      ',': 'Comma',
      '.': 'Period',
      '/': 'Slash',
      '`': 'Backquote'
    };
    return named[key] || null;
  }

  function acceleratorFromEvent(event) {
    const modifiers = [];
    if (event.ctrlKey) modifiers.push('Ctrl');
    if (event.altKey) modifiers.push('Alt');
    if (event.shiftKey) modifiers.push('Shift');
    if (event.metaKey) modifiers.push('Super');
    if (!modifiers.length) return null;

    const key = keyTokenFromEvent(event);
    if (!key) return null;

    return modifiers.concat(key).join('+');
  }

  async function submitShortcut(accelerator) {
    if (!window.__TAURI__) {
      endShortcutCapture('仅桌面版支持更换快捷键');
      return;
    }

    shortcutButton.textContent = '注册中…';
    setStatus('正在注册快捷键…', { saving: true });

    try {
      const saved = await window.__TAURI__.core.invoke('set_shortcut', { accelerator });
      currentShortcut = saved;
      endShortcutCapture('快捷键已改为 ' + shortcutLabel(saved));
    } catch (error) {
      const message = typeof error === 'string'
        ? error
        : (error && error.message) || '这个组合键不可用，请换一个';
      endShortcutCapture(message);
    }
  }

  async function loadShortcut() {
    if (!window.__TAURI__) return;
    try {
      const accelerator = await window.__TAURI__.core.invoke('get_shortcut');
      if (accelerator) {
        currentShortcut = accelerator;
        if (!capturing) renderShortcut();
      }
    } catch (error) {
      console.warn('读取快捷键失败：', error);
    }
  }

  function hideWindow() {
    disarmDiscard();
    if (window.__TAURI__) {
      window.__TAURI__.core.invoke('hide_quick_note').catch((error) => {
        console.warn('隐藏便签失败：', error);
      });
    } else {
      window.close();
    }
  }

  function makeFileName() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return (
      '便签-' +
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      '-' +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      '.txt'
    );
  }

  async function saveToDisk() {
    disarmDiscard();
    if (!textarea.value.trim()) {
      setStatus('还没有内容');
      textarea.focus();
      return;
    }
    if (!window.__TAURI__) {
      setStatus('仅桌面版支持保存');
      return;
    }

    setStatus('正在保存...', { saving: true });
    try {
      const path = await window.__TAURI__.core.invoke('save_quick_note', {
        text: textarea.value,
        suggestedName: makeFileName()
      });
      if (path) {
        setStatus('已保存 · ' + path, { title: path });
      } else {
        setStatus('已取消保存，内容仍在');
      }
    } catch (error) {
      console.warn('保存便签失败：', error);
      setStatus('保存失败，请重试');
    }
    if (!capturing) textarea.focus();
  }

  textarea.addEventListener('input', () => {
    if (discardArmed) disarmDiscard();
    if (!capturing) setStatus(DEFAULT_STATUS);
  });

  closeButton.addEventListener('click', hideWindow);
  saveButton.addEventListener('click', saveToDisk);

  clearButton.addEventListener('click', () => {
    if (!textarea.value) {
      setStatus('便签还是空的');
      textarea.focus();
      return;
    }
    if (!discardArmed) {
      armDiscard();
      return;
    }
    disarmDiscard();
    textarea.value = '';
    setStatus('已丢弃 · 可以写新的了');
    textarea.focus();
  });

  shortcutButton.addEventListener('click', () => {
    if (capturing) {
      endShortcutCapture('已取消更换');
    } else {
      beginShortcutCapture();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (capturing) {
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || event.isComposing) return;

      if (event.key === 'Escape') {
        endShortcutCapture('已取消更换');
        return;
      }

      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) {
        return;
      }

      const accelerator = acceleratorFromEvent(event);
      if (!accelerator) {
        setStatus(!event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey
          ? '请同时按住 Ctrl / Alt / Shift'
          : '这个键不支持，请换一个组合');
        return;
      }

      const label = shortcutLabel(accelerator);
      if (label === 'Ctrl+S' || label === 'Ctrl+Space' || label === 'Alt+F4') {
        setStatus(label + ' 另有用途，请换一个');
        return;
      }

      submitShortcut(accelerator);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      if (discardArmed) {
        disarmDiscard();
        setStatus(DEFAULT_STATUS);
        textarea.focus();
      } else {
        hideWindow();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveToDisk();
    }
  }, true);

  if (window.__TAURI__) {
    window.__TAURI__.event.listen('shortcut-edit', () => {
      if (!capturing) beginShortcutCapture();
      shortcutButton.focus();
    }).catch((error) => {
      console.warn('监听快捷键设置事件失败：', error);
    });
    window.addEventListener('blur', () => {
      if (capturing) endShortcutCapture('已取消更换');
    });
    window.addEventListener('focus', () => {
      if (!capturing) textarea.focus();
    });
    loadShortcut();
  }

  window.setTimeout(() => textarea.focus(), 60);
})();
