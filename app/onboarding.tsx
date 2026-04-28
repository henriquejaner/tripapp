import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';
import { FontAwesome } from '@expo/vector-icons';
import type { TravelVibe, BudgetRange } from '@/lib/types';

const VIBES: { value: TravelVibe; label: string; desc: string; icon: string }[] = [
  { value: 'cultural', label: 'Cultural', desc: 'Museums, history, local life', icon: 'bank' },
  { value: 'party',    label: 'Party',    desc: 'Nightlife, festivals, bars',   icon: 'music' },
  { value: 'outdoors', label: 'Outdoors', desc: 'Hiking, beaches, nature',      icon: 'tree' },
  { value: 'mixed',    label: 'Mixed',    desc: 'A bit of everything',          icon: 'random' },
];

const GROUP_SIZES = [
  { value: 2,  label: 'Just 2' },
  { value: 4,  label: '3–5 people' },
  { value: 8,  label: '6–10 people' },
  { value: 15, label: '10+ people' },
];

const BUDGETS: { value: BudgetRange; label: string; desc: string; icon: string }[] = [
  { value: 'budget',  label: 'Budget',    desc: 'Hostels, street food, free activities', icon: 'leaf' },
  { value: 'mid',     label: 'Mid-range', desc: 'Hotels, restaurants, some splurges',   icon: 'star-half-o' },
  { value: 'luxury',  label: 'Luxury',    desc: 'Best hotels, fine dining, VIP',        icon: 'diamond' },
];

const STEPS = [
  { title: "What's your travel vibe?",  subtitle: 'Pick all that apply — you can be cultural and a party animal.' },
  { title: 'How big is your crew?',     subtitle: 'Typically, how many people do you travel with?' },
  { title: "What's your budget style?", subtitle: 'Pick all that apply. No judgment — it depends on the trip.' },
];

export default function OnboardingScreen() {
  const [step, setStep]           = useState(0);
  const [vibes, setVibes]         = useState<TravelVibe[]>([]);
  const [groupSize, setGroupSize] = useState<number | null>(null);
  const [budgets, setBudgets]     = useState<BudgetRange[]>([]);
  const [loading, setLoading]     = useState(false);

  function toggleVibe(v: TravelVibe) {
    setVibes(prev =>
      prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
    );
  }

  function toggleBudget(b: BudgetRange) {
    setBudgets(prev =>
      prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]
    );
  }

  const canContinue = [vibes.length > 0, groupSize !== null, budgets.length > 0][step];

  async function handleFinish() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    await supabase.from('profiles').update({
      travel_vibe: vibes,
      group_size_pref: groupSize,
      budget_range: budgets,
      onboarded: true,
    }).eq('id', user.id);
    setLoading(false);
    router.replace('/(tabs)');
  }

  function handleNext() {
    if (step < 2) setStep(step + 1);
    else handleFinish();
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress bar */}
      <View style={styles.topBar}>
        <View style={styles.progressTrack}>
          {[0, 1, 2].map(i => (
            <View key={i} style={[styles.progressSegment, i <= step && styles.progressSegmentActive]} />
          ))}
        </View>
        {step > 0 && (
          <TouchableOpacity onPress={() => setStep(step - 1)} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>Step {step + 1} of 3</Text>
        <Text style={styles.title}>{STEPS[step].title}</Text>
        <Text style={styles.subtitle}>{STEPS[step].subtitle}</Text>

        {/* Step 0 — Vibe (multi-select) */}
        {step === 0 && (
          <View style={styles.options}>
            {VIBES.map(item => {
              const selected = vibes.includes(item.value);
              return (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.optionCard, selected && styles.optionCardSelected]}
                  onPress={() => toggleVibe(item.value)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                    <FontAwesome name={item.icon as any} size={16} color={selected ? Colors.white : Colors.textMuted} />
                  </View>
                  <View style={styles.optionTextBlock}>
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                      {item.label}
                    </Text>
                    <Text style={styles.optionDesc}>{item.desc}</Text>
                  </View>
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected && <FontAwesome name="check" size={11} color={Colors.white} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Step 1 — Group size (single-select grid) */}
        {step === 1 && (
          <View style={styles.grid}>
            {GROUP_SIZES.map(item => (
              <TouchableOpacity
                key={item.value}
                style={[styles.gridCard, groupSize === item.value && styles.gridCardSelected]}
                onPress={() => setGroupSize(item.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.gridLabel, groupSize === item.value && styles.gridLabelSelected]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Step 2 — Budget (multi-select) */}
        {step === 2 && (
          <View style={styles.options}>
            {BUDGETS.map(item => {
              const selected = budgets.includes(item.value);
              return (
                <TouchableOpacity
                  key={item.value}
                  style={[styles.optionCard, selected && styles.optionCardSelected]}
                  onPress={() => toggleBudget(item.value)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                    <FontAwesome name={item.icon as any} size={16} color={selected ? Colors.white : Colors.textMuted} />
                  </View>
                  <View style={styles.optionTextBlock}>
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                      {item.label}
                    </Text>
                    <Text style={styles.optionDesc}>{item.desc}</Text>
                  </View>
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected && <FontAwesome name="check" size={11} color={Colors.white} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextButton, !canContinue && styles.nextButtonDisabled]}
          onPress={handleNext}
          disabled={!canContinue || loading}
          activeOpacity={0.85}
        >
          <Text style={styles.nextButtonText}>
            {loading ? 'Saving...' : step === 2 ? 'Get started' : 'Continue'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  topBar: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8, gap: 12 },
  progressTrack: { flexDirection: 'row', gap: 6 },
  progressSegment: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.border },
  progressSegmentActive: { backgroundColor: Colors.text },
  backBtn: { alignSelf: 'flex-start' },
  backBtnText: { fontSize: 14, color: Colors.textSecondary },

  inner: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 120 },
  stepLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
  },
  title: { fontSize: 28, fontWeight: '800', color: Colors.text, letterSpacing: -0.5, marginBottom: 8 },
  subtitle: { fontSize: 15, color: Colors.textSecondary, lineHeight: 22, marginBottom: 32 },

  // Multi-select option cards
  options: { gap: 10 },
  optionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    padding: 16, gap: 14,
  },
  optionCardSelected: { borderColor: Colors.text },
  optionIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.backgroundAlt,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  optionIconSelected: { backgroundColor: Colors.text, borderColor: Colors.text },
  optionTextBlock: { flex: 1, gap: 2 },
  optionLabel: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },
  optionLabelSelected: { color: Colors.text },
  optionDesc: { fontSize: 13, color: Colors.textMuted },
  checkbox: {
    width: 24, height: 24, borderRadius: 7,
    borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: Colors.text, borderColor: Colors.text },

  // Group size grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: Colors.card,
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border,
    paddingVertical: 22, alignItems: 'center',
  },
  gridCardSelected: { borderColor: Colors.text, backgroundColor: Colors.backgroundAlt },
  gridLabel: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  gridLabelSelected: { color: Colors.text },

  // Footer
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 24, paddingBottom: 40,
    backgroundColor: Colors.background,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  nextButton: { backgroundColor: Colors.text, borderRadius: 10, paddingVertical: 16, alignItems: 'center' },
  nextButtonDisabled: { opacity: 0.3 },
  nextButtonText: { fontSize: 15, fontWeight: '700', color: Colors.white, letterSpacing: 0.2 },
});
