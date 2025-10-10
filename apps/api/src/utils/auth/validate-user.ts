import { User } from '@supabase/supabase-js';
import { getSupabase } from '../supabase';

const supabase = getSupabase();

export async function validateUser(accessToken: string): Promise<User> {
  let user: User | null = null;

  try {
    console.log('[ValidateUser] Validating token with length:', accessToken.length);
    console.log('[ValidateUser] Token preview:', accessToken.substring(0, 20) + '...');

    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error) {
      console.error('[ValidateUser] Supabase auth error:', error);
      throw new Error(`Supabase auth error: ${error.message}`);
    }

    user = data.user;
    console.log(
      '[ValidateUser] User data retrieved:',
      user ? { id: user.id, email: user.email } : null
    );
  } catch (error) {
    console.error('[ValidateUser] Error validating user:', error);
    throw error;
  }

  if (!user) {
    console.error('[ValidateUser] No user found in token');
    throw new Error('Unauthenticated user - no user found in token');
  }

  return user;
}
