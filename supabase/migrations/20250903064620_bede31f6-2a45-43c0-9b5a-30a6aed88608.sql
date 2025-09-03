-- Fix infinite recursion in profiles RLS policies
-- Drop the problematic admin policy that causes recursion
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

-- Keep the working user policies that don't cause recursion
-- Users can still view, insert, and update their own profiles
-- Admin functionality can be added later with proper security definer functions