-- Add permissions and password columns to profiles if they don't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS senha TEXT;

-- Update RLS Policies to allow managing professionals
-- Enable RLS just in case
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Allow reading all profiles in the same clinic (needed for listing)
CREATE POLICY "Users can view profiles in same clinic" ON profiles
  FOR SELECT USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid()) OR
    auth.uid() = id -- Always allow viewing own profile
  );

-- Allow admins to insert/update profiles in their clinic
CREATE POLICY "Admins can manage profiles in same clinic" ON profiles
  FOR ALL USING (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    clinica_id IN (SELECT clinica_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
