ALTER TABLE public.diagnosis_records
  ADD COLUMN IF NOT EXISTS appearance_assessment JSONB NOT NULL DEFAULT '{
    "status": "uncertain",
    "confidenceBand": "낮음",
    "issueLabels": [],
    "summary": "외관 스크리닝 정보가 없습니다.",
    "visualReasons": [],
    "recommendedActions": []
  }'::jsonb;
