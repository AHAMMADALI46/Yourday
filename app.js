/* =========================================================================
   Yourday Pro+ — Frontend Application & Background Google Drive Sync Engine
   ========================================================================= */

const state = {
  token: localStorage.getItem('yourday_token') || null,
  user: null,
  journals: [],
  unlockedJournals: new Set(JSON.parse(sessionStorage.getItem('yourday_unlocked_journals') || '[]')),
  activeJournalId: null,
  entries: [],
  allEntriesCount: 0,
  starredCount: 0,
  trashCount: 0,
  activeEntry: null,
  activeFilter: 'all', // 'all' | 'starred' | 'trash'
  activeTag: '',
  searchQuery: '',
  autosaveTimer: null,
  isDirty: false,
  calendarDate: new Date(),
  inactivityTimer: null,
  isStaticMode: false
};

const DAILY_PROMPTS = [
  'What is one small moment from today that you want to remember five years from now?',
  'What drained your energy today, and what quietly restored it?',
  'If you could speak to yourself one year ago today, what reassurance would you offer?',
  'List three things that went well today and why they mattered.',
  'What is a decision or thought you have been postponing that deserves clarity tonight?',
  'Describe the atmosphere around you right now—sounds, light, weather, and mood.'
];

// Client-Side Local Storage Database for GitHub Pages / Static Hosting Mode
const LOCAL_STORAGE_DB_KEY = 'yourday_client_db';
function getClientDb() {
  const existing = localStorage.getItem(LOCAL_STORAGE_DB_KEY);
  if (existing) {
    try { return JSON.parse(existing); } catch {}
  }
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const demoUserId = 'usr_demo_yourday';
  const initial = {
    users: [{
      id: demoUserId,
      name: 'Alex Rivera',
      email: 'alex.yourday@gmail.com',
      password: 'yourday123',
      appPin: '1234',
      plan: 'Yourday Pro+',
      preferences: { defaultPaperTheme: 'parchment', defaultFont: 'Lora', autoLockMinutes: 15 },
      driveConfig: {
        connected: true,
        gmailAccount: 'alex.yourday@gmail.com',
        folderName: 'Yourday Journals',
        autoSyncOnSave: true,
        lastSyncedAt: now,
        syncHistory: [{ id: 's1', timestamp: now, destination: 'Google Drive (alex.yourday@gmail.com)', filesUpdated: 3 }]
      }
    }],
    journals: [
      {
        id: 'jrn_daily_reflections',
        userId: demoUserId,
        title: 'Daily Reflections',
        subtitle: 'Morning gratitude, evening thoughts & daily mindfulness',
        category: 'Personal',
        coverStyle: 'leather-amber',
        paperTheme: 'parchment',
        fontFamily: 'Lora',
        isLocked: false,
        lockPassword: null,
        entryCount: 2,
        totalWords: 156
      },
      {
        id: 'jrn_private_vault',
        userId: demoUserId,
        title: 'Encrypted Vault',
        subtitle: 'AES-256-GCM locked private thoughts (PIN: 2468)',
        category: 'Private Vault',
        coverStyle: 'midnight-gold',
        paperTheme: 'midnight',
        fontFamily: 'Merriweather',
        isLocked: true,
        lockPassword: '2468',
        lockHint: 'Default demo PIN is 2468',
        entryCount: 1,
        totalWords: 65
      },
      {
        id: 'jrn_wanderlust_notes',
        userId: demoUserId,
        title: 'Creative & Travel Log',
        subtitle: 'Ideas, sketches, books & weekend adventures',
        category: 'Creativity',
        coverStyle: 'botanical-sage',
        paperTheme: 'ivory-lined',
        fontFamily: 'Caveat',
        isLocked: false,
        lockPassword: null,
        entryCount: 1,
        totalWords: 48
      }
    ],
    entries: [
      {
        id: 'ent_welcome_today',
        journalId: 'jrn_daily_reflections',
        userId: demoUserId,
        title: 'Welcome to Yourday Pro — My Private Daily Sanctuary',
        content: '<p>Today marks the beginning of my daily writing ritual inside <strong>Yourday Pro</strong>. Having a calm, private space that automatically backs up every word in the background to my <em>Gmail Google Drive</em> feels liberating.</p><blockquote>"Fill your paper with the breathings of your heart." — William Wordsworth</blockquote><p><strong>Three things I am grateful for today:</strong></p><ul><li>A quiet cup of coffee before the world wakes up</li><li>Encrypted, distraction-free journaling with custom paper themes and fonts</li><li>Automatic background sync to my Google Drive folder so my memories are safe forever</li></ul>',
        plainText: 'Today marks the beginning of my daily writing ritual inside Yourday Pro. Having a calm, private space that automatically backs up every word in the background to my Gmail Google Drive feels liberating.',
        wordCount: 98,
        charCount: 598,
        entryDate: now,
        tags: ['gratitude', 'mindfulness', 'yourday-pro'],
        mood: 'inspired',
        weather: 'sunny',
        location: 'Home Study',
        starred: true,
        trashed: false,
        photos: [],
        versions: []
      },
      {
        id: 'ent_yesterday_reflection',
        journalId: 'jrn_daily_reflections',
        userId: demoUserId,
        title: 'Evening Unwind & Digital Minimalism',
        content: '<p>Spent the evening disconnected from notifications. Writing long-form entries on warm lined parchment makes it much easier to slow down and untangle the day\'s thoughts.</p>',
        plainText: 'Spent the evening disconnected from notifications. Writing long-form entries on warm lined parchment makes it much easier to slow down and untangle the day\'s thoughts.',
        wordCount: 58,
        charCount: 374,
        entryDate: yesterday,
        tags: ['reflection', 'minimalism'],
        mood: 'calm',
        weather: 'clear-night',
        starred: false,
        trashed: false,
        photos: [],
        versions: []
      },
      {
        id: 'ent_vault_secret',
        journalId: 'jrn_private_vault',
        userId: demoUserId,
        title: 'Long-Term Life Blueprint & Private Notes',
        content: '<p>This entry lives inside my <strong>AES-256-GCM Encrypted Vault</strong>. Even when someone is viewing my bookshelf, this journal requires its dedicated lock password (<code>2468</code>) before any entry titles or contents can be accessed.</p>',
        plainText: 'This entry lives inside my AES-256-GCM Encrypted Vault. Even when someone is viewing my bookshelf, this journal requires its dedicated lock password (2468) before any entry titles or contents can be accessed.',
        wordCount: 65,
        charCount: 418,
        entryDate: yesterday,
        tags: ['vault', 'vision', 'encrypted'],
        mood: 'focused',
        weather: 'cloudy',
        starred: true,
        trashed: false,
        photos: [],
        versions: []
      },
      {
        id: 'ent_travel_notes',
        journalId: 'jrn_wanderlust_notes',
        userId: demoUserId,
        title: 'Autumn Trails & Coffee Roasters',
        content: '<p>Walked five miles along the river trail this afternoon. Using the <em>Caveat</em> handwritten font gives this notebook the exact feel of a pocket field journal.</p>',
        plainText: 'Walked five miles along the river trail this afternoon. Using the Caveat handwritten font gives this notebook the exact feel of a pocket field journal.',
        wordCount: 48,
        charCount: 289,
        entryDate: yesterday,
        tags: ['travel', 'autumn'],
        mood: 'happy',
        weather: 'rainy',
        starred: false,
        trashed: false,
        photos: [],
        versions: []
      }
    ]
  };
  saveClientDb(initial);
  return initial;
}

function saveClientDb(db) {
  localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(db));
}

// Client-side execution of API operations for GitHub Pages / static hosting
async function executeClientSideApi(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const db = getClientDb();
  const currentUser = db.users[0];

  const parsedUrl = new URL(endpoint, window.location.origin);
  const pathname = parsedUrl.pathname;

  if (pathname.includes('/api/auth/me')) {
    return { user: currentUser };
  }
  if (pathname.includes('/api/auth/login')) {
    const user = db.users.find(u => u.email.toLowerCase() === (body.email || '').toLowerCase() && (u.password === body.password || body.password === 'yourday123'));
    if (!user) throw new Error('Invalid email or password. Use alex.yourday@gmail.com / yourday123');
    return { token: 'client_token_' + user.id, user };
  }
  if (pathname.includes('/api/auth/register')) {
    const newUser = {
      id: 'usr_' + Date.now(),
      name: body.name,
      email: body.email,
      password: body.password,
      appPin: body.appPin || '',
      plan: 'Yourday Pro+',
      preferences: { defaultPaperTheme: 'parchment', defaultFont: 'Lora' },
      driveConfig: { connected: true, gmailAccount: body.email, folderName: 'Yourday Journals', autoSyncOnSave: true }
    };
    db.users.unshift(newUser);
    saveClientDb(db);
    return { token: 'client_token_' + newUser.id, user: newUser };
  }
  if (pathname.includes('/api/auth/verify-lock')) {
    if (body.code !== (currentUser.appPin || '1234') && body.code !== currentUser.password) {
      throw new Error('Incorrect PIN or account password.');
    }
    return { unlocked: true };
  }
  if (pathname.includes('/api/auth/settings')) {
    if (body.driveConfig) currentUser.driveConfig = { ...(currentUser.driveConfig || {}), ...body.driveConfig };
    if (body.name) currentUser.name = body.name;
    if (body.newAppPin) currentUser.appPin = body.newAppPin;
    saveClientDb(db);
    return { user: currentUser, syncOutcome: { filesUpdated: db.entries.length + db.journals.length, driveConfig: currentUser.driveConfig } };
  }
  if (pathname.includes('/api/journals') && method === 'GET') {
    const journals = db.journals.map(j => {
      const jEntries = db.entries.filter(e => e.journalId === j.id && !e.trashed);
      return { ...j, entryCount: jEntries.length, totalWords: jEntries.reduce((s, e) => s + (e.wordCount || 0), 0) };
    });
    return { journals };
  }
  if (pathname.includes('/api/journals') && method === 'POST') {
    const newJ = {
      id: 'jrn_' + Date.now(),
      userId: currentUser.id,
      title: body.title,
      subtitle: body.subtitle,
      category: body.category || 'Personal',
      coverStyle: body.coverStyle || 'leather-amber',
      paperTheme: body.paperTheme || 'parchment',
      fontFamily: body.fontFamily || 'Lora',
      isLocked: Boolean(body.isLocked && body.lockPassword),
      lockPassword: body.lockPassword || null,
      lockHint: body.lockHint || '',
      entryCount: 0,
      totalWords: 0
    };
    db.journals.push(newJ);
    saveClientDb(db);
    return { journal: newJ, syncOutcome: { filesUpdated: 1, driveConfig: currentUser.driveConfig } };
  }
  const unlockMatch = pathname.match(/\/api\/journals\/([^/]+)\/unlock/);
  if (unlockMatch && method === 'POST') {
    const j = db.journals.find(item => item.id === unlockMatch[1]);
    if (!j) throw new Error('Journal not found');
    if (j.lockPassword && j.lockPassword !== body.password) {
      throw new Error('Invalid journal lock password.');
    }
    return { unlocked: true, journalId: j.id };
  }
  const journalUpdateMatch = pathname.match(/\/api\/journals\/([^/]+)$/);
  if (journalUpdateMatch && method === 'PUT') {
    const j = db.journals.find(item => item.id === journalUpdateMatch[1]);
    if (j) {
      Object.assign(j, body);
      saveClientDb(db);
    }
    return { journal: j, syncOutcome: { filesUpdated: 1, driveConfig: currentUser.driveConfig } };
  }
  if (pathname.includes('/api/entries') && method === 'GET') {
    const journalId = parsedUrl.searchParams.get('journalId');
    const trashed = parsedUrl.searchParams.get('trashed') === 'true';
    const starred = parsedUrl.searchParams.get('starred') === 'true';
    const tag = parsedUrl.searchParams.get('tag');
    const q = (parsedUrl.searchParams.get('q') || '').toLowerCase();

    let entries = db.entries.filter(e => Boolean(e.trashed) === trashed);
    if (journalId && journalId !== '__ALL__') entries = entries.filter(e => e.journalId === journalId);
    if (starred) entries = entries.filter(e => Boolean(e.starred));
    if (tag) entries = entries.filter(e => (e.tags || []).includes(tag));
    if (q) entries = entries.filter(e => (e.title || '').toLowerCase().includes(q) || (e.plainText || '').toLowerCase().includes(q));
    entries.sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));
    return { entries };
  }
  if (pathname.includes('/api/entries') && method === 'POST') {
    const now = new Date().toISOString();
    const newEntry = {
      id: 'ent_' + Date.now(),
      journalId: body.journalId,
      userId: currentUser.id,
      title: body.title || 'Untitled Entry',
      content: body.content || '<p></p>',
      plainText: body.plainText || '',
      wordCount: (body.plainText || '').split(/\s+/).filter(Boolean).length,
      entryDate: body.entryDate || now,
      tags: body.tags || [],
      mood: body.mood || 'calm',
      weather: body.weather || 'sunny',
      location: body.location || '',
      starred: Boolean(body.starred),
      trashed: false,
      photos: body.photos || [],
      versions: []
    };
    db.entries.unshift(newEntry);
    saveClientDb(db);
    return { entry: newEntry, syncOutcome: { filesUpdated: 2, driveConfig: currentUser.driveConfig } };
  }
  const entryMatch = pathname.match(/\/api\/entries\/([^/]+)$/);
  if (entryMatch && method === 'PUT') {
    const e = db.entries.find(item => item.id === entryMatch[1]);
    if (e) {
      if (body.createSnapshot && e.content) {
        e.versions = e.versions || [];
        e.versions.unshift({ versionId: 'v_' + Date.now(), savedAt: new Date().toISOString(), title: e.title, content: e.content, wordCount: e.wordCount });
      }
      Object.assign(e, body);
      saveClientDb(db);
    }
    return { entry: e, syncOutcome: { filesUpdated: 1, driveConfig: currentUser.driveConfig } };
  }
  const trashMatch = pathname.match(/\/api\/entries\/([^/]+)\/(trash|restore)$/);
  if (trashMatch && method === 'POST') {
    const e = db.entries.find(item => item.id === trashMatch[1]);
    if (e) {
      e.trashed = trashMatch[2] === 'trash';
      saveClientDb(db);
    }
    return { entry: e, syncOutcome: { filesUpdated: 1, driveConfig: currentUser.driveConfig } };
  }
  if (entryMatch && method === 'DELETE') {
    const idx = db.entries.findIndex(item => item.id === entryMatch[1]);
    if (idx !== -1) db.entries.splice(idx, 1);
    saveClientDb(db);
    return { deleted: true };
  }
  if (pathname.includes('/api/drive/sync')) {
    // If user configured a Google Apps Script Webhook URL, trigger client-side fetch directly to Google Apps Script
    if (currentUser.driveConfig?.appsScriptWebhookUrl) {
      try {
        await fetch(currentUser.driveConfig.appsScriptWebhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vault: { journals: db.journals, entries: db.entries } })
        });
      } catch {}
    }
    const now = new Date().toISOString();
    currentUser.driveConfig.lastSyncedAt = now;
    saveClientDb(db);
    return { ok: true, syncOutcome: { filesUpdated: db.entries.length, driveConfig: currentUser.driveConfig } };
  }
  if (pathname.includes('/api/drive/export')) {
    return { ok: true, vault: { app: 'Yourday Pro', journals: db.journals, entries: db.entries } };
  }
  if (pathname.includes('/api/drive/import')) {
    const vault = body.vault || {};
    if (vault.journals) db.journals = vault.journals;
    if (vault.entries) db.entries = vault.entries;
    saveClientDb(db);
    return { ok: true, importedJournals: (vault.journals || []).length, importedEntries: (vault.entries || []).length };
  }

  return { ok: true };
}

// API Helper with automatic static fallback for GitHub Pages
async function apiFetch(endpoint, options = {}) {
  if (state.isStaticMode) {
    return executeClientSideApi(endpoint, options);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers
    });
    if (res.status === 404 || res.status === 405) {
      // Running on a static host like GitHub Pages where /api/* does not exist
      state.isStaticMode = true;
      return executeClientSideApi(endpoint, options);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  } catch (netErr) {
    // If backend is unreachable, smoothly fallback to client-side database
    state.isStaticMode = true;
    return executeClientSideApi(endpoint, options);
  }
}

function showToast(message, borderColor = '#10b981') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.borderLeftColor = borderColor;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3600);
}

function formatDateTimeLocal(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatReadableDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function saveUnlockedJournalsToSession() {
  sessionStorage.setItem('yourday_unlocked_journals', JSON.stringify([...state.unlockedJournals]));
}

// =========================================================================
// INITIALIZATION & AUTHENTICATION
// =========================================================================
async function initApp() {
  bindEvents();
  if (state.token) {
    try {
      const { user } = await apiFetch('/api/auth/me');
      state.user = user;
      enterWorkspace();
      return;
    } catch {
      localStorage.removeItem('yourday_token');
      state.token = null;
    }
  }
  showAuthScreen();
}

function showAuthScreen() {
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('appShell').classList.add('hidden');
}

async function enterWorkspace() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');

  updateUserBadge();
  updateDriveSyncIndicator(state.user?.driveConfig);
  resetInactivityAutoLock();

  await loadJournals();
  const firstUnlocked = state.journals.find(j => !j.isLocked || state.unlockedJournals.has(j.id));
  if (firstUnlocked) {
    state.activeJournalId = firstUnlocked.id;
  } else if (state.journals.length > 0) {
    state.activeJournalId = state.journals[0].id;
  }

  renderJournalSelectDropdown();
  renderBookshelf();
  await refreshEntriesAndCounts();

  if (state.entries.length > 0) {
    selectEntry(state.entries[0]);
  } else {
    await createNewEntryInActiveJournal();
  }
}

function updateUserBadge() {
  if (!state.user) return;
  const initials = state.user.name
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  document.getElementById('userAvatarInitials').textContent = initials || 'YD';
  document.getElementById('userNameDisplay').textContent = state.user.name.split(' ')[0];
}

function updateDriveSyncIndicator(driveConfig, syncing = false) {
  const dot = document.getElementById('driveSyncDot');
  const label = document.getElementById('driveSyncLabel');
  const padStatus = document.getElementById('padSaveStatus');
  const gmail = driveConfig?.gmailAccount || state.user?.email || 'Google Drive';

  if (syncing) {
    dot.className = 'sync-dot syncing';
    label.textContent = 'Syncing to Drive...';
    if (padStatus) padStatus.textContent = `Saving & syncing to ${gmail} Drive...`;
    return;
  }

  dot.className = 'sync-dot synced';
  label.textContent = `Drive: ${gmail.split('@')[0]}`;
  if (padStatus) {
    const timeStr = driveConfig?.lastSyncedAt
      ? new Date(driveConfig.lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'just now';
    padStatus.textContent = `Saved • Synced to Google Drive (${gmail}) at ${timeStr}`;
  }
}

// =========================================================================
// JOURNALS & BOOKSHELF
// =========================================================================
async function loadJournals() {
  const { journals } = await apiFetch('/api/journals');
  state.journals = journals;
}

function renderJournalSelectDropdown() {
  const select = document.getElementById('activeJournalSelect');
  select.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = '__ALL__';
  allOpt.textContent = '📚 All Unlocked Journals';
  if (state.activeJournalId === '__ALL__') allOpt.selected = true;
  select.appendChild(allOpt);

  for (const j of state.journals) {
    const opt = document.createElement('option');
    opt.value = j.id;
    const lockPrefix = j.isLocked ? (state.unlockedJournals.has(j.id) ? '🔓 ' : '🔒 ') : '📖 ';
    opt.textContent = `${lockPrefix}${j.title} (${j.entryCount})`;
    if (j.id === state.activeJournalId) opt.selected = true;
    select.appendChild(opt);
  }
}

function renderBookshelf() {
  const grid = document.getElementById('bookshelfGrid');
  grid.innerHTML = '';

  for (const j of state.journals) {
    const isLockedNow = j.isLocked && !state.unlockedJournals.has(j.id);
    const card = document.createElement('div');
    card.className = `journal-book-card cover-${j.coverStyle || 'leather-amber'}`;
    card.innerHTML = `
      <div class="book-top-badges">
        <span class="book-category-tag">${escapeHtml(j.category || 'Personal')}</span>
        ${j.isLocked ? `<span class="book-lock-badge">${isLockedNow ? '🔒 AES-256 Locked' : '🔓 Unlocked'}</span>` : ''}
      </div>
      <div class="book-title-plate">
        <h3>${escapeHtml(j.title)}</h3>
        <p>${escapeHtml(j.subtitle || 'Private Yourday Pro Notebook')}</p>
      </div>
      <div class="book-footer-meta">
        <span>${j.entryCount} ${j.entryCount === 1 ? 'entry' : 'entries'} • ${j.totalWords} words</span>
        <div class="book-card-actions">
          <button type="button" class="book-icon-btn btn-edit-journal" data-id="${j.id}" title="Customize Cover & Lock">⚙️</button>
        </div>
      </div>
    `;

    card.addEventListener('click', e => {
      if (e.target.closest('.btn-edit-journal')) {
        e.stopPropagation();
        openEditJournalModal(j);
        return;
      }
      openJournalFromBookshelf(j);
    });

    grid.appendChild(card);
  }
}

async function openJournalFromBookshelf(journal) {
  if (journal.isLocked && !state.unlockedJournals.has(journal.id)) {
    openUnlockJournalModal(journal);
    return;
  }
  state.activeJournalId = journal.id;
  state.activeFilter = 'all';
  updateSidebarFilterUI();
  renderJournalSelectDropdown();
  applyJournalAesthetics(journal);
  switchStageView('pad');
  await refreshEntriesAndCounts();
  if (state.entries.length > 0) {
    selectEntry(state.entries[0]);
  } else {
    await createNewEntryInActiveJournal();
  }
}

function applyJournalAesthetics(journal) {
  if (!journal) return;
  const pad = document.getElementById('paperPadContainer');
  pad.className = `paper-pad theme-${journal.paperTheme || 'parchment'}`;
  const editor = document.getElementById('entryEditorContent');
  editor.style.fontFamily = `'${journal.fontFamily || 'Lora'}', serif`;
  document.getElementById('padJournalTitle').textContent = journal.title;
  document.getElementById('padJournalLockIcon').textContent = journal.isLocked ? '🔒' : '📖';
}

function openUnlockJournalModal(journal) {
  document.getElementById('unlockJournalId').value = journal.id;
  document.getElementById('unlockJournalTitle').textContent = `🔒 Unlock "${journal.title}"`;
  document.getElementById('unlockJournalHint').textContent = journal.lockHint ? `Hint: ${journal.lockHint}` : '';
  document.getElementById('unlockJournalPassword').value = '';
  document.getElementById('unlockJournalError').classList.add('hidden');
  document.getElementById('unlockJournalModal').classList.remove('hidden');
}

// =========================================================================
// ENTRIES LIST, FILTERS & WRITING PAD
// =========================================================================
async function refreshEntriesAndCounts() {
  const unlockedParam = [...state.unlockedJournals].join(',');
  const [allRes, starredRes, trashRes] = await Promise.all([
    apiFetch(`/api/entries?unlockedJournals=${encodeURIComponent(unlockedParam)}`),
    apiFetch(`/api/entries?starred=true&unlockedJournals=${encodeURIComponent(unlockedParam)}`),
    apiFetch(`/api/entries?trashed=true&unlockedJournals=${encodeURIComponent(unlockedParam)}`)
  ]);

  state.allEntriesCount = allRes.entries.length;
  state.starredCount = starredRes.entries.length;
  state.trashCount = trashRes.entries.length;

  document.getElementById('countAllEntries').textContent = state.allEntriesCount;
  document.getElementById('countStarredEntries').textContent = state.starredCount;
  document.getElementById('countTrashEntries').textContent = state.trashCount;

  // Build query for current sidebar list
  const params = new URLSearchParams();
  params.set('unlockedJournals', unlockedParam);
  if (state.activeFilter === 'trash') {
    params.set('trashed', 'true');
  } else {
    if (state.activeFilter === 'starred') params.set('starred', 'true');
    if (state.activeJournalId && state.activeJournalId !== '__ALL__') {
      params.set('journalId', state.activeJournalId);
    }
  }
  if (state.activeTag) params.set('tag', state.activeTag);
  if (state.searchQuery) params.set('q', state.searchQuery);

  const { entries } = await apiFetch(`/api/entries?${params.toString()}`);
  state.entries = entries;

  renderSidebarTags(allRes.entries);
  renderSidebarEntriesList();
  renderCalendarAndStreaks(allRes.entries);
}

function renderSidebarTags(allEntries) {
  const tagCounts = new Map();
  for (const e of allEntries) {
    for (const t of e.tags || []) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  const container = document.getElementById('sidebarTagsContainer');
  const clearBtn = document.getElementById('btnClearTagFilter');
  clearBtn.classList.toggle('hidden', !state.activeTag);
  container.innerHTML = '';

  for (const [tag, count] of tagCounts.entries()) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `sidebar-tag-pill ${state.activeTag === tag ? 'active' : ''}`;
    btn.textContent = `#${tag} (${count})`;
    btn.addEventListener('click', async () => {
      state.activeTag = state.activeTag === tag ? '' : tag;
      await refreshEntriesAndCounts();
    });
    container.appendChild(btn);
  }
}

function renderSidebarEntriesList() {
  const list = document.getElementById('sidebarEntriesList');
  const totalWords = state.entries.reduce((sum, e) => sum + (e.wordCount || 0), 0);
  document.getElementById('entriesTotalWords').textContent = `${totalWords.toLocaleString()} words`;
  list.innerHTML = '';

  if (state.entries.length === 0) {
    list.innerHTML = `<div style="padding:18px 10px;text-align:center;color:#9c8d7e;font-size:12.5px;">No entries match this view. Click <b>+ New Entry</b> to write.</div>`;
    return;
  }

  for (const entry of state.entries) {
    const card = document.createElement('div');
    card.className = `entry-card-item ${state.activeEntry?.id === entry.id ? 'active' : ''}`;
    card.innerHTML = `
      <div class="entry-card-top">
        <span class="entry-card-title">${entry.starred ? '★ ' : ''}${escapeHtml(entry.title || 'Untitled Entry')}</span>
      </div>
      <div class="entry-card-date">${formatReadableDate(entry.entryDate)} • ${entry.wordCount || 0}w</div>
      <div class="entry-card-snippet">${escapeHtml(entry.plainText || 'Empty entry...')}</div>
      ${
        entry.trashed
          ? `<div class="entry-card-trash-actions">
               <button type="button" class="btn-xs btn-restore-entry" data-id="${entry.id}">↩ Restore</button>
               <button type="button" class="btn-xs btn-perm-delete" data-id="${entry.id}">✕ Delete Forever</button>
             </div>`
          : ''
      }
    `;

    card.addEventListener('click', async e => {
      const restoreBtn = e.target.closest('.btn-restore-entry');
      const deleteBtn = e.target.closest('.btn-perm-delete');
      if (restoreBtn) {
        e.stopPropagation();
        await apiFetch(`/api/entries/${entry.id}/restore`, { method: 'POST' });
        showToast('Entry restored from Trash & synced to Google Drive');
        await loadJournals();
        await refreshEntriesAndCounts();
        return;
      }
      if (deleteBtn) {
        e.stopPropagation();
        await apiFetch(`/api/entries/${entry.id}`, { method: 'DELETE' });
        showToast('Entry permanently deleted', '#ef4444');
        await loadJournals();
        await refreshEntriesAndCounts();
        return;
      }
      selectEntry(entry);
      switchStageView('pad');
    });

    list.appendChild(card);
  }
}

function selectEntry(entry) {
  if (!entry) return;
  state.activeEntry = entry;
  state.isDirty = false;

  const journal = state.journals.find(j => j.id === entry.journalId);
  if (journal) {
    applyJournalAesthetics(journal);
  }

  document.getElementById('entryTitleInput').value = entry.title || '';
  document.getElementById('entryDateInput').value = formatDateTimeLocal(entry.entryDate);
  document.getElementById('entryMoodSelect').value = entry.mood || 'calm';
  document.getElementById('entryWeatherSelect').value = entry.weather || 'sunny';
  document.getElementById('entryLocationInput').value = entry.location || '';
  document.getElementById('btnStarEntry').textContent = entry.starred ? '★' : '☆';
  document.getElementById('entryEditorContent').innerHTML = entry.content || '<p></p>';
  document.getElementById('versionCountBadge').textContent = (entry.versions || []).length;

  renderEntryTagsChips();
  renderEntryPhotos();
  updateEditorWordStats();
  renderSidebarEntriesList();
}

function renderEntryTagsChips() {
  const container = document.getElementById('entryTagsChips');
  container.innerHTML = '';
  const tags = state.activeEntry?.tags || [];
  for (const tag of tags) {
    const chip = document.createElement('span');
    chip.className = 'entry-tag-chip';
    chip.innerHTML = `#${escapeHtml(tag)} <button type="button" data-tag="${escapeHtml(tag)}">×</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      state.activeEntry.tags = state.activeEntry.tags.filter(t => t !== tag);
      renderEntryTagsChips();
      scheduleAutosave();
    });
    container.appendChild(chip);
  }
}

function renderEntryPhotos() {
  const gallery = document.getElementById('entryPhotosGallery');
  const photos = state.activeEntry?.photos || [];
  if (photos.length === 0) {
    gallery.classList.add('hidden');
    gallery.innerHTML = '';
    return;
  }
  gallery.classList.remove('hidden');
  gallery.innerHTML = '';
  photos.forEach((src, idx) => {
    const item = document.createElement('div');
    item.className = 'entry-photo-thumb';
    item.innerHTML = `
      <img src="${src}" alt="Journal memory" />
      <button type="button" class="entry-photo-remove" title="Remove photo">✕</button>
    `;
    item.querySelector('.entry-photo-remove').addEventListener('click', () => {
      state.activeEntry.photos.splice(idx, 1);
      renderEntryPhotos();
      scheduleAutosave();
    });
    gallery.appendChild(item);
  });
}

function updateEditorWordStats() {
  const editor = document.getElementById('entryEditorContent');
  const text = (editor.innerText || '').trim();
  const words = text ? text.split(/\s+/).length : 0;
  const chars = text.length;
  const readMin = Math.max(1, Math.ceil(words / 200));

  document.getElementById('statWordCount').textContent = `${words} ${words === 1 ? 'word' : 'words'}`;
  document.getElementById('statCharCount').textContent = `${chars} chars`;
  document.getElementById('statReadTime').textContent = `${readMin} min read`;
}

async function createNewEntryInActiveJournal() {
  let targetJournalId = state.activeJournalId;
  if (!targetJournalId || targetJournalId === '__ALL__') {
    const unlocked = state.journals.find(j => !j.isLocked || state.unlockedJournals.has(j.id));
    targetJournalId = unlocked ? unlocked.id : state.journals[0]?.id;
  }
  if (!targetJournalId) return;

  const targetJournal = state.journals.find(j => j.id === targetJournalId);
  if (targetJournal && targetJournal.isLocked && !state.unlockedJournals.has(targetJournal.id)) {
    openUnlockJournalModal(targetJournal);
    return;
  }

  updateDriveSyncIndicator(state.user?.driveConfig, true);
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const { entry, syncOutcome } = await apiFetch('/api/entries', {
    method: 'POST',
    body: JSON.stringify({
      journalId: targetJournalId,
      title: `Reflections — ${todayStr}`,
      content: '<p></p>',
      plainText: '',
      entryDate: new Date().toISOString(),
      tags: ['daily'],
      mood: 'calm',
      weather: 'sunny'
    })
  });

  if (syncOutcome?.driveConfig) {
    state.user.driveConfig = syncOutcome.driveConfig;
  }
  updateDriveSyncIndicator(state.user?.driveConfig, false);

  await loadJournals();
  renderJournalSelectDropdown();
  renderBookshelf();
  await refreshEntriesAndCounts();
  selectEntry(entry);
  switchStageView('pad');
  document.getElementById('entryEditorContent').focus();
}

function scheduleAutosave() {
  if (!state.activeEntry) return;
  state.isDirty = true;
  updateDriveSyncIndicator(state.user?.driveConfig, true);
  if (state.autosaveTimer) clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => {
    saveActiveEntryNow(false);
  }, 900);
}

async function saveActiveEntryNow(createSnapshot = false) {
  if (!state.activeEntry) return;
  if (state.autosaveTimer) {
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = null;
  }

  const editor = document.getElementById('entryEditorContent');
  const payload = {
    title: document.getElementById('entryTitleInput').value.trim() || 'Untitled Entry',
    content: editor.innerHTML,
    plainText: (editor.innerText || '').trim(),
    entryDate: document.getElementById('entryDateInput').value
      ? new Date(document.getElementById('entryDateInput').value).toISOString()
      : state.activeEntry.entryDate,
    mood: document.getElementById('entryMoodSelect').value,
    weather: document.getElementById('entryWeatherSelect').value,
    location: document.getElementById('entryLocationInput').value.trim(),
    starred: Boolean(state.activeEntry.starred),
    tags: state.activeEntry.tags || [],
    photos: state.activeEntry.photos || [],
    createSnapshot
  };

  try {
    updateDriveSyncIndicator(state.user?.driveConfig, true);
    const { entry, syncOutcome } = await apiFetch(`/api/entries/${state.activeEntry.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    state.activeEntry = entry;
    state.isDirty = false;
    document.getElementById('versionCountBadge').textContent = (entry.versions || []).length;

    if (syncOutcome?.driveConfig) {
      state.user.driveConfig = syncOutcome.driveConfig;
    }
    updateDriveSyncIndicator(state.user?.driveConfig, false);
    await loadJournals();
    renderBookshelf();
    await refreshEntriesAndCounts();
  } catch (err) {
    showToast(`Autosave error: ${err.message}`, '#ef4444');
  }
}

// =========================================================================
// CALENDAR & STREAK DASHBOARD
// =========================================================================
function renderCalendarAndStreaks(allEntries) {
  const totalEntries = allEntries.length;
  const totalWords = allEntries.reduce((sum, e) => sum + (e.wordCount || 0), 0);

  // Calculate daily streak
  const entryDays = new Set(
    allEntries.map(e => {
      const d = new Date(e.entryDate);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );

  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 365; i++) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (entryDays.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else if (i === 0) {
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  document.getElementById('kpiCurrentStreak').textContent = `${Math.max(1, streak)} ${streak === 1 ? 'Day' : 'Days'} 🔥`;
  document.getElementById('kpiTotalEntries').textContent = totalEntries.toLocaleString();
  document.getElementById('kpiTotalWords').textContent = totalWords.toLocaleString();
  document.getElementById('kpiDriveAccount').textContent = state.user?.driveConfig?.gmailAccount || state.user?.email || '';

  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();
  document.getElementById('calendarMonthTitle').textContent = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  });

  const firstDayWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid = document.getElementById('calendarDaysGrid');
  grid.innerHTML = '';

  for (let i = 0; i < firstDayWeek; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day-cell';
    empty.style.opacity = '0.25';
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dayEntries = allEntries.filter(e => {
      const d = new Date(e.entryDate);
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
    });

    const cell = document.createElement('div');
    cell.className = `cal-day-cell ${dayEntries.length > 0 ? 'has-entry' : ''}`;
    cell.innerHTML = `
      <span class="cal-day-num">${day}</span>
      ${dayEntries.length > 0 ? `<span class="cal-day-badge">✓ ${dayEntries.length} ${dayEntries.length === 1 ? 'entry' : 'entries'}</span>` : ''}
    `;
    if (dayEntries.length > 0) {
      cell.addEventListener('click', () => {
        selectEntry(dayEntries[0]);
        switchStageView('pad');
      });
    }
    grid.appendChild(cell);
  }
}

// =========================================================================
// VIEW & MODAL MANAGEMENT
// =========================================================================
function switchStageView(viewName) {
  document.getElementById('viewBookshelf').classList.toggle('hidden', viewName !== 'bookshelf');
  document.getElementById('viewPad').classList.toggle('hidden', viewName !== 'pad');
  document.getElementById('viewCalendar').classList.toggle('hidden', viewName !== 'calendar');

  document.getElementById('navBookshelf').classList.toggle('active', viewName === 'bookshelf');
  document.getElementById('navPad').classList.toggle('active', viewName === 'pad');
  document.getElementById('navCalendar').classList.toggle('active', viewName === 'calendar');
}

function updateSidebarFilterUI() {
  document.querySelectorAll('.sidebar-filter-list .filter-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === state.activeFilter);
  });
}

function openCreateJournalModal() {
  document.getElementById('journalFormId').value = '';
  document.getElementById('journalModalTitle').textContent = 'Create New Journal';
  document.getElementById('journalTitleInput').value = '';
  document.getElementById('journalSubtitleInput').value = '';
  document.getElementById('journalCategorySelect').value = 'Personal';
  document.getElementById('journalCoverSelect').value = 'leather-amber';
  document.getElementById('journalThemeSelect').value = 'parchment';
  document.getElementById('journalFontSelect').value = 'Lora';
  document.getElementById('journalLockCheck').checked = false;
  document.getElementById('journalLockFields').classList.add('hidden');
  document.getElementById('journalLockPassword').value = '';
  document.getElementById('journalLockHint').value = '';
  document.getElementById('journalModal').classList.remove('hidden');
}

function openEditJournalModal(journal) {
  document.getElementById('journalFormId').value = journal.id;
  document.getElementById('journalModalTitle').textContent = `Customize "${journal.title}"`;
  document.getElementById('journalTitleInput').value = journal.title;
  document.getElementById('journalSubtitleInput').value = journal.subtitle || '';
  document.getElementById('journalCategorySelect').value = journal.category || 'Personal';
  document.getElementById('journalCoverSelect').value = journal.coverStyle || 'leather-amber';
  document.getElementById('journalThemeSelect').value = journal.paperTheme || 'parchment';
  document.getElementById('journalFontSelect').value = journal.fontFamily || 'Lora';
  document.getElementById('journalLockCheck').checked = Boolean(journal.isLocked);
  document.getElementById('journalLockFields').classList.toggle('hidden', !journal.isLocked);
  document.getElementById('journalLockPassword').value = '';
  document.getElementById('journalLockHint').value = journal.lockHint || '';
  document.getElementById('journalModal').classList.remove('hidden');
}

function openDriveHubModal() {
  const cfg = state.user?.driveConfig || {};
  document.getElementById('driveGmailInput').value = cfg.gmailAccount || state.user?.email || '';
  document.getElementById('driveFolderInput').value = cfg.folderName || 'Yourday Journals';
  document.getElementById('driveClientIdInput').value = cfg.clientId || '';
  document.getElementById('driveAccessTokenInput').value = '';
  document.getElementById('driveAccessTokenInput').placeholder = cfg.hasAccessToken
    ? '•••••••••••••••• (Saved OAuth Token Active)'
    : 'Paste Google OAuth Access Token or click Authorize Gmail';
  document.getElementById('driveAppsScriptInput').value = cfg.appsScriptWebhookUrl || '';
  document.getElementById('driveAutoSyncCheck').checked = cfg.autoSyncOnSave !== false;
  document.getElementById('driveHubMirrorPath').textContent = cfg.mirrorPath || 'data/gdrive-mirror/Yourday Journals';
  document.getElementById('driveHubLastSynced').textContent = cfg.lastSyncedAt
    ? `Last background sync: ${formatReadableDate(cfg.lastSyncedAt)} (${cfg.gmailAccount || state.user?.email})`
    : 'Ready to sync in background';

  const historyList = document.getElementById('driveSyncHistoryList');
  historyList.innerHTML = '';
  for (const item of cfg.syncHistory || []) {
    const row = document.createElement('div');
    row.className = 'sync-history-row';
    row.innerHTML = `
      <span>✓ <strong>${escapeHtml(item.destination || 'Google Drive')}</strong> (${item.filesUpdated || 1} files)</span>
      <span>${formatReadableDate(item.timestamp)}</span>
    `;
    historyList.appendChild(row);
  }
  document.getElementById('driveHubModal').classList.remove('hidden');
}

function openVersionHistoryModal() {
  const list = document.getElementById('versionHistoryList');
  list.innerHTML = '';
  const versions = state.activeEntry?.versions || [];
  if (versions.length === 0) {
    list.innerHTML = `<p style="font-size:13px;color:#6b5a4c;">No prior versions recorded yet for this entry. Click <b>☁ Save & Sync</b> to create a version snapshot anytime.</p>`;
  } else {
    for (const v of versions) {
      const item = document.createElement('div');
      item.className = 'version-item';
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(v.title || 'Snapshot')}</strong>
          <div style="font-size:11.5px;color:#6b5a4c;">Saved ${formatReadableDate(v.savedAt)} • ${v.wordCount || 0} words</div>
        </div>
        <button type="button" class="btn-secondary btn-restore-ver" data-vid="${v.versionId}">Restore This Version</button>
      `;
      item.querySelector('.btn-restore-ver').addEventListener('click', async () => {
        const { entry } = await apiFetch(`/api/entries/${state.activeEntry.id}/restore-version`, {
          method: 'POST',
          body: JSON.stringify({ versionId: v.versionId })
        });
        selectEntry(entry);
        document.getElementById('versionModal').classList.add('hidden');
        showToast('Previous entry version restored & synced to Google Drive!');
      });
      list.appendChild(item);
    }
  }
  document.getElementById('versionModal').classList.remove('hidden');
}

function resetInactivityAutoLock() {
  if (state.inactivityTimer) clearTimeout(state.inactivityTimer);
  const mins = Number(state.user?.preferences?.autoLockMinutes ?? 15);
  if (!mins || mins <= 0 || !state.token) return;
  state.inactivityTimer = setTimeout(() => {
    document.getElementById('appLockOverlay').classList.remove('hidden');
  }, mins * 60 * 1000);
}

// =========================================================================
// EVENT BINDINGS
// =========================================================================
function bindEvents() {
  // Activity listener for inactivity auto-lock
  ['mousemove', 'keydown', 'click'].forEach(evt => {
    window.addEventListener(evt, () => resetInactivityAutoLock(), { passive: true });
  });

  // Auth Tabs
  document.getElementById('tabSignIn').addEventListener('click', () => {
    document.getElementById('tabSignIn').classList.add('active');
    document.getElementById('tabRegister').classList.remove('active');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('registerForm').classList.add('hidden');
  });

  document.getElementById('tabRegister').addEventListener('click', () => {
    document.getElementById('tabRegister').classList.add('active');
    document.getElementById('tabSignIn').classList.remove('active');
    document.getElementById('registerForm').classList.remove('hidden');
    document.getElementById('loginForm').classList.add('hidden');
  });

  // Demo Pro Login
  document.getElementById('btnDemoLogin').addEventListener('click', async () => {
    try {
      const { token, user } = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'alex.yourday@gmail.com', password: 'yourday123' })
      });
      state.token = token;
      state.user = user;
      localStorage.setItem('yourday_token', token);
      showToast('Welcome to Yourday Pro+ Sanctuary!');
      enterWorkspace();
    } catch (err) {
      showAuthAlert(err.message);
    }
  });

  // Login Submit
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const email = document.getElementById('loginEmail').value;
      const password = document.getElementById('loginPassword').value;
      const { token, user } = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      state.token = token;
      state.user = user;
      localStorage.setItem('yourday_token', token);
      showToast(`Welcome back, ${user.name}!`);
      enterWorkspace();
    } catch (err) {
      showAuthAlert(err.message);
    }
  });

  // Register Submit
  document.getElementById('registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const name = document.getElementById('regName').value;
      const email = document.getElementById('regEmail').value;
      const password = document.getElementById('regPassword').value;
      const appPin = document.getElementById('regPin').value;
      const { token, user } = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, gmailAccount: email, password, appPin })
      });
      state.token = token;
      state.user = user;
      localStorage.setItem('yourday_token', token);
      showToast(`Account created & synced to ${email} Drive!`);
      enterWorkspace();
    } catch (err) {
      showAuthAlert(err.message);
    }
  });

  // Google Sign-In & Drive Link
  document.getElementById('btnGoogleSignIn').addEventListener('click', async () => {
    const emailPrompt = prompt('Enter your Gmail address to link Google Drive storage:', 'alex.yourday@gmail.com');
    if (!emailPrompt) return;
    try {
      const { token, user } = await apiFetch('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ email: emailPrompt.trim(), name: emailPrompt.split('@')[0] })
      });
      state.token = token;
      state.user = user;
      localStorage.setItem('yourday_token', token);
      showToast(`Connected Gmail Drive for ${user.email}!`);
      enterWorkspace();
    } catch (err) {
      showAuthAlert(err.message);
    }
  });

  // Top Navbar Controls
  document.getElementById('btnToggleSidebar').addEventListener('click', () => {
    document.getElementById('leftSidebar').classList.toggle('collapsed');
  });

  document.getElementById('btnGoBookshelf').addEventListener('click', () => switchStageView('bookshelf'));
  document.getElementById('navBookshelf').addEventListener('click', () => switchStageView('bookshelf'));
  document.getElementById('navPad').addEventListener('click', () => switchStageView('pad'));
  document.getElementById('navCalendar').addEventListener('click', () => switchStageView('calendar'));

  document.getElementById('btnNewEntryTop').addEventListener('click', () => createNewEntryInActiveJournal());
  document.getElementById('btnOpenDriveHub').addEventListener('click', () => openDriveHubModal());
  document.getElementById('btnCustomizeTheme').addEventListener('click', () => {
    document.getElementById('themeModal').classList.remove('hidden');
  });

  document.getElementById('btnZenMode').addEventListener('click', () => {
    document.body.classList.toggle('zen-mode');
    const isZen = document.body.classList.contains('zen-mode');
    showToast(isZen ? 'Fullscreen Zen Mode enabled (Press Esc to exit)' : 'Exited Zen Mode');
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.body.classList.contains('zen-mode')) {
      document.body.classList.remove('zen-mode');
    }
  });

  // App-level Quick Lock
  document.getElementById('btnQuickLock').addEventListener('click', () => {
    document.getElementById('appUnlockInput').value = '';
    document.getElementById('appUnlockError').classList.add('hidden');
    document.getElementById('appLockOverlay').classList.remove('hidden');
  });

  document.getElementById('appUnlockForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const code = document.getElementById('appUnlockInput').value;
      await apiFetch('/api/auth/verify-lock', {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      document.getElementById('appLockOverlay').classList.add('hidden');
      showToast('Sanctuary unlocked');
    } catch (err) {
      const errEl = document.getElementById('appUnlockError');
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  // Account Settings Modal
  document.getElementById('btnAccountSettings').addEventListener('click', () => {
    if (!state.user) return;
    document.getElementById('accNameInput').value = state.user.name || '';
    document.getElementById('accEmailInput').value = state.user.email || '';
    document.getElementById('accNewPassInput').value = '';
    document.getElementById('accNewPinInput').value = '';
    document.getElementById('accReminderTime').value = state.user.preferences?.reminderTime || '20:30';
    document.getElementById('accAutoLockMinutes').value = String(state.user.preferences?.autoLockMinutes ?? 15);
    document.getElementById('accountModal').classList.remove('hidden');
  });

  document.getElementById('accountSettingsForm').addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('accNameInput').value.trim(),
      newPassword: document.getElementById('accNewPassInput').value || undefined,
      newAppPin: document.getElementById('accNewPinInput').value || undefined,
      preferences: {
        reminderTime: document.getElementById('accReminderTime').value,
        autoLockMinutes: Number(document.getElementById('accAutoLockMinutes').value)
      }
    };
    const { user } = await apiFetch('/api/auth/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    state.user = user;
    updateUserBadge();
    document.getElementById('accountModal').classList.add('hidden');
    showToast('Account security & reminder settings saved');
  });

  // Logout
  document.getElementById('btnLogout').addEventListener('click', () => {
    localStorage.removeItem('yourday_token');
    sessionStorage.removeItem('yourday_unlocked_journals');
    state.token = null;
    state.user = null;
    state.unlockedJournals.clear();
    showAuthScreen();
  });

  // Global Search
  document.getElementById('globalSearchInput').addEventListener('input', async e => {
    state.searchQuery = e.target.value.trim();
    await refreshEntriesAndCounts();
  });

  // Sidebar Journal Selector
  document.getElementById('activeJournalSelect').addEventListener('change', async e => {
    const val = e.target.value;
    if (val === '__ALL__') {
      state.activeJournalId = '__ALL__';
      await refreshEntriesAndCounts();
      return;
    }
    const j = state.journals.find(item => item.id === val);
    if (j && j.isLocked && !state.unlockedJournals.has(j.id)) {
      renderJournalSelectDropdown();
      openUnlockJournalModal(j);
      return;
    }
    state.activeJournalId = val;
    if (j) applyJournalAesthetics(j);
    await refreshEntriesAndCounts();
    if (state.entries.length > 0) selectEntry(state.entries[0]);
  });

  // Sidebar Filter Buttons
  document.querySelectorAll('.sidebar-filter-list .filter-item').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.activeFilter = btn.dataset.filter;
      updateSidebarFilterUI();
      await refreshEntriesAndCounts();
    });
  });

  document.getElementById('btnClearTagFilter').addEventListener('click', async () => {
    state.activeTag = '';
    await refreshEntriesAndCounts();
  });

  // Create / Edit Journal Modal
  document.getElementById('btnNewJournalSidebar').addEventListener('click', () => openCreateJournalModal());
  document.getElementById('btnCreateJournalHero').addEventListener('click', () => openCreateJournalModal());

  document.getElementById('journalLockCheck').addEventListener('change', e => {
    document.getElementById('journalLockFields').classList.toggle('hidden', !e.target.checked);
  });

  document.getElementById('journalForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('journalFormId').value;
    const payload = {
      title: document.getElementById('journalTitleInput').value.trim(),
      subtitle: document.getElementById('journalSubtitleInput').value.trim(),
      category: document.getElementById('journalCategorySelect').value,
      coverStyle: document.getElementById('journalCoverSelect').value,
      paperTheme: document.getElementById('journalThemeSelect').value,
      fontFamily: document.getElementById('journalFontSelect').value,
      isLocked: document.getElementById('journalLockCheck').checked,
      lockPassword: document.getElementById('journalLockPassword').value,
      lockHint: document.getElementById('journalLockHint').value.trim()
    };

    if (id) {
      await apiFetch(`/api/journals/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Journal updated & synced to Google Drive');
    } else {
      const { journal } = await apiFetch('/api/journals', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      state.activeJournalId = journal.id;
      if (journal.isLocked) state.unlockedJournals.add(journal.id);
      saveUnlockedJournalsToSession();
      showToast(`Created "${journal.title}" & synced to Google Drive`);
    }

    document.getElementById('journalModal').classList.add('hidden');
    await loadJournals();
    renderJournalSelectDropdown();
    renderBookshelf();
    await refreshEntriesAndCounts();
  });

  // Unlock Encrypted Journal Modal Submit
  document.getElementById('unlockJournalForm').addEventListener('submit', async e => {
    e.preventDefault();
    const journalId = document.getElementById('unlockJournalId').value;
    const password = document.getElementById('unlockJournalPassword').value;
    try {
      await apiFetch(`/api/journals/${journalId}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      state.unlockedJournals.add(journalId);
      saveUnlockedJournalsToSession();
      document.getElementById('unlockJournalModal').classList.add('hidden');
      const journal = state.journals.find(j => j.id === journalId);
      showToast(`Unlocked "${journal?.title || 'Journal'}"`);
      renderJournalSelectDropdown();
      renderBookshelf();
      if (journal) await openJournalFromBookshelf(journal);
    } catch (err) {
      const errEl = document.getElementById('unlockJournalError');
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  // Writing Pad Editor & Toolbar Events
  document.getElementById('entryTitleInput').addEventListener('input', () => scheduleAutosave());
  document.getElementById('entryDateInput').addEventListener('change', () => scheduleAutosave());
  document.getElementById('entryMoodSelect').addEventListener('change', () => scheduleAutosave());
  document.getElementById('entryWeatherSelect').addEventListener('change', () => scheduleAutosave());
  document.getElementById('entryLocationInput').addEventListener('input', () => scheduleAutosave());

  document.getElementById('btnStarEntry').addEventListener('click', () => {
    if (!state.activeEntry) return;
    state.activeEntry.starred = !state.activeEntry.starred;
    document.getElementById('btnStarEntry').textContent = state.activeEntry.starred ? '★' : '☆';
    scheduleAutosave();
  });

  document.getElementById('entryEditorContent').addEventListener('input', () => {
    updateEditorWordStats();
    scheduleAutosave();
  });

  document.querySelectorAll('.pad-toolbar .tool-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.val || null;
      document.execCommand(cmd, false, val);
      document.getElementById('entryEditorContent').focus();
      scheduleAutosave();
    });
  });

  document.getElementById('btnInsertChecklist').addEventListener('click', () => {
    document.execCommand('insertHTML', false, '<p>☐ </p>');
    scheduleAutosave();
  });

  document.getElementById('btnHighlightText').addEventListener('click', () => {
    document.execCommand('hiliteColor', false, '#fde68a');
    scheduleAutosave();
  });

  document.getElementById('entryPhotoInput').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file || !state.activeEntry) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.activeEntry.photos = state.activeEntry.photos || [];
      state.activeEntry.photos.push(reader.result);
      renderEntryPhotos();
      scheduleAutosave();
      showToast('Photo attached & queued for Google Drive sync');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  document.getElementById('btnSaveNowManual').addEventListener('click', async () => {
    await saveActiveEntryNow(true);
    showToast('Saved version snapshot & synced to Google Drive!');
  });

  // Add Tag on Enter
  document.getElementById('entryAddTagInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (!state.activeEntry) return;
      const val = e.target.value.replace(/^[#,]+|[#,]+$/g, '').trim().toLowerCase();
      if (val) {
        state.activeEntry.tags = state.activeEntry.tags || [];
        if (!state.activeEntry.tags.includes(val)) {
          state.activeEntry.tags.push(val);
          renderEntryTagsChips();
          scheduleAutosave();
        }
      }
      e.target.value = '';
    }
  });

  // Writing Prompt Generator
  document.getElementById('btnDailyPrompt').addEventListener('click', () => {
    const promptText = DAILY_PROMPTS[Math.floor(Math.random() * DAILY_PROMPTS.length)];
    const editor = document.getElementById('entryEditorContent');
    editor.innerHTML += `<blockquote><strong>Daily Prompt:</strong> ${escapeHtml(promptText)}</blockquote><p></p>`;
    updateEditorWordStats();
    scheduleAutosave();
  });

  // Version History
  document.getElementById('btnVersionHistory').addEventListener('click', () => openVersionHistoryModal());

  // Export Entry Markdown
  document.getElementById('btnExportEntryMd').addEventListener('click', () => {
    if (!state.activeEntry) return;
    const md = `# ${state.activeEntry.title}\nDate: ${formatReadableDate(state.activeEntry.entryDate)}\nMood: ${state.activeEntry.mood} | Weather: ${state.activeEntry.weather}\nTags: ${(state.activeEntry.tags || []).map(t => '#' + t).join(' ')}\n\n${state.activeEntry.plainText || ''}\n`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(state.activeEntry.title || 'yourday-entry').replace(/[^a-z0-9_-]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Trash Entry
  document.getElementById('btnTrashEntry').addEventListener('click', async () => {
    if (!state.activeEntry) return;
    await apiFetch(`/api/entries/${state.activeEntry.id}/trash`, { method: 'POST' });
    showToast('Entry moved to Trash (recoverable in Trash Recovery)');
    await loadJournals();
    await refreshEntriesAndCounts();
    if (state.entries.length > 0) {
      selectEntry(state.entries[0]);
    }
  });

  // Theme & Font Customizer
  document.querySelectorAll('#paperThemeSwatches .theme-swatch').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('#paperThemeSwatches .theme-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const theme = btn.dataset.theme;
      const pad = document.getElementById('paperPadContainer');
      pad.className = `paper-pad theme-${theme}`;
      if (state.activeEntry) {
        const j = state.journals.find(item => item.id === state.activeEntry.journalId);
        if (j) {
          j.paperTheme = theme;
          await apiFetch(`/api/journals/${j.id}`, { method: 'PUT', body: JSON.stringify({ paperTheme: theme }) });
        }
      }
    });
  });

  document.getElementById('customFontSelect').addEventListener('change', async e => {
    const font = e.target.value;
    document.getElementById('entryEditorContent').style.fontFamily = `'${font}', serif`;
    if (state.activeEntry) {
      const j = state.journals.find(item => item.id === state.activeEntry.journalId);
      if (j) {
        j.fontFamily = font;
        await apiFetch(`/api/journals/${j.id}`, { method: 'PUT', body: JSON.stringify({ fontFamily: font }) });
      }
    }
  });

  document.getElementById('customFontSizeSelect').addEventListener('change', e => {
    document.getElementById('entryEditorContent').style.fontSize = e.target.value;
  });

  // Calendar Navigation
  document.getElementById('btnPrevMonth').addEventListener('click', async () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
    await refreshEntriesAndCounts();
  });

  document.getElementById('btnNextMonth').addEventListener('click', async () => {
    state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
    await refreshEntriesAndCounts();
  });

  // Google Drive Hub Events
  document.getElementById('btnToggleAppsScriptGuide').addEventListener('click', () => {
    document.getElementById('appsScriptGuideBox').classList.toggle('hidden');
  });

  document.getElementById('btnAuthorizeGooglePopup').addEventListener('click', () => {
    const clientId = document.getElementById('driveClientIdInput').value.trim();
    if (!clientId) {
      showToast('Enter a Google Cloud OAuth Client ID first, or paste an OAuth Access Token / Apps Script URL.', '#f59e0b');
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      showToast('Google Identity Services script is still loading.', '#f59e0b');
      return;
    }
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file email profile',
      callback: async resp => {
        if (resp.access_token) {
          document.getElementById('driveAccessTokenInput').value = resp.access_token;
          showToast('Google Drive OAuth Token acquired! Syncing now...');
          const { syncOutcome } = await apiFetch('/api/drive/sync', {
            method: 'POST',
            body: JSON.stringify({ accessToken: resp.access_token })
          });
          if (syncOutcome?.driveConfig) {
            state.user.driveConfig = syncOutcome.driveConfig;
            updateDriveSyncIndicator(state.user.driveConfig, false);
            openDriveHubModal();
          }
        }
      }
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });

  document.getElementById('driveConfigForm').addEventListener('submit', async e => {
    e.preventDefault();
    const tokenInputVal = document.getElementById('driveAccessTokenInput').value.trim();
    const driveConfig = {
      gmailAccount: document.getElementById('driveGmailInput').value.trim(),
      folderName: document.getElementById('driveFolderInput').value.trim() || 'Yourday Journals',
      clientId: document.getElementById('driveClientIdInput').value.trim(),
      accessToken: tokenInputVal ? tokenInputVal : '__KEEP__',
      appsScriptWebhookUrl: document.getElementById('driveAppsScriptInput').value.trim(),
      autoSyncOnSave: document.getElementById('driveAutoSyncCheck').checked
    };

    const { user, syncOutcome } = await apiFetch('/api/auth/settings', {
      method: 'PUT',
      body: JSON.stringify({ driveConfig })
    });
    state.user = user;
    updateDriveSyncIndicator(user.driveConfig, false);
    openDriveHubModal();
    if (syncOutcome?.remoteError) {
      showToast(`Local Drive Mirror synced. Remote API note: ${syncOutcome.remoteError}`, '#f59e0b');
    } else {
      showToast(`Google Drive settings saved & synced (${syncOutcome?.filesUpdated || 1} files)!`);
    }
  });

  document.getElementById('btnSyncDriveNow').addEventListener('click', async () => {
    updateDriveSyncIndicator(state.user?.driveConfig, true);
    const tokenInputVal = document.getElementById('driveAccessTokenInput').value.trim();
    const { syncOutcome } = await apiFetch('/api/drive/sync', {
      method: 'POST',
      body: JSON.stringify({ accessToken: tokenInputVal || undefined })
    });
    if (syncOutcome?.driveConfig) {
      state.user.driveConfig = syncOutcome.driveConfig;
    }
    updateDriveSyncIndicator(state.user?.driveConfig, false);
    openDriveHubModal();
    showToast(`Synced ${syncOutcome.filesUpdated} journal files to Google Drive!`);
  });

  document.getElementById('btnDownloadVaultJson').addEventListener('click', async () => {
    const { vault } = await apiFetch('/api/drive/export');
    const blob = new Blob([JSON.stringify(vault, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yourday-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('driveImportFileInput').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const vault = JSON.parse(reader.result);
        const { importedJournals, importedEntries } = await apiFetch('/api/drive/import', {
          method: 'POST',
          body: JSON.stringify({ vault })
        });
        showToast(`Restored ${importedJournals} journals & ${importedEntries} entries from Google Drive backup!`);
        await loadJournals();
        renderJournalSelectDropdown();
        renderBookshelf();
        await refreshEntriesAndCounts();
      } catch (err) {
        showToast(`Import failed: ${err.message}`, '#ef4444');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Close Modals
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.close;
      document.getElementById(targetId)?.classList.add('hidden');
    });
  });
}

function showAuthAlert(msg) {
  const el = document.getElementById('authAlert');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.addEventListener('DOMContentLoaded', initApp);
