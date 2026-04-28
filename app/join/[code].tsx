import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';
import type { TripWithStops } from '@/lib/types';

export default function JoinScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [trip, setTrip] = useState<TripWithStops | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function lookup() {
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .select('*')
        .eq('invite_code', code?.toUpperCase())
        .single();

      if (tripError || !tripData) {
        setError('This invite link is invalid or has expired.');
        setLoading(false);
        return;
      }

      const { data: stops } = await supabase
        .from('trip_stops')
        .select('*')
        .eq('trip_id', tripData.id)
        .order('order_index');

      const { data: memberCount } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', tripData.id);

      setTrip({
        ...tripData,
        stops: stops ?? [],
        member_count: memberCount?.length ?? 0,
      });
      setLoading(false);
    }
    if (code) lookup();
  }, [code]);

  async function handleJoin() {
    if (!trip) return;

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      // Not logged in — send to signup with return path
      router.push(`/signup?redirect=/join/${code}`);
      return;
    }

    setJoining(true);

    // Check if already a member
    const { data: existing } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', trip.id)
      .eq('user_id', user.id)
      .single();

    if (existing) {
      setJoining(false);
      router.replace(`/trip/${trip.id}`);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const { error: joinError } = await supabase.from('trip_members').insert({
      trip_id: trip.id,
      user_id: user.id,
      display_name: profile?.full_name ?? 'Traveler',
      role: 'member',
    });

    setJoining(false);

    if (joinError) {
      Alert.alert('Could not join trip', joinError.message);
      return;
    }

    router.replace(`/trip/${trip.id}`);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (error || !trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <View style={styles.errorIcon}>
            <FontAwesome name="exclamation" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.errorTitle}>Invalid invite</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/(tabs)')} activeOpacity={0.8}>
            <Text style={styles.buttonText}>Go home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <View style={styles.inviteIcon}>
          <FontAwesome name="plane" size={28} color={Colors.primary} />
        </View>
        <Text style={styles.inviteTitle}>You're invited!</Text>
        <Text style={styles.inviteSubtitle}>
          You've been invited to join a trip
        </Text>

        <View style={styles.tripCard}>
          <Text style={styles.tripName}>{trip.name}</Text>
          {trip.stops.length > 0 && (
            <Text style={styles.tripDests}>
              {trip.stops.map(s => s.destination).join(' → ')}
            </Text>
          )}
          <View style={styles.membersRow}>
            <FontAwesome name="users" size={12} color={Colors.textMuted} />
            <Text style={styles.tripMembers}>
              {trip.member_count} {trip.member_count === 1 ? 'person' : 'people'} planning this trip
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, joining && styles.buttonDisabled]}
          onPress={handleJoin}
          disabled={joining}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>{joining ? 'Joining...' : 'Join trip'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.skipButton}>
          <Text style={styles.skipText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },

  inviteIcon: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  inviteTitle: { fontSize: 28, fontWeight: '800', color: Colors.text, marginBottom: 8, letterSpacing: -0.5 },
  inviteSubtitle: { fontSize: 15, color: Colors.textSecondary, marginBottom: 28, textAlign: 'center' },

  tripCard: {
    backgroundColor: Colors.card, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.border,
    padding: 20, width: '100%', marginBottom: 28, gap: 10, alignItems: 'center',
  },
  tripName: { fontSize: 22, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  tripDests: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  membersRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tripMembers: { fontSize: 13, color: Colors.textMuted },

  button: {
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 15, width: '100%', alignItems: 'center', marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  skipButton: { padding: 8 },
  skipText: { color: Colors.textSecondary, fontSize: 15 },

  errorIcon: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  errorTitle: { fontSize: 22, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  errorText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: 28, lineHeight: 21 },
});
