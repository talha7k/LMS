import { currentOrg, currentOrgDomain } from '$lib/utils/store/org';
import { identifyPosthogUser, initPosthog } from '$lib/utils/services/posthog';
import { initSentry, setSentryUser } from '$lib/utils/services/sentry';
import { profile, user } from '$lib/utils/store/user';
import { getAuthRedirectUrl, shouldStayOnCurrentDomain } from './domainAuth';

import { ROLE } from '$lib/utils/constants/roles';
import { ROUTE } from '$lib/utils/constants/routes';
import { dev } from '$app/environment';
import { get } from 'svelte/store';
import { getOrganizations } from '$lib/utils/services/org';
import { goto } from '$app/navigation';
import { handleLocaleChange } from '$lib/utils/functions/translations';
import isEmpty from 'lodash/isEmpty';
import isPublicRoute from '$lib/utils/functions/routes/isPublicRoute';
import { page } from '$app/stores';
import { setTheme } from '$lib/utils/functions/theme';
import shouldRedirectOnAuth from '$lib/utils/functions/routes/shouldRedirectOnAuth';
import { supabase } from '$lib/utils/functions/supabase';

export function setupAnalytics() {
  // Set up sentry
  initSentry();

  // Set up posthog
  initPosthog();

  // Disable umami on localhost
  if (dev) {
    localStorage.setItem('umami.disabled', '1');
  }
}

function setAnalyticsUser() {
  const profileStore = get(profile);

  if (!profileStore.id) return;

  setSentryUser({
    id: profileStore.id,
    username: profileStore.username,
    email: profileStore.email,
    fullname: profileStore.fullname
  });

  identifyPosthogUser(profileStore.id, {
    email: profileStore.email,
    name: profileStore.fullname
  });
}

export async function getProfile({
  path,
  queryParam,
  isOrgSite,
  orgSiteName
}: {
  path: string;
  queryParam: string;
  isOrgSite: boolean;
  orgSiteName: string;
}) {
  const pageStore = get(page);
  const profileStore = get(profile);
  const currentOrgStore = get(currentOrg);
  const currentOrgDomainStore = get(currentOrgDomain);

  const params = new URLSearchParams(window.location.search);

  console.log('=== AUTH FLOW DEBUG ===');
  console.log('Current domain:', window.location.origin);
  console.log('Is org site:', isOrgSite);
  console.log('Org site name:', orgSiteName);
  console.log('Current org store:', currentOrgStore);
  console.log('Path:', path);
  console.log('Query params:', queryParam);
  // Get user profile
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('Session error:', sessionError);
  }

  const { user: authUser } = session || {};
  console.log('Get user', authUser, 'Session error:', sessionError);

  if (!authUser && !isPublicRoute(pageStore.url?.pathname)) {
    return goto('/login?redirect=/' + path + queryParam);
  }

  // Skip refetching profile, if already in store
  if (profileStore.id) {
    handleLocaleChange(profileStore.locale);
    return;
  }

  // Check if user has profile
  let {
    data: profileData,
    error: profileError,
    status
  } = await supabase.from('profile').select(`*`).eq('id', authUser?.id).single();
  console.log('Get profile', profileData, 'Profile error:', profileError, 'Status:', status);

  if (profileError && !profileData && status === 406 && authUser) {
    // User wasn't found, create profile
    console.log(`User wasn't found, create profile`);

    const [regexUsernameMatch] = [...(authUser.email?.matchAll(/(.*)@/g) || [])];
    const isGoogleAuth = !!authUser.app_metadata?.providers?.includes('google');

    console.log('Creating profile with data:', {
      id: authUser.id,
      username: regexUsernameMatch[1] + `${new Date().getTime()}`,
      fullname: regexUsernameMatch[1],
      email: authUser.email,
      is_email_verified: isGoogleAuth,
      verified_at: isGoogleAuth ? new Date().toDateString() : undefined
    });

    const { data: newProfileData, error: profileError } = await supabase
      .from('profile')
      .insert({
        id: authUser.id,
        username: regexUsernameMatch[1] + `${new Date().getTime()}`,
        fullname: regexUsernameMatch[1],
        email: authUser.email,
        is_email_verified: isGoogleAuth,
        verified_at: isGoogleAuth ? new Date().toDateString() : undefined
      })
      .select();

    if (profileError) {
      console.error('Profile creation failed:', profileError);
      // Show user-friendly error message
      alert(
        `Failed to create profile: ${profileError.message || 'Unknown error'}. Please try again or contact support.`
      );
      return;
    }

    console.log('Profile created successfully:', newProfileData);

    // Profile created, go to onboarding or lms
    if (!profileError && newProfileData) {
      user.update((_user) => ({
        ..._user,
        fetchingUser: false,
        isLoggedIn: true,
        currentSession: authUser
      }));

      profile.set(newProfileData[0]);

      setAnalyticsUser();

      // Fetch language
      handleLocaleChange(newProfileData[0].locale);

      if (isOrgSite) {
        // Use the newly created profile data instead of potentially empty profileStore
        const newProfileId = newProfileData[0]?.id;
        console.log(
          'Adding user to organization with profile ID:',
          newProfileId,
          'and org ID:',
          currentOrgStore.id
        );

        if (!newProfileId) {
          console.error('No profile ID available for organization member creation');
          return;
        }

        const { data, error } = await supabase
          .from('organizationmember')
          .insert({
            organization_id: currentOrgStore.id,
            profile_id: newProfileId,
            role_id: 3 // Student role
          })
          .select();

        if (error) {
          console.error('Error adding user to organisation', error);
          // Don't return here - continue with the flow even if org member creation fails
        } else {
          console.log('Success adding user to organisation', data);
          const memberId = data?.[0]?.id || '';

          currentOrg.update((_currentOrg) => ({
            ..._currentOrg,
            memberId
          }));
        }

        if (params.get('redirect')) {
          goto(params.get('redirect') || '');
        } else if (shouldRedirectOnAuth(path)) {
          goto('/lms');
        }
        return;
      }

      // On invite page, don't go to onboarding
      if (!path.includes('invite')) {
        goto(ROUTE.ONBOARDING);
      }
    } else {
      console.error('Profile creation returned no data:', { profileError, newProfileData });
      alert('Profile creation failed: No data returned. Please try again.');
    }

    user.update((_user) => ({
      ..._user,
      fetchingUser: false
    }));
  } else if (profileData) {
    // Profile exists, go to profile page
    user.update((_user) => ({
      ..._user,
      fetchingUser: false,
      isLoggedIn: true,
      currentSession: authUser
    }));

    profile.set(profileData);

    // Set user in sentry
    setAnalyticsUser();

    handleLocaleChange(profileData.locale);

    const orgRes = await getOrganizations(profileData.id, isOrgSite, orgSiteName);

    const isStudentAccount = orgRes.currentOrg.role_id == ROLE.STUDENT;

    // Domain-aware redirect logic
    const userRole = isStudentAccount ? 'student' : 'admin';
    const shouldStay = shouldStayOnCurrentDomain(isOrgSite, userRole);

    console.log('Redirect decision:', {
      isOrgSite,
      userRole,
      shouldStay,
      orgSiteName
    });

    if (params.has('redirect')) {
      // Respect explicit redirect parameter
      goto(params.get('redirect') || '');
    } else if (shouldRedirectOnAuth(path)) {
      // Use domain-aware redirect logic
      const redirectUrl = getAuthRedirectUrl(
        isOrgSite,
        userRole,
        orgRes.currentOrg?.siteName,
        '/lms'
      );
      console.log('Redirecting to:', redirectUrl);
      goto(redirectUrl);
    } else if (!isOrgSite && isEmpty(orgRes.orgs) && !path.includes('invite')) {
      // Not on invite page or no org, go to onboarding (only on main domain)
      goto(ROUTE.ONBOARDING);
    }

    setTheme(orgRes?.currentOrg?.theme);
  }

  if (!profileData && !isPublicRoute(pageStore.url?.pathname)) {
    goto('/login?redirect=/' + path);
  }
}
