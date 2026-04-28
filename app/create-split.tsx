import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';
import CalendarPicker from '@/components/CalendarPicker';
import CitySearchInput from '@/components/CitySearchInput';
import type { TripMember, TripTab, TripStop } from '@/lib/types';

interface Stop {
  destination: string;
  start_date: string | null;
  end_date: string | null;
}

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function capitalizeWords(s: string) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

function formatDateShort(d: string | null) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' });
}
function calcNights(start: string, end: string) {
  return Math.round((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000);
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function CreateSplitScreen() {
  const { parentId, parentName } = useLocalSearchParams<{ parentId: string; parentName: string }>();

  const [splitName, setSplitName] = useState('');
  const [splitNote, setSplitNote] = useState('');
  const [members, setMembers] = useState<TripMember[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [stops, setStops] = useState<Stop[]>([{ destination: '', start_date: null, end_date: null }]);
  const [calendarFor, setCalendarFor] = useState<number | null>(null);
  const [parentStops, setParentStops] = useState<TripStop[]>([]);
  const [imported, setImported] = useState(false);
  const [parentTabs, setParentTabs] = useState<TripTab[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [error, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);

      const [membersRes, tabsRes, stopsRes] = await Promise.all([
        supabase.from('trip_members').select('*').eq('trip_id', parentId),
        supabase.from('trip_tabs').select('*').eq('trip_id', parentId).order('order_index'),
        supabase.from('trip_stops').select('*').eq('trip_id', parentId).order('order_index'),
      ]);

      const memberList = membersRes.data ?? [];
      setMembers(memberList);
      setParentTabs(tabsRes.data ?? []);
      setParentStops(stopsRes.data ?? []);

      // Auto-select current user
      if (user) {
        const me = memberList.find(m => m.user_id === user.id);
        if (me) setSelectedMembers(new Set([me.id]));
      }

      setLoadingMembers(false);
    }
    load();
  }, [parentId]);

  function toggleMember(memberId: string) {
    const me = members.find(m => m.user_id === currentUserId);
    if (me && memberId === me.id) return; // can't deselect yourself
    setSelectedMembers(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  }

  function importFromParent() {
    if (!parentStops.length) return;
    setStops(parentStops.map(s => ({
      destination: s.destination,
      start_date: s.start_date,
      end_date: s.end_date,
    })));
    setImported(true);
  }

  async function handleCreate() {
    setError('');
    if (!splitName.trim()) { setError('Give this split a name.'); return; }
    if (selectedMembers.size === 0) { setError('Select at least one person.'); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const inviteCode = generateInviteCode();

    // Create the sub-trip
    const { data: subTrip, error: tripErr } = await supabase
      .from('trips')
      .insert({
        name: splitName.trim(),
        created_by: user.id,
        invite_code: inviteCode,
        status: 'planning',
        parent_trip_id: parentId,
        split_note: splitNote.trim() || null,
        people_count: selectedMembers.size,
      })
      .select()
      .single();

    if (tripErr || !subTrip) {
      setLoading(false);
      setError(tripErr?.message ?? 'Could not create split.');
      return;
    }

    // Selected members to add
    const selectedMemberRows = members.filter(m => selectedMembers.has(m.id));

    // ⚠️ Members MUST be inserted first — trip_tabs RLS checks is_trip_member(),
    // so tabs insert will silently fail if membership isn't committed yet.
    await supabase.from('trip_members').insert(
      selectedMemberRows.map(m => ({
        trip_id: subTrip.id,
        user_id: m.user_id,
        display_name: m.display_name,
        role: m.user_id === user.id ? 'owner' : 'member',
      }))
    );

    // Now insert everything else (RLS will pass)
    await Promise.all([
      // Add stops if any destinations provided
      stops.filter(s => s.destination.trim()).length > 0
        ? supabase.from('trip_stops').insert(
            stops
              .filter(s => s.destination.trim())
              .map((s, i) => ({
                trip_id: subTrip.id,
                destination: s.destination.trim(),
                start_date: s.start_date ?? null,
                end_date: s.end_date ?? null,
                order_index: i,
              }))
          )
        : Promise.resolve(),

      // Copy parent tabs
      parentTabs.length
        ? supabase.from('trip_tabs').insert(
            parentTabs.map((t, i) => ({
              trip_id: subTrip.id,
              name: t.name,
              icon: t.icon,
              order_index: i,
              created_by: user.id,
            }))
          )
        : Promise.resolve(),
    ]);

    setLoading(false);
    router.replace(`/trip/${subTrip.id}`);
  }

  const selectedCount = selectedMembers.size;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create split</Text>
          <View style={{ width: 56 }} />
        </View>

        {/* Parent trip crumb */}
        <View style={styles.crumb}>
          <FontAwesome name="code-fork" size={11} color={Colors.primary} />
          <Text style={styles.crumbText}>Split from <Text style={styles.crumbParent}>{parentName}</Text></Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.inner}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Split name */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Split name</Text>
            <TextInput
              style={styles.input}
              placeholder='e.g. "Beach Squad" or "Museum Crew"'
              placeholderTextColor={Colors.textMuted}
              value={splitName}
              onChangeText={v => setSplitName(capitalizeWords(v))}
              autoFocus
            />
          </View>

          {/* Who's going */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Who's going on this split?</Text>
            <Text style={styles.sectionHint}>
              Select the members joining this group. You're always included.
            </Text>

            {loadingMembers ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 8 }} />
            ) : (
              <View style={styles.memberGrid}>
                {members.map(m => {
                  const isSelected = selectedMembers.has(m.id);
                  const isMe = m.user_id === currentUserId;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={[styles.memberChip, isSelected && styles.memberChipActive]}
                      onPress={() => toggleMember(m.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.memberAvatar, isSelected && styles.memberAvatarActive]}>
                        <Text style={[styles.memberAvatarText, isSelected && styles.memberAvatarTextActive]}>
                          {initials(m.display_name)}
                        </Text>
                      </View>
                      <Text style={[styles.memberName, isSelected && styles.memberNameActive]}>
                        {isMe ? 'You' : m.display_name.split(' ')[0]}
                      </Text>
                      {isSelected && (
                        <FontAwesome name="check" size={10} color={Colors.primary} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {selectedCount > 0 && (
              <Text style={styles.selectedCount}>
                {selectedCount} {selectedCount === 1 ? 'person' : 'people'} selected
              </Text>
            )}
          </View>

          {/* Destination */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Where are they going?</Text>

            {/* Import banner */}
            {parentStops.length > 0 && !imported && (
              <TouchableOpacity style={styles.importBanner} onPress={importFromParent} activeOpacity={0.8}>
                <FontAwesome name="download" size={13} color={Colors.primary} />
                <Text style={styles.importBannerText}>
                  Import stops from <Text style={{ fontWeight: '700' }}>{parentName}</Text>
                </Text>
                <FontAwesome name="angle-right" size={13} color={Colors.primary} />
              </TouchableOpacity>
            )}
            {imported && (
              <View style={styles.importedBadge}>
                <FontAwesome name="check" size={11} color={Colors.primary} />
                <Text style={styles.importedBadgeText}>Imported from {parentName}</Text>
                <TouchableOpacity onPress={() => { setStops([{ destination: '', start_date: null, end_date: null }]); setImported(false); }}>
                  <Text style={styles.importedClear}>Clear</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Multi-stop list */}
            {stops.map((stop, index) => (
              <View key={index} style={styles.stopCard}>
                <View style={styles.stopHeader}>
                  <View style={styles.stopNumber}>
                    <Text style={styles.stopNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.stopHeaderLabel}>Stop {index + 1}</Text>
                  {stops.length > 1 && (
                    <TouchableOpacity onPress={() => setStops(s => s.filter((_, i) => i !== index))} style={{ padding: 6 }}>
                      <FontAwesome name="times" size={13} color={Colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
                <CitySearchInput
                  value={stop.destination}
                  onChangeText={v => setStops(s => s.map((st, i) => i === index ? { ...st, destination: v } : st))}
                  placeholder="City or place"
                />
                <TouchableOpacity
                  style={styles.dateBtn}
                  onPress={() => setCalendarFor(index)}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="calendar-o" size={13} color={Colors.textSecondary} />
                  {stop.start_date ? (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.dateBtnSelected}>
                        {formatDateShort(stop.start_date)}{stop.end_date ? ` → ${formatDateShort(stop.end_date)}` : ''}
                      </Text>
                      {stop.start_date && stop.end_date && (
                        <Text style={styles.dateBtnNights}>
                          {calcNights(stop.start_date, stop.end_date)} nights
                        </Text>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.dateBtnPlaceholder}>Select dates (optional)</Text>
                  )}
                  <FontAwesome name="angle-right" size={13} color={Colors.textMuted} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={styles.addStopBtn} onPress={() => setStops(s => [...s, { destination: '', start_date: null, end_date: null }])} activeOpacity={0.7}>
              <Text style={styles.addStopText}>+ Add another stop</Text>
            </TouchableOpacity>
          </View>

          {/* Note */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Note <Text style={styles.optional}>(optional)</Text></Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              placeholder='e.g. "We want more relaxed days by the sea"'
              placeholderTextColor={Colors.textMuted}
              value={splitNote}
              onChangeText={setSplitNote}
              multiline
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <TouchableOpacity
            style={[styles.createBtn, loading && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={loading}
            activeOpacity={0.85}
          >
            <FontAwesome name="code-fork" size={15} color={Colors.white} />
            <Text style={styles.createBtnText}>{loading ? 'Creating...' : 'Create split'}</Text>
          </TouchableOpacity>
        </View>

        <CalendarPicker
          visible={calendarFor !== null}
          startDate={calendarFor !== null ? stops[calendarFor]?.start_date ?? null : null}
          endDate={calendarFor !== null ? stops[calendarFor]?.end_date ?? null : null}
          title="Select dates"
          onClose={() => setCalendarFor(null)}
          onConfirm={(s, e) => {
            if (calendarFor !== null) {
              setStops(prev => prev.map((st, i) => i === calendarFor ? { ...st, start_date: s, end_date: e } : st));
            }
            setCalendarFor(null);
          }}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cancelText: { fontSize: 15, color: Colors.textSecondary, width: 56 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },

  crumb: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: Colors.primaryDim,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  crumbText: { fontSize: 13, color: Colors.textSecondary },
  crumbParent: { fontWeight: '700', color: Colors.primary },

  inner: { padding: 24, paddingBottom: 120, gap: 28 },

  section: { gap: 10 },
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  sectionHint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginTop: -4 },
  optional: { fontWeight: '400', textTransform: 'none', letterSpacing: 0 },

  input: {
    backgroundColor: Colors.card, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: Colors.text,
  },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },

  memberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 40, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  memberChipActive: {
    borderColor: Colors.primary, backgroundColor: Colors.primaryDim,
  },
  memberAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarActive: { backgroundColor: Colors.primary + '30' },
  memberAvatarText: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary },
  memberAvatarTextActive: { color: Colors.primary },
  memberName: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  memberNameActive: { color: Colors.primary },
  selectedCount: {
    fontSize: 12, color: Colors.primary, fontWeight: '600', marginTop: 2,
  },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11,
    backgroundColor: Colors.backgroundAlt,
  },
  dateBtnSelected: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.text },
  dateBtnPlaceholder: { flex: 1, fontSize: 14, color: Colors.textMuted },
  dateBtnNights: {
    fontSize: 11, fontWeight: '700', color: Colors.primary,
    backgroundColor: Colors.primaryDim, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },

  importBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.primaryDim, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.primary + '40',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  importBannerText: { flex: 1, fontSize: 14, color: Colors.textSecondary },
  importedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primaryDim, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  importedBadgeText: { flex: 1, fontSize: 13, color: Colors.primary, fontWeight: '600' },
  importedClear: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  stopCard: {
    backgroundColor: Colors.backgroundAlt, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    padding: 12, gap: 8,
  },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stopNumber: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.card, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  stopNumberText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  stopHeaderLabel: { flex: 1, fontSize: 11, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  addStopBtn: {
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  addStopText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '600' },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 20, paddingBottom: 36,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  errorText: { fontSize: 13, color: '#E53E3E', textAlign: 'center', marginBottom: 8 },
  createBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingVertical: 16, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 10,
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white, letterSpacing: 0.2 },
});
