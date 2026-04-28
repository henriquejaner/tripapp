import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';
import type { Profile, TripWithStops } from '@/lib/types';

const VIBE_LABELS: Record<string, string> = {
  cultural: 'Cultural',
  party: 'Party',
  outdoors: 'Outdoors',
  mixed: 'Mixed',
};
const BUDGET_LABELS: Record<string, string> = {
  budget: 'Budget',
  mid: 'Mid-range',
  luxury: 'Luxury',
};

function formatArray(arr: string[] | null, map: Record<string, string>): string {
  if (!arr || arr.length === 0) return 'Not set';
  return arr.map(v => map[v] ?? v).join(', ');
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trips, setTrips] = useState<TripWithStops[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
          supabase.from('trips').select('*').in('id', tripIds).order('created_at', { ascending: false }),
          supabase.from('trip_stops').select('*').in('trip_id', tripIds).order('order_index'),
        ]);
        const enriched: TripWithStops[] = (tripRes.data ?? []).map(t => ({
          ...t,
          stops: (stopRes.data ?? []).filter(s => s.trip_id === t.id),
          member_count: 0,
        }));
        setTrips(enriched);
      }

      setLoading(false);
    }
    load();
  }, []);

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  }

  if (loading || !profile) {
    return <View style={styles.container} />;
  }

  const initials = profile.full_name
    ? profile.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.topRow}>
          <Text style={styles.heading}>Profile</Text>
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn}>
            <FontAwesome name="sign-out" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Avatar + name */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{profile.full_name ?? 'Traveler'}</Text>
        </View>

        {/* Preferences */}
        <Text style={styles.sectionLabel}>Travel preferences</Text>
        <View style={styles.prefsCard}>
          <PrefRow
            icon="star-o"
            label="Vibe"
            value={formatArray(profile.travel_vibe, VIBE_LABELS)}
          />
          <View style={styles.divider} />
          <PrefRow
            icon="users"
            label="Group size"
            value={profile.group_size_pref ? `Up to ${profile.group_size_pref} people` : 'Not set'}
          />
          <View style={styles.divider} />
          <PrefRow
            icon="credit-card"
            label="Budget"
            value={formatArray(profile.budget_range, BUDGET_LABELS)}
          />
        </View>

        {/* Trips */}
        {trips.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Your trips</Text>
            <View style={styles.tripsCard}>
              {trips.map((trip, i) => (
                <View key={trip.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.tripRow}
                    onPress={() => router.push(`/trip/${trip.id}`)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.tripInfo}>
                      <Text style={styles.tripName}>{trip.name}</Text>
                      {trip.stops.length > 0 && (
                        <Text style={styles.tripDests} numberOfLines={1}>
                          {trip.stops.map(s => s.destination).join(' · ')}
                        </Text>
                      )}
                    </View>
                    <View style={styles.tripRight}>
                      <View style={[
                        styles.tripStatus,
                        { backgroundColor: trip.status === 'confirmed' ? Colors.greenDim : Colors.primaryDim },
                      ]}>
                        <Text style={[
                          styles.tripStatusText,
                          { color: trip.status === 'confirmed' ? Colors.green : Colors.primary },
                        ]}>
                          {trip.status === 'confirmed' ? 'Confirmed' : 'Planning'}
                        </Text>
                      </View>
                      <FontAwesome name="angle-right" size={14} color={Colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function PrefRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.prefRow}>
      <View style={styles.prefLeft}>
        <FontAwesome name={icon as any} size={14} color={Colors.textMuted} />
        <Text style={styles.prefLabel}>{label}</Text>
      </View>
      <Text style={styles.prefValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: { padding: 20, paddingBottom: 48 },

  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  heading: { fontSize: 26, fontWeight: '700', color: Colors.text, letterSpacing: -0.5 },
  signOutBtn: { padding: 8 },

  avatarSection: { alignItems: 'center', marginBottom: 32 },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: Colors.primaryDim,
    borderWidth: 2, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  avatarText: { fontSize: 26, fontWeight: '800', color: Colors.primary },
  name: { fontSize: 22, fontWeight: '700', color: Colors.text, letterSpacing: -0.3 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
  },

  prefsCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 28,
  },
  prefRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 15,
  },
  prefLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  prefLabel: { fontSize: 15, color: Colors.textSecondary },
  prefValue: { fontSize: 14, fontWeight: '600', color: Colors.text },

  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },

  tripsCard: {
    backgroundColor: Colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 12,
  },
  tripRow: {
    flexDirection: 'row', alignItems: 'center', padding: 15, gap: 12,
  },
  tripInfo: { flex: 1, gap: 3 },
  tripName: { fontSize: 15, fontWeight: '600', color: Colors.text },
  tripDests: { fontSize: 13, color: Colors.textSecondary },
  tripRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tripStatus: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tripStatusText: { fontSize: 11, fontWeight: '700' },
});
