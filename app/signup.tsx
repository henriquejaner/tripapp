import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { GoogleIcon } from '@/components/GoogleIcon';
import { supabase } from '@/lib/supabase';
import { Colors } from '@/lib/colors';

export default function SignupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [alreadyExists, setAlreadyExists] = useState(false);

  async function handleSignup() {
    setErrorMsg('');
    setAlreadyExists(false);
    if (!fullName || !email || !password) {
      setErrorMsg('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setLoading(false);
      const msg = error.message.toLowerCase();
      if (msg.includes('already registered') || msg.includes('user already exists') || msg.includes('email address is already')) {
        setAlreadyExists(true);
        setErrorMsg('An account with this email already exists.');
      } else {
        setErrorMsg(error.message);
      }
      return;
    }
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: fullName,
        onboarded: false,
      });
      // If session is null, email confirmation is required
      if (!data.session) {
        setLoading(false);
        setConfirming(true);
        return;
      }
    }
    setLoading(false);
  }

  if (confirming) {
    return (
      <View style={styles.container}>
        <View style={styles.confirmBox}>
          <Text style={styles.wordmark}>Wayfarer</Text>
          <Text style={styles.confirmTitle}>Check your email</Text>
          <Text style={styles.confirmText}>
            We sent a confirmation link to{'\n'}<Text style={{ fontWeight: '700' }}>{email}</Text>.{'\n\n'}
            Open it to activate your account, then come back and sign in.
          </Text>
          <Link href="/login" asChild>
            <TouchableOpacity style={styles.button} activeOpacity={0.85}>
              <Text style={styles.buttonText}>Go to sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">

        <View style={styles.brand}>
          <Text style={styles.wordmark}>Wayfarer</Text>
          <Text style={styles.tagline}>Travelling made easier.</Text>
        </View>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor={Colors.textMuted}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            returnKeyType="next"
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSignup}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>{loading ? 'Creating account...' : 'Get started'}</Text>
          </TouchableOpacity>

          {!!errorMsg && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMsg}</Text>
              {alreadyExists && (
                <Link href="/login" asChild>
                  <TouchableOpacity style={styles.errorLink}>
                    <Text style={styles.errorLinkText}>Sign in instead</Text>
                  </TouchableOpacity>
                </Link>
              )}
            </View>
          )}

          <Text style={styles.terms}>
            By signing up you agree to our Terms & Privacy Policy.
          </Text>
        </View>

        <View style={styles.socialSection}>
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.divider} />
          </View>
          <View style={styles.socialRow}>
            <TouchableOpacity style={styles.socialButton} activeOpacity={0.7}>
              <GoogleIcon size={20} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialButton} activeOpacity={0.7}>
              <FontAwesome name="apple" size={22} color={Colors.text} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialButton} activeOpacity={0.7}>
              <FontAwesome name="facebook" size={20} color="#1877F2" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Have an account? </Text>
          <Link href="/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  inner: {
    flexGrow: 1,
    paddingHorizontal: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 36,
  },
  brand: {
    alignItems: 'center',
    gap: 8,
  },
  wordmark: {
    fontSize: 56,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -2.5,
  },
  tagline: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  form: {
    width: '100%',
    maxWidth: 380,
    gap: 10,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
    width: '100%',
  },
  button: {
    backgroundColor: Colors.text,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    width: '100%',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.white,
    letterSpacing: 0.2,
  },
  confirmBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  confirmText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  terms: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
  socialSection: {
    width: '100%',
    maxWidth: 380,
    gap: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 12,
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  socialButton: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialIconG: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4285F4',
    fontStyle: 'italic',
  },
  socialIconA: {
    fontSize: 20,
    color: Colors.text,
    lineHeight: 24,
  },
  socialIconF: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1877F2',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: { color: Colors.textMuted, fontSize: 13 },
  footerLink: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  errorBox: {
    backgroundColor: '#2a1010',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#5a1a1a',
    padding: 12,
    gap: 8,
    alignItems: 'center',
  },
  errorText: { fontSize: 13, color: '#ff6b6b', textAlign: 'center' },
  errorLink: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  errorLinkText: { fontSize: 13, fontWeight: '700', color: Colors.text },
});
