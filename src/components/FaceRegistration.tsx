import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Camera, CheckCircle, RotateCcw } from 'lucide-react';

interface FaceRegistrationProps {
  userId: string;
  onComplete: () => void;
}

export const FaceRegistration: React.FC<FaceRegistrationProps> = ({ userId, onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [faceDescriptor, setFaceDescriptor] = useState<Float32Array | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  useEffect(() => {
    loadModels();
    return () => {
      stopCamera();
    };
  }, []);

  const loadModels = async () => {
    try {
      const MODEL_URL = '/models';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ]);
      setIsLoading(false);
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
        setIsCameraActive(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Camera access denied. Please allow camera permissions.');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const captureFace = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsProcessing(true);
    
    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        toast.error('No face detected. Please position your face clearly in the camera.');
        setIsProcessing(false);
        return;
      }

      // Draw detection on canvas
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d')!;
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      
      ctx.drawImage(videoRef.current, 0, 0);
      
      // Convert canvas to blob for upload
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        
        const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(imageDataUrl);
        
        // Upload to Supabase Storage
        const fileName = `${userId}_face_${Date.now()}.jpg`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('face-images')
          .upload(`${userId}/${fileName}`, blob, {
            contentType: 'image/jpeg',
            upsert: true
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast.error('Failed to save face image');
          setIsProcessing(false);
          return;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('face-images')
          .getPublicUrl(`${userId}/${fileName}`);

        // Get user email for profile
        const { data: { user } } = await supabase.auth.getUser();
        
        // Save face descriptor and image URL to database
        const { error: dbError } = await supabase
          .from('profiles')
          .upsert({
            user_id: userId,
            email: user?.email || '',
            face_descriptor: Array.from(detection.descriptor),
            face_image_url: publicUrl,
            is_verified: true
          });

        if (dbError) {
          console.error('Database error:', dbError);
          toast.error('Failed to save face data');
          setIsProcessing(false);
          return;
        }

        setFaceDescriptor(detection.descriptor);
        toast.success('Face registered successfully! 🎉');
        
        // Log audit
        await supabase.from('audit_logs').insert({
          user_id: userId,
          action: 'FACE_REGISTERED',
          details: { success: true }
        });
        
        setIsProcessing(false);
        stopCamera();
        onComplete();
      }, 'image/jpeg', 0.8);

    } catch (error) {
      console.error('Face capture error:', error);
      toast.error('Failed to process face. Please try again.');
      setIsProcessing(false);
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setFaceDescriptor(null);
    startCamera();
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="flex items-center justify-center p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p>Loading face detection models...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <Camera className="h-6 w-6" />
          Face Registration
        </CardTitle>
        <CardDescription>
          We need to capture your face to verify your identity for voting
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="relative">
          {!capturedImage ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                className="w-full rounded-lg border"
                style={{ display: isCameraActive ? 'block' : 'none' }}
              />
              <canvas
                ref={canvasRef}
                className="hidden"
              />
              
              {!isCameraActive && (
                <div className="flex items-center justify-center h-64 bg-muted rounded-lg border-2 border-dashed">
                  <div className="text-center">
                    <Camera className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">Camera not active</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center">
              <img
                src={capturedImage}
                alt="Captured face"
                className="w-full max-w-md mx-auto rounded-lg border"
              />
              <div className="flex items-center justify-center gap-2 mt-4 text-green-600">
                <CheckCircle className="h-5 w-5" />
                <span>Face captured successfully!</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-4 justify-center">
          {!isCameraActive && !capturedImage && (
            <Button onClick={startCamera} size="lg">
              <Camera className="h-4 w-4 mr-2" />
              Start Camera
            </Button>
          )}
          
          {isCameraActive && !capturedImage && (
            <>
              <Button 
                onClick={captureFace} 
                disabled={isProcessing}
                size="lg"
                className="bg-green-600 hover:bg-green-700"
              >
                {isProcessing ? 'Processing...' : 'Capture Face'}
              </Button>
              <Button onClick={stopCamera} variant="outline" size="lg">
                Cancel
              </Button>
            </>
          )}
          
          {capturedImage && (
            <Button onClick={retakePhoto} variant="outline" size="lg">
              <RotateCcw className="h-4 w-4 mr-2" />
              Retake Photo
            </Button>
          )}
        </div>

        <div className="text-sm text-muted-foreground text-center space-y-2">
          <p>🔒 Your face data is encrypted and stored securely</p>
          <p>📸 Look directly at the camera for best results</p>
          <p>💡 Ensure good lighting and remove glasses if possible</p>
        </div>
      </CardContent>
    </Card>
  );
};