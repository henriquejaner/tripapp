import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, Image,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';
import type { Profile, TripWithStops } from '@/lib/types';

const VIBE_LABELS: Record<string, string> = {
  cultural: 'Cultural', party: 'Party', outdoors: 'Outdoors', mixed: 'Mixed',
};
const BUDGET_LABELS: Record<string, string> = {
  budget: 'Budget', mid: 'Mid-range', luxury: 'Luxury',
};
const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning', confirmed: 'Confirmed', completed: 'Done',
};
const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  planning:  { bg: Colors.primaryDim, text: Colors.primary },
  confirmed: { bg: Colors.successDim, text: Colors.success },
  completed: { bg: Colors.backgroundAlt, text: Colors.textMuted },
};

function formatArray(arr: string[] | null, map: Record<string, string>): string {
  if (!arr?.length) return 'Not set';
  return arr.map(v => map[v] ?? v).join(', ');
}

function formatDateRange(start: string, end: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const s = new Date(start).toLocaleDateString('en', opts);
  if (!end || end === start) return s;
  return `${s} – ${new Date(end).toLocaleDateString('en', opts)}`;
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trips, setTrips] = useState<TripWithStops[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useFocusEffect(useCallback(() => {
    load();
  }, []));

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [profileRes, memberRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('trip_members').select('trip_id').eq('user_id', user.id),
    ]);

    setProfile(profileRes.data);

    if (memberRes.data?.length) {
      const tripIds = memberRes.data.map(r => r.trip_id);
      const [tripRes, stopRes] = await Promise.all([
        supabase.from('trips').select('*').in('id', tripIds).is('parent_trip_id', null).order('created_at', { ascending: false }),
        supabase.from('trip_stops').select('*').in('trip_id', tripIds).order('order_index'),
      ]);
      setTrips((tripRes.data ?? []).map(t => ({
        ...t,
        stops: (stopRes.data ?? []).filter(s => s.trip_id === t.id),
        member_count: 0,
      })));
    }

    setLoading(false);
  }

  if (loading || !profile) return <View style={styles.container} />;

  const initials = profile.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  const allDests = [...new Set(trips.flatMap(t => t.stops.map(s => s.destination.split(',')[0].trim())))];
  const upcoming = trips.filter(t => t.status !== 'completed');
  const past = trips.filter(t => t.status === 'completed');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>

        {/* Top actions */}
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.iconBtn}>
            <FontAwesome name="bell-o" size={18} color={Colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/onboarding')} style={styles.editBtn}>
            <FontAwesome name="pencil" size={12} color={Colors.primary} />
            <Text style={styles.editBtnText}>Edit profile</Text>
          </TouchableOpacity>
        </View>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarWrap}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
          </View>
          <Text style={styles.name}>{profile.full_name ?? 'Traveler'}</Text>
          {profile.username ? (
            <Text style={styles.username}>@{profile.username}</Text>
          ) : null}
        </View>

        {/* Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{trips.length}</Text>
            <Text style={styles.statLabel}>Trips</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{allDests.length}</Text>
            <Text style={styles.statLabel}>Destinations</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{past.length}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>

        {/* Travel style */}
        <Text style={styles.sectionLabel}>Travel style</Text>
        <View style={styles.prefsCard}>
          <PrefRow icon="star-o" label="Vibe" value={formatArray(profile.travel_vibe, VIBE_LABELS)} />
          <View style={styles.divider} />
          <PrefRow icon="users" label="Group size" value={profile.group_size_pref ? `Up to ${profile.group_size_pref} people` : 'Not set'} />
          <View style={styles.divider} />
          <PrefRow icon="credit-card" label="Budget" value={formatArray(profile.budget_range, BUDGET_LABELS)} />
        </View>

        {/* Upcoming trips */}
        {upcoming.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Upcoming</Text>
              <View style={styles.badge}><Text style={styles.badgeText}>{upcoming.length}</Text></View>
            </View>
            {upcoming.map(t => <TripCard key={t.id} trip={t} />)}
          </>
        )}

        {/* Past trips */}
        {past.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Completed</Text>
            {past.map(t => <TripCard key={t.id} trip={t} />)}
          </>
        )}

        {/* Empty state */}
        {trips.length === 0 && (
          <View style={styles.emptyTrips}>
            <FontAwesome name="map-o" size={32} color={Colors.border} />
            <Text style={styles.emptyTitle}>No trips yet</Text>
            <TouchableOpacity style={styles.createBtn} onPress={() => router.push('/create-trip')}>
              <Text style={styles.createBtnText}>Plan your first trip</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Sign out */}
        <View style={styles.signOutArea}>
          {confirmSignOut ? (
            <View style={styles.confirmRow}>
              <Text style={styles.confirmText}>Sign out?</Text>
              <TouchableOpacity onPress={() => setConfirmSignOut(false)} style={styles.confirmCancel}>
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => supabase.auth.signOut()} style={styles.confirmOk}>
                <Text style={styles.confirmOkText}>Sign out</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => setConfirmSignOut(true)} style={styles.signOutBtn}>
              <FontAwesome name="sign-out" size={14} color={Colors.textMuted} />
              <Text style={styles.signOutText}>Sign out</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function TripCard({ trip }: { trip: TripWithStops }) {
  const first = trip.stops[0];
  const last = trip.stops[trip.stops.length - 1];
  const dateLabel = first?.start_date ? formatDateRange(first.start_date, last?.end_date ?? null) : null;
  const { bg, text } = STATUS_COLOR[trip.status] ?? STATUS_COLOR.planning;

  return (
    <TouchableOpacity style={styles.tripCard} onPress={() => router.push(`/trip/${trip.id}`)} activeOpacity={0.75}>
      {trip.cover_image ? (
        <Image source={{ uri: trip.cover_image }} style={styles.tripCover} resizeMode="cover" />
      ) : null}
      <View style={styles.tripBody}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={styles.tripName} numberOfLines={1}>{trip.name}</Text>
          {trip.stops.length > 0 && (
            <Text style={styles.tripDests} numberOfLines={1}>
              {trip.stops.map(s => s.destination).join(' → ')}
            </Text>
          )}
          {dateLabel && (
            <View style={styles.tripDateRow}>
              <FontAwesome name="calendar-o" size={10} color={Colors.textMuted} />
              <Text style={styles.tripDate}>{dateLabel}</Text>
            </View>
          )}
        </View>
        <View style={styles.tripRight}>
          <View style={[styles.statusPill, { backgroundColor: bg }]}>
            <Text style={[styles.statusPillText, { color: text }]}>{STATUS_LABEL[trip.status] ?? trip.status}</Text>
          </View>
          <FontAwesome name="angle-right" size={14} color={Colors.textMuted} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

function PrefRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.prefRow}>
      <View style={styles.prefLeft}>
        <FontAwesome name={icon as any} size={14} color={Colors.textMuted} />
        <Text style={styles.prefLabel}>{label}</Text>
      </View>
      <Text style={styles.prefValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { padding: 20, paddingBottom: 48 },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
  iconBtn: { padding: 8, marginLeft: -8 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primaryDim, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  avatarSection: { alignItems: 'center', marginBottom: 24 },
  avatarWrap: { marginBottom: 12 },
  avatarImg: { width: 84, height: 84, borderRadius: 42 },
  avatarPlaceholder: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: Colors.primaryDim, borderWidth: 2, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  name: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.4 },
  username: { fontSize: 14, color: Colors.textMuted, marginTop: 3 },

  statsCard: {
    flexDirection: 'row', backgroundColor: Colors.card,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 18, marginBottom: 28,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statNumber: { fontSize: 22, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: Colors.border },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 4 },
  badge: { backgroundColor: Colors.primaryDim, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  prefsCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 28,
  },
  prefRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15 },
  prefLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prefLabel: { fontSize: 15, color: Colors.textSecondary },
  prefValue: { fontSize: 13, fontWeight: '600', color: Colors.text, maxWidth: '50%' },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },

  tripCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 8, overflow: 'hidden',
  },
  tripCover: { width: '100%', height: 80 },
  tripBody: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  tripName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  tripDests: { fontSize: 12, color: Colors.textSecondary },
  tripDateRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  tripDate: { fontSize: 11, color: Colors.textMuted },
  tripRight: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusPillText: { fontSize: 11, fontWeight: '700' },

  emptyTrips: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  createBtn: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 11, marginTop: 4,
  },
  createBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  signOutArea: { marginTop: 32, alignItems: 'center' },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  signOutText: { fontSize: 14, color: Colors.textMuted },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmText: { fontSize: 14, color: Colors.textSecondary },
  confirmCancel: { paddingHorizontal: 14, paddingVertical: 8 },
  confirmCancelText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
  confirmOk: {
    backgroundColor: '#fee2e2', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  confirmOkText: { fontSize: 14, color: '#dc2626', fontWeight: '700' },
});
