CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.conversations ADD COLUMN project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE POLICY "omni upload own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'omni-files' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "omni read own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'omni-files' AND (storage.foldername(name))[1] = auth.uid()::text);