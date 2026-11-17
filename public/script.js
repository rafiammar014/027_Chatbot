/* ==========================================================================
   NeoTea — AI Chat Dashboard (frontend)
   --------------------------------------------------------------------------
   01. Helper kecil
   02. Tema (light / dark + persist)
   03. Sidebar drawer (mobile)
   04. Toast
   05. Render pesan & markdown ringan
   06. Composer (auto-grow, Enter to send)
   07. Riwayat percakapan (localStorage)
   08. Streaming ke /api/chat
   09. Inisialisasi
   ========================================================================== */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const chatEl      = $('#chat');
const messagesEl  = $('#messages');
const welcomeEl   = $('#welcome');
const formEl      = $('#chatForm');
const inputEl     = $('#input');
const sendBtn     = $('#sendBtn');
const themeToggle = $('#themeToggle');
const menuBtn     = $('#menuBtn');
const historyEl   = $('#history');
const historyCnt  = $('#historyCount');
const historyEmpty= $('#historyEmpty');
const chatTitle   = $('#chatTitle');
const scrollBtn   = $('#scrollBottom');
const toastsEl    = $('#toasts');

const STORE_CHATS = 'neotea.chats';
const STORE_THEME = 'neotea.theme';

/** State aplikasi */
const state = {
  messages: [],   // { role: 'user' | 'assistant', content: string }
  streaming: false,
  chats: [],
  activeChatId: null,
};


/* ==========================================================================
   01. HELPER
   ========================================================================== */

/** Bungkus SVG sprite jadi elemen <svg>. */
function icon(name, cls = 'icon') {
  return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/** Escape HTML agar teks dari API tidak dieksekusi sebagai markup. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Jam lokal HH.MM */
function nowTime() {
  return new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Auto-scroll hanya jika pengguna sedang di dekat bagian bawah. */
function isNearBottom(threshold = 120) {
  return chatEl.scrollHeight - chatEl.scrollTop - chatEl.clientHeight < threshold;
}

function scrollToBottom(smooth = true) {
  chatEl.scrollTo({
    top: chatEl.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto',
  });
}

/** Render markdown ringan → HTML aman (escape dulu, baru format). */
function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Blok kode ```...```
  html = html.replace(/```(\w+)?\n?([\s\S]*?)```/g, (_, _lang, code) =>
    `<pre><code>${code.replace(/\n$/, '')}</code></pre>`
  );

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Bold & italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  // Heading ringan
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // Daftar bullet
  html = html.replace(/(?:^|\n)((?:[-*] .+(?:\n|$))+)/g, (block) => {
    const items = block
      .trim()
      .split('\n')
      .map((line) => `<li>${line.replace(/^[-*] /, '')}</li>`)
      .join('');
    return `\n<ul>${items}</ul>`;
  });

  // Paragraf: baris ganda jadi paragraf, baris tunggal jadi <br>
  html = html
    .split(/\n{2,}/)
    .map((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return '';
      if (/^<(ul|ol|pre|h[1-3]|blockquote)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  return html;
}


/* ==========================================================================
   02. TEMA (LIGHT / DARK)
   ========================================================================== */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle?.setAttribute(
    'aria-label',
    theme === 'dark' ? 'Aktifkan tema terang' : 'Aktifkan tema gelap'
  );
  themeToggle?.setAttribute('aria-pressed', String(theme === 'dark'));
  try { localStorage.setItem(STORE_THEME, theme); } catch {}
}

/** Tema awal: pilihan tersimpan → preferensi sistem → terang. */
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(STORE_THEME); } catch {}

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));

  themeToggle?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    showToast(next === 'dark' ? 'Tema gelap aktif' : 'Tema terang aktif');
  });
}


/* ==========================================================================
   03. SIDEBAR DRAWER (MOBILE)
   ========================================================================== */

function openNav() {
  document.body.classList.add('nav-open');
  menuBtn?.setAttribute('aria-expanded', 'true');
}

function closeNav() {
  document.body.classList.remove('nav-open');
  menuBtn?.setAttribute('aria-expanded', 'false');
}

function initNav() {
  menuBtn?.addEventListener('click', () => {
    document.body.classList.contains('nav-open') ? closeNav() : openNav();
  });

  $('[data-close-nav]')?.addEventListener('click', closeNav);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNav();
  });

  // Tutup drawer saat layar melebar ke desktop
  window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => {
    if (e.matches) closeNav();
  });
}


/* ==========================================================================
   04. TOAST
   ========================================================================== */

function showToast(message) {
  if (!toastsEl) return;

  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon('check')}<span>${escapeHtml(message)}</span>`;
  toastsEl.appendChild(el);

  setTimeout(() => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 2200);
}


/* ==========================================================================
   05. RENDER PESAN
   ========================================================================== */

/** Sembunyikan empty state saat sudah ada pesan. */
function hideWelcome() {
  welcomeEl?.classList.add('is-hidden');
}

function showWelcome() {
  welcomeEl?.classList.remove('is-hidden');
}

/** Buat elemen baris pesan. */
function createMessageEl(role, content = '') {
  const isUser = role === 'user';

  const row = document.createElement('div');
  row.className = `msg msg--${isUser ? 'user' : 'ai'}`;

  const avatar = document.createElement('span');
  avatar.className = `msg__avatar ${isUser ? 'msg__avatar--user' : 'msg__avatar--ai'}`;
  avatar.innerHTML = isUser ? 'KU' : icon('leaf');

  const body = document.createElement('div');
  body.className = 'msg__body';

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.dataset.role = role;
  if (isUser) {
    bubble.textContent = content;
  } else {
    bubble.innerHTML = content ? renderMarkdown(content) : '';
  }

  const foot = document.createElement('div');
  foot.className = 'msg__foot';
  foot.innerHTML = `<span>${nowTime()}</span>`;

  if (!isUser) {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'msg__copy';
    copyBtn.innerHTML = `${icon('copy')}<span>Salin</span>`;
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(bubble.textContent);
        showToast('Pesan disalin');
      } catch {
        showToast('Gagal menyalin');
      }
    });
    foot.appendChild(copyBtn);
  }

  body.append(bubble, foot);
  row.append(avatar, body);
  messagesEl.appendChild(row);

  return { row, bubble };
}

/** Tambahkan pesan ke DOM + state. */
function addMessage(role, content, { persist = true } = {}) {
  hideWelcome();
  const { row, bubble } = createMessageEl(role, content);
  if (persist) state.messages.push({ role, content });
  if (isNearBottom()) scrollToBottom();
  return { row, bubble };
}


/* ==========================================================================
   06. COMPOSER
   ========================================================================== */

/** Textarea tumbuh mengikuti isi (maks. via CSS max-height). */
function autoGrow() {
  inputEl.style.height = 'auto';
  inputEl.style.height = `${inputEl.scrollHeight}px`;
}

function syncSendButton() {
  const empty = !inputEl.value.trim();
  sendBtn.disabled = empty || state.streaming;
}

function initComposer() {
  inputEl.addEventListener('input', () => {
    autoGrow();
    syncSendButton();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      formEl.requestSubmit();
    }
  });

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSend(inputEl.value.trim());
  });

  chatEl.addEventListener('scroll', () => {
    scrollBtn?.classList.toggle('is-visible', !isNearBottom(200));
  });

  scrollBtn?.addEventListener('click', () => scrollToBottom(true));

  autoGrow();
  syncSendButton();
}


/* ==========================================================================
   07. RIWAYAT PERCOKAPAN (LOCALSTORAGE)
   ========================================================================== */

function loadChats() {
  try {
    const raw = localStorage.getItem(STORE_CHATS);
    state.chats = raw ? JSON.parse(raw) : [];
  } catch {
    state.chats = [];
  }
}

function saveChats() {
  try {
    localStorage.setItem(STORE_CHATS, JSON.stringify(state.chats));
  } catch {}
}

function renderHistory() {
  if (!historyEl) return;

  historyEl.innerHTML = '';
  if (!state.chats.length) {
    historyEl.innerHTML = `<p class="history__empty">Belum ada percakapan.<br>Mulai obrolan pertamamu!</p>`;
  } else {
    state.chats
      .slice()
      .reverse()
      .forEach((chat) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'history__item' + (chat.id === state.activeChatId ? ' is-active' : '');
        btn.innerHTML = `${icon('chat')}<span></span>`;
        btn.querySelector('span').textContent = chat.title;
        btn.title = chat.title;
        btn.addEventListener('click', () => openChat(chat.id));
        historyEl.appendChild(btn);
      });
  }

  if (historyCnt) historyCnt.textContent = String(state.chats.length);
}

/** Simpan / perbarui percakapan aktif. */
function persistActiveChat() {
  if (!state.messages.length) return;

  const firstUser = state.messages.find((m) => m.role === 'user');
  const title = (firstUser?.content || 'Percakapan').slice(0, 42);

  if (!state.activeChatId) {
    state.activeChatId = `c_${Date.now()}`;
    state.chats.push({
      id: state.activeChatId,
      title,
      messages: [...state.messages],
      updatedAt: Date.now(),
    });
  } else {
    const chat = state.chats.find((c) => c.id === state.activeChatId);
    if (chat) {
      chat.messages = [...state.messages];
      chat.updatedAt = Date.now();
    }
  }

  if (chatTitle) chatTitle.textContent = title;
  saveChats();
  renderHistory();
}

function openChat(id) {
  const chat = state.chats.find((c) => c.id === id);
  if (!chat) return;

  state.activeChatId = id;
  state.messages = [...chat.messages];

  messagesEl.innerHTML = '';
  chat.messages.forEach((m) => addMessage(m.role, m.content, { persist: false }));

  if (chatTitle) chatTitle.textContent = chat.title;
  renderHistory();
  closeNav();
  requestAnimationFrame(() => scrollToBottom(false));
}

function newChat() {
  state.messages = [];
  state.activeChatId = null;
  messagesEl.innerHTML = '';
  messagesEl.appendChild(welcomeEl);
  showWelcome();
  if (chatTitle) chatTitle.textContent = 'Percakapan Baru';
  renderHistory();
  closeNav();
  inputEl.value = '';
  autoGrow();
  syncSendButton();
  inputEl.focus();
}

function initHistory() {
  loadChats();
  renderHistory();
  $('#newChatBtn')?.addEventListener('click', newChat);
}


/* ==========================================================================
   08. STREAMING KE /api/chat
   ========================================================================== */

function setStreaming(on) {
  state.streaming = on;
  syncSendButton();
  inputEl.disabled = on;
  formEl.classList.toggle('is-disabled', on);
}

/** Kirim pesan dan baca respons SSE dari server. */
async function handleSend(text) {
  if (!text || state.streaming) return;

  inputEl.value = '';
  autoGrow();
  syncSendButton();

  addMessage('user', text);
  persistActiveChat();

  // Bubble AI kosong + indikator mengetik
  const { bubble } = addMessage('assistant', '');
  bubble.innerHTML = `
    <span class="typing" role="status" aria-label="Asisten sedang mengetik">
      <span class="typing__dot"></span>
      <span class="typing__dot"></span>
      <span class="typing__dot"></span>
    </span>`;

  setStreaming(true);
  scrollToBottom();

  let answer = '';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: state.messages.concat({ role: 'user', content: text }) }),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data?.error) detail = typeof data.error === 'string' ? data.error : detail;
      } catch {}
      throw new Error(detail);
    }

    if (!res.body) throw new Error('Server tidak mengirim stream.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        for (const line of event.split('\n')) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            if (json.error) throw new Error(json.error);

            const chunk = json.content || json.choices?.[0]?.delta?.content || '';
            if (chunk) {
              answer += chunk;
              bubble.innerHTML =
                renderMarkdown(answer) + '<span class="cursor"></span>';
              if (isNearBottom()) scrollToBottom(false);
            }
          } catch (err) {
            if (err instanceof SyntaxError) continue; // potongan JSON belum utuh
            throw err;
          }
        }
      }
    }

    if (!answer.trim()) {
      answer = '_Maaf, tidak ada jawaban yang diterima. Coba lagi._';
    }

    bubble.innerHTML = renderMarkdown(answer);
    state.messages.push({ role: 'assistant', content: answer });
    persistActiveChat();
  } catch (err) {
    console.error('Chat error:', err);
    bubble.innerHTML = `
      <div class="alert">
        ${icon('alert')}
        <span>Gagal menghubungi asisten. ${escapeHtml(err.message || '')}</span>
      </div>`;
    showToast('Terjadi kesalahan');
  } finally {
    setStreaming(false);
    inputEl.focus();
    if (isNearBottom()) scrollToBottom();
  }
}


/* ==========================================================================
   09. INISIALISASI
   ========================================================================== */

function initSuggestions() {
  messagesEl.addEventListener('click', (e) => {
    const card = e.target.closest('.suggestion');
    if (!card) return;
    const prompt = card.dataset.prompt || card.textContent.trim();
    inputEl.value = prompt;
    syncSendButton();
    formEl.requestSubmit();
  });
}

function init() {
  initTheme();
  initNav();
  initComposer();
  initHistory();
  initSuggestions();
  inputEl.focus();
}

document.addEventListener('DOMContentLoaded', init);
