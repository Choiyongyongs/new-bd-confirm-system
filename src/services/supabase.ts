import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Local storage keys for user-configured credentials fallback
const STORAGE_KEY_URL = 'dental_supabase_url';
const STORAGE_KEY_ANON = 'dental_supabase_anon_key';

export function getSupabaseConfig(): { url: string; anonKey: string } {
  const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
  const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  const storedUrl = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_URL) || '' : '').trim();
  const storedKey = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_ANON) || '' : '').trim();

  const url = storedUrl || envUrl;
  const anonKey = storedKey || envKey;

  return { url, anonKey };
}

export function saveSupabaseConfig(url: string, anonKey: string) {
  if (typeof window !== 'undefined') {
    if (url) localStorage.setItem(STORAGE_KEY_URL, url.trim());
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
