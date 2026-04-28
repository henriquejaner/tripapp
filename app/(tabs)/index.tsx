import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, RefreshControl, ActivityIndicator,
  Animated, Modal, TextInput, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';
import type { TripWithStops, TripStop } from '@/lib/types';

const BANNER_PHOTOS = [
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=80',
  'https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=1200&q=80',
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200&q=80',
  'https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&q=80',
  'https://images.unsplash.com/photo-1503220317375-aaad61436b1b?w=1200&q=80',
];

function HeroBanner() {
  const [current, setCurrent] = useState(0);
  const [next, setNext] = useState(1);
  const nextOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      const upcoming = (current + 1) % BANNER_PHOTOS.length;
      setNext(upcoming);
      nextOpacity.setValue(0);
      Animated.timing(nextOpacity, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }).start(() => {
        setCurrent(upcoming);
      });
    }, 4500);
    return () => clearInterval(interval);
  }, [current]);

  return (
    <View style={styles.banner}>
      {/* Base image — always visible */}
      <Animated.Image
        source={{ uri: BANNER_PHOTOS[current] }}
        style={styles.bannerImage}
        resizeMode="cover"
      />
      {/* Next image fades in on top */}
      <Animated.Image
        source={{ uri: BANNER_PHOTOS[next] }}
        style={[styles.bannerImage, { opacity: nextOpacity }]}
        resizeMode="cover"
      />

      {/* Overlay + text — never fades */}
      <View style={styles.bannerOverlay}>
        <SafeAreaView>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerHeading}>Where are we{'\n'}going next?</Text>
          </View>
        </SafeAreaView>
      </View>

      {/* Dots */}
      <View style={styles.dots}>
        {BANNER_PHOTOS.map((_, i) => (
          <View key={i} style={[styles.dot, i === current && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const [trips, setTrips] = useState<TripWithStops[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showJoin, setShowJoin] = useState(false);

  async function fetchUnread() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false);
    setUnreadCount(count ?? 0);
  }

  async function fetchTrips() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: memberRows } = await supabase
      .from('trip_members')
      .select('trip_id, role')
      .eq('user_id', user.id);

    if (!memberRows?.length) {
      setTrips([]);
      setLoading(false);
      return;
    }

    const tripIds = memberRows.map(r => r.trip_id);

    const [tripRes, stopRes, memberCountRes] = await Promise.all([
      supabase.from('trips').select('*').in('id', tripIds).order('created_at', { ascending: false }),
      supabase.from('trip_stops').select('*').in('trip_id', tripIds).order('order_index'),
      supabase.from('trip_members').select('trip_id').in('trip_id', tripIds),
    ]);

    const countMap: Record<string, number> = {};
    memberCountRes.data?.forEach(m => {
      countMap[m.trip_id] = (countMap[m.trip_id] ?? 0) + 1;
    });

    const roleMap: Record<string, string> = {};
    memberRows.forEach(m => { roleMap[m.trip_id] = m.role; });

    const enriched: TripWithStops[] = (tripRes.data ?? []).map(t => ({
      ...t,
      stops: (stopRes.data ?? []).filter(s => s.trip_id === t.id),
      member_count: countMap[t.id] ?? 0,
      user_role: roleMap[t.id] as any,
    }));

    setTrips(enriched);
    setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      fetchTrips();
      fetchUnread();
    }, [])
  );


  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTrips();
    setRefreshing(false);
  }, []);

  const rootTrips = trips.filter(t => !t.parent_trip_id);
  const splitsByParent = trips.reduce<Record<string, TripWithStops[]>>((acc, t) => {
    if (t.parent_trip_id) {
      acc[t.parent_trip_id] = [...(acc[t.parent_trip_id] ?? []), t];
    }
    return acc;
  }, {});
  const hasTrips = rootTrips.length > 0;

  return (
    <View style={styles.container}>
      <FlatList
        data={rootTrips}
        keyExtractor={t => t.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ListHeaderComponent={
          <>
            <HeroBanner />
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{hasTrips ? 'Your trips' : ''}</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.joinBtn} onPress={() => setShowJoin(true)} activeOpacity={0.8}>
                  <FontAwesome name="sign-in" size={13} color={Colors.primary} />
                  <Text style={styles.joinBtnText}>Join</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bellBtn} onPress={() => router.push('/notifications')}>
                  <FontAwesome name="bell-o" size={18} color={Colors.text} />
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unreadCount}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
            {loading && (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 32 }} />
            )}
          </>
        }
        ListEmptyComponent={!loading ? <EmptyState onJoin={() => setShowJoin(true)} /> : null}
        ListFooterComponent={hasTrips ? <TripListFooter /> : null}
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            splits={splitsByParent[item.id] ?? []}
            onPress={() => router.push(`/trip/${item.id}`)}
          />
        )}
        contentContainerStyle={styles.listContent}
      />
      <JoinModal visible={showJoin} onClose={() => setShowJoin(false)} />

      {/* FAB — only when trips exist */}
      {trips.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/create-trip')}
          activeOpacity={0.85}
        >
          <FontAwesome name="plus" size={16} color={Colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function TripCard({ trip, splits, onPress }: {
  trip: TripWithStops; splits: TripWithStops[]; onPress: () => void;
}) {
  const firstStop = trip.stops[0];
  const lastStop = trip.stops[trip.stops.length - 1];
  const dateLabel = formatDateRange(firstStop, lastStop);
  const statusColor = {
    planning: Colors.primary, confirmed: Colors.green, completed: Colors.textMuted,
  }[trip.status];
  const statusLabel = { planning: 'Planning', confirmed: 'Confirmed', completed: 'Completed' }[trip.status];

  return (
    <View style={styles.cardGroup}>
      <TouchableOpacity
        style={[styles.card, splits.length > 0 && styles.cardHasSplits, trip.cover_image ? styles.cardWithCover : null]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {trip.cover_image ? (
          <View>
            <Image
              source={{ uri: trip.cover_image }}
              style={styles.cardCover}
              resizeMode="cover"
            />
            <View style={styles.cardCoverOverlay} />
            <View style={styles.cardCoverTitleRow}>
              <Text style={styles.cardTitleOnCover} numberOfLines={1}>{trip.name}</Text>
              <View style={[styles.statusBadge, { backgroundColor: statusColor + '30' }]}>
                <Text style={[styles.statusText, { color: '#fff' }]}>{statusLabel}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.cardTop}>
            <Text style={styles.cardTitle}>{trip.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        )}
        <View style={trip.cover_image ? styles.cardBodyPadded : null}>
          {trip.stops.length > 0 && (
            <Text style={styles.cardDests}>{trip.stops.map(s => s.destination).join(' → ')}</Text>
          )}
          <View style={styles.cardBottom}>
            <Text style={styles.cardMeta}>{trip.member_count} {trip.member_count === 1 ? 'person' : 'people'}</Text>
            {dateLabel && <Text style={styles.cardMeta}>{dateLabel}</Text>}
          </View>
        </View>
      </TouchableOpacity>

      {splits.length > 0 && (
        <View style={styles.splitsNested}>
          {splits.map((split, i) => {
            const sc = { planning: Colors.primary, confirmed: Colors.green, completed: Colors.textMuted }[split.status];
            return (
              <TouchableOpacity
                key={split.id}
                style={[styles.splitNestedRow, i < splits.length - 1 && styles.splitNestedDivider]}
                onPress={() => router.push(`/trip/${split.id}`)}
                activeOpacity={0.7}
              >
                <FontAwesome name="code-fork" size={11} color={Colors.primary} style={{ marginTop: 1 }} />
                <Text style={styles.splitNestedName} numberOfLines={1}>{split.name}</Text>
                {split.people_count != null && (
                  <Text style={styles.splitNestedMeta}>{split.people_count}p</Text>
                )}
                <View style={[styles.splitNestedStatus, { backgroundColor: sc + '18' }]}>
                  <Text style={[styles.splitNestedStatusText, { color: sc }]}>{statusLabel}</Text>
                </View>
                <FontAwesome name="angle-right" size={12} color={Colors.textMuted} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

function EmptyState({ onJoin }: { onJoin: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No trips yet</Text>
      <Text style={styles.emptyText}>
        Start planning your next adventure, or join one with an invite code from a friend.
      </Text>
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => router.push('/create-trip')}
        activeOpacity={0.85}
      >
        <Text style={styles.createButtonText}>+ Plan a trip</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.joinCodeButton} onPress={onJoin} activeOpacity={0.8}>
        <Text style={styles.joinCodeButtonText}>Enter invite code</Text>
      </TouchableOpacity>
    </View>
  );
}

function TripListFooter() {
  return (
    <View style={styles.listFooter}>
      <View style={styles.listFooterLine} />
      <Text style={styles.listFooterText}>every great trip starts with a plan.</Text>
      <View style={styles.listFooterLine} />
    </View>
  );
}

function JoinModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLookup() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('trips').select('id').eq('invite_code', trimmed).single();
    setLoading(false);
    if (err || !data) {
      setError('No trip found with that code. Check it and try again.');
      return;
    }
    onClose();
    setCode('');
    router.push(`/join/${trimmed}`);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.joinModal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.joinModalHeader}>
          <View style={{ width: 56 }} />
          <Text style={styles.joinModalTitle}>Join a trip</Text>
          <TouchableOpacity onPress={() => { onClose(); setCode(''); setError(''); }}>
            <Text style={styles.joinModalCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.joinModalBody}>
          <Text style={styles.joinModalHint}>
            Enter the invite code shared by your trip organizer.
          </Text>
          <TextInput
            style={styles.joinCodeInput}
            placeholder="e.g. ABC123"
            placeholderTextColor={Colors.textMuted}
            value={code}
            onChangeText={v => { setCode(v.toUpperCase()); setError(''); }}
            autoCapitalize="characters"
            autoFocus
            maxLength={8}
            returnKeyType="go"
            onSubmitEditing={handleLookup}
          />
          {error ? <Text style={styles.joinError}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.joinSubmitBtn, (!code.trim() || loading) && { opacity: 0.5 }]}
            onPress={handleLookup}
            disabled={!code.trim() || loading}
            activeOpacity={0.85}
          >
            <Text style={styles.joinSubmitText}>{loading ? 'Looking up...' : 'Find trip'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function formatDateRange(first?: TripStop, last?: TripStop): string {
  if (!first?.start_date) return '';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const start = new Date(first.start_date).toLocaleDateString('en', opts);
  if (last?.end_date && last.end_date !== first.start_date) {
    const end = new Date(last.end_date).toLocaleDateString('en', opts);
    return `${start} – ${end}`;
  }
  return start;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listContent: { paddingBottom: 100 },

  // Banner
  banner: { width: '100%', height: 260, overflow: 'hidden' },
  bannerImage: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    width: '100%',
    height: '100%',
  },
  bannerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.32)',
    justifyContent: 'flex-end',
  },
  bannerContent: {
    padding: 20,
    paddingBottom: 32,
  },
  bannerHeading: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.8,
    lineHeight: 36,
  },
  dots: {
    position: 'absolute',
    bottom: 16,
    right: 20,
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#fff',
    width: 18,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
    flex: 1,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  joinBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.primary,
    backgroundColor: Colors.primaryDim,
  },
  joinBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  bellBtn: { padding: 4, position: 'relative' },
  badge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: Colors.primary,
    borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: Colors.white },

  // Trip card
  cardGroup: {
    marginHorizontal: 16,
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    gap: 8,
  },
  cardHasSplits: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  cardWithCover: {
    padding: 0,
    overflow: 'hidden',
  },
  cardCover: {
    width: '100%',
    height: 110,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  cardCoverOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 110,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  cardCoverTitleRow: {
    position: 'absolute',
    bottom: 10,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitleOnCover: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  cardBodyPadded: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 8,
  },

  // Nested splits
  splitsNested: {
    backgroundColor: Colors.backgroundAlt,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Colors.border,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: 'hidden',
  },
  splitNestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  splitNestedDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  splitNestedName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  splitNestedMeta: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  splitNestedStatus: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  splitNestedStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 8,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDests: { fontSize: 14, color: Colors.textSecondary },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  cardMeta: { fontSize: 13, color: Colors.textMuted },

  // Empty
  empty: {
    paddingHorizontal: 40,
    paddingTop: 56,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 8,
  },
  createButton: {
    backgroundColor: Colors.green,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 4,
    width: '100%',
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  listFooter: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginTop: 28, gap: 12,
  },
  listFooterLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  listFooterText: {
    fontSize: 12, color: Colors.textMuted,
    fontStyle: 'italic', letterSpacing: 0.2,
  },

  joinCodeButton: {
    borderWidth: 1, borderColor: Colors.border,
    borderRadius: 10, paddingVertical: 13,
    width: '100%', alignItems: 'center',
  },
  joinCodeButtonText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },

  // Join modal
  joinModal: { flex: 1, backgroundColor: Colors.background },
  joinModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  joinModalTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  joinModalCancel: { fontSize: 15, color: Colors.textSecondary, width: 56, textAlign: 'right' },
  joinModalBody: { padding: 24, gap: 16 },
  joinModalHint: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  joinCodeInput: {
    backgroundColor: Colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 24, fontWeight: '800', color: Colors.text,
    letterSpacing: 6, textAlign: 'center',
  },
  joinError: { fontSize: 13, color: '#E53E3E', textAlign: 'center' },
  joinSubmitBtn: {
    backgroundColor: Colors.text, borderRadius: 10,
    paddingVertical: 15, alignItems: 'center',
  },
  joinSubmitText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  // FAB
  fab: {
    position: 'absolute', bottom: 32, right: 20,
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: Colors.text,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 8,
  },
});
