import { supabase } from './supabase';

export async function createNotificationsForTrip(
  tripId: string,
  excludeUserId: string,
  type: string,
  message: string,
  tripName: string
) {
  // Get all trip members except the actor
  const { data: members } = await supabase
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', tripId)
    .neq('user_id', excludeUserId);

  if (!members?.length) return;

  await supabase.from('notifications').insert(
    members.map(m => ({
      user_id: m.user_id,
      trip_id: tripId,
      type,
      message,
      trip_name: tripName,
    }))
  );
}
