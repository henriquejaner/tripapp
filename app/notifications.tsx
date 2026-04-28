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

const TYPE_ICONS: Record<string, { icon: string; color: string }> = {
  idea_added:     { icon: 'lightbulb-o', color: Colors.accent },
  idea_confirmed: { icon: 'check-circle', color: Colors.green },
  comment_added:  { icon: 'comment-o', color: Colors.primary },
  member_joined:  { icon: 'user-plus', color: Colors.warning },
  nudge_21:       { icon: 'calendar', color: Colors.accent },
  nudge_7:        { icon: 'clock-o', color: Colors.warning },
  nudge_3:        { icon: 'exclamation-circle', color: Colors.primary },
  default:        { icon: 'bell', color: Colors.textMuted },
};

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
      .limit(50);
    setNotifications(data ?? []);
    setLoading(false);

    // Mark all as read on open
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
  }

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  useEffect(() => { load(); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome name="angle-left" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 ? (
          <TouchableOpacity onPress={markAllRead}>
            <Text style={styles.markAllText}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={n => n.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          ListEmptyComponent={<EmptyState />}
          renderItem={({ item }) => (
            <NotificationRow
              notification={item}
              onPress={() => {
                if (item.trip_id) router.push(`/trip/${item.trip_id}`);
              }}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function NotificationRow({ notification, onPress }: {
  notification: AppNotification; onPress: () => void;
}) {
  const { icon, color } = TYPE_ICONS[notification.type] ?? TYPE_ICONS.default;
  const timeAgo = formatTimeAgo(notification.created_at);

  return (
    <TouchableOpacity
      style={[styles.row, !notification.read && styles.rowUnread]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconBox, { backgroundColor: color + '15' }]}>
        <FontAwesome name={icon as any} size={16} color={color} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, !notification.read && styles.rowTitleUnread]}>
          {notification.message}
        </Text>
        {notification.trip_name && (
          <Text style={styles.rowBody} numberOfLines={1}>{notification.trip_name}</Text>
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
      <FontAwesome name="bell-o" size={40} color={Colors.border} />
      <Text style={styles.emptyTitle}>You're all caught up</Text>
      <Text style={styles.emptyText}>
        We'll notify you when ideas are added, confirmed, or when new members join your trips.
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
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  backBtn: { padding: 4, width: 36 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  markAllText: { fontSize: 13, color: Colors.primary, fontWeight: '600', width: 80, textAlign: 'right' },

  list: { paddingVertical: 8, paddingBottom: 40 },

  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  rowUnread: { backgroundColor: Colors.card },
  iconBox: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rowContent: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14, fontWeight: '500', color: Colors.textSecondary },
  rowTitleUnread: { fontWeight: '700', color: Colors.text },
  rowBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  rowTime: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  unreadDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: Colors.primary, marginTop: 4, flexShrink: 0,
  },

  empty: {
    alignItems: 'center', paddingTop: 80,
    paddingHorizontal: 40, gap: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  emptyText: {
    fontSize: 14, color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 21,
  },
});
