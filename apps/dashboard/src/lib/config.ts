import { env } from '$env/dynamic/public';
import type { ConfigType } from '$lib/utils/types/config';

export const config: ConfigType = {
  supabaseConfig: {
    url: env.PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    anonKey: env.PUBLIC_SUPABASE_ANON_KEY || 'anon-key'
  },
  baseUrl: env.PUBLIC_BASE_URL || 'https://enrich.sa',
  appUrl: env.PUBLIC_APP_URL || 'https://app.enrich.sa'
};
