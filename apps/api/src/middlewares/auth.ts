import { Context, Next } from 'hono';

import { validateUser } from '$src/utils/auth/validate-user';

export const authMiddleware = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('authorization');
    const path = c.req.path;
    const method = c.req.method;

    console.log(`[Auth] ${method} ${path} - Checking authorization`);

    if (!authHeader) {
      console.log(`[Auth] ${method} ${path} - No authorization header provided`);
      return c.json(
        {
          success: false,
          message: 'No authorization header provided',
          code: 'MISSING_AUTH_HEADER'
        },
        401
      );
    }

    console.log(`[Auth] ${method} ${path} - Auth header: ${authHeader.substring(0, 20)}...`);

    // Extract the token from "Bearer <token>"
    const token = authHeader.split(' ')[1];

    if (!token) {
      console.log(`[Auth] ${method} ${path} - Invalid authorization header format`);
      return c.json(
        {
          success: false,
          message: 'Invalid authorization header format',
          code: 'INVALID_AUTH_FORMAT'
        },
        401
      );
    }

    console.log(`[Auth] ${method} ${path} - Token length: ${token.length}`);
    console.log(`[Auth] ${method} ${path} - Token preview: ${token.substring(0, 20)}...`);

    const user = await validateUser(token);

    if (!user) {
      console.log(`[Auth] ${method} ${path} - User validation failed`);
      return c.json(
        {
          success: false,
          message: 'User validation failed',
          code: 'USER_VALIDATION_FAILED'
        },
        401
      );
    }

    console.log(`[Auth] ${method} ${path} - User authenticated: ${user.id}`);
    c.set('user', user); // Attach the user to the context
    await next();
  } catch (error) {
    console.error(`[Auth] Error in auth middleware:`, error);
    return c.json(
      {
        success: false,
        message: 'Unauthorized',
        code: 'AUTH_ERROR',
        details: error instanceof Error ? error.message : 'Unknown authentication error'
      },
      401
    );
  }
};
