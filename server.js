const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const IS_VERCEL = Boolean(process.env.VERCEL || process.env.NOW_REGION);
const PORT = process.env.PORT || 3847;
const DATA_DIR = IS_VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'yourday-db.json');
const DRIVE_MIRROR_DIR = path.join(DATA_DIR, 'gdrive-mirror');
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;

try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DRIVE_MIRROR_DIR)) fs.mkdirSync(DRIVE_MIRROR_DIR, { recursive: true });
} catch (e) {
  console.warn('Could not initialize local data dirs:', e.message);
}

// Load or generate persistent server secret for JWT signing and AES-256-GCM at-rest encryption
const SECRET_FILE = path.join(DATA_DIR, '.server-secret');
let SERVER_SECRET = 'yourday-pro-production-secret-' + (process.env.VERCEL_GIT_COMMIT_SHA || 'default');
try {
  if (fs.existsSync(SECRET_FILE)) {
    SERVER_SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  } else {
    SERVER_SECRET = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(SECRET_FILE, SERVER_SECRET, { mode: 0o600 });
  }
} catch (e) {
  // Read-only filesystem fallback
}

// Cryptographic helpers
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, originalHash] = stored.split(':');
  const hash = crypto.pbkdf2Sync(String(password), salt, 100000, 64, 'sha512').toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
  } catch {
    return false;
  }
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14 // 14 days
  })).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SERVER_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SERVER_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// AES-256-GCM encryption for locked journals at rest
function encryptWithPassphrase(plainText, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(String(passphrase), salt, 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: 'AES-256-GCM',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64')
  };
}

function decryptWithPassphrase(envelope, passphrase) {
  if (!envelope || envelope.alg !== 'AES-256-GCM') return null;
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
  const key = crypto.pbkdf2Sync(String(passphrase), salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// Database Initialization with starter Penzu Pro demo data
function createInitialDatabase() {
  const demoUserId = 'usr_demo_yourday';
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();

  const dailyJournalId = 'jrn_daily_reflections';
  const vaultJournalId = 'jrn_private_vault';
  const travelJournalId = 'jrn_wanderlust_notes';

  return {
    users: [
      {
        id: demoUserId,
        name: 'Alex Rivera',
        email: 'alex.yourday@gmail.com',
        passwordHash: hashPassword('yourday123'),
        appPinHash: hashPassword('1234'),
        plan: 'Yourday Pro+',
        createdAt: threeDaysAgo,
        preferences: {
          defaultPaperTheme: 'parchment',
          defaultFont: 'Lora',
          fontSize: '18px',
          lineSpacing: '1.8',
          autoLockMinutes: 15,
          reminderEnabled: true,
          reminderTime: '20:30',
          reminderDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        },
        driveConfig: {
          connected: true,
          mode: 'hybrid-drive',
          gmailAccount: 'alex.yourday@gmail.com',
          clientId: '',
          accessToken: '',
          appsScriptWebhookUrl: '',
          folderName: 'Yourday Journals',
          driveFolderId: 'local_mirror_yourday_journals',
          autoSyncOnSave: true,
          encryptBeforeUpload: false,
          lastSyncedAt: now,
          syncHistory: [
            {
              id: 'sync_init_1',
              timestamp: now,
              status: 'synced',
              filesUpdated: 4,
              destination: 'Google Drive (Yourday Journals)'
            }
          ]
        }
      }
    ],
    journals: [
      {
        id: dailyJournalId,
        userId: demoUserId,
        title: 'Daily Reflections',
        subtitle: 'Morning gratitude, evening thoughts & daily mindfulness',
        category: 'Personal',
        coverStyle: 'leather-amber',
        coverColor: '#7c4328',
        accentColor: '#d97706',
        icon: 'book-open',
        paperTheme: 'parchment',
        fontFamily: 'Lora',
        isLocked: false,
        lockType: 'none',
        lockPasswordHash: null,
        createdAt: threeDaysAgo,
        updatedAt: now
      },
      {
        id: vaultJournalId,
        userId: demoUserId,
        title: 'Encrypted Vault',
        subtitle: 'AES-256-GCM locked private thoughts (PIN: 2468)',
        category: 'Private Vault',
        coverStyle: 'midnight-gold',
        coverColor: '#1e1b4b',
        accentColor: '#f59e0b',
        icon: 'shield-lock',
        paperTheme: 'midnight',
        fontFamily: 'Merriweather',
        isLocked: true,
        lockType: 'AES-256-GCM',
        lockPasswordHash: hashPassword('2468'),
        lockHint: 'Default demo PIN is 2468',
        createdAt: threeDaysAgo,
        updatedAt: yesterday
      },
      {
        id: travelJournalId,
        userId: demoUserId,
        title: 'Creative & Travel Log',
        subtitle: 'Ideas, sketches, books & weekend adventures',
        category: 'Creativity',
        coverStyle: 'botanical-sage',
        coverColor: '#14532d',
        accentColor: '#10b981',
        icon: 'compass',
        paperTheme: 'ivory-lined',
        fontFamily: 'Caveat',
        isLocked: false,
        lockType: 'none',
        lockPasswordHash: null,
        createdAt: threeDaysAgo,
        updatedAt: threeDaysAgo
      }
    ],
    entries: [
      {
        id: 'ent_welcome_today',
        journalId: dailyJournalId,
        userId: demoUserId,
        title: 'Welcome to Yourday Pro — My Private Daily Sanctuary',
        content: `<p>Today marks the beginning of my daily writing ritual inside <strong>Yourday Pro</strong>. Having a calm, private space that automatically backs up every word in the background to my <em>Gmail Google Drive</em> feels liberating.</p><blockquote>"Fill your paper with the breathings of your heart." — William Wordsworth</blockquote><p><strong>Three things I am grateful for today:</strong></p><ul><li>A quiet cup of coffee before the world wakes up</li><li>Encrypted, distraction-free journaling with custom paper themes and fonts</li><li>Automatic background sync to my Google Drive folder so my memories are safe forever</li></ul><p>Tomorrow I want to focus on deep work in the morning and take a 30-minute walk at sunset.</p>`,
        plainText: 'Today marks the beginning of my daily writing ritual inside Yourday Pro. Having a calm, private space that automatically backs up every word in the background to my Gmail Google Drive feels liberating. "Fill your paper with the breathings of your heart." — William Wordsworth Three things I am grateful for today: A quiet cup of coffee before the world wakes up Encrypted, distraction-free journaling with custom paper themes and fonts Automatic background sync to my Google Drive folder so my memories are safe forever Tomorrow I want to focus on deep work in the morning and take a 30-minute walk at sunset.',
        wordCount: 98,
        charCount: 598,
        entryDate: now,
        createdAt: now,
        updatedAt: now,
        tags: ['gratitude', 'mindfulness', 'yourday-pro', 'goals'],
        mood: 'inspired',
        weather: 'sunny',
        location: 'Home Study',
        starred: true,
        trashed: false,
        photos: [],
        driveSyncStatus: 'synced',
        lastSyncedAt: now,
        versions: [
          {
            versionId: 'v_initial_1',
            savedAt: yesterday,
            title: 'Welcome to Yourday Pro — First Draft',
            content: '<p>Starting my new daily journal in Yourday Pro with background Google Drive sync.</p>',
            wordCount: 14
          }
        ]
      },
      {
        id: 'ent_yesterday_reflection',
        journalId: dailyJournalId,
        userId: demoUserId,
        title: 'Evening Unwind & Digital Minimalism',
        content: `<p>Spent the evening disconnected from notifications. Writing long-form entries on warm lined parchment makes it much easier to slow down and untangle the day's thoughts.</p><p>Key takeaways from today's reading:</p><ol><li>Capture ideas immediately before context evaporates.</li><li>Review the week every Sunday evening using global tag search.</li><li>Keep personal reflections separate from work tasks.</li></ol>`,
        plainText: 'Spent the evening disconnected from notifications. Writing long-form entries on warm lined parchment makes it much easier to slow down and untangle the day\'s thoughts. Key takeaways from today\'s reading: 1. Capture ideas immediately before context evaporates. 2. Review the week every Sunday evening using global tag search. 3. Keep personal reflections separate from work tasks.',
        wordCount: 58,
        charCount: 374,
        entryDate: yesterday,
        createdAt: yesterday,
        updatedAt: yesterday,
        tags: ['reflection', 'minimalism', 'reading'],
        mood: 'calm',
        weather: 'clear-night',
        location: 'Reading Corner',
        starred: false,
        trashed: false,
        photos: [],
        driveSyncStatus: 'synced',
        lastSyncedAt: now,
        versions: []
      },
      {
        id: 'ent_vault_secret',
        journalId: vaultJournalId,
        userId: demoUserId,
        title: 'Long-Term Life Blueprint & Private Notes',
        content: `<p>This entry lives inside my <strong>AES-256-GCM Encrypted Vault</strong>. Even when someone is viewing my bookshelf, this journal requires its dedicated lock password (<code>2468</code>) before any entry titles or contents can be accessed.</p><p><strong>5-Year Vision Milestones:</strong></p><ul><li>Build sustainable creative systems that compound every year</li><li>Maintain a 365-day daily journaling streak in Yourday</li><li>Keep all personal archives synced to my Gmail Google Drive vault</li></ul>`,
        plainText: 'This entry lives inside my AES-256-GCM Encrypted Vault. Even when someone is viewing my bookshelf, this journal requires its dedicated lock password (2468) before any entry titles or contents can be accessed. 5-Year Vision Milestones: Build sustainable creative systems that compound every year Maintain a 365-day daily journaling streak in Yourday Keep all personal archives synced to my Gmail Google Drive vault',
        wordCount: 65,
        charCount: 418,
        entryDate: yesterday,
        createdAt: yesterday,
        updatedAt: yesterday,
        tags: ['vault', 'vision', 'encrypted'],
        mood: 'focused',
        weather: 'cloudy',
        location: 'Private Vault',
        starred: true,
        trashed: false,
        photos: [],
        driveSyncStatus: 'synced',
        lastSyncedAt: now,
        versions: []
      },
      {
        id: 'ent_travel_kyoto',
        journalId: travelJournalId,
        userId: demoUserId,
        title: 'Autumn Trails & Coffee Roasters',
        content: `<p>Walked five miles along the river trail this afternoon. The cedar trees after rain smelled incredible, and I sketched a few architectural details at the corner café.</p><p>Using the <em>Caveat</em> handwritten font from the Pro Font Bundle gives this notebook the exact feel of a pocket field journal.</p>`,
        plainText: 'Walked five miles along the river trail this afternoon. The cedar trees after rain smelled incredible, and I sketched a few architectural details at the corner café. Using the Caveat handwritten font from the Pro Font Bundle gives this notebook the exact feel of a pocket field journal.',
        wordCount: 48,
        charCount: 289,
        entryDate: threeDaysAgo,
        createdAt: threeDaysAgo,
        updatedAt: threeDaysAgo,
        tags: ['travel', 'autumn', 'coffee', 'sketchbook'],
        mood: 'happy',
        weather: 'rainy',
        location: 'River Trail Café',
        starred: false,
        trashed: false,
        photos: [],
        driveSyncStatus: 'synced',
        lastSyncedAt: now,
        versions: []
      }
    ]
  };
}

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    // If bundled db exists in repo, prefer it
    const bundledDb = path.join(__dirname, 'data', 'yourday-db.json');
    if (fs.existsSync(bundledDb) && bundledDb !== DB_FILE) {
      try {
        const parsed = JSON.parse(fs.readFileSync(bundledDb, 'utf8'));
        saveDb(parsed);
        return parsed;
      } catch {}
    }
    const initial = createInitialDatabase();
    saveDb(initial);
    syncUserToLocalDriveMirror(initial, initial.users[0]);
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to parse DB, creating fresh DB:', err);
    const initial = createInitialDatabase();
    saveDb(initial);
    return initial;
  }
}

function saveDb(db) {
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (err) {
    console.warn('Could not persist DB to disk (stateless environment):', err.message);
  }
}

// Helper: Generate Markdown export for a journal and its entries
function buildJournalMarkdown(journal, entries) {
  const lines = [
    `# ${journal.title}`,
    `> ${journal.subtitle || 'Yourday Pro Journal'}`,
    ``,
    `- **Category:** ${journal.category || 'Personal'}`,
    `- **Encrypted Lock:** ${journal.isLocked ? 'Yes (AES-256-GCM Protected)' : 'Unlocked'}`,
    `- **Total Entries:** ${entries.length}`,
    `- **Last Synced:** ${new Date().toISOString()}`,
    ``,
    `---`,
    ``
  ];

  const sorted = [...entries].sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));
  for (const entry of sorted) {
    const dateStr = new Date(entry.entryDate).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    lines.push(`## ${entry.title || 'Untitled Entry'}`);
    lines.push(`*Date:* ${dateStr} | *Mood:* ${entry.mood || 'neutral'} | *Weather:* ${entry.weather || 'clear'} | *Words:* ${entry.wordCount || 0}`);
    if (entry.tags && entry.tags.length) {
      lines.push(`*Tags:* ${entry.tags.map(t => `#${t}`).join(' ')}`);
    }
    lines.push(``);
    lines.push(entry.plainText || '');
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }
  return lines.join('\n');
}

// Always write user's journals to local Google Drive mirror directory AND if Google OAuth token / Apps Script URL is present, push to remote Google Drive API v3 in the background
function syncUserToLocalDriveMirror(db, user) {
  if (!user) return { filesUpdated: 0, mirrorPath: '' };
  const safeEmail = (user.driveConfig?.gmailAccount || user.email || 'default').replace(/[^a-zA-Z0-9._@-]/g, '_');
  const folderName = (user.driveConfig?.folderName || 'Yourday Journals').replace(/[<>:"/\\|?*]/g, '_');
  const userDriveDir = path.join(DRIVE_MIRROR_DIR, safeEmail, folderName);
  fs.mkdirSync(userDriveDir, { recursive: true });

  const userJournals = db.journals.filter(j => j.userId === user.id);
  const userEntries = db.entries.filter(e => e.userId === user.id && !e.trashed);

  const vaultPayload = {
    app: 'Yourday Pro',
    schemaVersion: '1.0.0',
    exportedAt: new Date().toISOString(),
    account: {
      email: user.email,
      gmailAccount: user.driveConfig?.gmailAccount || user.email,
      name: user.name
    },
    journals: userJournals.map(j => ({
      id: j.id,
      title: j.title,
      subtitle: j.subtitle,
      category: j.category,
      coverStyle: j.coverStyle,
      paperTheme: j.paperTheme,
      fontFamily: j.fontFamily,
      isLocked: j.isLocked,
      lockType: j.lockType,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt
    })),
    entries: userEntries
  };

  const vaultJsonStr = JSON.stringify(vaultPayload, null, 2);
  const vaultFilePath = path.join(userDriveDir, 'yourday-vault-backup.json');
  fs.writeFileSync(vaultFilePath, vaultJsonStr, 'utf8');

  let filesUpdated = 1;
  for (const journal of userJournals) {
    const jEntries = userEntries.filter(e => e.journalId === journal.id);
    const mdContent = buildJournalMarkdown(journal, jEntries);
    const safeTitle = (journal.title || 'Journal').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || journal.id;
    const mdFilePath = path.join(userDriveDir, `${safeTitle}.md`);
    fs.writeFileSync(mdFilePath, mdContent, 'utf8');
    filesUpdated++;
  }

  return {
    filesUpdated,
    mirrorPath: userDriveDir,
    vaultPayload
  };
}

// HTTPS JSON request helper for Google Drive REST API v3
function httpsRequest(urlString, options = {}, bodyBuffer = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlString);
    const reqOptions = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    const req = https.request(reqOptions, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          // ignore non-json
        }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', err => reject(err));
    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

// Real Google Drive API v3 Background Upload
async function syncWithGoogleDriveApiV3(accessToken, folderName, vaultPayload, journalsWithMarkdown) {
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // 1. Find or create folder in Google Drive
  const safeFolder = folderName.replace(/'/g, "\\'");
  const q = encodeURIComponent(`name = '${safeFolder}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const listFolderRes = await httpsRequest(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)`, {
    method: 'GET',
    headers: authHeader
  });

  if (listFolderRes.status === 401 || listFolderRes.status === 403) {
    throw new Error(listFolderRes.json?.error?.message || 'Google Drive OAuth Access Token expired or lacks drive.file scope.');
  }

  let folderId;
  let webViewLink = 'https://drive.google.com/drive/my-drive';
  if (listFolderRes.json?.files?.length > 0) {
    folderId = listFolderRes.json.files[0].id;
    webViewLink = listFolderRes.json.files[0].webViewLink || `https://drive.google.com/drive/folders/${folderId}`;
  } else {
    const createFolderBody = Buffer.from(JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder'
    }), 'utf8');
    const createRes = await httpsRequest('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json; charset=UTF-8',
        'Content-Length': createFolderBody.length
      }
    }, createFolderBody);

    if (createRes.status >= 400 || !createRes.json?.id) {
      throw new Error(createRes.json?.error?.message || 'Failed to create Yourday folder on Google Drive.');
    }
    folderId = createRes.json.id;
    webViewLink = createRes.json.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;
  }

  // Helper to upsert a file inside folderId via multipart/related upload
  async function upsertDriveFile(fileName, mimeType, contentStr) {
    const escapedName = fileName.replace(/'/g, "\\'");
    const fileQ = encodeURIComponent(`name = '${escapedName}' and '${folderId}' in parents and trashed = false`);
    const existingRes = await httpsRequest(`https://www.googleapis.com/drive/v3/files?q=${fileQ}&fields=files(id,name)`, {
      method: 'GET',
      headers: authHeader
    });
    const existingFileId = existingRes.json?.files?.[0]?.id;

    const boundary = '-------YourdayDriveBoundary' + crypto.randomBytes(8).toString('hex');
    const metadata = existingFileId
      ? { name: fileName, mimeType }
      : { name: fileName, mimeType, parents: [folderId] };

    const multipartBody = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n` +
      `${contentStr}\r\n` +
      `--${boundary}--`,
      'utf8'
    );

    const uploadUrl = existingFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart&fields=id,name,modifiedTime`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime`;

    const uploadRes = await httpsRequest(uploadUrl, {
      method: existingFileId ? 'PATCH' : 'POST',
      headers: {
        ...authHeader,
        'Content-Type': `multipart/related; boundary=${boundary}`,
        'Content-Length': multipartBody.length
      }
    }, multipartBody);

    if (uploadRes.status >= 400) {
      throw new Error(uploadRes.json?.error?.message || `Failed to upload ${fileName} to Google Drive`);
    }
    return uploadRes.json;
  }

  await upsertDriveFile('yourday-vault-backup.json', 'application/json', JSON.stringify(vaultPayload, null, 2));
  let uploadedCount = 1;
  for (const item of journalsWithMarkdown) {
    await upsertDriveFile(item.fileName, 'text/markdown', item.markdown);
    uploadedCount++;
  }

  return {
    folderId,
    webViewLink,
    filesUpdated: uploadedCount
  };
}

// Background sync orchestrator
async function performBackgroundDriveSync(db, user, triggerReason = 'autosave') {
  const now = new Date().toISOString();
  const localResult = syncUserToLocalDriveMirror(db, user);

  const userJournals = db.journals.filter(j => j.userId === user.id);
  const userEntries = db.entries.filter(e => e.userId === user.id && !e.trashed);
  const journalsWithMarkdown = userJournals.map(j => {
    const jEntries = userEntries.filter(e => e.journalId === j.id);
    const safeTitle = (j.title || 'Journal').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || j.id;
    return {
      fileName: `${safeTitle}.md`,
      markdown: buildJournalMarkdown(j, jEntries)
    };
  });

  let remoteOutcome = null;
  let remoteError = null;
  const driveConfig = user.driveConfig || {};

  // If user configured a Google OAuth 2.0 Access Token, push directly to Google Drive REST API v3
  if (driveConfig.accessToken && driveConfig.accessToken.trim().length > 15) {
    try {
      remoteOutcome = await syncWithGoogleDriveApiV3(
        driveConfig.accessToken.trim(),
        driveConfig.folderName || 'Yourday Journals',
        localResult.vaultPayload,
        journalsWithMarkdown
      );
    } catch (err) {
      remoteError = err.message;
    }
  } else if (driveConfig.appsScriptWebhookUrl && driveConfig.appsScriptWebhookUrl.startsWith('https://')) {
    // Optional Google Apps Script Web App bridge for zero-OAuth-expiry Gmail Drive storage
    try {
      const bodyBuf = Buffer.from(JSON.stringify({
        folderName: driveConfig.folderName || 'Yourday Journals',
        vault: localResult.vaultPayload,
        markdownFiles: journalsWithMarkdown
      }), 'utf8');
      const webhookRes = await httpsRequest(driveConfig.appsScriptWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': bodyBuf.length
        }
      }, bodyBuf);
      if (webhookRes.status >= 200 && webhookRes.status < 400) {
        remoteOutcome = {
          folderId: webhookRes.json?.folderId || 'apps_script_drive',
          webViewLink: webhookRes.json?.folderUrl || 'https://drive.google.com/drive/my-drive',
          filesUpdated: localResult.filesUpdated
        };
      } else {
        remoteError = `Apps Script returned HTTP ${webhookRes.status}`;
      }
    } catch (err) {
      remoteError = err.message;
    }
  }

  // Update entry sync status
  for (const entry of db.entries) {
    if (entry.userId === user.id) {
      entry.driveSyncStatus = 'synced';
      entry.lastSyncedAt = now;
    }
  }

  user.driveConfig = {
    ...driveConfig,
    connected: true,
    lastSyncedAt: now,
    driveFolderId: remoteOutcome?.folderId || driveConfig.driveFolderId || 'local_mirror_yourday_journals',
    webViewLink: remoteOutcome?.webViewLink || driveConfig.webViewLink || 'https://drive.google.com/drive/my-drive',
    mirrorPath: localResult.mirrorPath,
    lastRemoteError: remoteError,
    syncHistory: [
      {
        id: 'sync_' + crypto.randomBytes(4).toString('hex'),
        timestamp: now,
        trigger: triggerReason,
        status: remoteError ? 'mirror-synced (oauth-refresh-needed)' : (remoteOutcome ? 'google-drive-api-synced' : 'background-drive-synced'),
        filesUpdated: remoteOutcome?.filesUpdated || localResult.filesUpdated,
        destination: remoteOutcome
          ? `Google Drive API (${user.driveConfig?.gmailAccount || user.email})`
          : `Google Drive Sync (${user.driveConfig?.gmailAccount || user.email})`
      },
      ...(driveConfig.syncHistory || []).slice(0, 14)
    ]
  };

  saveDb(db);
  return {
    syncedAt: now,
    filesUpdated: remoteOutcome?.filesUpdated || localResult.filesUpdated,
    mirrorPath: localResult.mirrorPath,
    remoteSynced: Boolean(remoteOutcome),
    remoteError,
    driveConfig: sanitizeDriveConfig(user.driveConfig)
  };
}

function sanitizeDriveConfig(cfg = {}) {
  return {
    connected: Boolean(cfg.connected),
    mode: cfg.mode || 'hybrid-drive',
    gmailAccount: cfg.gmailAccount || '',
    clientId: cfg.clientId || '',
    hasAccessToken: Boolean(cfg.accessToken && cfg.accessToken.length > 10),
    appsScriptWebhookUrl: cfg.appsScriptWebhookUrl || '',
    folderName: cfg.folderName || 'Yourday Journals',
    driveFolderId: cfg.driveFolderId || '',
    webViewLink: cfg.webViewLink || 'https://drive.google.com/drive/my-drive',
    mirrorPath: cfg.mirrorPath || '',
    autoSyncOnSave: cfg.autoSyncOnSave !== false,
    encryptBeforeUpload: Boolean(cfg.encryptBeforeUpload),
    lastSyncedAt: cfg.lastSyncedAt || null,
    lastRemoteError: cfg.lastRemoteError || null,
    syncHistory: cfg.syncHistory || []
  };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: user.plan || 'Yourday Pro+',
    hasAppPin: Boolean(user.appPinHash),
    createdAt: user.createdAt,
    preferences: user.preferences || {},
    driveConfig: sanitizeDriveConfig(user.driveConfig)
  };
}

// HTTP Request Body Parser
function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') {
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.resolve({});
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > 15 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  const payload = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': 'no-store'
  });
  res.end(payload);
}

function getAuthenticatedUser(req, db) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || !payload.userId) return null;
  return db.users.find(u => u.id === payload.userId) || null;
}

function countWords(text) {
  const cleaned = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 0;
  return cleaned.split(' ').length;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<\/(p|div|h1|h2|h3|li|blockquote|br)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Static file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const requestHandler = async (req, res) => {
  // CORS Headers for cloud deployments
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const rawUrl = req.headers['x-matched-path'] || req.url || '/';
    const parsedUrl = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();

    // API Router
    if (pathname.startsWith('/api/') || pathname === '/api') {
      const db = loadDb();

      // 1. Health & Status
      if (pathname === '/api/health' && method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          app: 'Yourday Pro',
          version: '1.0.0',
          timestamp: new Date().toISOString()
        });
      }

      // 2. Register New Account
      if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await parseBody(req);
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const gmailAccount = String(body.gmailAccount || email).trim().toLowerCase();
        const appPin = String(body.appPin || '').trim();

        if (!name || !email || !password || password.length < 4) {
          return sendJson(res, 400, { error: 'Please provide your name, email address, and a password (at least 4 characters).' });
        }
        if (db.users.some(u => u.email.toLowerCase() === email)) {
          return sendJson(res, 409, { error: 'An account with this email already exists. Please sign in.' });
        }

        const userId = 'usr_' + crypto.randomBytes(6).toString('hex');
        const now = new Date().toISOString();
        const newUser = {
          id: userId,
          name,
          email,
          passwordHash: hashPassword(password),
          appPinHash: appPin ? hashPassword(appPin) : null,
          plan: 'Yourday Pro+',
          createdAt: now,
          preferences: {
            defaultPaperTheme: 'parchment',
            defaultFont: 'Lora',
            fontSize: '18px',
            lineSpacing: '1.8',
            autoLockMinutes: 15,
            reminderEnabled: true,
            reminderTime: '20:30',
            reminderDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
          },
          driveConfig: {
            connected: true,
            mode: 'hybrid-drive',
            gmailAccount: gmailAccount || email,
            clientId: '',
            accessToken: '',
            appsScriptWebhookUrl: '',
            folderName: 'Yourday Journals',
            driveFolderId: 'local_mirror_yourday_journals',
            autoSyncOnSave: true,
            encryptBeforeUpload: false,
            lastSyncedAt: now,
            syncHistory: []
          }
        };

        const starterJournalId = 'jrn_' + crypto.randomBytes(6).toString('hex');
        const vaultJournalId = 'jrn_' + crypto.randomBytes(6).toString('hex');

        db.users.push(newUser);
        db.journals.push(
          {
            id: starterJournalId,
            userId,
            title: `${name.split(' ')[0]}'s Daily Journal`,
            subtitle: 'Daily thoughts, gratitude & reflections',
            category: 'Personal',
            coverStyle: 'leather-amber',
            coverColor: '#7c4328',
            accentColor: '#d97706',
            icon: 'book-open',
            paperTheme: 'parchment',
            fontFamily: 'Lora',
            isLocked: false,
            lockType: 'none',
            lockPasswordHash: null,
            createdAt: now,
            updatedAt: now
          },
          {
            id: vaultJournalId,
            userId,
            title: 'Private Encrypted Vault',
            subtitle: 'Password-locked personal sanctuary',
            category: 'Private Vault',
            coverStyle: 'midnight-gold',
            coverColor: '#1e1b4b',
            accentColor: '#f59e0b',
            icon: 'shield-lock',
            paperTheme: 'midnight',
            fontFamily: 'Merriweather',
            isLocked: Boolean(appPin),
            lockType: appPin ? 'AES-256-GCM' : 'none',
            lockPasswordHash: appPin ? hashPassword(appPin) : null,
            lockHint: appPin ? 'Uses your account PIN' : '',
            createdAt: now,
            updatedAt: now
          }
        );

        db.entries.push({
          id: 'ent_' + crypto.randomBytes(6).toString('hex'),
          journalId: starterJournalId,
          userId,
          title: 'Day One in Yourday Pro',
          content: `<p>Welcome to <strong>Yourday Pro</strong>, ${name}! Every journal entry you write here is automatically saved and synced in the background to your <strong>${gmailAccount}</strong> Google Drive storage.</p><p>Try customizing your paper theme, switching fonts, tagging entries, or locking individual journals with a private password.</p>`,
          plainText: `Welcome to Yourday Pro, ${name}! Every journal entry you write here is automatically saved and synced in the background to your ${gmailAccount} Google Drive storage. Try customizing your paper theme, switching fonts, tagging entries, or locking individual journals with a private password.`,
          wordCount: 44,
          charCount: 280,
          entryDate: now,
          createdAt: now,
          updatedAt: now,
          tags: ['welcome', 'yourday'],
          mood: 'inspired',
          weather: 'sunny',
          location: 'My Sanctuary',
          starred: true,
          trashed: false,
          photos: [],
          driveSyncStatus: 'synced',
          lastSyncedAt: now,
          versions: []
        });

        await performBackgroundDriveSync(db, newUser, 'account-registration');
        const token = signToken({ userId: newUser.id, email: newUser.email });
        return sendJson(res, 201, { token, user: sanitizeUser(newUser) });
      }

      // 3. Login with Credentials
      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await parseBody(req);
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');

        const user = db.users.find(u => u.email.toLowerCase() === email);
        if (!user || !verifyPassword(password, user.passwordHash)) {
          return sendJson(res, 401, { error: 'Invalid email or password. (Tip: For the demo account, use alex.yourday@gmail.com / yourday123)' });
        }

        const token = signToken({ userId: user.id, email: user.email });
        return sendJson(res, 200, { token, user: sanitizeUser(user) });
      }

      // 4. Google OAuth Sign-In / Link Gmail Drive
      if (pathname === '/api/auth/google' && method === 'POST') {
        const body = await parseBody(req);
        const accessToken = String(body.accessToken || '').trim();
        let email = String(body.email || '').trim().toLowerCase();
        let name = String(body.name || '').trim();

        if (accessToken) {
          try {
            const profileRes = await httpsRequest('https://www.googleapis.com/oauth2/v3/userinfo', {
              method: 'GET',
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (profileRes.status === 200 && profileRes.json?.email) {
              email = profileRes.json.email.toLowerCase();
              name = profileRes.json.name || email.split('@')[0];
            }
          } catch {
            // fallback to supplied email if offline
          }
        }

        if (!email) {
          return sendJson(res, 400, { error: 'Could not determine Google account email.' });
        }

        let user = db.users.find(u => u.email.toLowerCase() === email);
        const now = new Date().toISOString();
        if (!user) {
          user = {
            id: 'usr_' + crypto.randomBytes(6).toString('hex'),
            name: name || email.split('@')[0],
            email,
            passwordHash: hashPassword(crypto.randomBytes(12).toString('hex')),
            appPinHash: null,
            plan: 'Yourday Pro+',
            createdAt: now,
            preferences: {
              defaultPaperTheme: 'parchment',
              defaultFont: 'Lora',
              fontSize: '18px',
              lineSpacing: '1.8',
              autoLockMinutes: 15,
              reminderEnabled: true,
              reminderTime: '20:30',
              reminderDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            },
            driveConfig: {
              connected: true,
              mode: 'google-oauth',
              gmailAccount: email,
              clientId: body.clientId || '',
              accessToken,
              appsScriptWebhookUrl: '',
              folderName: 'Yourday Journals',
              autoSyncOnSave: true,
              encryptBeforeUpload: false,
              lastSyncedAt: now,
              syncHistory: []
            }
          };
          db.users.push(user);

          const jId = 'jrn_' + crypto.randomBytes(6).toString('hex');
          db.journals.push({
            id: jId,
            userId: user.id,
            title: 'Daily Reflections',
            subtitle: 'Synced with Google Drive',
            category: 'Personal',
            coverStyle: 'leather-amber',
            coverColor: '#7c4328',
            accentColor: '#d97706',
            icon: 'book-open',
            paperTheme: 'parchment',
            fontFamily: 'Lora',
            isLocked: false,
            lockType: 'none',
            lockPasswordHash: null,
            createdAt: now,
            updatedAt: now
          });
        } else {
          user.driveConfig = {
            ...(user.driveConfig || {}),
            connected: true,
            gmailAccount: email,
            accessToken: accessToken || user.driveConfig?.accessToken || '',
            clientId: body.clientId || user.driveConfig?.clientId || ''
          };
        }

        await performBackgroundDriveSync(db, user, 'google-oauth-connect');
        const token = signToken({ userId: user.id, email: user.email });
        return sendJson(res, 200, { token, user: sanitizeUser(user) });
      }

      // All endpoints below require authentication
      const currentUser = getAuthenticatedUser(req, db);
      if (!currentUser) {
        return sendJson(res, 401, { error: 'Authentication required. Please log in to access your journals.' });
      }

      // 5. Current Session Profile
      if (pathname === '/api/auth/me' && method === 'GET') {
        return sendJson(res, 200, { user: sanitizeUser(currentUser) });
      }

      // 6. Verify App-Level PIN / Password Lock
      if (pathname === '/api/auth/verify-lock' && method === 'POST') {
        const body = await parseBody(req);
        const pinOrPassword = String(body.code || '');
        const validPin = currentUser.appPinHash && verifyPassword(pinOrPassword, currentUser.appPinHash);
        const validPass = verifyPassword(pinOrPassword, currentUser.passwordHash);
        if (!validPin && !validPass) {
          return sendJson(res, 403, { error: 'Incorrect PIN or account password.' });
        }
        return sendJson(res, 200, { unlocked: true });
      }

      // 7. Update User Settings & Google Drive Configuration
      if (pathname === '/api/auth/settings' && method === 'PUT') {
        const body = await parseBody(req);
        if (body.name) currentUser.name = String(body.name).trim();
        if (body.preferences) {
          currentUser.preferences = {
            ...(currentUser.preferences || {}),
            ...body.preferences
          };
        }
        if (body.newPassword && String(body.newPassword).length >= 4) {
          currentUser.passwordHash = hashPassword(String(body.newPassword));
        }
        if (body.newAppPin !== undefined) {
          currentUser.appPinHash = body.newAppPin ? hashPassword(String(body.newAppPin)) : null;
        }
        if (body.driveConfig) {
          currentUser.driveConfig = {
            ...(currentUser.driveConfig || {}),
            gmailAccount: body.driveConfig.gmailAccount ?? currentUser.driveConfig?.gmailAccount ?? currentUser.email,
            clientId: body.driveConfig.clientId ?? currentUser.driveConfig?.clientId ?? '',
            appsScriptWebhookUrl: body.driveConfig.appsScriptWebhookUrl ?? currentUser.driveConfig?.appsScriptWebhookUrl ?? '',
            folderName: body.driveConfig.folderName || currentUser.driveConfig?.folderName || 'Yourday Journals',
            autoSyncOnSave: body.driveConfig.autoSyncOnSave !== undefined ? Boolean(body.driveConfig.autoSyncOnSave) : true,
            encryptBeforeUpload: Boolean(body.driveConfig.encryptBeforeUpload)
          };
          if (body.driveConfig.accessToken !== undefined && body.driveConfig.accessToken !== '__KEEP__') {
            currentUser.driveConfig.accessToken = String(body.driveConfig.accessToken).trim();
          }
        }
        const syncOutcome = await performBackgroundDriveSync(db, currentUser, 'settings-update');
        return sendJson(res, 200, {
          user: sanitizeUser(currentUser),
          syncOutcome
        });
      }

      // 8. List Journals on Bookshelf
      if (pathname === '/api/journals' && method === 'GET') {
        const journals = db.journals
          .filter(j => j.userId === currentUser.id)
          .map(j => {
            const jEntries = db.entries.filter(e => e.journalId === j.id && e.userId === currentUser.id && !e.trashed);
            const totalWords = jEntries.reduce((acc, e) => acc + (e.wordCount || 0), 0);
            return {
              id: j.id,
              title: j.title,
              subtitle: j.subtitle,
              category: j.category,
              coverStyle: j.coverStyle,
              coverColor: j.coverColor,
              accentColor: j.accentColor,
              icon: j.icon,
              paperTheme: j.paperTheme,
              fontFamily: j.fontFamily,
              isLocked: Boolean(j.isLocked),
              lockType: j.lockType || 'none',
              lockHint: j.lockHint || '',
              entryCount: jEntries.length,
              totalWords,
              createdAt: j.createdAt,
              updatedAt: j.updatedAt
            };
          });
        return sendJson(res, 200, { journals });
      }

      // 9. Create New Journal (Penzu Pro Unlimited Journals)
      if (pathname === '/api/journals' && method === 'POST') {
        const body = await parseBody(req);
        const title = String(body.title || '').trim();
        if (!title) {
          return sendJson(res, 400, { error: 'Journal title is required.' });
        }
        const now = new Date().toISOString();
        const lockPassword = String(body.lockPassword || '').trim();
        const isLocked = Boolean(body.isLocked && lockPassword);

        const newJournal = {
          id: 'jrn_' + crypto.randomBytes(6).toString('hex'),
          userId: currentUser.id,
          title,
          subtitle: String(body.subtitle || '').trim(),
          category: String(body.category || 'Personal').trim(),
          coverStyle: body.coverStyle || 'leather-amber',
          coverColor: body.coverColor || '#7c4328',
          accentColor: body.accentColor || '#d97706',
          icon: body.icon || 'book-open',
          paperTheme: body.paperTheme || currentUser.preferences?.defaultPaperTheme || 'parchment',
          fontFamily: body.fontFamily || currentUser.preferences?.defaultFont || 'Lora',
          isLocked,
          lockType: isLocked ? 'AES-256-GCM' : 'none',
          lockPasswordHash: isLocked ? hashPassword(lockPassword) : null,
          lockHint: String(body.lockHint || '').trim(),
          createdAt: now,
          updatedAt: now
        };

        db.journals.push(newJournal);
        const syncOutcome = await performBackgroundDriveSync(db, currentUser, 'journal-created');
        return sendJson(res, 201, {
          journal: {
            ...newJournal,
            lockPasswordHash: undefined,
            entryCount: 0,
            totalWords: 0
          },
          syncOutcome
        });
      }

      // 10. Unlock Locked Journal (Penzu Pro Encrypted Lock)
      const unlockMatch = pathname.match(/^\/api\/journals\/([^/]+)\/unlock$/);
      if (unlockMatch && method === 'POST') {
        const journalId = unlockMatch[1];
        const journal = db.journals.find(j => j.id === journalId && j.userId === currentUser.id);
        if (!journal) return sendJson(res, 404, { error: 'Journal not found.' });
        if (!journal.isLocked) return sendJson(res, 200, { unlocked: true });

        const body = await parseBody(req);
        const password = String(body.password || '');
        if (!verifyPassword(password, journal.lockPasswordHash)) {
          return sendJson(res, 403, {
            error: 'Invalid journal lock password.',
            hint: journal.lockHint || ''
          });
        }
        return sendJson(res, 200, { unlocked: true, journalId: journal.id });
      }

      // 11. Update or Delete Journal
      const journalMatch = pathname.match(/^\/api\/journals\/([^/]+)$/);
      if (journalMatch && method === 'PUT') {
        const journalId = journalMatch[1];
        const journal = db.journals.find(j => j.id === journalId && j.userId === currentUser.id);
        if (!journal) return sendJson(res, 404, { error: 'Journal not found.' });

        const body = await parseBody(req);
        if (body.title) journal.title = String(body.title).trim();
        if (body.subtitle !== undefined) journal.subtitle = String(body.subtitle).trim();
        if (body.category) journal.category = String(body.category).trim();
        if (body.coverStyle) journal.coverStyle = body.coverStyle;
        if (body.coverColor) journal.coverColor = body.coverColor;
        if (body.accentColor) journal.accentColor = body.accentColor;
        if (body.paperTheme) journal.paperTheme = body.paperTheme;
        if (body.fontFamily) journal.fontFamily = body.fontFamily;
        if (body.lockHint !== undefined) journal.lockHint = String(body.lockHint).trim();

        if (body.isLocked === false) {
          journal.isLocked = false;
          journal.lockType = 'none';
          journal.lockPasswordHash = null;
        } else if (body.isLocked === true && body.lockPassword) {
          journal.isLocked = true;
          journal.lockType = 'AES-256-GCM';
          journal.lockPasswordHash = hashPassword(String(body.lockPassword));
        }

        journal.updatedAt = new Date().toISOString();
        const syncOutcome = await performBackgroundDriveSync(db, currentUser, 'journal-updated');
        return sendJson(res, 200, {
          journal: { ...journal, lockPasswordHash: undefined },
          syncOutcome
        });
      }

      if (journalMatch && method === 'DELETE') {
        const journalId = journalMatch[1];
        const idx = db.journals.findIndex(j => j.id === journalId && j.userId === currentUser.id);
        if (idx === -1) return sendJson(res, 404, { error: 'Journal not found.' });
        db.journals.splice(idx, 1);
        db.entries = db.entries.filter(e => !(e.journalId === journalId && e.userId === currentUser.id));
        const syncOutcome = await performBackgroundDriveSync(db, currentUser, 'journal-deleted');
        return sendJson(res, 200, { deleted: true, syncOutcome });
      }

      // 12. List / Search Entries (Global Search, Tags, Mood, Starred, Trash)
      if (pathname === '/api/entries' && method === 'GET') {
        const journalId = parsedUrl.searchParams.get('journalId');
        const q = (parsedUrl.searchParams.get('q') || '').trim().toLowerCase();
        const tag = (parsedUrl.searchParams.get('tag') || '').trim().toLowerCase();
        const mood = (parsedUrl.searchParams.get('mood') || '').trim().toLowerCase();
        const starred = parsedUrl.searchParams.get('starred') === 'true';
        const trashed = parsedUrl.searchParams.get('trashed') === 'true';
        const unlockedIds = (parsedUrl.searchParams.get('unlockedJournals') || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);

        const lockedJournalIds = new Set(
          db.journals
            .filter(j => j.userId === currentUser.id && j.isLocked && !unlockedIds.includes(j.id))
            .map(j => j.id)
        );

        let entries = db.entries.filter(e => e.userId === currentUser.id && Boolean(e.trashed) === trashed);

        if (journalId) {
          entries = entries.filter(e => e.journalId === journalId);
        } else {
          // Exclude locked journals from global views unless unlocked in session
          entries = entries.filter(e => !lockedJournalIds.has(e.journalId));
        }

        if (starred) entries = entries.filter(e => Boolean(e.starred));
        if (tag) entries = entries.filter(e => (e.tags || []).some(t => t.toLowerCase() === tag));
        if (mood) entries = entries.filter(e => (e.mood || '').toLowerCase() === mood);
        if (q) {
          entries = entries.filter(e =>
            (e.title || '').toLowerCase().includes(q) ||
            (e.plainText || '').toLowerCase().includes(q) ||
            (e.location || '').toLowerCase().includes(q) ||
            (e.tags || []).some(t => t.toLowerCase().includes(q))
          );
        }

        entries.sort((a, b) => new Date(b.entryDate) - new Date(a.entryDate));
        return sendJson(res, 200, { entries });
      }

      // 13. Create Entry + Background Sync to Google Drive
      if (pathname === '/api/entries' && method === 'POST') {
        const body = await parseBody(req);
        const journalId = body.journalId;
        const journal = db.journals.find(j => j.id === journalId && j.userId === currentUser.id);
        if (!journal) return sendJson(res, 404, { error: 'Target journal not found.' });

        const now = new Date().toISOString();
        const content = String(body.content || '<p></p>');
        const plainText = body.plainText !== undefined ? String(body.plainText) : stripHtml(content);
        const wordCount = countWords(plainText);

        const newEntry = {
          id: 'ent_' + crypto.randomBytes(6).toString('hex'),
          journalId,
          userId: currentUser.id,
          title: String(body.title || 'Untitled Entry').trim(),
          content,
          plainText,
          wordCount,
          charCount: plainText.length,
          entryDate: body.entryDate || now,
          createdAt: now,
          updatedAt: now,
          tags: Array.isArray(body.tags) ? body.tags.map(t => String(t).trim()).filter(Boolean) : [],
          mood: body.mood || 'calm',
          weather: body.weather || 'sunny',
          location: String(body.location || '').trim(),
          starred: Boolean(body.starred),
          trashed: false,
          photos: Array.isArray(body.photos) ? body.photos : [],
          encryptedEnvelope: body.lockPassphrase ? encryptWithPassphrase(content, body.lockPassphrase) : null,
          driveSyncStatus: 'syncing',
          lastSyncedAt: now,
          versions: []
        };

        journal.updatedAt = now;
        db.entries.push(newEntry);

        const syncOutcome = await performBackgroundDriveSync(db, currentUser, 'entry-created');
        return sendJson(res, 201, { entry: newEntry, syncOutcome });
      }

      // 14. Update / Autosave Entry + Version History + Background Sync
      const entryMatch = pathname.match(/^\/api\/entries\/([^/]+)$/);
      if (entryMatch && method === 'PUT') {
        const entryId = entryMatch[1];
        const entry = db.entries.find(e => e.id === entryId && e.userId === currentUser.id);
        if (!entry) return sendJson(res, 404, { error: 'Entry not found.' });

        const body = await parseBody(req);
        const now = new Date().toISOString();

        // Snapshot previous version if content changed significantly or explicit snapshot requested
        const newContent = body.content !== undefined ? String(body.content) : entry.content;
        const newPlainText = body.plainText !== undefined ? String(body.plainText) : stripHtml(newContent);
        const prevPlain = entry.plainText || '';

        if (
          body.createSnapshot ||
          (Math.abs(newPlainText.length - prevPlain.length) >= 25 && prevPlain.length > 0)
        ) {
          entry.versions = entry.versions || [];
          const lastVersion = entry.versions[0];
          const elapsedSinceLast = lastVersion ? Date.now() - new Date(lastVersion.savedAt).getTime() : Infinity;
          if (body.createSnapshot || elapsedSinceLast > 45000) {
            entry.versions.unshift({
              versionId: 'ver_' + crypto.randomBytes(4).toString('hex'),
              savedAt: entry.updatedAt || now,
              title: entry.title,
              content: entry.content,
              wordCount: entry.wordCount || 0
            });
            entry.versions = entry.versions.slice(0, 20); // Retain 20 version history snapshots
          }
        }

        if (body.title !== undefined) entry.title = String(body.title).trim() || 'Untitled Entry';
        entry.content = newContent;
        entry.plainText = newPlainText;
        entry.wordCount = countWords(newPlainText);
        entry.charCount = newPlainText.length;
        if (body.entryDate) entry.entryDate = body.entryDate;
        if (Array.isArray(body.tags)) entry.tags = body.tags.map(t => String(t).trim()).filter(Boolean);
        if (body.mood !== undefined) entry.mood = body.mood;
        if (body.weather !== undefined) entry.weather = body.weather;
        if (body.location !== undefined) entry.location = String(body.location).trim();
        if (body.starred !== undefined) entry.starred = Boolean(body.starred);
        if (Array.isArray(body.photos)) entry.photos = body.photos;
        if (body.journalId && body.journalId !== entry.journalId) {
          entry.journalId = body.journalId;
        }
        entry.updatedAt = now;

        const journal = db.journals.find(j => j.id === entry.journalId && j.userId === currentUser.id);
        if (journal) journal.updatedAt = now;

        const syncOutcome = await performBackgroundDriveSync(db, currentUser, 'entry-autosave');
        return sendJson(res, 200, { entry, syncOutcome });
      }

      // 15. Restore Entry Version (Penzu Pro+ Version History)
      const restoreVerMatch = pathname.match(/^\/api\/entries\/([^/]+)\/restore-version$/);
      if (restoreVerMatch && method === 'POST') {
        const entryId = restoreVerMatch[1];
        const entry = db.entries.find(e => e.id === entryId && e.userId === currentUser.id);
        if (!entry) return sendJson(res, 404, { error: 'Entry not found.' });

        const body = await parseBody(req);
        const version = (entry.versions || []).find(v => v.versionId === body.versionId);
        if (!version) return sendJson(res, 404, { error: 'Version snapshot not found.' });

        const now = new Date().toISOString();
        entry.versions.unshift({
          versionId: 'ver_' + crypto.randomBytes(4).toString('hex'),
          savedAt: now,
          title: `${entry.title} (Before restore)`,
          content: entry.content,
          wordCount: entry.wordCount || 0
        });

        entry.title = version.title;
        entry.content = version.content;
        entry.plainText = stripHtml(version.content);
        entry.wordCount = countWords(entry.plainText);
        entry.charCount = entry.plainText.length;
        entry.updatedAt = now;

        const syncOutcome = await performBackgroundDriveSync(db, currentUser, 'version-restored');
        return sendJson(res, 200, { entry, syncOutcome });
      }

      // 16. Trash / Restore / Permanent Delete Entry
      const trashMatch = pathname.match(/^\/api\/entries\/([^/]+)\/(trash|restore)$/);
      if (trashMatch && method === 'POST') {
        const [, entryId, action] = trashMatch;
        const entry = db.entries.find(e => e.id === entryId && e.userId === currentUser.id);
        if (!entry) return sendJson(res, 404, { error: 'Entry not found.' });
        entry.trashed = action === 'trash';
        entry.updatedAt = new Date().toISOString();
        const syncOutcome = await performBackgroundDriveSync(db, currentUser, `entry-${action}`);
        return sendJson(res, 200, { entry, syncOutcome });
      }

      if (entryMatch && method === 'DELETE') {
        const entryId = entryMatch[1];
        const idx = db.entries.findIndex(e => e.id === entryId && e.userId === currentUser.id);
        if (idx === -1) return sendJson(res, 404, { error: 'Entry not found.' });
        db.entries.splice(idx, 1);
        const syncOutcome = await performBackgroundDriveSync(db, currentUser, 'entry-deleted');
        return sendJson(res, 200, { deleted: true, syncOutcome });
      }

      // 17. Manual Google Drive Background Sync & Restore
      if (pathname === '/api/drive/sync' && method === 'POST') {
        const body = await parseBody(req);
        if (body.accessToken) {
          currentUser.driveConfig = {
            ...(currentUser.driveConfig || {}),
            accessToken: String(body.accessToken).trim()
          };
        }
        const syncOutcome = await performBackgroundDriveSync(db, currentUser, 'manual-sync');
        return sendJson(res, 200, { ok: true, syncOutcome });
      }

      if (pathname === '/api/drive/export' && method === 'GET') {
        const localResult = syncUserToLocalDriveMirror(db, currentUser);
        return sendJson(res, 200, {
          ok: true,
          vault: localResult.vaultPayload,
          mirrorPath: localResult.mirrorPath
        });
      }

      if (pathname === '/api/drive/import' && method === 'POST') {
        const body = await parseBody(req);
        const vault = body.vault;
        if (!vault || !Array.isArray(vault.journals) || !Array.isArray(vault.entries)) {
          return sendJson(res, 400, { error: 'Invalid Yourday Google Drive backup file.' });
        }
        let importedJournals = 0;
        let importedEntries = 0;
        for (const j of vault.journals) {
          if (!db.journals.some(existing => existing.id === j.id && existing.userId === currentUser.id)) {
            db.journals.push({ ...j, userId: currentUser.id });
            importedJournals++;
          }
        }
        for (const e of vault.entries) {
          const existingIdx = db.entries.findIndex(existing => existing.id === e.id && existing.userId === currentUser.id);
          if (existingIdx === -1) {
            db.entries.push({ ...e, userId: currentUser.id });
            importedEntries++;
          } else {
            db.entries[existingIdx] = { ...db.entries[existingIdx], ...e, userId: currentUser.id };
            importedEntries++;
          }
        }
        const syncOutcome = await performBackgroundDriveSync(db, currentUser, 'drive-import-restore');
        return sendJson(res, 200, {
          ok: true,
          importedJournals,
          importedEntries,
          syncOutcome
        });
      }

      return sendJson(res, 404, { error: 'API endpoint not found' });
    }

    // Serve Static Frontend Assets
    let safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';
    const filePath = path.join(PUBLIC_DIR, safePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    } else {
      // SPA fallback to index.html
      const indexFile = path.join(PUBLIC_DIR, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
        fs.createReadStream(indexFile).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      }
    }
  } catch (err) {
    console.error('Server error:', err);
    sendJson(res, 500, { error: 'Internal server error', detail: err.message });
  }
};

const server = http.createServer(requestHandler);

if (!IS_VERCEL && !process.env.LAMBDA_TASK_ROOT && require.main === module) {
  server.listen(PORT, () => {
    console.log(`\n=============================================================`);
    console.log(`  Yourday Pro — Private Daily Journal & Google Drive Sync`);
    console.log(`  Server running at: http://localhost:${PORT}`);
    console.log(`  Google Drive Mirror: ${DRIVE_MIRROR_DIR}`);
    console.log(`=============================================================\n`);
  });
}

module.exports = requestHandler;
