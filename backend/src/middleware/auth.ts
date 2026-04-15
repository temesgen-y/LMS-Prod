import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../lib/supabase';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    authId: string;
    role: string;
    email: string;
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization token' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('id, role, email')
      .eq('auth_user_id', user.id)
      .single();

    if (!profile) {
      res.status(401).json({ error: 'User profile not found' });
      return;
    }

    req.user = {
      id: (profile as { id: string; role: string; email: string }).id,
      authId: user.id,
      role: (profile as { id: string; role: string; email: string }).role,
      email: (profile as { id: string; role: string; email: string }).email,
    };

    next();
  } catch (err) {
    res.status(500).json({ error: 'Authentication error' });
  }
};

export const requireRole = (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Access denied. Required: ${roles.join(' or ')}`,
      });
      return;
    }
    next();
  };
