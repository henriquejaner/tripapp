import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, ActivityIndicator, Image, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';
import type { Trip, TripStop, TripTab, Idea } from '@/lib/types';

const TAB_ICON: Record<string, string> = {
  Flights: 'plane', Accommodation: 'home', Restaurants: 'cutlery',
  Activities: 'star-o', Nightlife: 'glass', Transport: 'car',
  Budget: 'money', Packing: 'suitcase', Documents: 'file-text-o',
};

const DEFAULT_TABS = [
  'Flights', 'Accommodation', 'Restaurants', 'Activities',
  'Nightlife', 'Transport', 'Budget', 'Packing', 'Documents',
];
const DEFAULT_TAB_ICONS: Record<string, string> = TAB_ICON;

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface TabWithIdeas extends TripTab {
  ideas: Idea[];
}

export default function PublicTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [tabs, setTabs] = useState<TabWithIdeas[]>([]);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  useEffect(() => { loadTrip(); }, [id]);

  async function loadTrip() {
    const [tripRes, stopsRes, tabsRes] = await Promise.all([
      supabase.from('trips').select('*').eq('id', id).single(),
      supabase.from('trip_stops').select('*').eq('trip_id', id).order('order_index'),
      supabase.from('trip_tabs').select('*').eq('trip_id', id).order('order_index'),
    ]);

    if (!tripRes.data) { setLoading(false); return; }
    setTrip(tripRes.data as Trip);
    setStops(stopsRes.data ?? []);

    const loadedTabs = tabsRes.data ?? [];
    if (loadedTabs.length) {
      const { data: ideas } = await supabase
        .from('ideas')
        .select('*')
        .eq('trip_id', id)
        .eq('status', 'confirmed')
        .order('vote_count', { ascending: false });

      const ideasByTab: Record<string, Idea[]> = {};
      (ideas ?? []).forEach(idea => {
        if (!ideasByTab[idea.tab_id]) ideasByTab[idea.tab_id] = [];
        ideasByTab[idea.tab_id].push(idea);
      });

      setTabs(loadedTabs.map(t => ({ ...t, ideas: ideasByTab[t.id] ?? [] })));
    }
    setLoading(false);
  }

  async function copyTrip() {
    if (!trip) return;
    setCopying(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setCopying(false); return; }

    const { data: profile } = await supabase
      .from('profiles').select('full_name').eq('id', user.id).single();

    // 1. Create new trip
    const { data: newTrip, error } = await supabase
      .from('trips')
      .insert({
        name: trip.name,
        created_by: user.id,
        invite_code: generateCode(),
        status: 'planning',
        people_count: trip.people_count,
        cover_image: trip.cover_image,
      })
      .select()
      .single();

    if (error || !newTrip) { setCopying(false); return; }

    // 2. Add user as owner
    await supabase.from('trip_members').insert({
      trip_id: newTrip.id,
      user_id: user.id,
      display_name: profile?.full_name ?? 'You',
      role: 'owner',
    });

    // 3. Copy stops
    if (stops.length) {
      await supabase.from('trip_stops').insert(
        stops.map((s, i) => ({
          trip_id: newTrip.id,
          destination: s.destination,
          start_date: s.start_date,
          end_date: s.end_date,
          order_index: i,
        }))
      );
    }

    // 4. Create default tabs + copy confirmed ideas into matching tabs
    const { data: newTabs } = await supabase
      .from('trip_tabs')
      .insert(
        DEFAULT_TABS.map((name, i) => ({
          trip_id: newTrip.id,
          name,
          icon: DEFAULT_TAB_ICONS[name] ?? 'bookmark-o',
          order_index: i,
          created_by: user.id,
        }))
      )
      .select();

    // Map tab name → new tab id
    const tabNameToId: Record<string, string> = {};
    (newTabs ?? []).forEach(t => { tabNameToId[t.name] = t.id; });

    // Map source tab id → tab name
    const srcTabIdToName: Record<string, string> = {};
    tabs.forEach(t => { srcTabIdToName[t.id] = t.name; });

    // Collect confirmed ideas to copy
    const ideasToInsert: object[] = [];
    tabs.forEach(srcTab => {
      const targetTabId = tabNameToId[srcTab.name];
      if (!targetTabId) return;
      srcTab.ideas.slice(0, 8).forEach((idea, idx) => {
        ideasToInsert.push({
          tab_id: targetTabId,
          trip_id: newTrip.id,
          created_by: user.id,
          creator_name: profile?.full_name ?? 'You',
          title: idea.title,
          description: idea.description,
          url: idea.url,
          estimated_cost: idea.estimated_cost,
          currency: idea.currency,
          status: 'idea',
          order_index: idx,
        });
      });
    });

    if (ideasToInsert.length) {
      await supabase.from('ideas').insert(ideasToInsert);
    }

    setCopying(false);
    router.replace(`/trip/${newTrip.id}`);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Trip not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  const tabsWithIdeas = tabs.filter(t => t.ideas.length > 0);
  const totalIdeas = tabs.reduce((n, t) => n + t.ideas.length, 0);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <FontAwesome name="angle-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerLabel}>Public trip</Text>
        <TouchableOpacity
          style={[styles.copyBtn, copying && styles.copyBtnDisabled]}
          onPress={copyTrip}
          disabled={copying}
          activeOpacity={0.85}
        >
          {copying
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <>
                <FontAwesome name="copy" size={12} color={Colors.white} />
                <Text style={styles.copyBtnText}>Plan this trip</Text>
              </>
          }
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Cover */}
        {trip.cover_image ? (
          <View>
            <Image source={{ uri: trip.cover_image }} style={styles.cover} resizeMode="cover" />
            <View style={styles.coverOverlay} />
            <View style={styles.coverContent}>
              <Text style={styles.coverTitle}>{trip.name}</Text>
              {stops.length > 0 && (
                <Text style={styles.coverDests}>{stops.map(s => s.destination).join(' → ')}</Text>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.titleBlock}>
            <Text style={styles.tripName}>{trip.name}</Text>
            {stops.length > 0 && (
              <Text style={styles.tripDests}>{stops.map(s => s.destination).join(' → ')}</Text>
            )}
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          {firstStop?.start_date && (
            <View style={styles.statPill}>
              <FontAwesome name="calendar-o" size={11} color={Colors.textMuted} />
              <Text style={styles.statText}>
                {formatDate(firstStop.start_date)}
                {lastStop?.end_date && lastStop.end_date !== firstStop.start_date
                  ? ` – ${formatDate(lastStop.end_date)}` : ''}
              </Text>
            </View>
          )}
          {stops.length > 1 && (
            <View style={styles.statPill}>
              <FontAwesome name="map-marker" size={11} color={Colors.textMuted} />
              <Text style={styles.statText}>{stops.length} stops</Text>
            </View>
          )}
          {totalIdeas > 0 && (
            <View style={styles.statPill}>
              <FontAwesome name="star" size={11} color={Colors.textMuted} />
              <Text style={styles.statText}>{totalIdeas} confirmed ideas</Text>
            </View>
          )}
        </View>

        {/* Stops */}
        {stops.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Itinerary</Text>
            <View style={styles.stopsList}>
              {stops.map((s, i) => (
                <View key={s.id} style={styles.stopRow}>
                  <View style={styles.stopDot} />
                  {i < stops.length - 1 && <View style={styles.stopLine} />}
                  <View style={styles.stopInfo}>
                    <Text style={styles.stopDest}>{s.destination}</Text>
                    {s.start_date && (
                      <Text style={styles.stopDate}>
                        {formatDate(s.start_date)}
                        {s.end_date && s.end_date !== s.start_date ? ` → ${formatDate(s.end_date)}` : ''}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Confirmed ideas by tab */}
        {tabsWithIdeas.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Confirmed ideas</Text>
            {tabsWithIdeas.map(tab => (
              <View key={tab.id} style={styles.tabGroup}>
                <View style={styles.tabGroupHeader}>
                  <FontAwesome
                    name={(TAB_ICON[tab.name] ?? 'bookmark-o') as any}
                    size={12} color={Colors.textSecondary}
                  />
                  <Text style={styles.tabGroupName}>{tab.name}</Text>
                  <Text style={styles.tabGroupCount}>{tab.ideas.length}</Text>
                </View>
                {tab.ideas.map(idea => (
                  <View key={idea.id} style={styles.ideaRow}>
                    <View style={styles.ideaCheck}>
                      <FontAwesome name="check" size={9} color={Colors.white} />
                    </View>
                    <View style={styles.ideaInfo}>
                      <Text style={styles.ideaTitle}>{idea.title}</Text>
                      {idea.description ? (
                        <Text style={styles.ideaDesc} numberOfLines={2}>{idea.description}</Text>
                      ) : null}
                    </View>
                    {idea.estimated_cost != null && (
                      <Text style={styles.ideaCost}>€{idea.estimated_cost}</Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {tabsWithIdeas.length === 0 && (
          <View style={styles.noIdeas}>
            <Text style={styles.noIdeasText}>No confirmed ideas shared yet.</Text>
          </View>
        )}

        {/* CTA at bottom */}
        <TouchableOpacity
          style={[styles.ctaBtn, copying && styles.copyBtnDisabled]}
          onPress={copyTrip}
          disabled={copying}
          activeOpacity={0.85}
        >
          {copying ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <FontAwesome name="copy" size={14} color={Colors.white} />
              <Text style={styles.ctaBtnText}>Plan a trip like this</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  scroll: { paddingBottom: 48 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, width: 36 },
  headerLabel: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  copyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  copyBtnDisabled: { opacity: 0.6 },
  copyBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  cover: { width: '100%', height: 200 },
  coverOverlay: { position: 'absolute', top: 0, left: 0, right: 0, height: 200, backgroundColor: 'rgba(0,0,0,0.35)' },
  coverContent: { position: 'absolute', bottom: 16, left: 20, right: 20 },
  coverTitle: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 4 },
  coverDests: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  titleBlock: { padding: 20, paddingBottom: 8 },
  tripName: { fontSize: 24, fontWeight: '800', color: Colors.text, letterSpacing: -0.5, marginBottom: 4 },
  tripDests: { fontSize: 14, color: Colors.textSecondary },

  statsRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.card, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: Colors.border,
  },
  statText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },

  section: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 12,
  },

  stopsList: { gap: 0 },
  stopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 16, position: 'relative' },
  stopDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.primary, marginTop: 4, flexShrink: 0,
  },
  stopLine: {
    position: 'absolute', left: 5, top: 16, bottom: 0,
    width: 2, backgroundColor: Colors.border,
  },
  stopInfo: { flex: 1 },
  stopDest: { fontSize: 15, fontWeight: '700', color: Colors.text },
  stopDate: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  tabGroup: {
    backgroundColor: Colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: 10, overflow: 'hidden',
  },
  tabGroupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.backgroundAlt,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tabGroupName: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  tabGroupCount: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    backgroundColor: Colors.border, borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  ideaRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  ideaCheck: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.success,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
  },
  ideaInfo: { flex: 1 },
  ideaTitle: { fontSize: 14, fontWeight: '600', color: Colors.text },
  ideaDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 17 },
  ideaCost: { fontSize: 13, fontWeight: '700', color: Colors.text },

  noIdeas: { padding: 32, alignItems: 'center' },
  noIdeasText: { fontSize: 13, color: Colors.textMuted },

  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.primary, borderRadius: 14,
    marginHorizontal: 16, marginTop: 28, paddingVertical: 16,
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 6,
  },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },

  errorText: { fontSize: 15, color: Colors.textSecondary },
  backLink: { padding: 8 },
  backLinkText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
});
