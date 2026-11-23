// Entry point: read the Supabase settings, load the study file, then show the welcome screen.
import * as config from '../config.js';
import * as api from './api.js';
import * as sync from './sync.js';
import { initUI, showWelcome, showFatal } from './views.js';

async function loadConfig() {
  let url = config.SUPABASE_URL || '';
  let key = config.SUPABASE_ANON_KEY || '';
  // config.local.js (git-ignored) overrides config.js for local testing. It never exists on GitHub Pages.
  if (!/\.github\.io$/.test(window.location.hostname)) {
    try {
      const local = await import('../config.local.js');
      if (local.SUPABASE_URL) url = local.SUPABASE_URL;
      if (local.SUPABASE_ANON_KEY) key = local.SUPABASE_ANON_KEY;
    } catch {
      // no local override
    }
  }
  return { url, key };
}

async function main() {
  const { url, key } = await loadConfig();
  api.configure(url, key);
  let study;
  try {
    const res = await fetch('data/study.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    study = await res.json();
  } catch {
    showFatal('The trials could not be loaded. Check your connection and reload the page.');
    return;
  }
  initUI(study);
  sync.start();
  showWelcome();
}

main();
