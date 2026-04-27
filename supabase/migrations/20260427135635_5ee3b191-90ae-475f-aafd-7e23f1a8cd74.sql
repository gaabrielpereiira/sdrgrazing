-- Bucket público para mídias do WhatsApp
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Leitura pública
DROP POLICY IF EXISTS "Public can read whatsapp-media" ON storage.objects;
CREATE POLICY "Public can read whatsapp-media"
ON storage.objects
FOR SELECT
USING (bucket_id = 'whatsapp-media');

-- Upload por authenticated (front) e service role (edge functions)
DROP POLICY IF EXISTS "Authenticated can upload whatsapp-media" ON storage.objects;
CREATE POLICY "Authenticated can upload whatsapp-media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'whatsapp-media');

DROP POLICY IF EXISTS "Authenticated can update whatsapp-media" ON storage.objects;
CREATE POLICY "Authenticated can update whatsapp-media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'whatsapp-media')
WITH CHECK (bucket_id = 'whatsapp-media');