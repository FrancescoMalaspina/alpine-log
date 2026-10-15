import { useEffect, useState } from 'react';
import { fetchUsernames } from '../lib/api';
import type { UserRef } from '../lib/types';

// Loaded once per page: the list is short, and only grows when someone signs up.
let users: Promise<UserRef[]> | null = null;

/** Every registered user (empty until loaded, or when loading fails). */
export function useUsernames(): UserRef[] {
  const [list, setList] = useState<UserRef[]>([]);
  useEffect(() => {
    let cancelled = false;
    users ??= fetchUsernames().catch(() => { users = null; return []; });
    users.then(u => { if (!cancelled) setList(u); });
    return () => { cancelled = true; };
  }, []);
  return list;
}
