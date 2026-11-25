// Entry point: read the Supabase settings, load the three data files, then show the welcome screen.
import * as config from '../config.js';
import * as api from './api.js';
import * as sync from './sync.js';
import { initUI, showWelcome, showFatal } from './views.js';
import { TEST } from './mode.js';

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
  if (!TEST) api.configure(url, key);   // test mode never talks to the database
  // study.json: the trials of Part 1. key.json: the abstracts of Part 2. second.json: the items of Part 3.
  const load = async (name) => {
    const res = await fetch(`data/${name}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  };
  let study;
  let keyData = null;
  let secondData = null;
  try {
    [study, keyData, secondData] = await Promise.all([load('study'), load('key').catch(() => null), load('second').catch(() => null)]);
  } catch {
    showFatal('The trials could not be loaded. Check your connection and reload the page.');
    return;
  }
  initUI(study, keyData, secondData);
  sync.start();
  showWelcome();
}

main();
