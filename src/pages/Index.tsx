import React, { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AuthForm } from '@/components/AuthForm';
import { FaceRegistration } from '@/components/FaceRegistration';
import { FaceVerification } from '@/components/FaceVerification';
import { BlinkVerification } from '@/components/BlinkVerification';
import { VotingInterface } from '@/components/VotingInterface';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Vote, Shield, Eye, UserCheck, CheckCircle } from 'lucide-react';

type AppState = 'auth' | 'face-registration' | 'face-verification' | 'blink-verification' | 'voting' | 'complete';

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [appState, setAppState] = useState<AppState>('auth');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => {
            loadUserProfile(session.user.id);
          }, 0);
        } else {
          setAppState('auth');
          setUserProfile(null);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (userId: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading profile:', error);
        toast.error('Failed to load user profile');
        return;
      }

      // If no profile exists, create one
      if (!profile) {
        const { data: { user } } = await supabase.auth.getUser();
        
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            user_id: userId,
            email: user?.email || '',
            full_name: user?.user_metadata?.full_name || 'User'
          });

        if (insertError) {
          console.error('Error creating profile:', insertError);
          toast.error('Failed to create user profile');
          return;
        }
        
        setAppState('face-registration');
        setIsLoading(false);
        return;
      }

      setUserProfile(profile);
      
      // Determine app state based on profile
      if (!profile.face_descriptor || !profile.is_verified) {
        setAppState('face-registration');
      } else {
        setAppState('face-verification');
      }
    } catch (error) {
      console.error('Error in loadUserProfile:', error);
      toast.error('Failed to load user data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setSession(null);
      setUserProfile(null);
      setAppState('auth');
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Sign out error:', error);
      toast.error('Failed to sign out');
    }
  };

  const handleAuthSuccess = () => {
    // Auth state change will trigger profile loading
  };

  const handleFaceRegistrationComplete = () => {
    setAppState('face-verification');
    if (user) {
      loadUserProfile(user.id);
    }
  };

  const handleFaceVerificationComplete = (success: boolean) => {
    if (success) {
      setAppState('blink-verification');
    } else {
      toast.error('Face verification failed. Please try again.');
      setAppState('face-verification');
    }
  };

  const handleBlinkComplete = () => {
    setAppState('voting');
  };

  const handleVoteComplete = () => {
    setAppState('complete');
  };

  const resetToVoting = () => {
    setAppState('face-verification');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-lg">Loading voting system...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary rounded-lg">
                <Vote className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Face & Blink Voting</h1>
                <p className="text-sm text-muted-foreground">Secure Biometric Democracy</p>
              </div>
            </div>
            
            {user && (
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-medium">{userProfile?.full_name || user.email}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Button onClick={handleSignOut} variant="outline" size="sm">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Progress Indicator */}
      {user && appState !== 'auth' && (
        <div className="container mx-auto px-4 py-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className={`flex items-center gap-2 ${
                    ['face-registration', 'face-verification', 'blink-verification', 'voting', 'complete'].includes(appState) 
                      ? 'text-green-600' 
                      : 'text-muted-foreground'
                  }`}>
                    <UserCheck className="h-4 w-4" />
                    <span className="text-sm font-medium">Face Setup</span>
                    {userProfile?.is_verified && <CheckCircle className="h-4 w-4" />}
                  </div>
                  
                  <div className={`flex items-center gap-2 ${
                    ['blink-verification', 'voting', 'complete'].includes(appState) 
                      ? 'text-green-600' 
                      : 'text-muted-foreground'
                  }`}>
                    <Eye className="h-4 w-4" />
                    <span className="text-sm font-medium">Blink Verify</span>
                    {['voting', 'complete'].includes(appState) && <CheckCircle className="h-4 w-4" />}
                  </div>
                  
                  <div className={`flex items-center gap-2 ${
                    ['voting', 'complete'].includes(appState) 
                      ? 'text-green-600' 
                      : 'text-muted-foreground'
                  }`}>
                    <Vote className="h-4 w-4" />
                    <span className="text-sm font-medium">Vote</span>
                    {appState === 'complete' && <CheckCircle className="h-4 w-4" />}
                  </div>
                </div>
                
                <Badge variant={appState === 'complete' ? 'default' : 'secondary'}>
                  {appState === 'face-registration' && 'Face Registration'}
                  {appState === 'face-verification' && 'Face Verification'}
                  {appState === 'blink-verification' && 'Blink Verification'}
                  {appState === 'voting' && 'Voting'}
                  {appState === 'complete' && 'Complete'}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {appState === 'auth' && (
          <AuthForm onAuthSuccess={handleAuthSuccess} />
        )}
        
        {appState === 'face-registration' && user && (
          <FaceRegistration 
            userId={user.id} 
            onComplete={handleFaceRegistrationComplete} 
          />
        )}
        
        {appState === 'face-verification' && user && (
          <FaceVerification 
            userId={user.id}
            onVerificationComplete={handleFaceVerificationComplete}
            onCancel={() => setAppState('face-registration')}
          />
        )}
        
        {appState === 'blink-verification' && (
          <BlinkVerification 
            onBlinkComplete={handleBlinkComplete}
            onCancel={() => setAppState('face-verification')}
          />
        )}
        
        {appState === 'voting' && user && (
          <VotingInterface 
            userId={user.id}
            onVoteComplete={handleVoteComplete}
          />
        )}
        
        {appState === 'complete' && (
          <Card className="w-full max-w-2xl mx-auto text-center">
            <CardContent className="p-8">
              <div className="space-y-6">
                <div className="p-6 bg-green-100 dark:bg-green-900/20 rounded-full w-32 h-32 mx-auto flex items-center justify-center">
                  <CheckCircle className="h-16 w-16 text-green-600" />
                </div>
                
                <div>
                  <h2 className="text-3xl font-bold mb-2">Vote Complete! 🎉</h2>
                  <p className="text-lg text-muted-foreground mb-6">
                    Thank you for participating in secure, biometric-verified voting.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <Shield className="h-6 w-6 mx-auto mb-2 text-green-600" />
                    <p className="font-medium">Face Verified</p>
                    <p className="text-muted-foreground">Identity confirmed</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <Eye className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                    <p className="font-medium">Blink Verified</p>
                    <p className="text-muted-foreground">Liveness confirmed</p>
                  </div>
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <Vote className="h-6 w-6 mx-auto mb-2 text-purple-600" />
                    <p className="font-medium">Vote Recorded</p>
                    <p className="text-muted-foreground">Securely stored</p>
                  </div>
                </div>
                
                <Button onClick={resetToVoting} variant="outline" size="lg">
                  Vote in Another Election
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-t mt-12">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>🔒 Face & Blink Voting System - Secure, Private, Democratic</p>
          <p>Your biometric data is encrypted and never shared with third parties.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
