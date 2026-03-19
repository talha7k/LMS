# OAuth Domain-Aware Authentication Fix

## Problem Summary

Users logging in with Google on org domains (like `cpdprovider.lms.enrich.sa`) were experiencing authentication issues because:

1. Supabase OAuth was only configured for localhost
2. Cross-domain redirects were breaking auth sessions
3. No domain-aware handling for OAuth callbacks

## Solution Implemented

### 1. **Supabase Configuration Update** (`supabase/config.toml`)

```toml
[auth]
site_url = "https://lms.enrich.sa"
additional_redirect_urls = [
  "https://localhost:3000",
  "http://localhost:3000",
  "https://lms.enrich.sa",
  "https://*.lms.enrich.sa"  # Wildcard for all subdomains
]
```

### 2. **OAuth State Management** (`oauthHandler.ts`)

- **Domain tracking**: Stores original domain in OAuth state
- **Automatic redirects**: Redirects to correct domain if callback happens on wrong domain
- **State validation**: Ensures OAuth callbacks are handled securely

### 3. **Enhanced AuthUI Component**

- **Domain-aware redirects**: Uses current domain for OAuth callback
- **State preservation**: Maintains original path and redirect parameters
- **Better error handling**: Improved logging and user feedback

### 4. **Layout Integration**

- **OAuth callback detection**: Automatically handles OAuth redirects in layout
- **Domain validation**: Ensures callbacks happen on correct domain

## How It Works

### **OAuth Flow:**

1. **User clicks "Sign up with Google"** on `cpdprovider.lms.enrich.sa`
2. **AuthUI creates OAuth state** with current domain info
3. **Supabase redirects to Google** with proper callback URL
4. **Google redirects back** to the same domain (`cpdprovider.lms.enrich.sa`)
5. **Layout detects OAuth callback** and validates domain
6. **Session is created** on the correct domain
7. **User stays on org domain** with proper authentication

### **Domain Handling:**

- **Org domains**: Users stay where they authenticated
- **Main domain**: Students stay on main domain, admins can be redirected
- **Cross-domain prevention**: No more breaking redirects between domains

## Testing Plan

### **1. Local Development**

```bash
# Start local Supabase
supabase start

# Test on localhost
http://localhost:3000/signup
```

### **2. Production Testing**

Test these scenarios:

#### **Org Domain Authentication:**

- [ ] Go to `https://cpdprovider.lms.enrich.sa/signup`
- [ ] Click "Sign up with Google"
- [ ] Complete Google OAuth flow
- [ ] Verify user stays on `cpdprovider.lms.enrich.sa`
- [ ] Verify user can access courses and enroll

#### **Main Domain Authentication:**

- [ ] Go to `https://lms.enrich.sa/signup`
- [ ] Click "Sign up with Google"
- [ ] Complete Google OAuth flow
- [ ] Verify proper redirect behavior based on user role

#### **Cross-Domain Prevention:**

- [ ] Authenticate on org domain
- [ ] Try to access main dashboard
- [ ] Verify user stays on appropriate domain

### **3. Debugging Tools**

Check browser console for:

- `OAuth redirect configuration:` - Shows redirect setup
- `OAuth callback detected:` - Shows callback handling
- `Domain redirect decision:` - Shows redirect logic
- `=== AUTH FLOW DEBUG ===` - Shows authentication flow

## Deployment Instructions

### **1. Update Supabase Configuration**

```bash
# Apply config changes
supabase db push
```

### **2. Deploy Application**

```bash
# Deploy the updated code
npm run build
# Deploy to your hosting platform
```

### **3. Verify OAuth Configuration**

In Supabase Dashboard:

1. Go to Authentication → Settings
2. Verify "Site URL" is set to `https://lms.enrich.sa`
3. Verify "Additional Redirect URLs" includes all your domains
4. Test Google OAuth configuration

## Troubleshooting

### **Common Issues:**

#### **"Invalid redirect_uri" Error**

- **Cause**: Domain not in Supabase allowlist
- **Fix**: Add domain to `additional_redirect_urls` in config

#### **"OAuth callback on wrong domain"**

- **Cause**: State parameter mismatch or domain change
- **Fix**: Check OAuth state and ensure consistent domains

#### **Session not persisting**

- **Cause**: Cross-domain cookie issues
- **Fix**: Ensure users stay on same domain throughout flow

### **Debug Steps:**

1. Check browser console for OAuth logs
2. Verify Supabase configuration
3. Test with incognito mode
4. Check network tab for redirect URLs

## Security Considerations

### **OAuth State Validation:**

- State parameter is encoded with domain info
- Timestamp prevents replay attacks
- Domain validation ensures correct callbacks

### **Redirect URL Security:**

- Only configured domains are allowed
- Wildcard patterns are properly scoped
- No open redirects are possible

## Future Enhancements

### **Potential Improvements:**

1. **Session sharing**: Implement cross-domain session sharing if needed
2. **SSO integration**: Add SSO for enterprise customers
3. **Custom domains**: Support for customer custom domains
4. **Analytics**: Track OAuth success rates by domain

### **Monitoring:**

- OAuth success/failure rates
- Domain-specific authentication metrics
- Cross-domain redirect attempts
