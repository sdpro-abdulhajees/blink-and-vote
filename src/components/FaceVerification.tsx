import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UserCheck, Camera, CheckCircle, X } from 'lucide-react';

interface FaceVerificationProps {
  userId: string;
  onVerificationComplete: (success: boolean) => void;
  onCancel: () => void;
}

export const FaceVerification: React.FC<FaceVerificationProps> = ({ 
  userId, 
  onVerificationComplete, 
  onCancel 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [storedDescriptor, setStoredDescriptor] = useState<Float32Array | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<'waiting' | 'verifying' | 'success' | 'failed'>('waiting');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadModelsAndData();
    return () => {
      stopCamera();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const loadModelsAndData = async () => {
    try {
      // Load face-api models
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      // Load stored face descriptor
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('face_descriptor')
        .eq('user_id', userId)
        .single();

      if (error || !profile?.face_descriptor) {
        toast.error('No face data found. Please register your face first.');
        onCancel();
        return;
      }

      const descriptorArray = Array.isArray(profile.face_descriptor) 
        ? (profile.face_descriptor as number[])
        : [];
      setStoredDescriptor(new Float32Array(descriptorArray));
      setIsLoading(false);
      startCamera();
    } catch (error) {
      console.error('Error loading face verification:', error);
      toast.error('Failed to load face verification');
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsActive(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Camera access denied');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  };

  const startVerification = () => {
    if (!storedDescriptor) return;
    
    setIsVerifying(true);
    setVerificationStatus('verifying');
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds at 100ms intervals

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !isActive || attempts >= maxAttempts) {
        if (attempts >= maxAttempts) {
          setVerificationStatus('failed');
          setIsVerifying(false);
          toast.error('Face verification timed out. Please try again.');
          
          // Log failed attempt
          await supabase.from('audit_logs').insert({
            user_id: userId,
            action: 'FACE_VERIFICATION_FAILED',
            details: { reason: 'timeout' }
          });
        }
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        return;
      }

      attempts++;

      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!detection) return;

        // Compare face descriptors
        const distance = faceapi.euclideanDistance(storedDescriptor, detection.descriptor);
        const threshold = 0.6; // Lower = more strict
        
        console.log('Face verification distance:', distance);

        if (distance < threshold) {
          setVerificationStatus('success');
          setIsVerifying(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
          }
          
          // Log successful verification
          await supabase.from('audit_logs').insert({
            user_id: userId,
            action: 'FACE_VERIFICATION_SUCCESS',
            details: { 
              distance,
              threshold,
              attempts 
            }
          });

          toast.success('Face verified successfully! 🎉');
          setTimeout(() => {
            stopCamera();
            onVerificationComplete(true);
          }, 1500);
        }
      } catch (error) {
        console.error('Face verification error:', error);
      }
    }, 100);
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading face verification...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <UserCheck className="h-6 w-6" />
          Face Verification
        </CardTitle>
        <CardDescription>
          Look at the camera to verify your identity
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            muted
            className="w-full rounded-lg border"
          />
          
          {/* Verification Status Overlay */}
          <div className="absolute top-4 left-4 right-4">
            <div className="flex justify-between">
              <div className="bg-black/70 text-white px-4 py-2 rounded-lg">
                {verificationStatus === 'waiting' && (
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    <span>Ready</span>
                  </div>
                )}
                {verificationStatus === 'verifying' && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                    <span>Verifying...</span>
                  </div>
                )}
                {verificationStatus === 'success' && (
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle className="h-4 w-4" />
                    <span>Verified!</span>
                  </div>
                )}
                {verificationStatus === 'failed' && (
                  <div className="flex items-center gap-2 text-red-400">
                    <X className="h-4 w-4" />
                    <span>Failed</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Face detection frame */}
          {verificationStatus === 'verifying' && (
            <div className="absolute inset-4 border-2 border-blue-500 rounded-lg animate-pulse"></div>
          )}
          {verificationStatus === 'success' && (
            <div className="absolute inset-4 border-2 border-green-500 rounded-lg"></div>
          )}
        </div>

        <div className="text-center space-y-4">
          <div className="text-lg font-semibold">
            {verificationStatus === 'waiting' && "Position your face in the camera"}
            {verificationStatus === 'verifying' && "Hold still, verifying..."}
            {verificationStatus === 'success' && "Identity verified! 🎉"}
            {verificationStatus === 'failed' && "Verification failed"}
          </div>
          
          <div className="flex gap-4 justify-center">
            {verificationStatus === 'waiting' && (
              <>
                <Button 
                  onClick={startVerification}
                  disabled={!isActive}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Verify Face
                </Button>
                <Button onClick={onCancel} variant="outline" size="lg">
                  Cancel
                </Button>
              </>
            )}
            
            {verificationStatus === 'failed' && (
              <>
                <Button 
                  onClick={() => {
                    setVerificationStatus('waiting');
                    setIsVerifying(false);
                  }}
                  size="lg"
                >
                  Try Again
                </Button>
                <Button onClick={onCancel} variant="outline" size="lg">
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="text-sm text-muted-foreground text-center space-y-2">
          <p>🔒 Your face is compared against your registered profile</p>
          <p>👤 Look directly at the camera</p>
          <p>💡 Ensure good lighting for best results</p>
        </div>
      </CardContent>
    </Card>
  );
};