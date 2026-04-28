import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  SafeAreaView, ScrollView, Dimensions,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { Colors } from '@/lib/colors';

interface Props {
  visible: boolean;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;   // YYYY-MM-DD
  onConfirm: (start: string | null, end: string | null) => void;
  onClose: () => void;
  title?: string;
  singleDate?: boolean; // if true, only pick one date
}

const DAY_HEADERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toStr(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDow(y: number, m: number) { return new Date(y, m, 1).getDay(); }
function todayStr() {
  const t = new Date();
  return toStr(t.getFullYear(), t.getMonth(), t.getDate());
}
function formatDisplay(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' });
}
function calcNights(start: string, end: string) {
  return Math.round((new Date(end + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 86400000);
}

export default function CalendarPicker({
  visible, startDate, endDate, onConfirm, onClose,
  title = 'Select dates', singleDate = false,
}: Props) {
  const today = todayStr();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [selStart, setSelStart] = useState<string | null>(null);
  const [selEnd, setSelEnd] = useState<string | null>(null);
  const [phase, setPhase] = useState<'start' | 'end'>('start');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (visible) {
      setSelStart(startDate);
      setSelEnd(endDate);
      setPhase('start');
      setShowPicker(false);
      const ref = startDate ?? today;
      const d = new Date(ref + 'T12:00:00');
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setPickerYear(d.getFullYear());
    }
  }, [visible]);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  function handleDay(dateStr: string) {
    if (dateStr < today) return;
    if (singleDate) {
      setSelStart(dateStr);
      setSelEnd(null);
      return;
    }
    if (phase === 'start' || !selStart) {
      setSelStart(dateStr);
      setSelEnd(null);
      setPhase('end');
    } else {
      if (dateStr <= selStart) {
        setSelStart(dateStr);
        setSelEnd(null);
      } else {
        setSelEnd(dateStr);
        setPhase('start');
      }
    }
  }

  type DayType = 'start' | 'end' | 'range' | 'none';
  function getDayType(dateStr: string): DayType {
    if (!selStart) return 'none';
    if (dateStr === selStart) return 'start';
    if (!singleDate && selEnd) {
      if (dateStr === selEnd) return 'end';
      if (dateStr > selStart && dateStr < selEnd) return 'range';
    }
    return 'none';
  }

  // Build grid
  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDow(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const sameDay = selStart && selEnd && selStart === selEnd;
  const nights = selStart && selEnd && !sameDay ? calcNights(selStart, selEnd) : null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={{ width: 60 }}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity
            onPress={() => onConfirm(selStart, singleDate ? null : selEnd)}
            style={{ width: 60, alignItems: 'flex-end' }}
            disabled={!selStart}
          >
            <Text style={[styles.doneText, !selStart && { opacity: 0.3 }]}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Selection summary bar */}
        {!singleDate && (
          <View style={styles.summaryBar}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>FROM</Text>
              <Text style={[styles.summaryDate, !selStart && styles.summaryPlaceholder]}>
                {selStart ? formatDisplay(selStart) : 'Select'}
              </Text>
            </View>
            <View style={styles.summaryArrow}>
              {nights ? (
                <View style={styles.nightsBadge}>
                  <Text style={styles.nightsText}>{nights} {nights === 1 ? 'night' : 'nights'}</Text>
                </View>
              ) : (
                <FontAwesome name="long-arrow-right" size={14} color={Colors.textMuted} />
              )}
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>TO</Text>
              <Text style={[styles.summaryDate, !selEnd && styles.summaryPlaceholder]}>
                {selEnd ? formatDisplay(selEnd) : 'Select'}
              </Text>
            </View>
          </View>
        )}

        {/* Month/Year picker overlay */}
        {showPicker && (
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerCard}>
              {/* Year selector */}
              <View style={styles.pickerYearRow}>
                <TouchableOpacity onPress={() => setPickerYear(y => y - 1)} style={styles.pickerArrow} activeOpacity={0.7}>
                  <FontAwesome name="angle-left" size={20} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.pickerYearLabel}>{pickerYear}</Text>
                <TouchableOpacity onPress={() => setPickerYear(y => y + 1)} style={styles.pickerArrow} activeOpacity={0.7}>
                  <FontAwesome name="angle-right" size={20} color={Colors.text} />
                </TouchableOpacity>
              </View>
              {/* Month grid */}
              <View style={styles.pickerMonthGrid}>
                {MONTH_NAMES.map((name, idx) => {
                  const isActive = idx === month && pickerYear === year;
                  return (
                    <TouchableOpacity
                      key={name}
                      style={[styles.pickerMonthCell, isActive && styles.pickerMonthCellActive]}
                      activeOpacity={0.75}
                      onPress={() => {
                        setYear(pickerYear);
                        setMonth(idx);
                        setShowPicker(false);
                      }}
                    >
                      <Text style={[styles.pickerMonthText, isActive && styles.pickerMonthTextActive]}>
                        {name.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Month navigation */}
          <View style={styles.monthNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn} activeOpacity={0.7}>
              <FontAwesome name="angle-left" size={20} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setPickerYear(year); setShowPicker(true); }}
              activeOpacity={0.7}
              style={styles.monthLabelBtn}
            >
              <Text style={styles.monthLabel}>{MONTH_NAMES[month]} {year}</Text>
              <FontAwesome name="caret-down" size={12} color={Colors.textMuted} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
            <TouchableOpacity onPress={nextMonth} style={styles.navBtn} activeOpacity={0.7}>
              <FontAwesome name="angle-right" size={20} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {/* Day-of-week headers */}
          <View style={styles.dowRow}>
            {DAY_HEADERS.map(d => (
              <Text key={d} style={styles.dowLabel}>{d}</Text>
            ))}
          </View>

          {/* Day grid */}
          {rows.map((row, ri) => (
            <View key={ri} style={styles.weekRow}>
              {row.map((day, di) => {
                if (!day) return <View key={di} style={styles.cell} />;
                const dateStr = toStr(year, month, day);
                const type = getDayType(dateStr);
                const isPast = dateStr < today;
                const isToday = dateStr === today;
                const isSelected = type === 'start' || type === 'end';

                return (
                  <TouchableOpacity
                    key={di}
                    style={styles.cell}
                    onPress={() => handleDay(dateStr)}
                    disabled={isPast}
                    activeOpacity={0.75}
                  >
                    {/* Range highlight strips */}
                    {type === 'range' && <View style={[styles.strip, styles.stripFull]} />}
                    {type === 'start' && !sameDay && selEnd && <View style={[styles.strip, styles.stripRight]} />}
                    {type === 'end' && !sameDay && <View style={[styles.strip, styles.stripLeft]} />}

                    {/* Day circle */}
                    <View style={[styles.circle, isSelected && styles.circleSelected]}>
                      <Text style={[
                        styles.dayNum,
                        isPast && styles.dayPast,
                        isToday && !isSelected && !type.includes('range') && styles.dayToday,
                        type === 'range' && styles.dayRange,
                        isSelected && styles.daySelected,
                      ]}>
                        {day}
                      </Text>
                    </View>

                    {/* Today dot */}
                    {isToday && !isSelected && <View style={styles.todayDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>

        {/* Clear button */}
        {(selStart || selEnd) && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => { setSelStart(null); setSelEnd(null); setPhase('start'); }}
            activeOpacity={0.7}
          >
            <Text style={styles.clearText}>Clear dates</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const CELL = 46;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  cancelText: { fontSize: 15, color: Colors.textSecondary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  doneText: { fontSize: 15, fontWeight: '700', color: Colors.primary },

  summaryBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 24,
    backgroundColor: Colors.card,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    gap: 8,
  },
  summaryItem: { flex: 1 },
  summaryLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.8, marginBottom: 4,
  },
  summaryDate: { fontSize: 14, fontWeight: '700', color: Colors.text },
  summaryPlaceholder: { color: Colors.textMuted, fontWeight: '400' },
  summaryArrow: { alignItems: 'center', paddingHorizontal: 4 },
  nightsBadge: {
    backgroundColor: Colors.primaryDim, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  nightsText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  monthNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 20,
  },
  navBtn: { padding: 8 },
  monthLabelBtn: { flexDirection: 'row', alignItems: 'center' },
  monthLabel: { fontSize: 18, fontWeight: '700', color: Colors.text, letterSpacing: -0.4 },

  pickerOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 20,
    width: 280,
    gap: 16,
  },
  pickerYearRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  pickerArrow: { padding: 8 },
  pickerYearLabel: { fontSize: 20, fontWeight: '700', color: Colors.text, letterSpacing: -0.5 },
  pickerMonthGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    justifyContent: 'space-between',
  },
  pickerMonthCell: {
    width: '30%', paddingVertical: 10,
    borderRadius: 10, alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  pickerMonthCellActive: {
    backgroundColor: Colors.primary, borderColor: Colors.primary,
  },
  pickerMonthText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  pickerMonthTextActive: { color: Colors.white },

  dowRow: { flexDirection: 'row', paddingHorizontal: 6, marginBottom: 2 },
  dowLabel: {
    flex: 1, textAlign: 'center',
    fontSize: 12, fontWeight: '600', color: Colors.textMuted,
    paddingBottom: 8,
  },

  weekRow: { flexDirection: 'row', paddingHorizontal: 6 },
  cell: {
    flex: 1, height: CELL,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },

  // Range strips
  strip: {
    position: 'absolute', top: 5, bottom: 5,
    backgroundColor: Colors.primaryDim,
  },
  stripFull: { left: 0, right: 0 },
  stripRight: { left: '50%', right: 0 },
  stripLeft: { left: 0, right: '50%' },

  // Day circle
  circle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  circleSelected: { backgroundColor: Colors.primary },

  dayNum: { fontSize: 15, color: Colors.text },
  dayPast: { color: Colors.textMuted, opacity: 0.35 },
  dayToday: { fontWeight: '800', color: Colors.primary },
  dayRange: { color: Colors.primary, fontWeight: '500' },
  daySelected: { color: Colors.white, fontWeight: '700' },

  // Today dot
  todayDot: {
    position: 'absolute', bottom: 5,
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: Colors.primary,
  },

  clearBtn: {
    marginHorizontal: 20, marginBottom: 20,
    paddingVertical: 13, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', backgroundColor: Colors.card,
  },
  clearText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
});
