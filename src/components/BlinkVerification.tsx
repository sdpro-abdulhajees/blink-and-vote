import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import { Eye, EyeOff, CheckCircle, X } from 'lucide-react';

interface BlinkVerificationProps {
  onBlinkComplete: () => void;
  onCancel: () => void;
}

export const BlinkVerification: React.FC<BlinkVerificationProps> = ({ 
  onBlinkComplete, 
  onCancel 
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [blinkCount, setBlinkCount] = useState(0);
  const [isEyeClosed, setIsEyeClosed] = useState(false);
  const [lastBlinkTime, setLastBlinkTime] = useState(0);
  const [status, setStatus] = useState<'waiting' | 'detecting' | 'completed' | 'failed'>('waiting');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const requiredBlinks = 3;

  useEffect(() => {
    loadModels();
    return () => {
      stopCamera();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const loadModels = async () => {
    try {
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      ]);
      setIsLoading(false);
      startCamera();
    } catch (error) {
      console.error('Error loading face-api models:', error);
      toast.error('Failed to load face detection models');
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
        startBlinkDetection();
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

  const startBlinkDetection = () => {
    setStatus('detecting');
    
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || !isActive) return;

      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks();

        if (!detection) return;

        // Calculate eye aspect ratio (EAR) to detect blinks
        const leftEye = detection.landmarks.getLeftEye();
        const rightEye = detection.landmarks.getRightEye();
        
        const leftEAR = calculateEAR(leftEye);
        const rightEAR = calculateEAR(rightEye);
        const avgEAR = (leftEAR + rightEAR) / 2;

        // Blink threshold (lower values indicate closed eyes)
        const blinkThreshold = 0.25;
        const currentTime = Date.now();
        
        if (avgEAR < blinkThreshold) {
          if (!isEyeClosed && currentTime - lastBlinkTime > 500) {
            setIsEyeClosed(true);
          }
        } else {
          if (isEyeClosed && currentTime - lastBlinkTime > 200) {
            setBlinkCount(prev => {
              const newCount = prev + 1;
              if (newCount >= requiredBlinks) {
                setStatus('completed');
                setTimeout(() => {
                  stopCamera();
                  onBlinkComplete();
                  toast.success('Blink verification successful! 🎉');
                }, 1000);
              }
              return newCount;
            });
            setLastBlinkTime(currentTime);
            setIsEyeClosed(false);
            toast.success(`Blink ${blinkCount + 1} detected!`);
          }
        }
      } catch (error) {
        console.error('Blink detection error:', error);
      }
    }, 100);

    // Auto-fail after 30 seconds
    setTimeout(() => {
      if (blinkCount < requiredBlinks && status === 'detecting') {
        setStatus('failed');
        stopCamera();
        toast.error('Blink verification timed out. Please try again.');
      }
    }, 30000);
  };

  // Calculate Eye Aspect Ratio (EAR)
  const calculateEAR = (eye: faceapi.Point[]) => {
    // Vertical eye landmarks
    const A = distance(eye[1], eye[5]);
    const B = distance(eye[2], eye[4]);
    // Horizontal eye landmark
    const C = distance(eye[0], eye[3]);
    
    return (A + B) / (2.0 * C);
  };

  const distance = (p1: faceapi.Point, p2: faceapi.Point) => {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading blink detection...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <Eye className="h-6 w-6" />
          Blink Verification
        </CardTitle>
        <CardDescription>
          Please blink {requiredBlinks} times slowly and clearly
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
          
          {/* Blink Counter Overlay */}
          <div className="absolute top-4 left-4 bg-black/70 text-white px-4 py-2 rounded-lg">
            <div className="flex items-center gap-2">
              {isEyeClosed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="font-mono text-lg">
                {blinkCount} / {requiredBlinks}
              </span>
            </div>
          </div>

          {/* Status Indicator */}
          <div className="absolute top-4 right-4 bg-black/70 text-white px-4 py-2 rounded-lg">
            {status === 'detecting' && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Detecting...</span>
              </div>
            )}
            {status === 'completed' && (
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="h-4 w-4" />
                <span>Complete!</span>
              </div>
            )}
            {status === 'failed' && (
              <div className="flex items-center gap-2 text-red-400">
                <X className="h-4 w-4" />
                <span>Failed</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-muted rounded-full h-2">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-300"
            style={{ width: `${(blinkCount / requiredBlinks) * 100}%` }}
          ></div>
        </div>

        <div className="text-center space-y-4">
          <div className="text-lg font-semibold">
            {status === 'waiting' && "Get ready to blink!"}
            {status === 'detecting' && "Blink slowly and clearly"}
            {status === 'completed' && "Verification complete! 🎉"}
            {status === 'failed' && "Verification failed. Try again."}
          </div>
          
          <div className="flex gap-4 justify-center">
            {(status === 'failed' || status === 'waiting') && (
              <>
                <Button 
                  onClick={() => {
                    setBlinkCount(0);
                    setStatus('waiting');
                    startBlinkDetection();
                  }}
                  disabled={false}
                >
                  {status === 'failed' ? 'Try Again' : 'Start Verification'}
                </Button>
                <Button onClick={onCancel} variant="outline">
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="text-sm text-muted-foreground text-center space-y-2">
          <p>👁️ Look directly at the camera</p>
          <p>😌 Blink naturally and slowly</p>
          <p>⏱️ Complete within 30 seconds</p>
        </div>
      </CardContent>
    </Card>
  );
};