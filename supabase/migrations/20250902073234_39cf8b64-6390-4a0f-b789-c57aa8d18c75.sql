-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table for user data and face descriptors
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  face_descriptor JSONB, -- Store face-api.js descriptor
  face_image_url TEXT, -- Store face image in Supabase Storage
  is_verified BOOLEAN DEFAULT FALSE,
  role TEXT DEFAULT 'voter' CHECK (role IN ('voter', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create elections table
CREATE TABLE public.elections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  options JSONB NOT NULL, -- Array of voting options
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create votes table
CREATE TABLE public.votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  election_id UUID NOT NULL REFERENCES public.elections(id) ON DELETE CASCADE,
  selected_option TEXT NOT NULL,
  face_verified BOOLEAN DEFAULT FALSE,
  blink_verified BOOLEAN DEFAULT FALSE,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure one vote per user per election
  UNIQUE(user_id, election_id)
);

-- Create audit_logs table for security tracking
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" 
ON public.profiles FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'admin'
));

-- Elections policies
CREATE POLICY "Everyone can view active elections" 
ON public.elections FOR SELECT 
USING (is_active = true);

CREATE POLICY "Admins can manage elections" 
ON public.elections FOR ALL 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'admin'
));

-- Votes policies
CREATE POLICY "Users can view their own votes" 
ON public.votes FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own votes" 
ON public.votes FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all votes" 
ON public.votes FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'admin'
));

-- Audit logs policies
CREATE POLICY "Admins can view audit logs" 
ON public.audit_logs FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.profiles 
  WHERE user_id = auth.uid() AND role = 'admin'
));

CREATE POLICY "Anyone can insert audit logs" 
ON public.audit_logs FOR INSERT 
WITH CHECK (true);

-- Create storage bucket for face images
INSERT INTO storage.buckets (id, name, public) VALUES ('face-images', 'face-images', false);

-- Storage policies for face images
CREATE POLICY "Users can upload their own face image" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'face-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own face image" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'face-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own face image" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'face-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_elections_updated_at
  BEFORE UPDATE ON public.elections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert a sample election for testing
INSERT INTO public.elections (title, description, options, start_date, end_date, is_active) VALUES 
(
  'Student Council President 2025',
  'Vote for your next student council president',
  '["Alice Johnson - Focus on campus sustainability", "Bob Smith - Improve dining options", "Carol Davis - Enhance student activities"]'::jsonb,
  now(),
  now() + interval '30 days',
  true
);