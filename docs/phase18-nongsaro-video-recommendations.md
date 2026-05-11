# Phase 18 Nongsaro Work Video Recommendations

## Purpose

The monthly farm work schedule on `/tasks` automatically attaches useful Nongsaro videos to each work item for the schedule month currently shown on screen. The app does not show a lookup or refresh button. It loads stored recommendations first, then only calls Nongsaro and Gemini when no stored result exists for that field, work item, and screen month.

## Flow

1. The monthly farm work schedule API result creates current-month work items.
2. The crop name is resolved to `cropEbook.subCategoryCode` through Nongsaro category APIs.
3. `cropEbook.videoList` is queried by `subCategoryCode` with `numOfRows=20`, up to 3 pages.
4. The app sends the work item and video candidates to Gemini.
5. Gemini returns `matchType`, `matchScore`, and `reason` for each candidate link.
6. The full candidate judgement result is saved in Supabase.
7. The UI shows only `direct` or `reference` recommendations with `matchScore >= 70`.
8. When the screen month changes, the recommendation key changes, so the new month can generate and store its own Nongsaro/Gemini judgement. Returning to a previously generated month reuses the stored rows.

`subject` is not sent to `videoList`; filtering is entirely based on Gemini judgement.

`nongsaro-proxy` uses `NONGSARO_CROP_EBOOK_API_KEY` for `cropEbook` when that secret is set. Other Nongsaro services continue to use `NONGSARO_API_KEY`.

## Storage

Table: `nongsaro_work_video_recommendations`

Required mapped fields:

- `crop_name`
- `work_item`
- `work_item_period`
- `video_title`
- `video_origin_instt`
- `video_link`
- `video_img`
- `match_score`
- `match_type`
- `reason`
- `source_api`: `nongsaro.cropEbook.videoList`
- `judged_by`: `gemini`
- `fetched_at`

Additional identity fields:

- `field_id`
- `sub_category_code`
- `work_item_key`
- `schedule_source_id`
- `created_at`
- `updated_at`

`work_item_key` includes the screen month, crop name, schedule source, work item, period label, and farm work flag. Uniqueness is `field_id + work_item_key + video_link`. RLS uses `public.is_field_owner(field_id)` for select, insert, update, and delete.

Rows saved before the screen-month key was introduced are still reused when their `fetched_at` month in KST matches the current screen month. They are not reused for another month.

## UI Rules

- Section label: `도움되는 동영상`
- Maximum display per work item: 3 videos.
- Default display: 1 video.
- If more than one video exists, `더 보기` expands the remaining videos.
- Each video shows thumbnail, title, origin institution, Gemini reason, and a `영상 보기` link opened in a new tab.
- If no visible recommendation exists, the UI shows `현재 작업과 직접 관련된 동영상은 확인되지 않았습니다.`

## Match Rules

- `direct`, score 90-100: directly related to the work item.
- `reference`, score 70-89: same crop and helpful for understanding or performing the work.
- `low` or `exclude`, or any score below 70: stored but not displayed.

If Nongsaro returns resultCode `00` with no `videoList` items, it is treated as no related videos, not an API error.

## Verification

- `src/services/cropEbookService.test.ts`
- `src/services/nongsaroWorkVideoRecommendationService.test.ts`
- `src/pages/Tasks.test.tsx`
- Final checks: `npm test`, `npm run lint`, `npm run build`
