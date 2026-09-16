import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Built-in default Supabase credentials
const DEFAULT_SUPABASE_URL = 'https://uflijnnhbuhhqdqrkcxs.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmbGlqbm5oYnVoaHFkcXJrY3hzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1MzE0ODAsImV4cCI6MjEwNTEwNzQ4MH0.B3JerfCuGPnqs1HmDeuuUfekz4Gf3Q66xSyXMYzVPUY';

// Local storage keys for user-configured credentials fallback (optional override)
const STORAGE_KEY_URL = 'dental_supabase_url';
const STORAGE_KEY_ANON = 'dental_supabase_anon_key';

function cleanBaseUrl(raw: string): string {
  if (!raw) return '';
  return raw.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  const storedUrl = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_URL) || '' : '').trim();
  const storedKey = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ANON) || '' : '').trim();

  // Ensure current project credentials take precedence over any old obsolete cache
  const rawUrl = (storedUrl && storedUrl.includes('uflijnnhbuhhqdqrkcxs'))
    ? storedUrl
    : (envUrl || DEFAULT_SUPABASE_URL);

  const anonKey = (storedKey && storedKey.startsWith('eyJ') && storedUrl.includes('uflijnnhbuhhqdqrkcxs'))
    ? storedKey
    : (envKey || DEFAULT_SUPABASE_ANON_KEY);

  const url = cleanBaseUrl(rawUrl);

  return { url, anonKey };
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  if (typeof window !== 'undefined') {
    if (url) localStorage.setItem(STORAGE_KEY_URL, cleanBaseUrl(url));
    else localStorage.removeItem(STORAGE_KEY_URL);

    if (anonKey) localStorage.setItem(STORAGE_KEY_ANON, anonKey.trim());
    else localStorage.removeItem(STORAGE_KEY_ANON);

    // Reset client to reinitialize on next call
    cachedClient = null;
  }
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(
    url &&
    url.startsWith('http') &&
    !url.includes('YOUR_SUPABASE') &&
    anonKey &&
    anonKey.length > 15 &&
    !anonKey.includes('YOUR_SUPABASE')
  );
}

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!cachedClient) {
    const { url, anonKey } = getSupabaseConfig();
    try {
      cachedClient = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      });
    } catch (e) {
      console.error('[Supabase] Failed to initialize client:', e);
      return null;
    }
  }

  return cachedClient;
}
