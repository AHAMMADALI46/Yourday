# Yourday Pro+ — Private Daily Journal & Gmail Google Drive Sanctuary

**Yourday** is a full-stack private online journal and daily diary web application inspired by **Penzu Pro / Pro+**, featuring authenticated multi-journal notebooks, per-journal AES-256-GCM encryption locks, customizable paper & cover themes, handwritten fonts, version history, and automatic background synchronization to your **Gmail Google Drive** storage.

---

## Quick Start

```bash
cd C:\Users\USER\Yourday
npm start
```

Open **http://localhost:3847** in your browser.

### Demo Pro+ Credentials
- **Email / Gmail:** `alex.yourday@gmail.com`
- **Password:** `yourday123`
- **App Quick-Lock PIN:** `1234`
- **Encrypted Vault Journal Lock PIN:** `2468`
- Or click **"Create Account"** on the login screen to register your own Gmail address and credentials.

---

## Core Penzu Pro & Pro+ Features Included

1. **Authenticated Sanctuary & Quick Lock**:
   - PBKDF2-SHA512 (`100,000` iterations) password hashing and signed JWT (`HMAC-SHA256`) session authentication.
   - Instant App Lock screen (`🔒` in the top bar) + configurable inactivity auto-lock timer.
2. **Unlimited Custom Journals & Covers (Bookshelf)**:
   - Create unlimited journals for Daily Reflections, Gratitude, Travel, Dreams, Work, Five-Year Journals, or Private Vaults.
   - 7 tactile book cover styles, custom paper themes, and custom default fonts per journal.
3. **Military-Grade Per-Journal Encrypted Locks (`AES-256-GCM`)**:
   - Lock individual journals with their own dedicated password or PIN (`POST /api/journals/:id/unlock` & `encryptWithPassphrase` / `decryptWithPassphrase`).
4. **Distraction-Free Writing Pad & Fullscreen Zen Mode**:
   - 6 paper themes (`Warm Parchment`, `Crisp Ivory`, `Midnight Ink`, `Botanical Grid`, `Vintage Ledger`, `Cherry Blossom`) and 8 Pro & Handwritten fonts (`Lora`, `Merriweather`, `Playfair Display`, `Caveat`, `Dancing Script`, `Patrick Hand`, `Inter`, `JetBrains Mono`).
   - Backdate or adjust entry timestamps, attach inline photos, add `#tags`, select Mood & Weather, and generate daily writing prompts.
5. **Entry Version History & Trash Recovery (Penzu Pro+)**:
   - Automatic version snapshots with 1-click restore (`POST /api/entries/:id/restore-version`) and soft-delete Trash bin recovery.
6. **Automatic Background Gmail Google Drive Storage**:
   - Every autosave triggers `performBackgroundDriveSync` in [`server.js`](./server.js):
     - **Direct Google Drive REST API v3 (`drive.file`)**: Connects via Google Identity Services OAuth 2.0 popup or access token to create `Yourday Journals` on your Gmail Google Drive and upload `yourday-vault-backup.json` + individual Markdown (`.md`) journals.
     - **Google Apps Script 30-Second Drive Bridge**: Zero-GCP-setup script you can deploy in your Gmail account for permanent background Drive sync.
     - **Local Google Drive Mirror**: Continuously writes every journal `.md` and `yourday-vault-backup.json` to `data/gdrive-mirror/<your-gmail>/Yourday Journals/`.
