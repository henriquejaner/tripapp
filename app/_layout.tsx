import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { supabase } from '@/lib/supabase';
import { Session } from '@supabase/supabase-js';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '@/lib/colors';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (session) {
      checkOnboarding(session);
    } else {
      router.replace('/login');
    }
  }, [session, loading]);

  async function checkOnboarding(currentSession: Session) {
    const { data } = await supabase
      .from('profiles')
      .select('onboarded')
      .eq('id', currentSession.user.id)
      .single();

    if (data?.onboarded) {
      router.replace('/(tabs)');
    } else {
      router.replace('/onboarding');
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="create-trip" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trip/[id]" />
        <Stack.Screen name="join/[code]" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="public-trip/[id]" />
      </Stack>
    </>
  );
}
