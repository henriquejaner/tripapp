import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  SafeAreaView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';
import type { AppNotification } from '@/lib/types';

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  idea_added:     { icon: 'lightbulb-o', color: '#3D7EFF', label: 'New idea' },
  idea_confirmed: { icon: 'check-circle', color: Colors.success, label: 'Confirmed' },
  comment_added:  { icon: 'comment-o',   color: Colors.primary, label: 'Comment' },
  member_joined:  { icon: 'user-plus',   color: '#A855F7', label: 'Joined' },
  nudge_21:       { icon: 'calendar',    color: '#F5A623', label: 'Reminder' },
  nudge_7:        { icon: 'clock-o',     color: '#F5A623', label: 'Reminder' },
  nudge_3:        { icon: 'exclamation-circle', color: Colors.primary, label: 'Urgent' },
  default:        { icon: 'bell',        color: Colors.textMuted, label: '' },
};

function groupByDate(notifications: AppNotification[]): Array<{ title: string; data: AppNotification[] }> {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;

  const groups: Record<string, AppNotification[]> = {
    Today: [], Yesterday: [], 'This week': [], Earlier: [],
  };

  notifications.forEach(n => {
    const t = new Date(n.created_at).getTime();
    if (t >= today) groups['Today'].push(n);
    else if (t >= yesterday) groups['Yesterday'].push(n);
    else if (t >= weekAgo) groups['This week'].push(n);
    else groups['Earlier'].push(n);
  });

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([title, data]) => ({ title, data }));
}

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);
    setNotifications(data ?? []);
    setLoading(false);
    // Mark all as read
    supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
  }

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;
  const groups = groupByDate(notifications);

  // Flatten groups into FlatList items with section headers
  type ListItem =
    | { type: 'header'; title: string; key: string }
    | { type: 'notification'; data: AppNotification; key: string };

  const flatItems: ListItem[] = groups.flatMap(g => [
    { type: 'header' as const, title: g.title, key: `h-${g.title}` },
    ...g.data.map(n => ({ type: 'notification' as const, data: n, key: n.id })),
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <FontAwesome name="angle-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          {unreadCount > 0 && (
            <Text style={styles.headerSub}>{unreadCount} unread</Text>
          )}
        </View>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : notifications.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={flatItems}
          keyExtractor={item => item.key}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return <Text style={styles.groupHeader}>{item.title}</Text>;
            }
            return (
              <NotificationRow
                notification={item.data}
                onPress={() => {
                  if (item.data.trip_id) router.push(`/trip/${item.data.trip_id}`);
                }}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function NotificationRow({ notification, onPress }: {
  notification: AppNotification; onPress: () => void;
}) {
  const config = TYPE_CONFIG[notification.type] ?? TYPE_CONFIG.default;
  const timeAgo = formatTimeAgo(notification.created_at);

  return (
    <TouchableOpacity
      style={[styles.row, !notification.read && styles.rowUnread]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconBox, { backgroundColor: config.color + '18' }]}>
        <FontAwesome name={config.icon as any} size={16} color={config.color} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowMessage, !notification.read && styles.rowMessageUnread]} numberOfLines={2}>
          {notification.message}
        </Text>
        {notification.trip_name && (
          <View style={styles.tripNameRow}>
            <FontAwesome name="map-marker" size={10} color={Colors.textMuted} />
            <Text style={styles.tripNameText} numberOfLines={1}>{notification.trip_name}</Text>
          </View>
        )}
        <Text style={styles.rowTime}>{timeAgo}</Text>
      </View>
      {!notification.read && <View style={styles.unreadDot} />}
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <FontAwesome name="bell-o" size={28} color={Colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>All caught up</Text>
      <Text style={styles.emptyText}>
        You'll get notified when someone joins your trip, adds an idea, or confirms a plan.
      </Text>
    </View>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(dateStr).toLocaleDateString('en', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, width: 36 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.text, textAlign: 'center' },
  headerSub: { fontSize: 11, color: Colors.primary, fontWeight: '600', textAlign: 'center', marginTop: 1 },

  list: { paddingBottom: 40 },

  groupHeader: {
    fontSize: 11, fontWeight: '700', color: Colors.textMuted,
    letterSpacing: 0.6, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6,
  },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowUnread: { backgroundColor: Colors.card },
  iconBox: {
    width: 42, height: 42, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowContent: { flex: 1, gap: 3 },
  rowMessage: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary, lineHeight: 20 },
  rowMessageUnread: { fontWeight: '700', color: Colors.text },
  tripNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tripNameText: { fontSize: 12, color: Colors.textMuted },
  rowTime: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.primary, marginTop: 6, flexShrink: 0,
  },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 14 },
  emptyIcon: {
    width: 68, height: 68, borderRadius: 20,
    backgroundColor: Colors.primaryDim,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  emptyText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 21 },
});
