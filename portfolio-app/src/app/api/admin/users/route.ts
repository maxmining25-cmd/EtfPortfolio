// route.ts
// Secure admin API route for deleting and mass-deleting user accounts using service role client.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabaseAdmin = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey) 
  : null;

// Secure helper to verify if request is made by Admin and return user ID
async function verifyAdmin(request: Request): Promise<{ isAdmin: boolean; callerId?: string; error?: string }> {
  if (!supabaseAdmin) {
    return { isAdmin: false, error: 'Database Admin client not configured.' };
  }

  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return { isAdmin: false, error: 'No authorization token provided.' };
  }

  try {
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return { isAdmin: false, error: authError?.message || 'Invalid session token.' };
    }

    const { data: profile, error: dbError } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (dbError || !profile) {
      return { isAdmin: false, error: 'User profile not found.' };
    }

    if (!profile.is_admin) {
      return { isAdmin: false, error: 'Access Denied: Administrator privileges required.' };
    }

    return { isAdmin: true, callerId: user.id };
  } catch (err: any) {
    return { isAdmin: false, error: err.message || 'Verification failed.' };
  }
}

// DELETE: Delete one or multiple users from Supabase Auth
export async function DELETE(request: Request) {
  const adminCheck = await verifyAdmin(request);
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: adminCheck.error }, { status: 403 });
  }

  try {
    const { id, ids } = await request.json();
    const callerId = adminCheck.callerId;

    // Check failsafe: cannot delete self
    if (id === callerId || (ids && ids.includes(callerId))) {
      return NextResponse.json({ error: 'Failsafe: You cannot delete your own administrator account.' }, { status: 400 });
    }

    if (id) {
      // Delete single user
      const { error } = await supabaseAdmin!.auth.admin.deleteUser(id);
      if (error) throw error;
      return NextResponse.json({ success: true, message: `User ${id} deleted successfully.` });
    } else if (ids && Array.isArray(ids)) {
      // Mass delete users
      if (ids.length === 0) {
        return NextResponse.json({ message: 'No user IDs provided for mass delete.' });
      }
      
      const results = await Promise.all(
        ids.map(async (uid) => {
          if (uid === callerId) {
            return { id: uid, success: false, error: 'Failsafe: Cannot delete self' };
          }
          const { error } = await supabaseAdmin!.auth.admin.deleteUser(uid);
          return { id: uid, success: !error, error: error?.message || null };
        })
      );

      return NextResponse.json({ success: true, results });
    } else {
      return NextResponse.json({ error: 'Missing identification parameter (id or ids).' }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to delete user.' }, { status: 500 });
  }
}
