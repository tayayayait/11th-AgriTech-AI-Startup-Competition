INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'pesticide-product-images',
  'pesticide-product-images',
  true,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.psis_pesticide_media
  ADD COLUMN storage_object_path TEXT,
  ADD COLUMN source_image_url TEXT,
  ADD COLUMN content_sha256 TEXT,
  ADD COLUMN mime_type TEXT,
  ADD COLUMN byte_size INTEGER,
  ADD COLUMN match_confidence NUMERIC(4, 3),
  ADD COLUMN match_method TEXT,
  ADD COLUMN license_note TEXT;

ALTER TABLE public.psis_pesticide_media
  ADD CONSTRAINT psis_pesticide_media_byte_size_chk
    CHECK (byte_size IS NULL OR byte_size > 0),
  ADD CONSTRAINT psis_pesticide_media_match_confidence_chk
    CHECK (
      match_confidence IS NULL
      OR (match_confidence >= 0 AND match_confidence <= 1)
    ),
  ADD CONSTRAINT psis_pesticide_media_match_method_chk
    CHECK (
      match_method IS NULL
      OR match_method IN ('official_brand_exact', 'official_brand_and_item_exact')
    );

CREATE UNIQUE INDEX psis_pesticide_media_storage_object_path_idx
  ON public.psis_pesticide_media(storage_object_path)
  WHERE storage_object_path IS NOT NULL;

DROP POLICY IF EXISTS "public read pesticide product images"
  ON storage.objects;

CREATE POLICY "public read pesticide product images"
  ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'pesticide-product-images');

COMMENT ON COLUMN public.psis_pesticide_media.source_image_url IS
  'Original image URL on the verified manufacturer product page.';

COMMENT ON COLUMN public.psis_pesticide_media.storage_object_path IS
  'Mirrored object path in the pesticide-product-images Storage bucket.';

COMMENT ON COLUMN public.psis_pesticide_media.license_note IS
  'Source and reuse note retained with the mirrored product image.';
